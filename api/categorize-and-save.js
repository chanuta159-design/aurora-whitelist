export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { authorizedApps, appNames, githubToken, githubUser, githubRepo } = request.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        console.error('Missing GEMINI_API_KEY in environment variables');
        return response.status(500).json({ error: 'GEMINI_API_KEY is missing from Vercel settings' });
    }

    if (!githubToken || !authorizedApps || !appNames) {
        return response.status(400).json({ error: 'Missing parameters' });
    }

    try {
        // 1. נרכיב רשימה של אפליקציות עבור ה-AI
        const appsListForPrompt = authorizedApps.map((pkg, idx) => {
            return `Name: "${appNames[idx] || pkg}", Package: "${pkg}"`;
        }).join('\n');

        // 2. פנייה למודל של Gemini
        const prompt = `
אתה מומחה לקטלוג אפליקציות לאנדרואיד עבור קהל ישראלי וחרדי.
לפניך רשימת אפליקציות:
${appsListForPrompt}

המשימה שלך:
חלק את כל האפליקציות לקטגוריות הגיוניות בעברית (למשל: "תחבורה וניווט", "פיננסים ובנקאות", "יהדות ותפילה", "פרודוקטיביות וכלים", "בריאות וקופות חולים", "תקשורת והודעות", "שונות" וכו').
ודא שכל אפליקציה מופיעה בדיוק בקטגוריה אחת המתאימה ביותר.

עליך להחזיר אך ורק אובייקט JSON תקין (בלי Markdown מסביב), במבנה הבא:
{
  "שם קטגוריה 1": ["package.name.1", "package.name.2"],
  "שם קטגוריה 2": ["package.name.3"]
}
`;

        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok || geminiData.error) {
            console.error('Gemini API Error details:', JSON.stringify(geminiData, null, 2));
            throw new Error(`Gemini Error: ${geminiData.error?.message || 'Failed to call Gemini'}`);
        }

        const rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJsonText) {
            console.error('Gemini returned empty text:', JSON.stringify(geminiData, null, 2));
            throw new Error('Gemini failed to generate categories: empty response');
        }

        const categorizedJson = JSON.parse(rawJsonText);

        // 3. שמירת הקובץ המקוטלג ב-GitHub (categorized-whitelist.json)
        const fileUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`;
        
        let currentSha = null;
        const checkRes = await fetch(fileUrl, {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            currentSha = checkData.sha;
        }

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
