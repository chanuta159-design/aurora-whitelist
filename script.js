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
    
    // קטלוג האפליקציות של CFOPUSER לחיפוש מהיר
    let cfopuserAppsCatalog = [];

    // מצב סריקת רקע לאייקונים
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
        loadCfopuserCatalog(); // טעינת קטלוג CFOPUSER לחיפוש מהיר
    };

    const showLogin = () => { 
        hideAllScreens();
        loginContainer.classList.remove('hidden'); 
    };

    const showAccessDenied = () => { 
        hideAllScreens();
        accessDeniedContainer.classList.remove('hidden'); 
    };

    // --- טעינת מאגר CFOPUSER מראש עבור החיפוש ---
    const loadCfopuserCatalog = async () => {
        try {
            const res = await fetch("https://raw.githubusercontent.com/cfopuser/app-store/main/apps.json");
            if (res.ok) {
                const appIds = await res.json();
                const promises = appIds.map(async id => {
                    try {
                        const appRes = await fetch(`https://raw.githubusercontent.com/cfopuser/app-store/main/apps/${id}/app.json`);
                        if (appRes.ok) {
                            const data = await appRes.json();
                            const meta = data.metadata || data;
                            const assets = data.assets || {};
                            let icon = assets.icon_url || "";
                            if (icon && !icon.startsWith("http")) {
                                icon = `https://raw.githubusercontent.com/cfopuser/app-store/main/${icon}`;
                            }
                            return {
                                id: meta.package_name,
                                title: meta.name_he || meta.name || id,
                                title_en: meta.name || id,
                                iconUrl: icon,
                                source: 'CFOPUSER'
                            };
                        }
                    } catch (e) { return null; }
                });
                const results = await Promise.all(promises);
                cfopuserAppsCatalog = results.filter(Boolean);
            }
        } catch (e) {
            console.warn("Failed to load CFOPUSER catalog", e);
        }
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
                    
                    let iconSrc = appIcons[pkg];
                    if (iconSrc) {
                        iconSrc = iconSrc.split('=')[0] + '=w128-h128-rw';
                    } else {
                        iconSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.charAt(0))}&background=e2e8f0&color=4f46e5&font-size=0.5&bold=true`;
                    }
                    
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
                    scroll: true,             
                    scrollSensitivity: 80,    
                    scrollSpeed: 20,          
                    bubbleScroll: true,       
                    forceFallback: true,      
                    fallbackClass: 'sortable-fallback', 
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
            
            if (iconUrl) {
                appIcons[pkg] = iconUrl.split('=')[0];
            }
            
            // שיבוץ זמני בלוח עד לשמירה ומיון ה-AI
            const firstCat = Object.keys(categorizedData)[0] || "כללי";
            if (!categorizedData[firstCat]) categorizedData[firstCat] = [];
            categorizedData[firstCat].push(pkg);

            renderCategoriesBoard();
            showStatus(`נוסף בהצלחה: ${title} (ייקוטלג אוטומטית בעת השמירה)`, false);
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

    // --- טעינת הנתונים מ-GitHub עם איחוד וסנכרון מלא ---
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

            // 🚀 סנכרון קריטי: מוודא שכל אפליקציה שקיימת בקטגוריות נכללת ברשימת החבילות (מונע מחיקה של מטרוליסט!)
            const allCategorizedPkgs = Object.values(categorizedData).flat();
            allCategorizedPkgs.forEach(pkg => {
                if (!authorizedApps.includes(pkg)) {
                    authorizedApps.push(pkg);
                    appNames.push(pkg);
                }
            });

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

    const startBackgroundIconFetch = async () => {
        if (isFetchingIcons) return;
        const missingPkgs = authorizedApps.filter(pkg => !appIcons[pkg]);
        if (missingPkgs.length === 0) return;
        
        isFetchingIcons = true;
        iconsModified = false;

        for (let i = 0; i < missingPkgs.length; i++) {
            const pkg = missingPkgs[i];
            let foundIcon = null;

            try {
                const res = await fetch(`/api/get-icon?pkg=${pkg}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.icon) {
                        foundIcon = data.icon;
                    }
                }
            } catch (e) { }

            if (foundIcon) {
                foundIcon = foundIcon.split('=')[0];
                appIcons[pkg] = foundIcon;
                iconsModified = true;
                
                const imgElement = document.querySelector(`.app-draggable-item[data-pkg="${pkg}"] .app-icon`);
                if (imgElement) {
                    imgElement.src = foundIcon + '=w128-h128-rw';
                }
            }
            await new Promise(r => setTimeout(r, 400));
        }

        isFetchingIcons = false;
        if (iconsModified) {
            await silentSaveIcons();
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
        } catch (e) { }
    };

    // --- שמירה עם מיון AI אוטומטי ---
    const saveWhitelistToGitHub = async () => {
        if (!githubUser || !githubRepo || !githubToken) { showStatus('שגיאת התחברות.', true); return; }
        
        saveButton.disabled = true;
        const originalText = saveButton.innerText;
        saveButton.innerText = 'מקטלג ושומר עם AI... 🤖';
        showStatus('ה-AI סורק ומקטלג אפליקציות חדשות, אנא המתן... ⏳', false, true);

        try {
            // 1. קריאה ל-API שממיין ומקטלג באמצעות Gemini
            const aiRes = await fetch('/api/categorize-and-save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    authorizedApps: authorizedApps,
                    githubToken: githubToken,
                    githubUser: githubUser,
                    githubRepo: githubRepo
                })
            });

            const aiData = await aiRes.json();
            if (!aiRes.ok) {
                throw new Error(aiData.error || 'שגיאה בקטלוג ה-AI');
            }

            if (aiData.categories) {
                categorizedData = aiData.categories;
            }

            // 2. שמירת יתר הקבצים
            const req = (file, content, sha, msg) => fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/${file}`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, content: encodeUnicode(JSON.stringify(content, null, 2)), sha: sha || undefined })
            }).then(res => res.json());

            const res1 = await req('whitelist.json', authorizedApps, fileSHA, 'Update apps list');
            if (res1.content) fileSHA = res1.content.sha;

            const res2 = await req('app-names.json', appNames, namesFileSHA, 'Update apps names');
            if (res2.content) namesFileSHA = res2.content.sha;

            const res4 = await req('app-icons.json', appIcons, iconsFileSHA, 'Update app icons mapping');
            if (res4.content) iconsFileSHA = res4.content.sha;

            renderCategoriesBoard();
            showStatus('כל השינויים קוטלגו ע"י ה-AI ונשמרו בהצלחה ב-GitHub! 🎉', false);
        } catch (err) {
            console.error(err);
            showStatus(`שגיאה בשמירה: ${err.message}`, true);
        } finally {
            saveButton.disabled = false;
            saveButton.innerText = originalText;
        }
    };

    // --- חיפוש חכם רב-ערוצי (CFOPUSER + Google Play + Direct ID) ---
    const searchApps = async () => { 
        const query = searchInput.value.trim(); 
        if (query.length < 2) { 
            searchResultsDiv.style.display = 'none'; 
            searchSpinner.classList.add('hidden');
            return; 
        } 
        
        searchSpinner.classList.remove('hidden');
        searchResultsDiv.innerHTML = '';
        searchResultsDiv.style.display = 'block';

        const qLower = query.toLowerCase();
        let resultsCount = 0;

        // 1. ערוץ א': חיפוש במאגר של CFOPUSER (כולל MetroList, Meld, SealPlus וכו')
        const cfopMatches = cfopuserAppsCatalog.filter(app => 
            app.title.toLowerCase().includes(qLower) || 
            app.title_en.toLowerCase().includes(qLower) || 
            app.id.toLowerCase().includes(qLower)
        );

        cfopMatches.forEach(app => {
            resultsCount++;
            appendSearchResultItem(app.id, app.title, app.iconUrl, 'CFOPUSER');
        });

        // 2. ערוץ ב': זיהוי ישיר של Package Name
        if (query.includes('.') && !query.includes(' ') && !cfopMatches.some(a => a.id === query)) {
            resultsCount++;
            appendSearchResultItem(query, query, '', 'ישיר');
        }

        // 3. ערוץ ג': חיפוש בגוגל פליי
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`; 
        try { 
            const res = await fetch(url); 
            const data = await res.json(); 
            if (data.items && data.items.length > 0) { 
                data.items.forEach(app => {
                    try {
                        const u = new URL(app.link);
                        const id = u.searchParams.get('id');
                        if (!id) return;
                        // הימנעות מכפילות אם כבר הוצג מ-CFOPUSER
                        if (cfopMatches.some(m => m.id === id)) return;

                        const title = app.title.split('-')[0].trim();
                        let iconUrl = app.pagemap?.cse_image?.[0]?.src || '';
                        if (iconUrl) iconUrl = iconUrl.split('=')[0] + '=w128-h128-rw';
                        
                        resultsCount++;
                        appendSearchResultItem(id, title, iconUrl, 'Google Play');
                    } catch (e) { }
                });
            }
        } catch (err) { }

        searchSpinner.classList.add('hidden');

        if (resultsCount === 0) {
            searchResultsDiv.innerHTML = '<div style="padding: 15px; text-align: center; color: #64748b;">לא נמצאו תוצאות.</div>';
        }
    };

    const appendSearchResultItem = (pkg, title, iconUrl, sourceBadge) => {
        const displayIcon = iconUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(title.charAt(0))}&background=e2e8f0&color=64748b&bold=true`;
        
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
            <img src="${displayIcon}" class="search-result-icon" alt="${title}" loading="lazy" />
            <div class="app-info" style="flex:1;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong>${title}</strong>
                    <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:${sourceBadge === 'CFOPUSER' ? '#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;' : '#f1f5f9; color:#64748b;'} font-family:sans-serif;">${sourceBadge}</span>
                </div>
                <small>${pkg}</small>
            </div>
            <button class="btn btn-primary" style="padding: 6px 14px; font-size: 13px;">הוסף</button>
        `;
        item.querySelector('button').addEventListener('click', () => {
            addApp(pkg, title, iconUrl);
            searchResultsDiv.style.display = 'none';
            searchInput.value = '';
        });
        searchResultsDiv.appendChild(item);
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
                    window.location.href = window.location.pathname;
                } else {
                    localStorage.clear();
                    showAccessDenied();
                }
            } catch (error) {
                alert(`שגיאת התחברות: ${error.message}`);
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
            const name = prompt('הכנס שם לקטגוריה החדשה:');
            if (name && name.trim()) {
                if (!categorizedData[name.trim()]) {
                    categorizedData[name.trim()] = [];
                    renderCategoriesBoard();
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
