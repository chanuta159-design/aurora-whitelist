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
        
        // --- 1. משיכת הקטגוריות הקיימות מ-GitHub ---
        let existingCategories = {};
        let currentSha = null;
        
        const checkRes = await fetch(fileUrl, { headers: { 'Authorization': `token ${githubToken}` } });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            currentSha = checkData.sha;
            const decodedContent = Buffer.from(checkData.content, 'base64').toString('utf8');
            existingCategories = JSON.parse(decodedContent);
        }

        // --- 2. סנכרון בטוח: איחוד כל האפליקציות המורשות (מונע מחיקה בטעות) ---
        const allKnownApps = new Set([...authorizedApps, ...Object.values(existingCategories).flat()]);
        for (const cat in existingCategories) {
            existingCategories[cat] = existingCategories[cat].filter(pkg => allKnownApps.has(pkg));
            if (existingCategories[cat].length === 0) delete existingCategories[cat];
        }

        // --- 3. זיהוי אפליקציות חדשות שעדיין לא משובצות באף קטגוריה ---
        const alreadyCategorizedSet = new Set(Object.values(existingCategories).flat());
        const newPackages = [...allKnownApps].filter(pkg => !alreadyCategorizedSet.has(pkg));

        if (newPackages.length === 0) {
            await saveToGithub(existingCategories, currentSha, githubToken, githubUser, githubRepo, 'Cleanup & Sync');
            return response.status(200).json({ success: true, message: 'No new apps. Synced.', categories: existingCategories });
        }

        console.log(`[AI] Found ${newPackages.length} new apps to categorize...`);

        // --- 4. שליפת מידע: קודם מגוגל פליי, ואם לא קיים - ממאגר CFOPUSER ---
        const scrapedAppsForPrompt = [];
        const scrapePromises = newPackages.map(async (pkg) => {
            let foundInfo = false;

            // נסיון א': סריקה מגוגל פליי
            try {
                const appInfo = await gplay.app({ appId: pkg, lang: 'he', country: 'il' });
                if (appInfo) {
                    const shortDesc = (appInfo.description || '').substring(0, 300).replace(/\n/g, ' ');
                    scrapedAppsForPrompt.push(`Package: "${pkg}", Title: "${appInfo.title}", Category: "${appInfo.genre}", Description: "${shortDesc}"`);
                    foundInfo = true;
                }
            } catch (e) {
                // לא קיים בגוגל פליי
            }

            // נסיון ב': אם לא קיים בגוגל - בדיקה במאגר CFOPUSER
            if (!foundInfo) {
                try {
                    // חיפוש שם האפליקציה במאגר CFOPUSER
                    const cfopAppsRes = await fetch("https://raw.githubusercontent.com/cfopuser/app-store/main/apps.json");
                    if (cfopAppsRes.ok) {
                        const appIds = await cfopAppsRes.json();
                        for (const appId of appIds) {
                            const appJsonRes = await fetch(`https://raw.githubusercontent.com/cfopuser/app-store/main/apps/${appId}/app.json`);
                            if (appJsonRes.ok) {
                                const appJson = await appJsonRes.json();
                                const meta = appJson.metadata || appJson;
                                if (meta.package_name === pkg) {
                                    const title = meta.name_he || meta.name || appId;
                                    const desc = meta.description_he || meta.description || meta.full_description || '';
                                    scrapedAppsForPrompt.push(`Package: "${pkg}", Title: "${title}", Category: "${meta.category_he || meta.category || ''}", Description: "${desc}"`);
                                    foundInfo = true;
                                    break;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`Could not check CFOPUSER repo for ${pkg}`, e);
                }
            }

            if (!foundInfo) {
                scrapedAppsForPrompt.push(`Package: "${pkg}", Title: "${pkg}", Description: "External Android Application"`);
            }
        });
        await Promise.all(scrapePromises);

        // --- 5. מציאת מודל Gemini עדכני ---
        let latestModel = 'gemini-1.5-flash'; 
        try {
            const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
            const modelsData = await modelsRes.json();
            if (modelsData.models) {
                const flashModels = modelsData.models.filter(m => {
                    const name = m.name.toLowerCase();
                    return name.includes('flash') && !name.includes('exp') && m.supportedGenerationMethods?.includes('generateContent');
                });
                if (flashModels.length > 0) {
                    latestModel = flashModels[flashModels.length - 1].name.replace('models/', '');
                }
            }
        } catch (e) { }

        // --- 6. שאילתה ל-Gemini ---
        const existingCategoryNames = Object.keys(existingCategories).length > 0 
            ? Object.keys(existingCategories).map(c => `"${c}"`).join(', ')
            : "אין קטגוריות קיימות. צור חדשות.";

        const prompt = `אתה מומחה לקטלוג אפליקציות עבור קהל ישראלי וחרדי.
המערכת מכילה כבר את הקטגוריות הבאות: ${existingCategoryNames}.

לפניך רשימה של אפליקציות חדשות:
${scrapedAppsForPrompt.join('\n')}

המשימה שלך:
1. שבץ כל אפליקציה חדשה אל תוך הקטגוריה המתאימה לה ביותר מהקטגוריות הקיימות.
2. מותר לייצר קטגוריה חדשה בעברית (2-4 מילים) אך ורק אם אף קטגוריה קיימת לא מתאימה בכלל.
3. ודא שכל אפליקציה מופיעה בדיוק פעם אחת.

🚨 אזהרה קריטית 🚨
שמות החבילות (Package Names) הם מזהי מערכת (באנגלית). אסור לתרגם אותם לעולם! (למשל: "com.metrolist.music" חייב להישאר בדיוק "com.metrolist.music").

החזר אך ורק אובייקט JSON תקין (בלי תגיות Markdown), במבנה הבא:
{
  "שם קטגוריה": ["package.name.1", "package.name.2"]
}`;

        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${latestModel}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const geminiData = await geminiResponse.json();
        const rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!rawJsonText) throw new Error('Gemini failed to generate categories');

        const newAiCategories = JSON.parse(rawJsonText);

        // --- 7. מיזוג ושמירה ב-GitHub ---
        for (const [cat, pkgs] of Object.entries(newAiCategories)) {
            if (!existingCategories[cat]) existingCategories[cat] = [];
            
            const fixedPkgs = pkgs.map(pkg => {
                return pkg.replace(/^קום\./, 'com.')
                          .replace(/^איל\./, 'il.')
                          .replace(/^אורג\./, 'org.');
            });

            existingCategories[cat].push(...fixedPkgs);
            existingCategories[cat] = [...new Set(existingCategories[cat])];
        }

        await saveToGithub(existingCategories, currentSha, githubToken, githubUser, githubRepo, 'AI Auto-categorize new apps');
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
