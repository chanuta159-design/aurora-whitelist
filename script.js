document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const ALLOWED_USERS = ['chanuta159-design']; // Add more usernames here if needed
    const GITHUB_USER = 'chanuta159-design'; // Your GitHub username
    const GITHUB_REPO = 'aurora-whitelist'; // The name of your repository

    // --- STATE MANAGEMENT ---
    // MODIFICATION: Added packageNameMap to cache app names
    let authorizedApps = [], appNames = [], debounceTimer, fileSHA, namesFileSHA, githubToken = null, githubUser = '', githubRepo = ''; // The packageNameMap is no longer needed, as appNames replaces it.

    // --- DOM ELEMENT REFERENCES ---
    // --- NEW HELPER FUNCTIONS FOR UNICODE ---
const encodeUnicode = (str) => {
    // First, URI-encode the string to handle Unicode characters, then convert to a format btoa can handle.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

const decodeUnicode = (str) => {
    // First, decode from base64, then decode the URI-encoded parts to get the original Unicode string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}
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
    const GOOGLE_API_KEY = 'AIzaSyD3YjTEIwAnBBIV7LzuRcQVHmTTB27og9o';
    const SEARCH_ENGINE_ID = 'b769d79cff32c40de';
    const GITHUB_CLIENT_ID = 'Ov23ligwsbAgnDvz3yp0';

    // --- UI LOGIC ---
    const showEditor = () => { loginContainer.style.display = 'none'; accessDeniedContainer.style.display = 'none'; appContainer.style.display = 'block'; repoNameSpan.textContent = `${githubUser}/${githubRepo}`; loadWhitelistFromGitHub(); };
    const showLogin = () => { appContainer.style.display = 'none'; accessDeniedContainer.style.display = 'none'; loginContainer.style.display = 'block'; githubUserInput.value = localStorage.getItem('githubUser') || ''; githubRepoInput.value = localStorage.getItem('githubRepo') || ''; };
    const showAccessDenied = () => { appContainer.style.display = 'none'; loginContainer.style.display = 'none'; accessDeniedContainer.style.display = 'block'; };

    // --- CORE FUNCTIONS ---

    // MODIFICATION: renderList now uses packageNameMap to show friendly names.
    // It also includes the package name in a smaller font for clarity.
    const renderList = () => {
    currentListDiv.innerHTML = '';
    authorizedApps.forEach((pkg, index) => {
        const displayName = appNames[index] || pkg; // Use the name from our list, or fallback to the package name
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `<div class="app-info"><strong>${displayName}</strong><small style="display: block; opacity: 0.7;">${pkg}</small></div><button><span>Remove</span></button>`;
        item.querySelector('button').addEventListener('click', () => removeApp(pkg));
        currentListDiv.appendChild(item);
    });
};

    // MODIFICATION: addApp now accepts a 'title' to store in the name cache.
    const addApp = (pkg, title) => {
    if (pkg && !authorizedApps.includes(pkg)) {
        authorizedApps.push(pkg);
        appNames.push(title); // Add the name to the parallel array
        renderList();
    } else {
        alert(`${title} (${pkg}) is already in the list.`);
    }
};

const removeApp = (pkg) => {
    const indexToRemove = authorizedApps.indexOf(pkg);
    if (indexToRemove > -1) {
        authorizedApps.splice(indexToRemove, 1); // Remove package
        appNames.splice(indexToRemove, 1);       // Remove name at the same index
    }
    renderList();
};
    const showStatus = (msg, isErr) => { statusMessage.textContent = msg; statusMessage.className = isErr ? 'status-message error' : 'status-message success'; setTimeout(() => statusMessage.textContent = '', 4000); };

    // --- GITHUB API FUNCTIONS ---

    // MODIFICATION: After loading the whitelist, it now fetches the app names.
    const loadWhitelistFromGitHub = async () => {
    if (!githubUser || !githubRepo) return;
    showStatus('טוען רשימה לבנה...');

    const packageUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`;
    const namesUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-names.json`;
    const headers = { 'Authorization': `token ${githubToken}` };

    try {
        const [packageRes, namesRes] = await Promise.all([
            fetch(packageUrl, { headers }),
            fetch(namesUrl, { headers })
        ]);

        // Process packages file (whitelist.json)
        if (packageRes.ok) {
            const data = await packageRes.json();
            fileSHA = data.sha;
            authorizedApps = JSON.parse(decodeUnicode(data.content));
        } else {
            // If the main whitelist doesn't exist, start with an empty list
            fileSHA = null;
            authorizedApps = [];
        }

        // Process names file (app-names.json)
        if (namesRes.ok) {
            const data = await namesRes.json();
            namesFileSHA = data.sha;
            appNames = JSON.parse(decodeUnicode(data.content));
        } else {
            // If the names file doesn't exist, start with an empty list
            namesFileSHA = null;
            appNames = [];
        }

        // Important: Ensure lists are synchronized
        if (authorizedApps.length !== appNames.length) {
            showStatus('אזהרה: הרשימה הלבנה אינה מסונכרת עם רשימת השמות , אנא בדוק את המאגר שלך (ריפו).', true);
            // As a fallback, we can create placeholder names
            appNames = authorizedApps.map(pkg => pkg); 
        }

        showStatus('נטען בהצלחה!');
        renderList();

    } catch (err) {
        showStatus(`Error loading files: ${err.message}`, true);
    }
};

const saveWhitelistToGitHub = async () => {
    if (!githubUser || !githubRepo || !githubToken) {
        showStatus('Authentication error.', true);
        return;
    }
    showStatus('שומר...');

    try {
        // --- Save whitelist.json ---
        const packageContent = JSON.stringify(authorizedApps, null, 2);
        const packageBody = {
            message: 'Updated whitelist packages via online editor',
            content: encodeUnicode(packageContent),
            sha: fileSHA
        };
        const packageRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(packageBody)
        });
        const packageData = await packageRes.json();
        if (!packageRes.ok) throw new Error(`Failed to save whitelist.json: ${packageData.message}`);
        fileSHA = packageData.content.sha; // Update the SHA

        // --- Save app-names.json ---
        const namesContent = JSON.stringify(appNames, null, 2);
        const namesBody = {
            message: 'Updated whitelist names via online editor',
            content: encodeUnicode(namesContent),
            sha: namesFileSHA
        };
        const namesRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-names.json`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(namesBody)
        });
        const namesData = await namesRes.json();
        if (!namesRes.ok) throw new Error(`Failed to save app-names.json: ${namesData.message}`);
        namesFileSHA = namesData.content.sha; // Update the SHA

        showStatus('נשמר בהצלחה!');
    } catch (err) {
        showStatus(err.message, true);
    }
};
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
