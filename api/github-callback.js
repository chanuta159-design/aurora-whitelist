export default async function handler(request, response) {
    const { code } = request.query;

    const client_id = process.env.GITHUB_CLIENT_ID;
    const client_secret = process.env.GITHUB_CLIENT_SECRET;

    if (!code) {
        return response.status(400).json({ error: 'No code provided.' });
    }

    try {
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ client_id, client_secret, code }),
        });

        const tokenData = await tokenResponse.json();

        // --- THIS IS THE NEW DEBUGGING LINE ---
        // It will print the exact response from GitHub to your Vercel logs.
        console.log("GitHub's Raw Response:", JSON.stringify(tokenData, null, 2));

        const accessToken = tokenData.access_token;

        if (!accessToken) {
            // This error will still happen, but now the log above will tell us why.
            throw new Error('Failed to retrieve access token from GitHub. Check Vercel logs for details.');
        }

        response.status(200).json({ token: accessToken });

    } catch (error) {
        console.error('Error in GitHub callback:', error);
        response.status(500).json({ error: 'Authentication failed.' });
    }
}
