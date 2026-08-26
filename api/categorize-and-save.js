export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { authorizedApps, githubToken, githubUser, githubRepo } = request.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) return response.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    if (!githubToken || !authorizedApps) return response.status(400).json({ error: 'Missing parameters' });

    try {
        const gplay = (await import('google-play-scraper')).default;
        const fileUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`;
        
        // --- 1. משיכת הזיכרון (הקטגוריות הקיימות מ-GitHub) ---
        let existingCategories = {};
        let currentSha = null;
        
        const checkRes = await fetch(fileUrl, { headers: { 'Authorization': `token ${githubToken}` } });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            currentSha = checkData.sha;
            const decodedContent = Buffer.from(checkData.content, 'base64').toString('utf8');
            existingCategories = JSON.parse(decodedContent);
        }

        // --- 2. ניקיון ---
        const validAuthorizedSet = new Set(authorizedApps);
        for (const cat in existingCategories) {
            existingCategories[cat] = existingCategories[cat].filter(pkg => validAuthorizedSet.has(pkg));
            if (existingCategories[cat].length === 0) delete existingCategories[cat];
        }

        // --- 3. זיהוי אפליקציות חדשות ---
        const alreadyCategorizedSet = new Set(Object.values(existingCategories).flat());
        const newPackages = authorizedApps.filter(pkg => !alreadyCategorizedSet.has(pkg));

        if (newPackages.length === 0) {
            await saveToGithub(existingCategories, currentSha, githubToken, githubUser, githubRepo, 'Cleanup removed apps');
            return response.status(200).json({ success: true, message: 'No new apps. Cleanup saved.', categories: existingCategories });
        }

        console.log(`[AI] Found ${newPackages.length} new apps. Fetching data from Google Play...`);

        // --- 4. שליפת תיאורים מגוגל פליי (רק לחדשות) ---
        const scrapedAppsForPrompt = [];
        const scrapePromises = newPackages.map(async (pkg) => {
            try {
                const appInfo = await gplay.app({ appId: pkg, lang: 'he', country: 'il' });
                const shortDesc = appInfo.description.substring(0, 300).replace(/\n/g, ' ');
                scrapedAppsForPrompt.push(`Package: "${pkg}", Title: "${appInfo.title}", Category: "${appInfo.genre}", Description: "${shortDesc}"`);
            } catch (e) {
                console.warn(`Could not scrape Google Play for ${pkg}`);
                scrapedAppsForPrompt.push(`Package: "${pkg}", Title: "Unknown", Description: "No metadata available"`);
            }
        });
        await Promise.all(scrapePromises);

        // --- 5. מציאת המודל העדכני ביותר אוטומטית (מתעלם מ-omni) ---
        let latestModel = 'gemini-3.7-flash'; // Fallback בטוח
        try {
            const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
            const modelsData = await modelsRes.json();
            
            if (modelsData.models) {
                const flashModels = modelsData.models.filter(m => {
                    const name = m.name.toLowerCase();
                    return name.includes('flash') && 
                           !name.includes('omni') && 
                           !name.includes('experimental') &&
                           !name.includes('exp') &&
                           m.supportedGenerationMethods &&
                           m.supportedGenerationMethods.includes('generateContent');
                });
                
                if (flashModels.length > 0) {
                    flashModels.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                    latestModel = flashModels[flashModels.length - 1].name.replace('models/', '');
                }
            }
        } catch (e) {
            console.warn('Failed to dynamically fetch models, using fallback', e);
        }
        console.log(`[AI] Selected model: ${latestModel}`);


        // --- 6. פנייה ל-AI ---
        const existingCategoryNames = Object.keys(existingCategories).length > 0 
            ? Object.keys(existingCategories).map(c => `"${c}"`).join(', ')
            : "אין קטגוריות קיימות. צור חדשות.";

        const prompt = `
אתה מומחה לקטלוג אפליקציות עבור קהל ישראלי וחרדי.
המערכת מכילה כבר את הקטגוריות הבאות: ${existingCategoryNames}.

לפניך רשימה של אפליקציות *חדשות* בצירוף התיאור הרשמי שלהן מגוגל פליי:
${scrapedAppsForPrompt.join('\n')}

המשימה שלך:const prompt = `
אתה מומחה לקטלוג אפליקציות עבור קהל ישראלי וחרדי.
המערכת מכילה כבר את הקטגוריות הבאות: ${existingCategoryNames}.

לפניך רשימה של אפליקציות *חדשות* בצירוף התיאור הרשמי שלהן מגוגל פליי:
${scrapedAppsForPrompt.join('\n')}

המשימה שלך:
1. שבץ את האפליקציות החדשות אל תוך הקטגוריות הקיימות. 
2. מותר לך לייצר קטגוריה חדשה בעברית אך ורק אם אף קטגוריה קיימת לא מתאימה בכלל. השתדל לאחד נושאים קרובים כדי לא ליצור קטגוריות עם אפליקציה אחת בלבד.
3. ודא שכל אפליקציה מופיעה בדיוק פעם אחת.

🚨 כלל ברזל קריטי - חובה לקרוא: 🚨
לעולם אל תשנה, תערוך או תתרגם את שמות החבילות (Package Names) לעברית! עליך להשתמש במזהה החבילה המקורי באנגלית בדיוק כפי שהוא נשלח אליך (למשל: "com.whatsapp").

עליך להחזיר אך ורק אובייקט JSON תקין (בלי תגיות Markdown מסביב), במבנה הבא:
{
  "שם קטגוריה": ["package.name.1", "package.name.2"]
}
`;

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
        
        if (!rawJsonText) {
            console.error('Gemini error response:', JSON.stringify(geminiData, null, 2));
            throw new Error('Gemini failed to generate categories');
        }

        const newAiCategories = JSON.parse(rawJsonText);

        // --- 7. מיזוג ושמירה ---
        for (const [cat, pkgs] of Object.entries(newAiCategories)) {
            if (!existingCategories[cat]) existingCategories[cat] = [];
            existingCategories[cat].push(...pkgs);
            existingCategories[cat] = [...new Set(existingCategories[cat])];
        }

        await saveToGithub(existingCategories, currentSha, githubToken, githubUser, githubRepo, 'Added new apps via AI scraping');
        return response.status(200).json({ success: true, categories: existingCategories });

    } catch (err) {
        console.error('Error in categorization:', err);
        return response.status(500).json({ error: err.message });
    }
}

async function saveToGithub(jsonObj, sha, token, user, repo, commitMessage) {
    const fileUrl = `https://api.github.com/repos/${user}/${repo}/contents/categorized-whitelist.json`;
    const contentBase64 = Buffer.from(JSON.stringify(jsonObj, null, 2)).toString('base64');
    
    const putRes = await fetch(fileUrl, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage, content: contentBase64, sha: sha || undefined })
    });
    if (!putRes.ok) {
        const err = await putRes.json();
        throw new Error(`GitHub save failed: ${err.message}`);
    }
}
