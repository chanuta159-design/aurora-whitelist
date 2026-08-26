document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const ALLOWED_USERS = ['chanuta159-design'];
    const GITHUB_USER = 'chanuta159-design';
    const GITHUB_REPO = 'aurora-whitelist';

    // --- STATE MANAGEMENT ---
    let authorizedApps = [];
    let appNames = [];
    let appIcons = {}; 
    let categorizedData = {};
    let catFileSHA = null, fileSHA = null, namesFileSHA = null, iconsFileSHA = null;
    let debounceTimer, githubToken = null, githubUser = '', githubRepo = '';
    
    // מצב סריקת רקע
    let isFetchingIcons = false;
    let iconsModified = false;

    // --- HELPER FUNCTIONS FOR UNICODE ---
    const encodeUnicode = (str) => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
    const decodeUnicode = (str) => decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));

    // --- DOM ELEMENT REFERENCES ---
    const appContainer = document.getElementById('appContainer');
    const loginContainer = document.getElementById('loginContainer');
    const accessDeniedContainer = document.getElementById('accessDeniedContainer');
    const searchWrapper = document.querySelector('.search-wrapper');
    const searchInput = document.getElementById('searchInput');
    const searchSpinner = document.getElementById('searchSpinner');
    const searchResultsDiv = document.getElementById('searchResults');
    const categoriesBoardDiv = document.getElementById('categoriesBoard');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const repoNameSpan = document.getElementById('repoName');
    const saveButton = document.getElementById('saveButton');
    const logoutButton = document.getElementById('logoutButton');
    const deniedLogoutButton = document.getElementById('deniedLogoutButton');
    const loginButton = document.getElementById('loginButton');
    const statusMessage = document.getElementById('statusMessage');

    // --- API CREDENTIALS ---
    const GOOGLE_API_KEY = 'AIzaSyD3YjTEIwAnBBIV7LzuRcQVHmTTB27og9o';
    const SEARCH_ENGINE_ID = 'b769d79cff32c40de';
    const GITHUB_CLIENT_ID = 'Ov23ligwsbAgnDvz3yp0';

    // --- UI LOGIC ---
    const hideAllScreens = () => {
        appContainer.classList.add('hidden');
        loginContainer.classList.add('hidden');
        accessDeniedContainer.classList.add('hidden');
    };

    const showEditor = () => { 
        hideAllScreens();
        appContainer.classList.remove('hidden'); 
        repoNameSpan.textContent = `${githubUser}/${githubRepo}`; 
        loadWhitelistFromGitHub(); 
    };

    const showLogin = () => { 
        hideAllScreens();
        loginContainer.classList.remove('hidden'); 
    };

    const showAccessDenied = () => { 
        hideAllScreens();
        accessDeniedContainer.classList.remove('hidden'); 
    };

    // --- RENDER BOARD ---
    const renderCategoriesBoard = () => {
        if (!categoriesBoardDiv) return;
        categoriesBoardDiv.innerHTML = '';

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
                    <span class="category-title" contenteditable="true" spellcheck="false">${categoryName}</span>
                    <button class="delete-cat-btn" title="מחק קטגוריה">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
                    </button>
                </div>
                <div class="apps-dropzone"></div>
            `;

            const dropzone = catCol.querySelector('.apps-dropzone');

            packages.forEach(pkg => {
                if (authorizedApps.includes(pkg)) {
                    const idx = authorizedApps.indexOf(pkg);
                    const displayName = appNames[idx] || pkg;
                    
                    const iconSrc = appIcons[pkg] || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.charAt(0))}&background=e2e8f0&color=4f46e5&font-size=0.5&bold=true`;
                    
                    const card = document.createElement('div');
                    card.className = 'app-draggable-item';
                    card.dataset.pkg = pkg;
                    card.innerHTML = `
                        <div class="app-item-content">
                            <img src="${iconSrc}" class="app-icon" alt="${displayName}" loading="lazy" />
                            <div class="app-info" title="${displayName}\n${pkg}">
                                <strong>${displayName}</strong>
                                <small>${pkg}</small>
                            </div>
                        </div>
                        <button class="remove-app-btn" title="הסר מהרשימה">
                            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                        </button>
                    `;
                    card.querySelector('.remove-app-btn').addEventListener('click', () => removeApp(pkg));
                    dropzone.appendChild(card);
                }
            });

            const titleSpan = catCol.querySelector('.category-title');
            titleSpan.addEventListener('blur', () => {
                const newName = titleSpan.innerText.trim();
                if (newName && newName !== categoryName) {
                    categorizedData[newName] = categorizedData[categoryName];
                    delete categorizedData[categoryName];
                    catCol.dataset.category = newName;
                } else {
                    titleSpan.innerText = categoryName;
                }
            });
            titleSpan.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    titleSpan.blur();
                }
            });

            catCol.querySelector('.delete-cat-btn').addEventListener('click', () => {
                if (confirm(`האם אתה בטוח שברצונך למחוק את הקטגוריה "${categoryName}"?\n(האפליקציות שבתוכה יוסרו מהרשימה הלבנה)`)) {
                    packages.forEach(pkg => removeApp(pkg));
                    delete categorizedData[categoryName];
                    renderCategoriesBoard();
                }
            });

            categoriesBoardDiv.appendChild(catCol);

            if (window.Sortable) {
                new Sortable(dropzone, {
                    group: 'shared-categories',
                    animation: 200,
                    ghostClass: 'sortable-ghost',
                    easing: "cubic-bezier(0.25, 1, 0.5, 1)",
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
            col.querySelectorAll('.app-draggable-item').forEach(item => pkgs.push(item.dataset.pkg));
            if (catName) newCatData[catName] = pkgs;
        });
        categorizedData = newCatData;
    };

    // --- ADD / REMOVE FUNCTIONS ---
    const addApp = (pkg, title, iconUrl) => {
        if (pkg && !authorizedApps.includes(pkg)) {
            authorizedApps.push(pkg);
            appNames.push(title);
            
            if (iconUrl) appIcons[pkg] = iconUrl;
            
            const firstCat = Object.keys(categorizedData)[0] || "כללי";
            if (!categorizedData[firstCat]) categorizedData[firstCat] = [];
            categorizedData[firstCat].push(pkg);

            renderCategoriesBoard();
            showStatus(`נוסף בהצלחה: ${title}`, false);
        } else {
            alert(`האפליקציה ${title} (${pkg}) כבר קיימת ברשימה.`);
        }
    };

    const removeApp = (pkg) => {
        const indexToRemove = authorizedApps.indexOf(pkg);
        if (indexToRemove > -1) {
            authorizedApps.splice(indexToRemove, 1);
            appNames.splice(indexToRemove, 1);
        }
        for (const cat in categorizedData) {
            categorizedData[cat] = categorizedData[cat].filter(p => p !== pkg);
        }
        renderCategoriesBoard();
    };

    const showStatus = (msg, isErr, keepAlive = false) => { 
        statusMessage.textContent = msg; 
        statusMessage.className = isErr ? 'status-message show error' : 'status-message show success'; 
        
        if (window.statusTimer) clearTimeout(window.statusTimer);
        if (!keepAlive) {
            window.statusTimer = setTimeout(() => statusMessage.classList.remove('show'), 5000); 
        }
    };

    // --- GITHUB API FUNCTIONS ---
    const loadWhitelistFromGitHub = async () => {
        if (!githubUser || !githubRepo) return;
        showStatus('טוען נתונים מ-GitHub...', false);
        saveButton.disabled = true;

        const headers = { 'Authorization': `token ${githubToken}` };
        try {
            const [packageRes, namesRes, catRes, iconsRes] = await Promise.all([
                fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, { headers }),
                fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-names.json`, { headers }),
                fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`, { headers }),
                fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-icons.json`, { headers }).catch(() => ({ ok: false }))
            ]);

            if (packageRes.ok) {
                const data = await packageRes.json();
                fileSHA = data.sha;
                authorizedApps = JSON.parse(decodeUnicode(data.content));
            } else { fileSHA = null; authorizedApps = []; }

            if (namesRes.ok) {
                const data = await namesRes.json();
                namesFileSHA = data.sha;
                appNames = JSON.parse(decodeUnicode(data.content));
            } else { namesFileSHA = null; appNames = []; }

            if (catRes.ok) {
                const data = await catRes.json();
                catFileSHA = data.sha;
                categorizedData = JSON.parse(decodeUnicode(data.content));
            } else { catFileSHA = null; categorizedData = { "כללי": [] }; }

            if (iconsRes.ok) {
                const data = await iconsRes.json();
                iconsFileSHA = data.sha;
                appIcons = JSON.parse(decodeUnicode(data.content));
            } else { iconsFileSHA = null; appIcons = {}; }

            if (authorizedApps.length !== appNames.length) appNames = authorizedApps.map(pkg => pkg); 

            showStatus('הנתונים נטענו בהצלחה!', false);
            renderCategoriesBoard();
            
            setTimeout(startBackgroundIconFetch, 2000);
            
        } catch (err) {
            showStatus(`שגיאה בטעינה: ${err.message}`, true);
        } finally {
            saveButton.disabled = false;
        }
    };

    // --- BACKGROUND ICON FETCHING (MAGIC) ---
    // פונקציית עזר לביצוע פקודת fetch שחותכת את עצמה אחרי זמן מסוים
    const fetchWithTimeout = async (url, timeoutMs = 5000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    };

    const startBackgroundIconFetch = async () => {
        if (isFetchingIcons) return;
        
        const missingPkgs = authorizedApps.filter(pkg => !appIcons[pkg]);
        if (missingPkgs.length === 0) return;
        
        isFetchingIcons = true;
        iconsModified = false;
        
        console.log(`[Icon Scanner] מתחיל סריקה של ${missingPkgs.length} אפליקציות חסרות...`);
        showStatus(`מתחיל סריקת איקונים... ⏳`, false, true);

        for (let i = 0; i < missingPkgs.length; i++) {
            const pkg = missingPkgs[i];
            let foundIcon = null;

            console.log(`[Icon Scanner] סורק עכשיו: ${pkg} (${i + 1}/${missingPkgs.length})`);
            showStatus(`סורק: ${pkg} (${missingPkgs.length - i} נותרו) ⏳`, false, true);

            try {
                // מנסים פרוקסי 1 עם חיתוך של 6 שניות
                const res = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=https://play.google.com/store/apps/details?id=${pkg}&hl=en`, 6000);
                const html = await res.text();
                const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<img[^>]+src="([^"]+)"[^>]+alt="Icon image"/i);
                if (match && match[1]) foundIcon = match[1];
            } catch (e) {
                console.warn(`[Icon Scanner] פרוקסי 1 נכשל עבור ${pkg} (Timeout/Error)`);
                try {
                    // גיבוי לפרוקסי 2 עם חיתוך של 6 שניות
                    const url = encodeURIComponent(`https://play.google.com/store/apps/details?id=${pkg}&hl=en`);
                    const res = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${url}`, 6000);
                    const html = await res.text();
                    const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
                    if (match && match[1]) foundIcon = match[1];
                } catch (err) {
                    console.warn(`[Icon Scanner] פרוקסי 2 נכשל עבור ${pkg} (Timeout/Error)`);
                }
            }

            if (foundIcon) {
                console.log(`[Icon Scanner] ✓ נמצא איקון עבור ${pkg}!`);
                if (foundIcon.includes('=')) foundIcon = foundIcon.split('=')[0] + '=w128-h128-rw';
                
                appIcons[pkg] = foundIcon;
                iconsModified = true;
                
                const imgElement = document.querySelector(`.app-draggable-item[data-pkg="${pkg}"] .app-icon`);
                if (imgElement) {
                    imgElement.style.opacity = '0';
                    setTimeout(() => {
                        imgElement.src = foundIcon;
                        imgElement.style.transition = 'opacity 0.5s ease-in';
                        imgElement.style.opacity = '1';
                    }, 100);
                }
            } else {
                console.log(`[Icon Scanner] ✗ לא נמצא איקון עבור ${pkg}, ממשיך הלאה.`);
            }

            // ממתינים שנייה לפני האפליקציה הבאה
            await new Promise(r => setTimeout(r, 1000));
        }

        isFetchingIcons = false;
        
        if (iconsModified) {
            console.log('[Icon Scanner] סריקה הסתיימה! שומר נתונים בשקט ל-GitHub...');
            showStatus('כל האייקונים נמצאו! שומר אוטומטית... 💾', false, true);
            await silentSaveIcons();
            showStatus('האייקונים עודכנו ונשמרו בהצלחה! 🎉', false);
        } else {
            console.log('[Icon Scanner] הסריקה הסתיימה אך לא נמצאו איקונים חדשים.');
            showStatus('סריקת הרקע הסתיימה.', false);
        }
    };

    const silentSaveIcons = async () => {
        try {
            const res = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-icons.json`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: 'Auto-sync missing app icons (Background worker)', 
                    content: encodeUnicode(JSON.stringify(appIcons, null, 2)), 
                    sha: iconsFileSHA || undefined 
                })
            });
            const data = await res.json();
            if (data.content) iconsFileSHA = data.content.sha;
            iconsModified = false;
        } catch (e) { 
            console.error('[Icon Scanner] Failed to save icons', e); 
        }
    };

    const saveWhitelistToGitHub = async () => {
        if (!githubUser || !githubRepo || !githubToken) { showStatus('שגיאת התחברות.', true); return; }
        syncStateFromBoard();
        
        saveButton.disabled = true;
        const originalText = saveButton.innerText;
        saveButton.innerText = 'שומר...';
        showStatus('שומר שינויים ל-GitHub...', false, true);

        try {
            const req = (file, content, sha, msg) => fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/${file}`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, content: encodeUnicode(JSON.stringify(content, null, 2)), sha: sha || undefined })
            }).then(res => res.json());

            const res1 = await req('whitelist.json', authorizedApps, fileSHA, 'Update apps list');
            if (res1.content) fileSHA = res1.content.sha;

            const res2 = await req('app-names.json', appNames, namesFileSHA, 'Update apps names');
            if (res2.content) namesFileSHA = res2.content.sha;

            const res3 = await req('categorized-whitelist.json', categorizedData, catFileSHA, 'Update categories via visual board');
            if (res3.content) catFileSHA = res3.content.sha;

            const res4 = await req('app-icons.json', appIcons, iconsFileSHA, 'Update app icons mapping');
            if (res4.content) iconsFileSHA = res4.content.sha;

            showStatus('השינויים נשמרו בהצלחה! 🎉', false);
        } catch (err) {
            showStatus(err.message, true);
        } finally {
            saveButton.disabled = false;
            saveButton.innerText = originalText;
        }
    };

    // --- GOOGLE SEARCH API ---
    const searchApps = async () => { 
        const query = searchInput.value.trim(); 
        if (query.length < 3) { 
            searchResultsDiv.style.display = 'none'; 
            searchSpinner.classList.add('hidden');
            return; 
        } 
        
        searchSpinner.classList.remove('hidden');
        searchResultsDiv.style.display = 'none'; 
        
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`; 
        try { 
            const res = await fetch(url); 
            const data = await res.json(); 
            if (data.items && data.items.length > 0) { 
                displayGoogleResults(data.items); 
            } else { 
                searchResultsDiv.innerHTML = '<div style="padding: 15px; text-align: center; color: #64748b;">לא נמצאו תוצאות.</div>'; 
                searchResultsDiv.style.display = 'block'; 
            } 
        } catch (err) { 
            searchResultsDiv.innerHTML = '<div style="padding: 15px; text-align: center; color: #ef4444;">שגיאה בחיפוש.</div>'; 
            searchResultsDiv.style.display = 'block'; 
        } finally {
            searchSpinner.classList.add('hidden');
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
                const iconUrl = app.pagemap?.cse_image?.[0]?.src || '';
                const displayIcon = iconUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(title.charAt(0))}&background=e2e8f0&color=64748b&bold=true`;

                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                    <img src="${displayIcon}" class="search-result-icon" alt="${title}" loading="lazy" />
                    <div class="app-info">
                        <strong>${title}</strong>
                        <small>${id}</small>
                    </div>
                    <button class="btn btn-primary" style="padding: 6px 14px; font-size: 13px;">הוסף</button>
                `;
                item.querySelector('button').addEventListener('click', () => {
                    addApp(id, title, iconUrl);
                    searchResultsDiv.style.display = 'none';
                    searchInput.value = '';
                });
                searchResultsDiv.appendChild(item);
            } catch (e) { }
        });
        searchResultsDiv.style.display = 'block'; 
    };

    // --- AUTHENTICATION ---
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
            loginContainer.innerHTML = '<div class="auth-card"><h1>מתחבר... אנא המתן</h1><div class="spinner" style="position:relative; left:auto; margin: 20px auto;"></div></div>';
            try {
                const tokenRes = await fetch(`/api/github-callback?code=${codeFromRedirect}`);
                if (!tokenRes.ok) throw new Error('Failed to get token from server.');
                const { token: tempToken } = await tokenRes.json();
                if (!tempToken) throw new Error('Token was not returned.');

                const userRes = await fetch('https://api.github.com/user', { headers: { 'Authorization': `token ${tempToken}` } });
                if (!userRes.ok) throw new Error('Failed to get user profile from GitHub.');
                const userData = await userRes.json();
                
                if (ALLOWED_USERS.includes(userData.login)) {
                    localStorage.setItem('githubToken', tempToken);
                    window.location.href = window.location.pat
