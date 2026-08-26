let githubToken = localStorage.getItem('gh_token');
let githubUser = localStorage.getItem('gh_user') || 'chanuta159-design';
let githubRepo = localStorage.getItem('gh_repo') || 'aurora-whitelist';

let categorizedData = {};
let appNamesMap = {}; // pkg -> name
let fileSHA = null;

const boardEl = document.getElementById('categories-board');
const statusEl = document.getElementById('status-msg');

// --- 1. אתחול וטעינת נתונים מ-GitHub ---
window.addEventListener('DOMContentLoaded', async () => {
    // בדיקת התחברות
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('token')) {
        githubToken = urlParams.get('token');
        localStorage.setItem('gh_token', githubToken);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!githubToken) {
        window.location.href = '/api/github-login'; // מפנה להתחברות
        return;
    }

    await loadDataFromGithub();
});

async function loadDataFromGithub() {
    showStatus('טוען נתונים...');
    try {
        // טעינת שמות
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

        // טעינת הקטגוריות
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

// --- 2. רינדור לוח ה-Drag & Drop ---
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

        // הוספת האפליקציות
        packages.forEach(pkg => {
            dropzone.appendChild(createAppCard(pkg));
        });

        // שינוי שם קטגוריה בעריכה
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
            if (confirm(`למחוק את הקטגוריה "${categoryName}"? (האפליקציות שבה יימחקו)`)) {
                delete categorizedData[categoryName];
                catBlock.remove();
            }
        });

        boardEl.appendChild(catBlock);

        // הפעלת SortableJS לגרירה בין קטגוריות
        new Sortable(dropzone, {
            group: 'shared-categories',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: syncDataFromDOM
        });
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

// סנכרון ה-State של המשתנה categorizedData מתוך המצב הוויזואלי של המסך
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

// --- 3. הוספת קטגוריה חדשה ---
document.getElementById('add-cat-btn').addEventListener('click', () => {
    const name = prompt('שם הקטגוריה החדשה:');
    if (name && name.trim()) {
        if (!categorizedData[name.trim()]) {
            categorizedData[name.trim()] = [];
            renderBoard();
        }
    }
});

// --- 4. שמירה ישירה ל-GitHub ---
document.getElementById('save-btn').addEventListener('click', async () => {
    syncDataFromDOM();
    showStatus('שומר ישירות ל-GitHub...');

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
            showStatus('נשמר בהצלחה ב-GitHub!');
        } else {
            const err = await res.json();
            throw new Error(err.message);
        }
    } catch (e) {
        showStatus('שגיאה בשמירה: ' + e.message, true);
    }
});

// פונקציות עזר
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
    window.location.reload();
});
