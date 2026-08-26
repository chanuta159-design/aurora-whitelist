import gplay from 'google-play-scraper';

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { authorizedApps, githubToken, githubUser, githubRepo } = request.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) return response.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    if (!githubToken || !authorizedApps) return response.status(400).json({ error: 'Missing parameters' });

    try {
        const fileUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`;
        
        // --- 1. משיכת הזיכרון (הקטגוריות הקיימות מ-GitHub) ---
        let existingCategories = {};
        let currentSha = null;
        
        const checkRes = await fetch(fileUrl, { headers: { 'Authorization': `token ${githubToken}` } });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            currentSha = checkData.sha;
            // פענוח מ-Base64
            const decodedContent = Buffer.from(checkData.content, 'base64').toString('utf8');
            existingCategories = JSON.parse(decodedContent);
        }

        // --- 2. ניקיון: הסרת אפליקציות שכבר לא מורשות (שנמחקו מהרשימה) ---
        const validAuthorizedSet = new Set(authorizedApps);
        for (const cat in existingCategories) {
            existingCategories[cat] = existingCategories[cat].filter(pkg => validAuthorizedSet.has(pkg));
            // אם קטגוריה התרוקנה לגמרי, נמחק אותה
            if (existingCategories[cat].length === 0) {
                delete existingCategories[cat];
            }
        }

        // --- 3. זיהוי אפליקציות חדשות שעדיין לא קוטלגו ---
        const alreadyCategorizedSet = new Set(Object.values(existingCategories).flat());
        const newPackages = authorizedApps.filter(pkg => !alreadyCategorizedSet.has(pkg));

        // אם אין אפליקציות חדשות, נשמור רק את הניקיון שעשינו ונסתלק (חוסך פנייה ל-AI!)
        if (newPackages.length === 0) {
            await saveToGithub(existingCategories, currentSha, githubToken, githubUser, githubRepo, 'Cleanup removed apps');
            return response.status(200).json({ success: true, message: 'No new apps. Cleanup saved.', categories: existingCategories });
        }

        console.log(`[AI] Found ${newPackages.length} new apps. Fetching data from Google Play...`);

        // --- 4. שליפת תיאורים מגוגל פליי עבור האפליקציות *החדשות בלבד* ---
        const scrapedAppsForPrompt = [];
        const scrapePromises = newPackages.map(async (pkg) => {
            try {
                // מביאים מידע בעברית ומישראל
                const appInfo = await gplay.app({ appId: pkg, lang: 'he', country: 'il' });
                // לוקחים רק את 300 התווים הראשונים של התיאור כדי לא להעמיס על ה-AI
                const shortDesc = appInfo.description.substring(0, 300).replace(/\n/g, ' ');
                scrapedAppsForPrompt.push(`Package: "${pkg}", Title: "${appInfo.title}", Category: "${appInfo.genre}", Description: "${shortDesc}"`);
            } catch (e) {
                // אם האפליקציה לא בחנות (למשל APK פרטי), נשלח רק את החבילה
                console.warn(`Could not scrape Google Play for ${pkg}`);
                scrapedAppsForPrompt.push(`Package: "${pkg}", Title: "Unknown", Description: "No metadata available"`);
            }
        });
        
        // ממתינים שכל השליפות מגוגל יסתיימו (הן רצות במקביל, זה לוקח שנייה אחת)
        await Promise.all(scrapePromises);

        // --- 5. פנייה ל-AI עם הזיכרון הקיים והמידע העשיר ---
        const existingCategoryNames = Object.keys(existingCategories).length > 0 
            ? Object.keys(existingCategories).map(c => `"${c}"`).join(', ')
            : "אין קטגוריות קיימות. צור חדשות.";

        const prompt = `
אתה מומחה לקטלוג אפליקציות עבור קהל ישראלי וחרדי.
המערכת מכילה כבר את הקטגוריות הבאות: ${existingCategoryNames}.

לפניך רשימה של אפליקציות *חדשות* בצירוף התיאור הרשמי שלהן מגוגל פליי:
${scrapedAppsForPrompt.join('\n')}

המשימה שלך:
שבץ את האפליקציות החדשות אל תוך הקטגוריות הקיימות. 
* מותר לך לייצר קטגוריה חדשה בעברית אך ורק אם אף קטגוריה קיימת לא מתאימה בכלל.
* ודא שכל אפליקציה מופיעה בדיוק פעם אחת.

עליך להחזיר אך ורק אובייקט JSON תקין (בלי תגיות Markdown), במבנה הבא:
{
  "שם קטגוריה": ["package.name.1", "package.name.2"]
}
`;

        const latestModel = 'gemini-2.5-flash'; // או 3.7 בהתאם למה שהגדרת
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${latestModel}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const geminiData = await geminiResponse.json();
        const rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJsonText) throw new Error('Gemini failed to generate categories');

        const newAiCategories = JSON.parse(rawJsonText);

        // --- 6. מיזוג התוצאות של ה-AI עם הזיכרון הקיים ---
        for (const [cat, pkgs] of Object.entries(newAiCategories)) {
            if (!existingCategories[cat]) {
                existingCategories[cat] = []; // יצירת קטגוריה חדשה אם ה-AI המציא אחת
            }
            // הוספת האפליקציות החדשות לקטגוריה
            existingCategories[cat].push(...pkgs);
            // מחיקת כפילויות ליתר ביטחון
            existingCategories[cat] = [...new Set(existingCategories[cat])];
        }

        // --- 7. שמירה חזרה ל-GitHub ---
        await saveToGithub(existingCategories, currentSha, githubToken, githubUser, githubRepo, 'Added new apps via AI scraping');

        return response.status(200).json({ success: true, categories: existingCategories });

    } catch (err) {
        console.error('Error in categorization:', err);
        return response.status(500).json({ error: err.message });
    }
}

// פונקציית עזר לשמירה בגיטהאב
async function saveToGithub(jsonObj, sha, token, user, repo, commitMessage) {
    const fileUrl = `https://api.github.com/repos/${user}/${repo}/contents/categorized-whitelist.json`;
    const contentBase64 = Buffer.from(JSON.stringify(jsonObj, null, 2)).toString('base64');
    
    const putRes = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: commitMessage,
            content: contentBase64,
            sha: sha || undefined
        })
    });
    if (!putRes.ok) {
        const err = await putRes.json();
        throw new Error(`GitHub save failed: ${err.message}`);
    }
}
