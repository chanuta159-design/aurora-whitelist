document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION (ORIGINAL) ---
    const ALLOWED_USERS = ['chanuta159-design'];
    const GITHUB_USER = 'chanuta159-design';
    const GITHUB_REPO = 'aurora-whitelist';

    // --- STATE MANAGEMENT ---
    let authorizedApps = [];
    let appNames = [];
    let categorizedData = {}; // ניהול הקטגוריות עבור הגרירה וה-JSON המקוטלג
    let catFileSHA = null;
    let debounceTimer, fileSHA, namesFileSHA, githubToken = null, githubUser = '', githubRepo = '';

    // --- HELPER FUNCTIONS FOR UNICODE (ORIGINAL) ---
    const encodeUnicode = (str) => {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(match, p1) {
                return String.fromCharCode('0x' + p1);
        }));
    };

    const decodeUnicode = (str) => {
        return decodeURIComponent(atob(str).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    };

    // --- DOM ELEMENT REFERENCES ---
    const appContainer = document.getElementById('appContainer');
    const loginContainer = document.getElementById('loginContainer');
    const accessDeniedContainer = document.getElementById('accessDeniedContainer');
    const searchWrapper = document.querySelector('.search-wrapper');
    const searchInput = document.getElementById('searchInput');
    const searchResultsDiv = document.getElementById('searchResults');
    const currentListDiv = document.getElementById('currentList');
    const categoriesBoardDiv = document.getElementById('categoriesBoard');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const repoNameSpan = document.getElementById('repoName');
    const saveButton = document.getElementById('saveButton');
    const logoutButton = document.getElementById('logoutButton');
    const deniedLogoutButton = document.getElementById('deniedLogoutButton');
    const loginButton = document.getElementById('loginButton');
    const statusMessage = document.getElementById('statusMessage');

    // --- GOOGLE API & GITHUB OAUTH CREDENTIALS (ORIGINAL) ---
    const GOOGLE_API_KEY = 'AIzaSyD3YjTEIwAnBBIV7LzuRcQVHmTTB27og9o';
    const SEARCH_ENGINE_ID = 'b769d79cff32c40de';
    const GITHUB_CLIENT_ID = 'Ov23ligwsbAgnDvz3yp0';

    // --- UI LOGIC (ORIGINAL) ---
    const showEditor = () => { 
        loginContainer.style.display = 'none'; 
        accessDeniedContainer.style.display = 'none'; 
        appContainer.style.display = 'block'; 
        repoNameSpan.textContent = `${githubUser}/${githubRepo}`; 
        loadWhitelistFromGitHub(); 
    };
    const showLogin = () => { 
        appContainer.style.display = 'none'; 
        accessDeniedContainer.style.display = 'none'; 
        loginContainer.style.display = 'block'; 
    };
    const showAccessDenied = () => { 
        appContainer.style.display = 'none'; 
        loginContainer.style.display = 'none'; 
        accessDeniedContainer.style.display = 'block'; 
    };

    // --- RENDER FUNCTIONS (TRAY & DRAG-AND-DROP BOARD) ---
    const renderList = () => {
        // 1. רינדור ה-Tray התחתון המקורי
        currentListDiv.innerHTML = '';
        authorizedApps.forEach((pkg, index) => {
            const displayName = appNames[index] || pkg;
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `<div class="app-info"><strong>${displayName}</strong><small style="display: block; opacity: 0.7;">${pkg}</small></div><button><span>Remove</span></button>`;
            item.querySelector('button').addEventListener('click', () => removeApp(pkg));
            currentListDiv.appendChild(item);
        });

        // 2. רינדור לוח הקטגוריות הצפות (Drag & Drop)
        renderCategoriesBoard();
    };

    const renderCategoriesBoard = () => {
        if (!categoriesBoardDiv) return;
        categoriesBoardDiv.innerHTML = '';

        // ודא שכל אפליקציה מורשית נמצאת לפחות בקטגוריה אחת
        const categorizedPkgs = new Set(Object.values(categorizedData).flat());
        authorizedApps.forEach((pkg) => {
            if (!categorizedPkgs.has(pkg)) {
                const firstCat = Object.keys(categorizedData)[0] || "כללי";
                if (!categorizedData[firstCat]) categorizedData[firstCat] = [];
                categorizedData[firstCat].push(pkg);
            }
        });

        for (const [categoryName, packages] of Object.entries(categorizedData)) {
            const catCol = document.createElement('div');
            catCol.className = 'category-column';
            catCol.dataset.category = categoryName;

            catCol.innerHTML = `
                <div class="category-header">
                    <span class="category-title" contenteditable="true">${categoryName}</span>
                    <button class="delete-cat-btn" title="מחק קטגוריה">✕</button>
                </div>
                <div class="apps-dropzone"></div>
            `;

            const dropzone = catCol.querySelector('.apps-dropzone');

            packages.forEach(pkg => {
                // מציג רק אפליקציות שקיימות ברשימה המורשית
                if (authorizedApps.includes(pkg)) {
                    const idx = authorizedApps.indexOf(pkg);
                    const displayName = appNames[idx] || pkg;
                    const card = document.createElement('div');
                    card.className = 'app-draggable-item';
                    card.dataset.pkg = pkg;
                    card.innerHTML = `
                        <div class="app-info">
                            <strong>${displayName}</strong>
                            <small>${pkg}</small>
                        </div>
                        <button title="הסר"></button>
                    `;
                    card.querySelector('button').addEventListener('click', () => removeApp(pkg));
                    dropzone.appendChild(card);
                }
            });

            // עריכת שם קטגוריה
            const titleSpan = catCol.querySelector('.category-title');
            titleSpan.addEventListener('blur', () => {
                const newName = titleSpan.innerText.trim();
                if (newName && newName !== categoryName) {
                    categorizedData[newName] = categorizedData[categoryName];
                    delete categorizedData[categoryName];
                    catCol.dataset.category = newName;
                }
            });

            // מחיקת קטגוריה
            catCol.querySelector('.delete-cat-btn').addEventListener('click', () => {
                if (confirm(`למחוק את הקטגוריה "${categoryName}"?`)) {
                    delete categorizedData[categoryName];
                    renderList();
                }
            });

            categoriesBoardDiv.appendChild(catCol);

            // הפעלת SortableJS לגרירה בין קטגוריות
            if (window.Sortable) {
                new Sortable(dropzone, {
                    group: 'shared-categories',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: syncStateFromBoard
                });
            }
        }
    };

    const syncStateFromBoard = () => {
        const newCatData = {};
        const columns = categoriesBoardDiv.querySelectorAll('.category-column');
        columns.forEach(col => {
            const catName = col.querySelector('.category-title').innerText.trim();
            const pkgs = [];
            col.querySelectorAll('.app-draggable-item').forEach(item => {
                pkgs.push(item.dataset.pkg);
            });
            if (catName) {
                newCatData[catName] = pkgs;
            }
        });
        categorizedData = newCatData;
    };

    // --- ADD / REMOVE FUNCTIONS (ORIGINAL) ---
    const addApp = (pkg, title) => {
        if (pkg && !authorizedApps.includes(pkg)) {
            authorizedApps.push(pkg);
            appNames.push(title);
            
            // מוסיף לקטגוריה הראשונה
            const firstCat = Object.keys(categorizedData)[0] || "כללי";
            if (!categorizedData[firstCat]) categorizedData[firstCat] = [];
            categorizedData[firstCat].push(pkg);

            renderList();
        } else {
            alert(`${title} (${pkg}) is already in the list.`);
        }
    };

    const removeApp = (pkg) => {
        const indexToRemove = authorizedApps.indexOf(pkg);
        if (indexToRemove > -1) {
            authorizedApps.splice(indexToRemove, 1);
            appNames.splice(indexToRemove, 1);
        }
        // הסרה מכל הקטגוריות
        for (const cat in categorizedData) {
            categorizedData[cat] = categorizedData[cat].filter(p => p !== pkg);
        }
        renderList();
    };

    const showStatus = (msg, isErr) => { 
        statusMessage.textContent = msg; 
        statusMessage.className = isErr ? 'status-message error' : 'status-message success'; 
        setTimeout(() => statusMessage.textContent = '', 5000); 
    };

    // --- GITHUB API FUNCTIONS (LOAD & SAVE) ---
    const loadWhitelistFromGitHub = async () => {
        if (!githubUser || !githubRepo) return;
        showStatus('טוען נתונים מ-GitHub...');

        const packageUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`;
        const namesUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-names.json`;
        const catUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`;
        const headers = { 'Authorization': `token ${githubToken}` };

        try {
            const [packageRes, namesRes, catRes] = await Promise.all([
                fetch(packageUrl, { headers }),
                fetch(namesUrl, { headers }),
                fetch(catUrl, { headers })
            ]);

            // Process packages file (whitelist.json)
            if (packageRes.ok) {
                const data = await packageRes.json();
                fileSHA = data.sha;
                authorizedApps = JSON.parse(decodeUnicode(data.content));
            } else {
                fileSHA = null;
                authorizedApps = [];
            }

            // Process names file (app-names.json)
            if (namesRes.ok) {
                const data = await namesRes.json();
                namesFileSHA = data.sha;
                appNames = JSON.parse(decodeUnicode(data.content));
            } else {
                namesFileSHA = null;
                appNames = [];
            }

            // Process categorized file (categorized-whitelist.json)
            if (catRes.ok) {
                const data = await catRes.json();
                catFileSHA = data.sha;
                categorizedData = JSON.parse(decodeUnicode(data.content));
            } else {
                catFileSHA = null;
                categorizedData = { "כללי": [] };
            }

            // Ensure lists are synchronized
            if (authorizedApps.length !== appNames.length) {
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
        syncStateFromBoard();
        showStatus('שומר שינויים ל-GitHub...');

        try {
            // 1. שמירת whitelist.json המקורי
            const packageContent = JSON.stringify(authorizedApps, null, 2);
            const packageRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Updated whitelist packages via online editor',
                    content: encodeUnicode(packageContent),
                    sha: fileSHA || undefined
                })
            });
            if (packageRes.ok) fileSHA = (await packageRes.json()).content.sha;

            // 2. שמירת app-names.json המקורי
            const namesContent = JSON.stringify(appNames, null, 2);
            const namesRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-names.json`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Updated whitelist names via online editor',
                    content: encodeUnicode(namesContent),
                    sha: namesFileSHA || undefined
                })
            });
            if (namesRes.ok) namesFileSHA = (await namesRes.json()).content.sha;

            // 3. שמירת categorized-whitelist.json המקוטלג (ישירות מהלוח שלך!)
            const catContent = JSON.stringify(categorizedData, null, 2);
            const catRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Updated categorized whitelist via visual board',
                    content: encodeUnicode(catContent),
                    sha: catFileSHA || undefined
                })
            });
            if (catRes.ok) catFileSHA = (await catRes.json()).content.sha;

            showStatus('השינויים נשמרו בהצלחה ב-GitHub!');
        } catch (err) {
            showStatus(err.message, true);
        }
    };

    // --- GOOGLE SEARCH API FUNCTIONS (ORIGINAL) ---
    const searchApps = async () => { 
        const query = searchInput.value.trim(); 
        if (query.length < 3) { 
            searchResultsDiv.style.display = 'none'; 
            return; 
        } 
        searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">Searching...</div>'; 
        searchResultsDiv.style.display = 'block'; 
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`; 
        try { 
            const res = await fetch(url); 
            const data = await res.json(); 
            if (data.items && data.items.length > 0) { 
                displayGoogleResults(data.items); 
            } else { 
                searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">No apps found.</div>'; 
            } 
        } catch (err) { 
            searchResultsDiv.innerHTML = 'Error fetching results.'; 
        } 
    };

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
                    searchResultsDiv.style.display = 'none';
                });
                searchResultsDiv.appendChild(item);
            } catch (e) { }
        });
    };

    // --- AUTHENTICATION LOGIC (ORIGINAL GITHUB OAUTH) ---
    const handleLogin = () => {
        localStorage.setItem('githubUser', GITHUB_USER);
        localStorage.setItem('githubRepo', GITHUB_REPO);
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo`;
    };

    const handleLogout = () => {
        localStorage.clear();
        window.location.href = window.location.pathname;
    };

    // --- INITIALIZATION (ORIGINAL) ---
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
    
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', () => {
            const name = prompt('שם הקטגוריה החדשה:');
            if (name && name.trim()) {
                if (!categorizedData[name.trim()]) {
                    categorizedData[name.trim()] = [];
                    renderList();
                }
            }
        });
    }

    searchInput.addEventListener('input', () => { 
        clearTimeout(debounceTimer); 
        debounceTimer = setTimeout(searchApps, 500); 
    });
    
    document.addEventListener('click', (event) => { 
        if (!searchWrapper.contains(event.target)) { 
            searchResultsDiv.style.display = 'none'; 
        } 
    });

    init();
});
