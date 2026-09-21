export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
    const GITHUB_USER = 'chanuta159-design';
    const GITHUB_REPO = 'aurora-whitelist';

    if (!GITHUB_TOKEN) {
        return response.status(500).json({ error: 'Missing GITHUB_TOKEN in environment variables' });
    }

    const body = request.body || {};
    const { repo, version, apkUrl, apkSize, iconUrl, manifest } = body;

    if (!manifest || !manifest.packageName || !apkUrl) {
        return response.status(400).json({ error: 'Missing required app information (packageName, apkUrl, manifest)' });
    }

    const pkg = manifest.packageName.trim();
    const appTitle = manifest.name || manifest.name_en || pkg;
    const appCategory = (manifest.category || '').trim();
    const appDesc = manifest.description || '';
    const now = new Date().toISOString();

    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AuroraStore-AppRegistrationService'
    };

    const fetchFile = async (filename) => {
        try {
            const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filename}`, { headers });
            if (res.ok) {
                const data = await res.json();
                return {
                    sha: data.sha,
                    content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'))
                };
            }
        } catch (_) {}
        return { sha: null, content: null };
    };

    const saveFile = async (filename, content, sha, commitMsg) => {
        const contentBase64 = Buffer.from(JSON.stringify(content, null, 2), 'utf8').toString('base64');
        const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filename}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                message: commitMsg,
                content: contentBase64,
                sha: sha || undefined
            })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Failed to save ${filename}: ${err.message}`);
        }
        return res.json();
    };

    try {
        const [sourcesFile, whitelistFile, namesFile, iconsFile, catFile, requestsFile] = await Promise.all([
            fetchFile('app-sources.json'),
            fetchFile('whitelist.json'),
            fetchFile('app-names.json'),
            fetchFile('app-icons.json'),
            fetchFile('categorized-whitelist.json'),
            fetchFile('pending-requests.json')
        ]);

        let appSources = sourcesFile.content || [];
        let whitelist = whitelistFile.content || [];
        let appNames = namesFile.content || [];
        let appIcons = iconsFile.content || {};
        let categorized = catFile.content || { "כללי": [] };
        let pendingRequests = requestsFile.content || [];

        // 1. עדכון ברשימת המקורות המאוחדת (שומר את התיאור האמיתי של המשתמש!)
        const existingSourceIdx = appSources.findIndex(a => a.packageName === pkg);
        const sourceRecord = {
            packageName: pkg,
            source: 'CUSTOM',
            name: appTitle,
            name_en: manifest.name_en || appTitle,
            category: appCategory,
            description: appDesc,
            iconUrl: iconUrl || (existingSourceIdx > -1 ? appSources[existingSourceIdx].iconUrl : ''),
            downloadUrl: apkUrl,
            size: Number(apkSize) || 0,
            versionName: version ? version.replace(/^v/, '') : '1.0.0',
            repo: repo || '',
            lastUpdated: now
        };

        if (existingSourceIdx > -1) {
            appSources[existingSourceIdx] = { ...appSources[existingSourceIdx], ...sourceRecord };
        } else {
            sourceRecord.addedAt = now;
            appSources.push(sourceRecord);
        }

        // 2. עדכון whitelist.json ו-app-names.json
        const wlIndex = whitelist.indexOf(pkg);
        if (wlIndex === -1) {
            whitelist.push(pkg);
            appNames.push(appTitle);
        } else {
            appNames[wlIndex] = appTitle;
        }

        // 3. עדכון app-icons.json
        if (iconUrl) {
            appIcons[pkg] = iconUrl;
        }

        // 4. בדיקת קטגוריה: רק אם הקטגוריה שהתבקשה קיימת כבר בלוח - משבצים אותה
        let categoryUpdated = false;
        const allCategorizedPkgs = new Set(Object.values(categorized).flat());
        if (!allCategorizedPkgs.has(pkg)) {
            if (appCategory && categorized[appCategory]) {
                categorized[appCategory].push(pkg);
                categoryUpdated = true;
            }
            // אם לא קיימת - האפליקציה תישאר מחוץ ל-categorized-whitelist.json
            // ותופיע אוטומטית בדשבורד במגש של "ממתינות לשיבוץ"!
        }

        // 5. ניקוי מ-pending-requests.json אם היה קיים
        const initialReqCount = pendingRequests.length;
        pendingRequests = pendingRequests.filter(r => r.packageName !== pkg);

        // 6. שמירת כל הקבצים ב-GitHub
        await saveFile('app-sources.json', appSources, sourcesFile.sha, `Update unified app source: ${appTitle} (${pkg})`);
        await saveFile('whitelist.json', whitelist, whitelistFile.sha, `Whitelist custom app: ${pkg}`);
        await saveFile('app-names.json', appNames, namesFile.sha, `Update name for: ${pkg}`);
        if (iconUrl) {
            await saveFile('app-icons.json', appIcons, iconsFile.sha, `Update icon for: ${pkg}`);
        }
        if (categoryUpdated) {
            await saveFile('categorized-whitelist.json', categorized, catFile.sha, `Categorize custom app into ${appCategory}: ${pkg}`);
        }
        if (pendingRequests.length !== initialReqCount) {
            await saveFile('pending-requests.json', pendingRequests, requestsFile.sha, `Resolved pending request for: ${pkg}`);
        }

        return response.status(200).json({
            success: true,
            message: `App ${appTitle} registered in unified sources successfully!`,
            app: sourceRecord
        });

    } catch (error) {
        console.error('Error registering app source:', error);
        return response.status(500).json({ error: error.message });
    }
}
