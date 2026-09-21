export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { authorizedApps, githubToken, githubUser, githubRepo } = request.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) return response.status(500).json({ error: 'Missing GEMINI_API_KEY in environment variables' });
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

        // --- 2. סנכרון בטוח: איחוד כל האפליקציות המורשות ---
        const allKnownApps = new Set(authorizedApps);
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

        // --- שליפת מאגר המקורות המאוחד app-sources.json לקבלת תיאורים של אפליקציות עצמאיות ---
        let customSources = [];
        try {
            const sourcesRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-sources.json`, {
                headers: { 'Authorization': `token ${githubToken}` }
            });
            if (sourcesRes.ok) {
                const sData = await sourcesRes.json();
                customSources = JSON.parse(Buffer.from(sData.content, 'base64').toString('utf8'));
            }
        } catch (_) {}

        // --- 4. שליפת מידע: קודם מ-app-sources.json, אח"כ גוגל פליי, ואח"כ CFOPUSER ---
        const scrapedAppsForPrompt = [];
        const scrapePromises = newPackages.map(async (pkg) => {
            let foundInfo = false;

            // נסיון א': האם יש תיאור שהמשתמש כתב בעצמו ב-app-sources.json?
            const customApp = customSources.find(a => a.packageName === pkg);
            if (customApp && (customApp.description || customApp.name)) {
                const title = customApp.name || customApp.name_en || pkg;
                const desc = customApp.description || '';
                scrapedAppsForPrompt.push(`Package: "${pkg}", Title: "${title}", Category Hint: "${customApp.category || ''}", Description: "${desc}"`);
                foundInfo = true;
            }

            // נסיון ב': סריקה מגוגל פליי
            if (!foundInfo) {
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
            }

            // נסיון ג': בדיקה במאגר CFOPUSER
            if (!foundInfo) {
                try {
                    const cfopAppsRes = await fetch("https://raw.githubusercontent.com/cfopuser/app-store/main/apps.json");
                    if (cfopAppsRes.ok) {
                        const appIds = await cfopAppsRes.json();
                        const searchLimit = Math.min(appIds.length, 30);
                        for (let i = 0; i < searchLimit; i++) {
                            const appId = appIds[i];
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

        // --- 5. הכנת הפרומפט ל-Gemini ---
        const existingCategoryNames = Object.keys(existingCategories).length > 0 
            ? Object.keys(existingCategories).map(c => `"${c}"`).join(', ')
            : "אין קטגוריות קיימות. צור חדשות.";

        const prompt = `אתה מומחה לקטלוג אפליקציות עבור קהל ישראלי וחרדי.
המערכת מכילה כבר את הקטגוריות הבאות: ${existingCategoryNames}.

לפניך רשימה של אפליקציות חדשות:
${scrapedAppsForPrompt.join('\n')}

המשימה שלך:
1. שבץ כל אפליקציה חדשה אל תוך הקטגוריה המתאימה לה ביותר מהקטגוריות הקיימות על פי שמה והתיאור שלה.
2. מותר לייצר קטגוריה חדשה בעברית (2-4 מילים) אך ורק אם אף קטגוריה קיימת לא מתאימה בכלל.
3. ודא שכל אפליקציה מופיעה בדיוק פעם אחת.

🚨 אזהרה קריטית 🚨
שמות החבילות (Package Names) הם מזהי מערכת (באנגלית). אסור לתרגם אותם לעולם! (למשל: "com.app.mishnat" חייב להישאר בדיוק "com.app.mishnat").

החזר אך ורק אובייקט JSON תקין (בלי תגיות Markdown), במבנה הבא:
{
  "שם קטגוריה": ["package.name.1", "package.name.2"]
}`;

        // --- 6. שאילתה ל-Gemini עם מודל מוביל וגיבוי מעודכנים ---
        const primaryModel = 'gemini-3.8-flash';
        const fallbackModel = 'gemini-3.7-flash';
        console.log(`[AI] Querying Gemini model: ${primaryModel}`);

        const requestBody = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
                responseMimeType: "application/json" 
            }
        });

        let geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
        });

        // גיבוי ל-3.7 אם 3.8 מחזיר 404 או שגיאת זמינות
        if (!geminiResponse.ok && (geminiResponse.status === 404 || geminiResponse.status === 503)) {
            console.warn(`Model ${primaryModel} failed (${geminiResponse.status}), falling back to ${fallbackModel}`);
            geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody
            });
        }

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok || geminiData.error) {
            const errMsg = geminiData.error?.message || `HTTP ${geminiResponse.status} ${geminiResponse.statusText}`;
            console.error('[Gemini API Error Detail]:', JSON.stringify(geminiData));
            throw new Error(`Gemini API error: ${errMsg}`);
        }

        const candidate = geminiData.candidates?.[0];
        let rawJsonText = candidate?.content?.parts?.[0]?.text;
        if (!rawJsonText) {
            throw new Error('Gemini returned an empty response or was blocked by safety filters');
        }

        rawJsonText = rawJsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let newAiCategories;
        try {
            newAiCategories = JSON.parse(rawJsonText);
        } catch (parseErr) {
            console.error('[JSON Parse Error] Raw text was:', rawJsonText);
            throw new Error(`Failed to parse JSON from Gemini: ${parseErr.message}`);
        }

        // --- 7. מיזוג ושמירה ב-GitHub ---
        for (const [cat, pkgs] of Object.entries(newAiCategories)) {
            if (!Array.isArray(pkgs)) continue;
            if (!existingCategories[cat]) existingCategories[cat] = [];
            
            const fixedPkgs = pkgs.map(pkg => {
                if (typeof pkg !== 'string') return '';
                return pkg.replace(/^קום\./, 'com.')
                          .replace(/^איל\./, 'il.')
                          .replace(/^אורג\./, 'org.');
            }).filter(Boolean);

            existingCategories[cat].push(...fixedPkgs);
            existingCategories[cat] = [...new Set(existingCategories[cat])];
        }

        await saveToGithub(existingCategories, currentSha, githubToken, githubUser, githubRepo, 'AI Auto-categorize new apps');
        return response.status(200).json({ success: true, categories: existingCategories });

    } catch (err) {
        console.error('Error in categorization process:', err);
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
