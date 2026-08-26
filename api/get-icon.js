import gplay from 'google-play-scraper';

export default async function handler(request, response) {
    const pkg = request.query.pkg;

    if (!pkg) {
        return response.status(400).json({ error: 'Missing pkg parameter' });
    }

    try {
        // שליפת נתונים רשמית ויציבה דרך השרת שלך
        const appInfo = await gplay.app({ appId: pkg, country: 'il' });
        if (appInfo && appInfo.icon) {
            return response.status(200).json({ success: true, icon: appInfo.icon });
        }
        return response.status(404).json({ error: 'Icon not found' });
    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}