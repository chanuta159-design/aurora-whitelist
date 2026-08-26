// --- הגדרות ---
let githubToken = localStorage.getItem('gh_token') || localStorage.getItem('github_token') || localStorage.getItem('token');
let githubUser = localStorage.getItem('gh_user') || 'chanuta159-design';
let githubRepo = localStorage.getItem('gh_repo') || 'aurora-whitelist';

let categorizedData = {};
let appNamesMap = {}; // pkg -> name
let fileSHA = null;

const boardEl = document.getElementById('categories-board');
const statusEl = document.getElementById('status-msg');

// --- 1. אתחול ובדיקת התחברות ---
window.addEventListener('DOMContentLoaded', async () => {
    // בדיקה אם חזרנו מהתחברות עם טוקן בכתובת ה-URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token') || urlParams.get('access_token');
    
    if (tokenFromUrl) {
        githubToken = tokenFromUrl;
        localStorage.setItem('gh_token', githubToken);
        // מנקה את ה-URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // אם אין טוקן מחובר, נציג הודעה להתחברות במקום לקרוס
    if (!githubToken) {
        showLoginOverlay();
        return;
    }

    await loadDataFromGithub();
});

// מסך התחברות אם פג תוקף הטוקן
function showLoginOverlay() {
    boardEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: white; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h3 style="margin-bottom: 12px;">אינך מחובר לחשבון GitHub</h3>
            <p style="color: #64748b; margin-bottom: 20px;">כדי לטעון ולשמור את הרשימות, עליך להזין את הטוקן שלך או להתחבר מחדש.</p>
            <div style="display: flex; gap: 10px; justify-content: center; max-width: 400px; margin: 0 auto;">
                <input type="password" id="manual-token-input" placeholder="הדבק GitHub Token (ghp_...)" style="flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
                <button class="btn-primary" id="btn-save-token">התחבר</button>
            </div>
        </div>
    `;

    document.getElementById('btn-save-token').addEventListener('click', () => {
        const val = document.getElementById('manual-token-input').value.trim();
        if (val) {
            localStorage.setItem('gh_token', val);
            githubToken = val;
            window.location.reload();
        }
    });
}

// --- 2. טעינת נתונים מ-GitHub ---
async function loadDataFromGithub() {
    showStatus('טוען נתונים...');
    try {
        // משיכת קובץ השמות היפים אם קיים
        try {
            const namesRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/app-names.json`, {
                headers: { 'Authorization': `token ${githubToken}` }
            });
            if (namesRes.ok) {
                const namesData = await namesRes.json();
                const namesArr = JSON.parse(decodeUnicode(namesData.content));
                const pkgsRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/whitelist.json`, {
                    headers: { 'Authorization': `token ${githubToken}` }
                });
                if (pkgsRes.ok) {
                    const pkgsArr = JSON.parse(decodeUnicode((await pkgsRes.json()).content));
                    pkgsArr.forEach((pkg, i) => { appNamesMap[pkg] = namesArr[i] || pkg; });
                }
            }
        } catch (e) {}

        // משיכת הקטגוריות
        const catRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });

        if (catRes.ok) {
            const catJson = await catRes.json();
            fileSHA = catJson.sha;
            categorizedData = JSON.parse(decodeUnicode(catJson.content));
        } else {
            categorizedData = { "כללי": [] };
        }

        renderBoard();
        showStatus('הנתונים נטענו בהצלחה!');
    } catch (err) {
        showStatus('שגיאה בטעינת נתונים: ' + err.message, true);
    }
}

// --- 3. רינדור לוח ה-Drag & Drop ---
function renderBoard() {
    boardEl.innerHTML = '';

    for (const [categoryName, packages] of Object.entries(categorizedData)) {
        const catBlock = document.createElement('div');
        catBlock.className = 'category-block';
        catBlock.dataset.category = categoryName;

        catBlock.innerHTML = `
            <div class="cat-title-bar">
                <span class="cat-title" contenteditable="true">${categoryName}</span>
                <button class="btn-del-cat" title="מחק קטגוריה">✕</button>
            </div>
            <div class="apps-dropzone"></div>
        `;

        const dropzone = catBlock.querySelector('.apps-dropzone');

        // הוספת האפליקציות לקטגוריה
        packages.forEach(pkg => {
            dropzone.appendChild(createAppCard(pkg));
        });

        // שינוי שם קטגוריה
        const titleSpan = catBlock.querySelector('.cat-title');
        titleSpan.addEventListener('blur', () => {
            const newName = titleSpan.innerText.trim();
            if (newName && newName !== categoryName) {
                categorizedData[newName] = categorizedData[categoryName];
                delete categorizedData[categoryName];
                catBlock.dataset.category = newName;
            }
        });

        // מחיקת קטגוריה
        catBlock.querySelector('.btn-del-cat').addEventListener('click', () => {
            if (confirm(`למחוק את הקטגוריה "${categoryName}"?`)) {
                delete categorizedData[categoryName];
                catBlock.remove();
            }
        });

        boardEl.appendChild(catBlock);

        // הפעלת גרירה חופשית בין בלוקים
        if (window.Sortable) {
            new Sortable(dropzone, {
                group: 'shared-categories',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: syncDataFromDOM
            });
        }
    }
}

function createAppCard(pkg) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.pkg = pkg;

    const displayName = appNamesMap[pkg] || pkg;

    card.innerHTML = `
        <div class="app-info">
            <span class="app-name">${displayName}</span>
            <span class="app-pkg">${pkg}</span>
        </div>
        <button class="btn-remove-app" title="הסר">✕</button>
    `;

    card.querySelector('.btn-remove-app').addEventListener('click', () => {
        card.remove();
        syncDataFromDOM();
    });

    return card;
}

function syncDataFromDOM() {
    const newCategorized = {};
    const allBlocks = boardEl.querySelectorAll('.category-block');

    allBlocks.forEach(block => {
        const catName = block.querySelector('.cat-title').innerText.trim();
        const pkgs = [];
        block.querySelectorAll('.app-card').forEach(card => {
            pkgs.push(card.dataset.pkg);
        });
        if (catName) {
            newCategorized[catName] = pkgs;
        }
    });

    categorizedData = newCategorized;
}

// --- 4. חיפוש והוספת אפליקציות ---
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;

    // אם הוזן מזהה חבילה ישירות (למשל com.waze)
    if (query.includes('.')) {
        addPackageDirectly(query, query);
        searchInput.value = '';
        return;
    }

    searchResults.innerHTML = '<span style="color:#64748b;">מחפש...</span>';
    try {
        const res = await fetch(`https://html-scraper.vercel.app/api/search?q=${encodeURIComponent(query)}`);
        // fallback לחיפוש אם הסקרייפר לא עונה
        if (!res.ok) throw new Error();
        const data = await res.json();
        searchResults.innerHTML = '';
        data.forEach(item => {
            const el = document.createElement('div');
            el.className = 'search-item';
            el.innerHTML = `<span>${item.title}</span> <small>(${item.appId})</small>`;
            el.addEventListener('click', () => {
                addPackageDirectly(item.appId, item.title);
                searchResults.innerHTML = '';
                searchInput.value = '';
            });
            searchResults.appendChild(el);
        });
    } catch (e) {
        // הוספה ישירה במקרה שאין חיפוש מקוון
        searchResults.innerHTML = `
            <div class="search-item" style="background:#fef3c7; border-color:#fde68a;">
                <span>הוסף ישירות: <b>${query}</b></span>
            </div>
        `;
        searchResults.querySelector('.search-item').addEventListener('click', () => {
            addPackageDirectly(query, query);
            searchResults.innerHTML = '';
            searchInput.value = '';
        });
    }
});

