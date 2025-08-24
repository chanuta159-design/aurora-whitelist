document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let authorizedApps = [];
    let debounceTimer;

    // --- DOM ELEMENT REFERENCES ---
    const searchWrapper = document.querySelector('.search-wrapper');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const searchResultsDiv = document.getElementById('searchResults');
    const currentListDiv = document.getElementById('currentList');
    const jsonInput = document.getElementById('jsonInput');
    const jsonOutput = document.getElementById('jsonOutput');
    const loadButton = document.getElementById('loadButton');
    const generateButton = document.getElementById('generateButton');
    
    // --- GOOGLE API CREDENTIALS ---
    const GOOGLE_API_KEY = 'AIzaSyDJOTpSjqi5PEew0nMJ2clRQFtJye9ByhU'; 
    const SEARCH_ENGINE_ID = 'd3210826cacdd48ee'; 

    // --- CORE FUNCTIONS ---

    const renderList = () => {
        currentListDiv.innerHTML = '';
        if (authorizedApps.length === 0) {
            jsonOutput.value = '';
        }
        authorizedApps.forEach(packageName => {
            const listItem = document.createElement('div');
            listItem.className = 'list-item';
            listItem.innerHTML = `<div class="app-info"><strong>${packageName}</strong></div><button><span>Remove</span></button>`;
            listItem.querySelector('button').addEventListener('click', () => removeApp(packageName));
            currentListDiv.appendChild(listItem);
        });
    };

    const loadListFromInput = () => {
        try {
            const parsedJson = JSON.parse(jsonInput.value);
            if (Array.isArray(parsedJson)) {
                authorizedApps = [...new Set(parsedJson)];
                renderList();
            } else {
                alert('Invalid format. The JSON must be an array of strings.');
            }
        } catch (error) {
            if (jsonInput.value.trim()) {
                alert('Invalid JSON! Please check the format.');
            }
            authorizedApps = [];
            renderList();
        }
    };
    
    const addApp = (packageName) => {
        if (packageName && !authorizedApps.includes(packageName)) {
            authorizedApps.push(packageName);
            renderList();
        } else {
            alert(`${packageName} is already in the list.`);
        }
    };

    const removeApp = (packageName) => {
        authorizedApps = authorizedApps.filter(app => app !== packageName);
        renderList();
    };

    const generateAndCopyJson = () => {
        const jsonString = JSON.stringify(authorizedApps, null, 2);
        jsonOutput.value = jsonString;
        if (jsonString.length > 2) {
            navigator.clipboard.writeText(jsonString).then(() => {
                alert('JSON copied to clipboard!');
            }, () => {
                alert('Failed to copy. Please copy manually.');
            });
        }
    };

    // --- GOOGLE API FUNCTIONS ---

    const searchApps = async () => {
        const query = searchInput.value.trim();
        
        if (query.length < 3) {
            searchResultsDiv.innerHTML = '';
            searchResultsDiv.style.display = 'none';
            return;
        }

        searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">Searching...</div>';
        searchResultsDiv.style.display = 'block';
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            console.log("Google API Response:", data);

            if (data && data.items && data.items.length > 0) {
                displayGoogleResults(data.items);
            } else {
                searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #718096;">No apps found.</div>';
            }
        } catch (error) {
            searchResultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: #dc3545;">Error fetching results.</div>';
            console.error("Fetch Error:", error);
        }
    };

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
                
                // This event listener will now work correctly
                resultItem.querySelector('button').addEventListener('click', () => {
                    addApp(bundle_id);
                });

                searchResultsDiv.appendChild(resultItem);
            } catch (error) {
                console.warn("Could not parse item, likely not an app link:", app);
            }
        });
    };
    
    // --- EVENT LISTENERS ---
    
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(searchApps, 500); 
    });

    searchButton.addEventListener('click', searchApps);
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            clearTimeout(debounceTimer);
            searchApps();
        }
    });

    document.addEventListener('click', (event) => {
        if (!searchWrapper.contains(event.target)) {
            searchResultsDiv.style.display = 'none';
        }
    });

    loadButton.addEventListener('click', loadListFromInput);
    generateButton.addEventListener('click', generateAndCopyJson);

    // Initial render on page load
    renderList();
});