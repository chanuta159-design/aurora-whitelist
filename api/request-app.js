export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    // ה-Token של גיטהאב נלקח ממשתני הסביבה של Vercel
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
    const GITHUB_USER = 'chanuta159-design';
    const GITHUB_REPO = 'aurora-whitelist';

    if (!GITHUB_TOKEN) {
        return response.status(500).json({ error: 'Missing GITHUB_TOKEN in environment variables' });
    }

    // מקבל רשימת אפליקציות או אפליקציה בודדת
    const body = request.body || {};
    let incomingApps = [];
    if (Array.isArray(body.apps)) {
        incomingApps = body.apps;
    } else if (body.packageName) {
        incomingApps = [{ packageName: body.packageName, title: body.title, iconUrl: body.iconUrl }];
    }

    if (incomingApps.length === 0) {
        return response.status(400).json({ error: 'No apps provided' });
    }

    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AuroraStore-RequestService'
    };

    try {
        // 1. שליפת רשימת האפליקציות המאושרות (whitelist.json) כדי למנוע בקשות סרק
        let authorizedApps = [];
        try {
            const wlRes = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/whitelist.json`, { headers });
            if (wlRes.ok) {
                const wlData = await wlRes.json();
                authorizedApps = JSON.parse(Buffer.from(wlData.content, 'base64').toString('utf8'));
            }
        } catch (_) {}

        // 2. שליפת קובץ הבקשות הממתינות הקיים
        const requestsFileUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/pending-requests.json`;
        let pendingRequests = [];
        let currentSha = null;

        const reqRes = await fetch(requestsFileUrl, { headers });
        if (reqRes.ok) {
            const reqData = await reqRes.json();
            currentSha = reqData.sha;
            pendingRequests = JSON.parse(Buffer.from(reqData.content, 'base64').toString('utf8'));
        }

        // 3. עיבוד הבקשות הנכנסות
        let updatedCount = 0;
        const now = new Date().toISOString();

        for (const app of incomingApps) {
            const pkg = (app.packageName || '').trim();
            if (!pkg) continue;

            // אם האפליקציה כבר מאושרת בחנות - מדלגים
            if (authorizedApps.includes(pkg)) continue;

            const existingIndex = pendingRequests.findIndex(r => r.packageName === pkg);

            if (existingIndex > -1) {
                // העלאת מונה לבקשה קיימת
                pendingRequests[existingIndex].requestCount = (pendingRequests[existingIndex].requestCount || 1) + 1;
                pendingRequests[existingIndex].lastRequestedAt = now;
                if (app.title && !pendingRequests[existingIndex].title) {
                    pendingRequests[existingIndex].title = app.title;
                }
                if (app.iconUrl && !pendingRequests[existingIndex].iconUrl) {
                    pendingRequests[existingIndex].iconUrl = app.iconUrl;
                }
            } else {
                // הוספת בקשה חדשה
                pendingRequests.push({
                    packageName: pkg,
                    title: app.title || pkg,
                    iconUrl: app.iconUrl || '',
                    requestCount: 1,
                    firstRequestedAt: now,
                    lastRequestedAt: now
                });
            }
            updatedCount++;
        }

        if (updatedCount === 0) {
            return response.status(200).json({ success: true, message: 'Apps already in whitelist or invalid', added: 0 });
        }

        // 4. שמירת הקובץ המעודכן ב-GitHub
        const contentBase64 = Buffer.from(JSON.stringify(pendingRequests, null, 2)).toString('base64');
        const putRes = await fetch(requestsFileUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                message: `Update pending app requests (+${updatedCount})`,
                content: contentBase64,
                sha: currentSha || undefined
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            throw new Error(`GitHub save failed: ${err.message}`);
        }

        return response.status(200).json({ success: true, processed: updatedCount });

    } catch (err) {
        console.error('Error handling app request:', err);
        return response.status(500).json({ error: err.message });
    }
}
