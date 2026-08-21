const fs = require('fs');
let app = fs.readFileSync('app.js', 'utf8');

const newAutoSync = `async function autoSyncWithPC(silent = true) { // Kept name autoSyncWithPC to avoid changing it everywhere, but it syncs to cloud
    const token = localStorage.getItem('ghToken');
    const gistId = localStorage.getItem('ghGistId');
    if (!token || !gistId) return; // Ignore si pas configuré
    
    try {
        const flights = await getAllFlights();
        if(flights.length === 0 && silent) return;

        // CHECK CLOUD VERSION FIRST TO PREVENT DOWNGRADE
        let cloudVersion = 0;
        try {
            const checkRes = await fetch(\`https://api.github.com/gists/\${gistId}?_t=\${Date.now()}\`, {
                method: 'GET',
                headers: { 'Accept': 'application/vnd.github+json', 'Authorization': \`Bearer \${token}\` }
            });
            if(checkRes.ok) {
                const data = await checkRes.json();
                if (data.files && data.files["carnet_de_vol_backup.json"]) {
                    let fileData = data.files["carnet_de_vol_backup.json"];
                    let fileContent = fileData.content;
                    if (fileData.truncated && fileData.raw_url) {
                        const rawRes = await fetch(fileData.raw_url + '?_t=' + Date.now());
                        if (rawRes.ok) fileContent = await rawRes.text();
                    }
                    if (fileContent) {
                        const parsed = JSON.parse(fileContent);
                        if (parsed && parsed.db_config && parsed.db_config.db_version) {
                            cloudVersion = parsed.db_config.db_version;
                        }
                    }
                }
            }
        } catch(e) {
            console.error("Erreur check version cloud:", e);
        }

        const localConfig = typeof getDbConfig === 'function' ? getDbConfig() : null;
        const localVersion = localConfig ? (localConfig.db_version || 0) : 0;

        if (cloudVersion > localVersion) {
            console.warn(\`Sauvegarde annulée: Le Cloud (v\${cloudVersion}) est plus récent que la version locale (v\${localVersion}).\`);
            if (!silent) alert(\`Le Cloud (v\${cloudVersion}) est plus récent que votre version locale (v\${localVersion}).\\nVeuillez d'abord "Restaurer du Cloud" pour ne pas écraser les données de vos autres appareils.\`);
            // Update the UI explicitly so the user sees the Cloud version
            if (typeof window.checkCloudVersion === 'function') window.checkCloudVersion();
            return;
        }

        const res = await fetch(\`https://api.github.com/gists/\${gistId}\`, {
            method: 'PATCH',
            headers: { 
                'Accept': 'application/vnd.github+json',
                'Authorization': \`Bearer \${token}\`
            },
            body: JSON.stringify({
                files: {
                    "carnet_de_vol_backup.json": {
                        content: JSON.stringify({
                            flights: flights,
                            db_config: localConfig
                        }, null, 2)
                    }
                }
            })
        });`;

const regex = /async function autoSyncWithPC\(silent = true\) \{[\s\S]*?body: JSON\.stringify\(\{\s*files: \{\s*"carnet_de_vol_backup\.json": \{\s*content: JSON\.stringify\(\{\s*flights: flights,\s*db_config: typeof getDbConfig === 'function' \? getDbConfig\(\) : null\s*\}, null, 2\)\s*\}\s*\}\s*\}\)\s*\}\);/m;
app = app.replace(regex, newAutoSync);
fs.writeFileSync('app.js', app);
console.log('Patched autoSyncWithPC');
