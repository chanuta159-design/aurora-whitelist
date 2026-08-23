export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { authorizedApps, appNames, githubToken, githubUser, githubRepo } = request.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!githubToken || !authorizedApps || !appNames) {
        return response.status(400).json({ error: 'Missing parameters' });
    }

    try {
        // 1. נרכיב רשימה של אפליקציות עם שמות ומזהים עבור ה-AI
        const appsListForPrompt = authorizedApps.map((pkg, idx) => {
            return `Name: "${appNames[idx] || pkg}", Package: "${pkg}"`;
        }).join('\n');

        // 2. פנייה למודל של Gemini לחלוקה לקטגוריות
        const prompt = `
אתה מומחה לקטלוג אפליקציות לאנדרואיד עבור קהל ישראלי וחרדי.
לפניך רשימת אפליקציות:
${appsListForPrompt}

המשימה שלך:
חלק את כל האפליקציות לקטגוריות הגיוניות בעברית (למשל: "תחבורה וניווט", "פיננסים ובנקאות", "יהדות ותפילה", "פרודוקטיביות וכלים", "בריאות וקופות חולים", "תקשורת והודעות" וכו').
אתה רשאי ליצור קטגוריות חדשות במידת הצורך. ודא שכל אפליקציה מופיעה בדיוק בקטגוריה אחת המתאימה ביותר.

עליך להחזיר אך ורק אובייקט JSON תקין (בלי תגיות Markdown מסביב), במבנה הבא:
{
  "שם קטגוריה 1": ["package.name.1", "package.name.2"],
  "שם קטגוריה 2": ["package.name.3"]
}
`;

        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const geminiData = await geminiResponse.json();
        const rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!rawJsonText) {
            throw new Error('Gemini failed to generate categories');
        }

        const categorizedJson = JSON.parse(rawJsonText);

        // 3. שמירת הקובץ המקוטלג ב-GitHub (categorized-whitelist.json)
        const fileUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`;
        
        // נבדוק אם הקובץ כבר קיים כדי לקבל את ה-SHA שלו (לצורך עדכון)
        let currentSha = null;
        const checkRes = await fetch(fileUrl, {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            currentSha = checkData.sha;
        }

        // המרה ל-Base64 ותמיכה ביוניקוד
        const contentBase64 = Buffer.from(JSON.stringify(categorizedJson, null, 2)).toString('base64');

        const putRes = await fetch(fileUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Update categorized whitelist via Gemini AI',
                content: contentBase64,
                sha: currentSha || undefined
            })
        });

        if (!putRes.ok) {
            const putErr = await putRes.json();
            throw new Error(`GitHub save failed: ${putErr.message}`);
        }

        return response.status(200).json({ success: true, categories: categorizedJson });

    } catch (err) {
        console.error('Error in categorization:', err);
        return response.status(500).json({ error: err.message });
    }
}