export default async function handler(request, response) {
    const { code } = request.query;

    const client_id = process.env.GITHUB_CLIENT_ID;
    const client_secret = process.env.GITHUB_CLIENT_SECRET;

    try {
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ client_id, client_secret, code }),
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            throw new Error('Failed to retrieve access token.');
        }

        // Redirect back to the homepage, passing the token in the URL hash
        // The front-end will grab it from here and save it to localStorage.
        response.redirect(`/?token=${accessToken}`);

    } catch (error) {
        console.error(error);
        response.status(500).send('Authentication failed.');
    }
}