function addPackageDirectly(pkg, name) {
    appNamesMap[pkg] = name;
    
    // מוסיף לקטגוריה הראשונה או ל"כללי"
    const firstCat = Object.keys(categorizedData)[0] || "כללי";
    if (!categorizedData[firstCat]) categorizedData[firstCat] = [];
    
    if (!categorizedData[firstCat].includes(pkg)) {
        categorizedData[firstCat].push(pkg);
        renderBoard();
        showStatus(`האפליקציה נוספה לקטגוריה "${firstCat}"! גרור אותה לאן שתרצה.`);
    }
}

// --- 5. הוספת קטגוריה ושמירה ---
document.getElementById('add-cat-btn').addEventListener('click', () => {
    const name = prompt('שם הקטגוריה החדשה:');
    if (name && name.trim()) {
        if (!categorizedData[name.trim()]) {
            categorizedData[name.trim()] = [];
            renderBoard();
        }
    }
});

document.getElementById('save-btn').addEventListener('click', async () => {
    syncDataFromDOM();
    showStatus('שומר שינויים ל-GitHub...');

    try {
        const contentBase64 = encodeUnicode(JSON.stringify(categorizedData, null, 2));
        const res = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/categorized-whitelist.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Updated categories manually via visual board',
                content: contentBase64,
                sha: fileSHA || undefined
            })
        });

        if (res.ok) {
            const data = await res.json();
            fileSHA = data.content.sha;
            showStatus('השינויים נשמרו בהצלחה ב-GitHub!');
        } else {
            const err = await res.json();
            throw new Error(err.message);
        }
    } catch (e) {
        showStatus('שגיאה בשמירה: ' + e.message, true);
    }
});

function showStatus(text, isError = false) {
    statusEl.innerText = text;
    statusEl.style.color = isError ? 'red' : 'green';
}

function encodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
}

function decodeUnicode(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('gh_token');
    localStorage.removeItem('github_token');
    localStorage.removeItem('token');
    window.location.reload();
});
