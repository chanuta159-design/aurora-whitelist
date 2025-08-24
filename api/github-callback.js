export default async function handler(request, response) {
    const { code } = request.query;

    const client_id = process.env.GITHUB_CLIENT_ID;
    const client_secret = process.env.GITHUB_CLIENT_SECRET;

    if (!code) {
        return response.status(400).json({ error: 'No code provided.' });
    }

    try {
        // --- THIS IS THE CORRECTED URL ---
        const tokenResponse = await fetch('https://api.github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ client_id, client_secret, code }),
        });

        const tokenData = await tokenResponse.json();
        console.log("GitHub's Raw Response:", JSON.stringify(tokenData, null, 2));

        const accessToken = tokenData.access_token;
        if (!accessToken) {
            // Include GitHub's error in our response for better debugging
            const errorMessage = tokenData.error_description || 'Failed to retrieve access token. Check Vercel logs.';
            throw new Error(errorMessage);
        }

        response.status(200).json({ token: accessToken });

    } catch (error) {
        console.error('Error in GitHub callback:', error.message);
        response.status(500).json({ error: 'Authentication failed.' });
    }
}
