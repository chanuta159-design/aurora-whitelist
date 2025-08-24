document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let authorizedApps = [];
    let debounceTimer;
    let fileSHA;
    let githubToken = null;
    let githubUser = '';
    let githubRepo = '';

    // --- DOM ELEMENT REFERENCES ---
    const appContainer = document.getElementById('appContainer');
    const loginContainer = document.getElementById('loginContainer');
    const searchWrapper = document.querySelector('.search-wrapper');
    const searchInput = document.getElementById('searchInput');
    const searchResultsDiv = document.getElementById('searchResults');
    const currentListDiv = document.getElementById('currentList');
    const repoNameSpan = document.getElementById('repoName');
    const saveButton = document.getElementById('saveButton');
    const logoutButton = document.getElementById('logoutButton');
    const loginButton = document.getElementById('loginButton');
    const statusMessage = document.getElementById('statusMessage');
    const githubUserInput = document.getElementById('githubUser');
    const githubRepoInput = document.getElementById('githubRepo');

    // --- GOOGLE API CREDENTIALS ---
    const GOOGLE_API_KEY = 'AIzaSyDJOTpSjqi5PEew0nMJ2clRQFtJye9ByhU';
    const SEARCH_ENGINE_ID = 'd3210826cacdd48ee';

    // --- GITHUB OAUTH APP CLIENT ID ---
    // IMPORTANT: Make sure you have replaced this with your real Client ID
    const GITHUB_CLIENT_ID = 'Iv23liG4e2UjaVjKhUSa';

    // --- UI LOGIC ---
    const showEditor = () => {
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        repoNameSpan.textContent = `${githubUser}/${githubRepo}`;
        loadWhitelistFromGitHub();
    };

    const showLogin = () => {
        appContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    };

    // --- CORE FUNCTIONS ---
    const renderList = () => { currentListDiv.innerHTML = ''; authorizedApps.forEach(packageName => { const listItem = document.createElement('div'); listItem.className = 'list-item'; listItem.innerHTML = `<div class="app-info"><strong>${packageName}</strong></div><button><span>Remove</span></button>`; listItem.querySelector('button').addEventListener('click', () => removeApp(packageName)); currentListDiv.appendChild(listItem); }); };
    const addApp = (packageName) => { if (packageName && !authorizedApps.includes(packageName)) { authorizedApps.push(packageName); authorizedApps.sort(); renderList(); } else { alert(`${packageName} is already in the list.`); } };
    const removeApp = (packageName) => { authorizedApps = authorizedApps.filter(app => app !== packageName); renderList(); };
    const showStatus = (message, isError = false) => { statusMessage.textContent = message; statusMessage.className = isError ? 'status-message error' : 'status-message success'; setTimeout(() => statusMessage.textContent = '', 4000); };

    // --- GITHUB API FUNCTIONS ---
    const loadWhitelistFromGitHub = async () => { if (!githubUser || !githubRepo) return; showStatus('Loading whitelist from GitHub...'); try { const response = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, { headers: { 'Authorization': `token ${githubToken}` } }); if (!response.ok) { if(response.status === 404) { showStatus('whitelist.json not found. A new one will be created on save.', true); authorizedApps = []; fileSHA = null; } else { throw new Error(`GitHub API Error: ${response.statusText}`); } } else { const data = await response.json(); fileSHA = data.sha; const content = atob(data.content); authorizedApps = JSON.parse(content); showStatus('Whitelist loaded successfully!'); } renderList(); } catch (error) { showStatus(error.message, true); } };
    const saveWhitelistToGitHub = async () => { if (!githubUser || !githubRepo || !githubToken) { showStatus('Authentication error. Please log in again.', true); return; } showStatus('Saving to GitHub...'); const content = JSON.stringify(authorizedApps, null, 2); const encodedContent = btoa(content); const body = { message: 'Updated whitelist via online editor', content: encodedContent, sha: fileSHA }; try { const response = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, { method: 'PUT', headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) { throw new Error(`GitHub API Error: ${data.message}`); } fileSHA = data.content.sha; showStatus('Whitelist saved successfully!'); } catch (error) { showStatus(error.message, true); } };
    
    // --- GOOGLE SEARCH API FUNCTIONS ---
    const searchApps = async () => { const query = searchInput.value.trim(); if (query.length < 3) { searchResultsDiv.innerHTML = ''; searchResultsDiv.style.display = 'none'; return; } searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">Searching...</div>'; searchResultsDiv.style.display = 'block'; const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`; try { const response = await fetch(url); const data = await response.json(); if (data && data.items && data.items.length > 0) { displayGoogleResults(data.items); } else { searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">No apps found.</div>'; } } catch (error) { searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #dc3545;">Error fetching results.</div>'; console.error("Fetch Error:", error); } };
    const displayGoogleResults = (results) => { searchResultsDiv.innerHTML = ''; results.forEach(app => { try { const appUrl = new URL(app.link); const bundle_id = appUrl.searchParams.get('id'); if (!bundle_id) return; const cleanTitle = app.title.split('-')[0].trim(); const resultItem = document.createElement('div'); resultItem.className = 'search-result-item'; resultItem.innerHTML = `<div class="app-info"><strong>${cleanTitle}</strong><small>${bundle_id}</small></div><button>Add</button>`; resultItem.querySelector('button').addEventListener('click', () => addApp(bundle_id)); searchResultsDiv.appendChild(resultItem); } catch (error) { console.warn("Could not parse item, likely not an app link:", app); } }); };
    
    // --- AUTHENTICATION LOGIC ---
    const handleLogin = () => {
        githubUser = githubUserInput.value.trim();
        githubRepo = githubRepoInput.value.trim();
        if (!githubUser || !githubRepo) {
            alert('Please enter your GitHub Username and Repository name.');
            return;
        }
       
        localStorage.setItem('githubUser', githubUser);
        localStorage.setItem('githubRepo', githubRepo);
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo`;
    };
    
    const handleLogout = () => {
        localStorage.removeItem('githubToken');
        localStorage.removeItem('githubUser');
        localStorage.removeItem('githubRepo');
        window.location.href = window.location.pathname; // Go to clean login page
    };

    const checkLoginStatus = () => {
        githubToken = localStorage.getItem('githubToken');
        githubUser = localStorage.getItem('githubUser');
        githubRepo = localStorage.getItem('githubRepo');
        if (githubToken && githubUser && githubRepo) {
            githubUserInput.value = githubUser;
            githubRepoInput.value = githubRepo;
            showEditor();
        } else {
            showLogin();
        }
    };

    // --- INITIALIZATION ---
    const init = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const codeFromRedirect = urlParams.get('code');

        if (codeFromRedirect) {
            // If there's a code, we are coming back from GitHub
            loginContainer.innerHTML = '<h1>Authenticating... Please wait.</h1>';
            try {
                // Call our backend to exchange the code for a token
                const response = await fetch(`/api/github-callback?code=${codeFromRedirect}`);
                if (!response.ok) throw new Error('Authentication failed on the server.');
                
                const data = await response.json();
                if (data.token) {
                    localStorage.setItem('githubToken', data.token);
                    // Clean the URL and check login status again
                    window.history.replaceState({}, document.title, window.location.pathname);
                    checkLoginStatus();
                } else {
                    throw new Error('Token was not returned from the server.');
                }
            } catch (error) {
                alert('An error occurred during login. Please try again.');
                console.error(error);
                // Go back to the clean login page on failure
                window.location.href = window.location.pathname;
            }
        } else {
            // If there's no code, just check if we are already logged in
            checkLoginStatus();
        }
    };
    
    // --- EVENT LISTENERS ---
    loginButton.addEventListener('click', handleLogin);
    logoutButton.addEventListener('click', handleLogout);
    saveButton.addEventListener('click', saveWhitelistToGitHub);
    searchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(searchApps, 500); });
    document.addEventListener('click', (event) => { if (!searchWrapper.contains(event.target)) { searchResultsDiv.style.display = 'none'; } });

    // START THE APPLICATION
    init();
});
