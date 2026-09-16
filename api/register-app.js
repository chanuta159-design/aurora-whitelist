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
    const appCategory = manifest.category || 'כלים';
    const appDesc = manifest.description || '';
    const now = new Date().toISOString();

    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AuroraStore-AppRegistrationService'
    };

    // פונקציות עזר לשליפה ושמירה ב-GitHub
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
        // 1. קריאת הקבצים הרלוונטיים מ-GitHub
        const [customAppsFile, whitelistFile, namesFile, iconsFile, catFile, requestsFile] = await Promise.all([
            fetchFile('custom-apps.json'),
            fetchFile('whitelist.json'),
            fetchFile('app-names.json'),
            fetchFile('app-icons.json'),
            fetchFile('categorized-whitelist.json'),
            fetchFile('pending-requests.json')
        ]);

        let customApps = customAppsFile.content || [];
        let whitelist = whitelistFile.content || [];
        let appNames = namesFile.content || [];
        let appIcons = iconsFile.content || {};
        let categorized = catFile.content || { "כללי": [] };
        let pendingRequests = requestsFile.content || [];

        // 2. עדכון custom-apps.json
        const existingCustomIdx = customApps.findIndex(a => a.packageName === pkg);
        const appRecord = {
            packageName: pkg,
            name: appTitle,
            name_en: manifest.name_en || appTitle,
            category: appCategory,
            description: appDesc,
            iconUrl: iconUrl || (existingCustomIdx > -1 ? customApps[existingCustomIdx].iconUrl : ''),
            downloadUrl: apkUrl,
            size: Number(apkSize) || 0,
            versionName: version ? version.replace(/^v/, '') : '1.0.0',
            repo: repo || '',
            lastUpdated: now
        };

        if (existingCustomIdx > -1) {
            customApps[existingCustomIdx] = { ...customApps[existingCustomIdx], ...appRecord };
        } else {
            appRecord.addedAt = now;
            customApps.push(appRecord);
        }

        // 3. עדכון whitelist.json ו-app-names.json
        const wlIndex = whitelist.indexOf(pkg);
        if (wlIndex === -1) {
            whitelist.push(pkg);
            appNames.push(appTitle);
        } else {
            appNames[wlIndex] = appTitle;
        }

        // 4. עדכון app-icons.json
        if (iconUrl) {
            appIcons[pkg] = iconUrl;
        }

        // 5. עדכון categorized-whitelist.json
        const allCategorizedPkgs = new Set(Object.values(categorized).flat());
        if (!allCategorizedPkgs.has(pkg)) {
            if (!categorized[appCategory]) {
                categorized[appCategory] = [];
            }
            categorized[appCategory].push(pkg);
        }

        // 6. ניקוי מ-pending-requests.json אם היה קיים
        const initialReqCount = pendingRequests.length;
        pendingRequests = pendingRequests.filter(r => r.packageName !== pkg);

        // 7. שמירת השינויים ב-GitHub
        await saveFile('custom-apps.json', customApps, customAppsFile.sha, `Register custom app: ${appTitle} (${pkg})`);
        await saveFile('whitelist.json', whitelist, whitelistFile.sha, `Whitelist custom app: ${pkg}`);
        await saveFile('app-names.json', appNames, namesFile.sha, `Update name for: ${pkg}`);
        if (iconUrl) {
            await saveFile('app-icons.json', appIcons, iconsFile.sha, `Update icon for: ${pkg}`);
        }
        await saveFile('categorized-whitelist.json', categorized, catFile.sha, `Categorize custom app: ${pkg}`);
        if (pendingRequests.length !== initialReqCount) {
            await saveFile('pending-requests.json', pendingRequests, requestsFile.sha, `Resolved pending request for: ${pkg}`);
        }

        return response.status(200).json({
            success: true,
            message: `App ${appTitle} registered and whitelisted successfully!`,
            app: appRecord
        });

    } catch (error) {
        console.error('Error registering custom app:', error);
        return response.status(500).json({ error: error.message });
    }
}
