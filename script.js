document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const ALLOWED_USERS = ['lilor159357']; // Add more usernames here if needed
    const GITHUB_USER = 'lilor159357'; // Your GitHub username
    const GITHUB_REPO = 'aurora-whitelist'; // The name of your repository

    // --- STATE MANAGEMENT ---
    // MODIFICATION: Added packageNameMap to cache app names
    let authorizedApps = [], debounceTimer, fileSHA, githubToken = null, githubUser = '', githubRepo = '', packageNameMap = {};

    // --- DOM ELEMENT REFERENCES ---
    const appContainer = document.getElementById('appContainer');
    const loginContainer = document.getElementById('loginContainer');
    const accessDeniedContainer = document.getElementById('accessDeniedContainer');
    const searchWrapper = document.querySelector('.search-wrapper');
    const searchInput = document.getElementById('searchInput');
    const searchResultsDiv = document.getElementById('searchResults');
    const currentListDiv = document.getElementById('currentList');
    const repoNameSpan = document.getElementById('repoName');
    const saveButton = document.getElementById('saveButton');
    const logoutButton = document.getElementById('logoutButton');
    const deniedLogoutButton = document.getElementById('deniedLogoutButton');
    const loginButton = document.getElementById('loginButton');
    const statusMessage = document.getElementById('statusMessage');
    const githubUserInput = document.getElementById('githubUser');
    const githubRepoInput = document.getElementById('githubRepo');

    // --- GOOGLE API & GITHUB OAUTH CREDENTIALS ---
    const GOOGLE_API_KEY = 'AIzaSyDJOTpSjqi5PEew0nMJ2clRQFtJye9ByhU';
    const SEARCH_ENGINE_ID = 'd3210826cacdd48ee';
    const GITHUB_CLIENT_ID = 'Ov23li1YXH2AXhWQAgER';

    // --- UI LOGIC ---
    const showEditor = () => { loginContainer.style.display = 'none'; accessDeniedContainer.style.display = 'none'; appContainer.style.display = 'block'; repoNameSpan.textContent = `${githubUser}/${githubRepo}`; loadWhitelistFromGitHub(); };
    const showLogin = () => { appContainer.style.display = 'none'; accessDeniedContainer.style.display = 'none'; loginContainer.style.display = 'block'; githubUserInput.value = localStorage.getItem('githubUser') || ''; githubRepoInput.value = localStorage.getItem('githubRepo') || ''; };
    const showAccessDenied = () => { appContainer.style.display = 'none'; loginContainer.style.display = 'none'; accessDeniedContainer.style.display = 'block'; };

    // --- CORE FUNCTIONS ---

    // MODIFICATION: renderList now uses packageNameMap to show friendly names.
    // It also includes the package name in a smaller font for clarity.
    const renderList = () => {
        currentListDiv.innerHTML = '';
        authorizedApps.forEach(pkg => {
            const displayName = packageNameMap[pkg] || pkg; // Use cached name or fallback to package name
            const item = document.createElement('div');
            item.className = 'list-item';
            // Display friendly name prominently, with package name below
            item.innerHTML = `<div class="app-info"><strong>${displayName}</strong><small style="display: block; opacity: 0.7;">${pkg}</small></div><button><span>Remove</span></button>`;
            item.querySelector('button').addEventListener('click', () => removeApp(pkg));
            currentListDiv.appendChild(item);
        });
    };

    // MODIFICATION: addApp now accepts a 'title' to store in the name cache.
    const addApp = (pkg, title) => {
        if (pkg && !authorizedApps.includes(pkg)) {
            authorizedApps.push(pkg);
            if (title) {
                packageNameMap[pkg] = title; // Cache the name
            }
            authorizedApps.sort();
            renderList();
        } else {
            alert(`${pkg} is already in the list.`);
        }
    };

    const removeApp = (pkg) => { authorizedApps = authorizedApps.filter(app => app !== pkg); renderList(); };
    const showStatus = (msg, isErr) => { statusMessage.textContent = msg; statusMessage.className = isErr ? 'status-message error' : 'status-message success'; setTimeout(() => statusMessage.textContent = '', 4000); };

    // --- GITHUB API FUNCTIONS ---

    // MODIFICATION: After loading the whitelist, it now fetches the app names.
    const loadWhitelistFromGitHub = async () => {
        if (!githubUser || !githubRepo) return;
        showStatus('Loading whitelist...');
        try {
            const res = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, { headers: { 'Authorization': `token ${githubToken}` } });
            if (!res.ok) {
                if (res.status === 404) {
                    showStatus('whitelist.json not found.', true);
                    authorizedApps = [];
                    fileSHA = null;
                } else {
                    throw new Error(res.statusText);
                }
            } else {
                const data = await res.json();
                fileSHA = data.sha;
                authorizedApps = JSON.parse(atob(data.content));
                showStatus('Loaded successfully!');
            }
            renderList(); // Render once with package names
            fetchAppNamesForWhitelist(); // Then, fetch and update with real names
        } catch (err) {
            showStatus(err.message, true);
        }
    };

    const saveWhitelistToGitHub = async () => { if (!githubUser || !githubRepo || !githubToken) { showStatus('Auth error.', true); return; } showStatus('Saving...'); const content = JSON.stringify(authorizedApps, null, 2); const body = { message: 'Updated whitelist via online editor', content: btoa(content), sha: fileSHA }; try { const res = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, { method: 'PUT', headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await res.json(); if (!res.ok) throw new Error(data.message); fileSHA = data.content.sha; showStatus('Saved successfully!'); } catch (err) { showStatus(err.message, true); } };

    // --- GOOGLE SEARCH API FUNCTIONS ---
    
    // NEW FUNCTION: Fetches the name for a single package ID and caches it.
    const fetchAppName = async (pkg) => {
        if (packageNameMap[pkg]) return; // Don't fetch if already in cache

        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(pkg)}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                const title = data.items[0].title.split('-')[0].trim();
                packageNameMap[pkg] = title;
            }
        } catch (err) {
            console.error(`Failed to fetch name for ${pkg}:`, err);
        }
    };

    // NEW FUNCTION: Iterates the whitelist and fetches names for all apps.
    const fetchAppNamesForWhitelist = async () => {
        const promises = authorizedApps.map(pkg => fetchAppName(pkg));
        await Promise.all(promises);
        renderList(); // Re-render the list now that names are cached
    };
    
    const searchApps = async () => { const query = searchInput.value.trim(); if (query.length < 3) { searchResultsDiv.style.display = 'none'; return; } searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">Searching...</div>'; searchResultsDiv.style.display = 'block'; const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`; try { const res = await fetch(url); const data = await res.json(); if (data.items && data.items.length > 0) { displayGoogleResults(data.items); } else { searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">No apps found.</div>'; } } catch (err) { searchResultsDiv.innerHTML = 'Error fetching results.'; } };
    
    // MODIFICATION: displayGoogleResults now passes the app title to addApp.
    const displayGoogleResults = (results) => {
        searchResultsDiv.innerHTML = '';
        results.forEach(app => {
            try {
                const url = new URL(app.link);
                const id = url.searchParams.get('id');
                if (!id) return;
                const title = app.title.split('-')[0].trim();
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `<div class="app-info"><strong>${title}</strong><small>${id}</small></div><button>Add</button>`;
                item.querySelector('button').addEventListener('click', () => {
                addApp(id, title);
                searchResultsDiv.style.display = 'none'; // Hide results after adding
                });
                searchResultsDiv.appendChild(item);
            } catch (e) { }
        });
    };
    
    // --- AUTHENTICATION LOGIC ---
    const handleLogin = () => {
        localStorage.setItem('githubUser', GITHUB_USER);
        localStorage.setItem('githubRepo', GITHUB_REPO);
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo`;
    };
    
    const handleLogout = () => {
        localStorage.clear();
        window.location.href = window.location.pathname;
    };

    // --- INITIALIZATION ---
    const init = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const codeFromRedirect = urlParams.get('code');

        if (codeFromRedirect) {
            loginContainer.innerHTML = '<h1>Authenticating... Please wait.</h1>';
            try {
                const tokenRes = await fetch(`/api/github-callback?code=${codeFromRedirect}`);
                if (!tokenRes.ok) throw new Error('Failed to get token from server.');
                const tokenData = await tokenRes.json();
                const tempToken = tokenData.token;
                if (!tempToken) throw new Error('Token was not returned.');

                const userRes = await fetch('https://api.github.com/user', { headers: { 'Authorization': `token ${tempToken}` } });
                if (!userRes.ok) throw new Error('Failed to get user profile from GitHub.');
                const userData = await userRes.json();
                
                if (ALLOWED_USERS.includes(userData.login)) {
                    localStorage.setItem('githubToken', tempToken);
                    window.location.href = window.location.pathname;
                } else {
                    localStorage.clear();
                    showAccessDenied();
                }
            } catch (error) {
                alert(`Login Error: ${error.message}`);
                console.error(error);
                window.location.href = window.location.pathname;
            }
        } else {
            githubToken = localStorage.getItem('githubToken');
            githubUser = localStorage.getItem('githubUser');
            githubRepo = localStorage.getItem('githubRepo');
            if (githubToken && githubUser && githubRepo) {
                showEditor();
            } else {
                showLogin();
            }
        }
    };
    
    // --- EVENT LISTENERS ---
    loginButton.addEventListener('click', handleLogin);
    logoutButton.addEventListener('click', handleLogout);
    deniedLogoutButton.addEventListener('click', handleLogout);
    saveButton.addEventListener('click', saveWhitelistToGitHub);
    searchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(searchApps, 500); });
    document.addEventListener('click', (event) => { if (!searchWrapper.contains(event.target)) { searchResultsDiv.style.display = 'none'; } });

    init(); // Start the application
});
