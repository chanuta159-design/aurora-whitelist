document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const ALLOWED_USERS = ['lilo159357'];
    const GITHUB_USER = 'lilo159357';
    const GITHUB_REPO = 'aurora-whitelist';

    // --- STATE MANAGEMENT ---
    let authorizedApps = [], debounceTimer, fileSHA, githubToken = null, githubUser = '', githubRepo = '';
    let appNameCache = {}; // Our new cache for friendly names

    // --- DOM ELEMENT REFERENCES ---
    const appContainer = document.getElementById('appContainer');
    const loginContainer = document.getElementById('loginContainer');
    // ... (rest of the DOM elements are the same)
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

    // --- CREDENTIALS ---
    const GOOGLE_API_KEY = 'AIzaSyDJOTpSjqi5PEew0nMJ2clRQFtJye9ByhU';
    const SEARCH_ENGINE_ID = 'd3210826cacdd48ee';
    const GITHUB_CLIENT_ID = 'Ov23li1YXH2AXhWQAgER';

    // --- UI LOGIC ---
    const showEditor = () => { /* ... same as before ... */ };
    const showLogin = () => { /* ... same as before ... */ };
    const showAccessDenied = () => { /* ... same as before ... */ };

    // --- CORE FUNCTIONS ---
    const renderList = () => {
        currentListDiv.innerHTML = '';
        authorizedApps.forEach(packageName => {
            const friendlyName = appNameCache[packageName] || packageName;
            const isFallback = friendlyName === packageName;

            const listItem = document.createElement('div');
            listItem.className = 'list-item';
            // NEW: Show friendly name, and show package name as smaller text
            listItem.innerHTML = `
                <div class="app-info">
                    <strong>${friendlyName}</strong>
                    ${!isFallback ? `<span class="app-package-name">${packageName}</span>` : ''}
                </div>
                <button><span>Remove</span></button>
            `;
            listItem.querySelector('button').addEventListener('click', () => removeApp(packageName));
            currentListDiv.appendChild(listItem);
        });
    };

    const addApp = (packageName, friendlyName) => {
        if (packageName && !authorizedApps.includes(packageName)) {
            // NEW: Update the name cache when adding an app
            if (friendlyName) {
                appNameCache[packageName] = friendlyName;
                localStorage.setItem('appNameCache', JSON.stringify(appNameCache));
            }
            authorizedApps.push(packageName);
            authorizedApps.sort();
            renderList();
        } else {
            alert(`${packageName} is already in the list.`);
        }
    };
    
    // --- GITHUB API FUNCTIONS ---
    const loadWhitelistFromGitHub = async () => {
        if (!githubUser || !githubRepo) return;
        showStatus('Loading whitelist...');
        try {
            const response = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, { headers: { 'Authorization': `token ${githubToken}` } });
            if (!response.ok) {
                if(response.status === 404) { showStatus('whitelist.json not found.', true); authorizedApps = []; fileSHA = null; }
                else { throw new Error(response.statusText); }
            } else {
                const data = await response.json();
                fileSHA = data.sha;
                authorizedApps = JSON.parse(atob(data.content));
                showStatus('Loaded successfully!');
            }
            renderList(); // Render the list after loading
        } catch (error) {
            showStatus(error.message, true);
        }
    };
    
    // --- GOOGLE SEARCH API FUNCTIONS ---
    const displayGoogleResults = (results) => {
        searchResultsDiv.innerHTML = '';
        results.forEach(app => {
            try {
                const appUrl = new URL(app.link);
                const bundle_id = appUrl.searchParams.get('id');
                if (!bundle_id) return;
                const cleanTitle = app.title.split('-')[0].trim();

                const resultItem = document.createElement('div');
                resultItem.className = 'search-result-item';
                resultItem.innerHTML = `<div class="app-info"><strong>${cleanTitle}</strong><small>${bundle_id}</small></div><button>Add</button>`;
                
                resultItem.querySelector('button').addEventListener('click', () => {
                    // CHANGED: Pass both the ID and the clean title to addApp
                    addApp(bundle_id, cleanTitle);
                    // NEW: Collapse the search results after adding
                    searchResultsDiv.style.display = 'none';
                    searchInput.value = ''; // Optional: clear the search bar
                });

                searchResultsDiv.appendChild(resultItem);
            } catch (e) {}
        });
    };
    
    // --- INITIALIZATION ---
    const init = async () => {
        // NEW: Load the name cache from localStorage at the very beginning
        appNameCache = JSON.parse(localStorage.getItem('appNameCache')) || {};
        // The rest of the init function is the same
        const urlParams = new URLSearchParams(window.location.search);
        // ... (rest of init is unchanged)
    };

    // --- (The rest of your script.js file remains exactly the same) ---
    // Make sure to paste this into your file, keeping the other functions.
    // I am abbreviating them here to avoid a huge wall of text.

    // --- Repasting the full script for you below to be safe ---

    const fullScript = () => {
        // --- UI LOGIC ---
        showEditor = () => { loginContainer.style.display = 'none'; accessDeniedContainer.style.display = 'none'; appContainer.style.display = 'block'; repoNameSpan.textContent = `${githubUser}/${githubRepo}`; loadWhitelistFromGitHub(); };
        showLogin = () => { appContainer.style.display = 'none'; accessDeniedContainer.style.display = 'none'; loginContainer.style.display = 'block'; };
        showAccessDenied = () => { appContainer.style.display = 'none'; loginContainer.style.display = 'none'; accessDeniedContainer.style.display = 'block'; };
        // --- CORE FUNCTIONS ---
        removeApp = (pkg) => { authorizedApps = authorizedApps.filter(app => app !== pkg); renderList(); };
        showStatus = (msg, isErr) => { statusMessage.textContent = msg; statusMessage.className = isErr ? 'status-message error' : 'status-message success'; setTimeout(() => statusMessage.textContent = '', 4000); };
        // --- GITHUB API FUNCTIONS ---
        saveWhitelistToGitHub = async () => { if (!githubUser || !githubRepo || !githubToken) { showStatus('Auth error.', true); return; } showStatus('Saving...'); const content = JSON.stringify(authorizedApps, null, 2); const body = { message: 'Updated whitelist via online editor', content: btoa(content), sha: fileSHA }; try { const res = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, { method: 'PUT', headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await res.json(); if (!res.ok) throw new Error(data.message); fileSHA = data.content.sha; showStatus('Saved successfully!'); } catch (err) { showStatus(err.message, true); } };
        // --- GOOGLE SEARCH API FUNCTIONS ---
        searchApps = async () => { const query = searchInput.value.trim(); if (query.length < 3) { searchResultsDiv.style.display = 'none'; return; } searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">Searching...</div>'; searchResultsDiv.style.display = 'block'; const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`; try { const res = await fetch(url); const data = await res.json(); if (data.items && data.items.length > 0) { displayGoogleResults(data.items); } else { searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">No apps found.</div>'; } } catch (err) { searchResultsDiv.innerHTML = 'Error fetching results.'; } };
        // --- AUTHENTICATION LOGIC ---
        handleLogin = () => { localStorage.setItem('githubUser', GITHUB_USER); localStorage.setItem('githubRepo', GITHUB_REPO); window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo`; };
        handleLogout = () => { localStorage.clear(); window.location.href = window.location.pathname; };
        // --- INITIALIZATION ---
        init = async () => {
            appNameCache = JSON.parse(localStorage.getItem('appNameCache')) || {};
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
        init();
    };
    fullScript();
});
