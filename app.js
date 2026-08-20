// app.js - Logique de l'interface utilisateur

// DOM Elements
const flightForm = document.getElementById('flightForm');
const formTitle = document.getElementById('formTitle');
const submitFlightBtn = document.getElementById('submitFlightBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const deleteFlightBtn = document.getElementById('deleteFlightBtn');

const flightsTableBody = document.getElementById('flightsTableBody');
const emptyStateTable = document.getElementById('emptyStateTable');
const addCustomFieldBtn = document.getElementById('addCustomFieldBtn');
const customFieldsContainer = document.getElementById('customFieldsContainer');
const syncStatus = document.getElementById('syncStatus');

// Navigation Elements
const burgerBtn = document.getElementById('burgerBtn');
const closeMenuBtn = document.getElementById('closeMenuBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const navButtons = document.querySelectorAll('.nav-btn');
const viewSections = document.querySelectorAll('.view-section');

// Filters Elements
const filterDate = document.getElementById('filter_date');
const filterType = document.getElementById('filter_type');
const filterReg = document.getElementById('filter_reg');
const filterRole = document.getElementById('filter_role');
const filterPil = document.getElementById('filter_pil');

// Datalists
const datalistRoles = document.getElementById('role_suggestions');
const datalistPils = document.getElementById('pil_suggestions');
const datalistNums = document.getElementById('num_suggestions');

let customFieldCount = 0;
let allFlightsData = []; 
let currentEditId = null; 

// Gestion des Percées (Approaches)
let currentFlightPercees = {}; 
let approachTypes = JSON.parse(localStorage.getItem('approachTypes')) || ['ILS', 'RNP', 'VOR'];

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await updateUI();
        setupNetworkListener();
        resetFormState();
    } catch (error) {
        console.error("Erreur d'initialisation:", error);
    }
});

// Menu Navigation
function toggleMenu() {
    sidebar.classList.toggle('active');
    sidebarOverlay.classList.toggle('active');
}

burgerBtn.addEventListener('click', toggleMenu);
closeMenuBtn.addEventListener('click', toggleMenu);
sidebarOverlay.addEventListener('click', toggleMenu);

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        navigateTo(btn.getAttribute('data-target'));
        toggleMenu(); 
    });
});


async function checkCloudVersion() {
    const localVerSpan = document.getElementById('localDbVer');
    const cloudVerSpan = document.getElementById('cloudDbVer');
    if(!localVerSpan || !cloudVerSpan) return;
    
    if (typeof getDbConfig === 'function') {
        const config = getDbConfig();
        if (config && config.db_version) {
            localVerSpan.textContent = "v" + config.db_version + (config.last_updated ? " (" + new Date(config.last_updated).toLocaleString() + ")" : "");
        }
    }
    
    const token = localStorage.getItem('ghToken');
    const gistId = localStorage.getItem('ghGistId');
    if(!token || !gistId) {
        cloudVerSpan.textContent = "Non configuré";
        return;
    }
    
    cloudVerSpan.textContent = "Vérification...";
    try {
        const url = `https://api.github.com/gists/${gistId}?_t=${Date.now()}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${token}` }
        });
        if(res.ok) {
            const data = await res.json();
            if (data.files && data.files["carnet_de_vol_backup.json"]) {
                let fileData = data.files["carnet_de_vol_backup.json"];
                let fileContent = fileData.content;
                if (fileData.truncated && fileData.raw_url) {
                    const rawRes = await fetch(fileData.raw_url);
                    if (!rawRes.ok) throw new Error("Impossible de télécharger le fichier complet");
                    fileContent = await rawRes.text();
                }
                const parsed = JSON.parse(fileContent);
                if (parsed && parsed.db_config && parsed.db_config.db_version) {
                    cloudVerSpan.textContent = "v" + parsed.db_config.db_version + (parsed.db_config.last_updated ? " (" + new Date(parsed.db_config.last_updated).toLocaleString() + ")" : "");
                } else {
                    cloudVerSpan.textContent = "Inconnue (Ancienne sauvegarde)";
                }
            } else {
                cloudVerSpan.textContent = "Fichier introuvable sur le Cloud";
            }
        } else {
            cloudVerSpan.textContent = `Erreur HTTP ${res.status}`;
        }
    } catch(e) {
        cloudVerSpan.textContent = "Erreur réseau (" + e.message + ")";
    }
}

function navigateTo(targetId) {
    if (targetId === 'settings') {
        checkCloudVersion();
    }

    navButtons.forEach(b => {
        if (b.getAttribute('data-target') === targetId) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
    
    viewSections.forEach(section => {
        if (section.id === targetId) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });
}

// Update Network Status
function setupNetworkListener() {
    const updateOnlineStatus = () => {
        const isOnline = navigator.onLine;
        syncStatus.innerHTML = isOnline 
            ? '<span class="dot online"></span><span class="text">En ligne (Synchronisé)</span>'
            : '<span class="dot offline"></span><span class="text">Hors-ligne (Local)</span>';
    };
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Init
}

// Custom fields
function addCustomFieldRow(name = '', val = '') {
    customFieldCount++;
    const row = document.createElement('div');
    row.className = 'custom-field-row';
    row.innerHTML = `
        <input type="text" placeholder="Nom (ex: Météo)" class="custom-name" value="${name}" required>
        <input type="text" placeholder="Valeur" class="custom-value" value="${val}" required>
        <button type="button" class="remove-field">&times;</button>
    `;
    
    row.querySelector('.remove-field').addEventListener('click', () => {
        row.remove();
    });
    
    customFieldsContainer.appendChild(row);
}

addCustomFieldBtn.addEventListener('click', () => addCustomFieldRow());

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// --- PARAMÈTRES & OCR (Gemini API) & SYNCHRO ---
const apiKeyInput = document.getElementById('apiKeyInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsStatusMsg = document.getElementById('settingsStatusMsg');
const cameraInput = document.getElementById('cameraInput');
const ocrLoadingOverlay = document.getElementById('ocrLoadingOverlay');

const ghTokenInput = document.getElementById('ghTokenInput');
const ghGistIdInput = document.getElementById('ghGistIdInput');
const btnPushSync = document.getElementById('btnPushSync');
const btnPullSync = document.getElementById('btnPullSync');
const syncStatusMsg = document.getElementById('syncStatusMsg');

// Load saved settings
const savedApiKey = localStorage.getItem('geminiApiKey');
const savedModel = localStorage.getItem('geminiModel') || 'gemini-1.5-flash-latest';
const geminiModelSelect = document.getElementById('geminiModelSelect');
if (geminiModelSelect && savedModel) {
    if (!Array.from(geminiModelSelect.options).some(o => o.value === savedModel)) {
        const opt = document.createElement('option');
        opt.value = savedModel;
        opt.textContent = savedModel;
        geminiModelSelect.appendChild(opt);
    }
    geminiModelSelect.value = savedModel;
}
if (savedApiKey) apiKeyInput.value = savedApiKey;

const savedGhToken = localStorage.getItem('ghToken');
if (savedGhToken) ghTokenInput.value = savedGhToken;

const savedGhGistId = localStorage.getItem('ghGistId');
if (savedGhGistId) ghGistIdInput.value = savedGhGistId;

saveSettingsBtn.addEventListener('click', () => {
    localStorage.setItem('geminiApiKey', apiKeyInput.value.trim());
    const mSelect = document.getElementById('geminiModelSelect');
    if (mSelect) localStorage.setItem('geminiModel', mSelect.value);
    settingsStatusMsg.style.display = 'block';
    setTimeout(() => { settingsStatusMsg.style.display = 'none'; }, 3000);
});

// Load/Save Rules Settings
const setPcb = document.getElementById('set_pcb');
const setPil = document.getElementById('set_pil');
const setMachine = document.getElementById('set_machine');
const setPanne6 = document.getElementById('set_panne6');
const setPanne12 = document.getElementById('set_panne12');
const saveRulesBtn = document.getElementById('saveRulesBtn');
const rulesStatusMsg = document.getElementById('rulesStatusMsg');

function getRules() {
    return {
        pcb: parseInt(localStorage.getItem('rule_pcb')) || 60,
        pil: parseInt(localStorage.getItem('rule_pil')) || 90,
        machine: parseInt(localStorage.getItem('rule_machine')) || 180,
        panne6: parseInt(localStorage.getItem('rule_panne6')) || 180,
        panne12: parseInt(localStorage.getItem('rule_panne12')) || 365
    };
}

function loadRulesToUI() {
    const rules = getRules();
    setPcb.value = rules.pcb;
    setPil.value = rules.pil;
    setMachine.value = rules.machine;
    setPanne6.value = rules.panne6;
    setPanne12.value = rules.panne12;
}

saveRulesBtn.addEventListener('click', () => {
    localStorage.setItem('rule_pcb', setPcb.value);
    localStorage.setItem('rule_pil', setPil.value);
    localStorage.setItem('rule_machine', setMachine.value);
    localStorage.setItem('rule_panne6', setPanne6.value);
    localStorage.setItem('rule_panne12', setPanne12.value);
    rulesStatusMsg.style.display = 'block';
    setTimeout(() => { rulesStatusMsg.style.display = 'none'; }, 3000);
    renderCompetences(); // Update comp based on new rules
});

loadRulesToUI();

ghTokenInput.addEventListener('change', () => localStorage.setItem('ghToken', ghTokenInput.value.trim()));
ghGistIdInput.addEventListener('change', () => localStorage.setItem('ghGistId', ghGistIdInput.value.trim()));

function showSyncMsg(msg, isError = false) {
    syncStatusMsg.textContent = msg;
    syncStatusMsg.style.color = isError ? 'var(--danger-color)' : 'var(--accent-color)';
    syncStatusMsg.style.display = 'block';
    setTimeout(() => { syncStatusMsg.style.display = 'none'; }, 4000);
}

// Push to GitHub Gist
async function autoSyncWithPC(silent = true) { // Kept name autoSyncWithPC to avoid changing it everywhere, but it syncs to cloud
    const token = localStorage.getItem('ghToken');
    const gistId = localStorage.getItem('ghGistId');
    if (!token || !gistId) return; // Ignore si pas configuré
    
    try {
        const flights = await getAllFlights();
        if(flights.length === 0 && silent) return;

        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: { 
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                files: {
                    "carnet_de_vol_backup.json": {
                        content: JSON.stringify({
                            flights: flights,
                            db_config: typeof getDbConfig === 'function' ? getDbConfig() : null
                        }, null, 2)
                    }
                }
            })
        });

        if(res.ok) {
            if(!silent) showSyncMsg(`✅ Sauvegarde Cloud réussie ! (${flights.length} vols)`);
            console.log("Cloud auto-sync success");
        } else {
            throw new Error("Erreur GitHub");
        }
    } catch(err) {
        if(!silent) showSyncMsg("❌ Erreur de connexion à GitHub. Vérifiez le Token et le Gist ID.", true);
        console.log("Cloud auto-sync skipped/failed", err);
    }
}

// Push to Cloud (Manual Backup)
btnPushSync.addEventListener('click', async () => {
    const token = ghTokenInput.value.trim();
    const gistId = ghGistIdInput.value.trim();
    if(!token || !gistId) return alert("Veuillez renseigner le Token GitHub et l'ID du Gist.");
    
    // Save tokens automatically
    localStorage.setItem('ghToken', token);
    localStorage.setItem('ghGistId', gistId);
    
    const flights = await getAllFlights();
    if(flights.length === 0) {
        if(!confirm("Votre carnet local est VIDE. Êtes-vous sûr de vouloir écraser la sauvegarde Cloud avec un carnet vide ?")) return;
    }
    await autoSyncWithPC(false);
});

// Pull from Cloud (Restore)
btnPullSync.addEventListener('click', async () => {
    const token = ghTokenInput.value.trim();
    const gistId = ghGistIdInput.value.trim();
    if(!token || !gistId) return alert("Veuillez renseigner le Token GitHub et l'ID du Gist.");
    
    // Save tokens automatically
    localStorage.setItem('ghToken', token);
    localStorage.setItem('ghGistId', gistId);
    
    if(!confirm("ATTENTION : Cela va remplacer tous les vols de votre téléphone par la sauvegarde du Cloud. Continuer ?")) return;

    try {
        const res = await fetch(`https://api.github.com/gists/${gistId}?_t=${Date.now()}`, {
            method: 'GET',
            headers: { 
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if(!res.ok) throw new Error("Erreur GitHub HTTP " + res.status);
        
        const data = await res.json();
        const fileData = data.files && data.files["carnet_de_vol_backup.json"] ? data.files["carnet_de_vol_backup.json"] : null;
        
        if (!fileData) {
            throw new Error("Fichier introuvable dans le Gist.");
        }
        
        let fileContent = fileData.content;
        
        // Handle Gist Truncation for large files (e.g. many flights)
        if (fileData.truncated || !fileContent) {
            console.log("Fichier trop lourd (tronqué par l'API), récupération via raw_url...");
            const rawRes = await fetch(fileData.raw_url);
            if (!rawRes.ok) throw new Error("Impossible de télécharger le fichier complet.");
            fileContent = await rawRes.text();
        }
        
        let parsed;
        try {
            parsed = JSON.parse(fileContent);
        } catch(e) {
            throw new Error("Impossible de lire la sauvegarde, le fichier est corrompu ou incomplet.");
        }
        
        let flightsToImport = [];
        if (Array.isArray(parsed)) {
            flightsToImport = parsed;
        } else {
            flightsToImport = parsed.flights || [];
            if (parsed.db_config && typeof saveDbConfig === 'function') {
                window.isImportingCloud = true;
                saveDbConfig(parsed.db_config);
                window.isImportingCloud = false;
            }
        }
        
        await importFlights(flightsToImport);
        await updateUI();
        
        showSyncMsg(`✅ Restauration Cloud réussie ! (${flightsToImport.length} vols récupérés)`);
    } catch(err) {
        showSyncMsg("❌ " + err.message, true);
        console.error(err);
        alert("Erreur de restauration : " + err.message);
    }
});

// Auto-sync au démarrage si réseau
window.addEventListener('load', () => {
    setTimeout(() => autoSyncWithPC(true), 2000); // Wait 2s for IndexedDB to be ready
});

// Convert file to Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

// Trigger OCR on file selection
cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("Veuillez d'abord renseigner votre clé API Google Gemini dans l'onglet Paramètres !");
        navigateTo('view-settings');
        return;
    }

    try {
        ocrLoadingOverlay.style.display = 'block';
        cameraInput.disabled = true;

        const base64Image = await fileToBase64(file);
        const mimeType = file.type || 'image/jpeg';

        // Prompt system for Gemini
        const systemPrompt = `
Tu es un assistant expert en numérisation de carnets de vol aéronautiques (logbooks) et manifestes passagers.
L'utilisateur te fournit l'image d'une page de carnet de vol manuscrit ou d'un manifeste (la mise en page varie historiquement).
Ton but est d'extraire TOUS les vols présents sur l'image et de les formater STRICTEMENT selon ce schéma JSON.
ATTENTION, renvoie UNIQUEMENT un tableau JSON valide. Pas de texte avant, pas de texte après, pas de bloc de code markdown.

Règles d'extraction :
- date: format "YYYY-MM-DD"
- role: Fonction à bord (PIC, DUAL, FI, P1, COPI...)
- pil_name: Nom et Prénom du pilote (SANS LE GRADE MILITAIRE, ex: retirer les CNE, LTN, CBA, ADC, ADJ, MDL, etc. et ne garder que le nom)
- aircraft_type: Type d'aéronef (ex: C172, A320)
- aircraft_num: Numéro d'immatriculation immuable ou N° de la machine (ex: 4215, 334)
- aircraft_reg: Indicatif radio ou série de lettres (ex: F-GXYZ, FZA, BZH, AUTO, ou vide)
- j: Temps de vol de jour en heures décimales (ex: 1.5)
- n: Temps de vol de nuit en heures décimales (ex: 0.5)
- vtn: Temps de vol VTN en heures décimales
- vsv: Temps VSV en heures décimales
- sil: Temps Simulateur en heures décimales
- percee: Nombre de percées totales ou détail. Laisse vide ou 0 si absent.
- att: Nombre d'atterrissages
- seance_type: Type d'entrainement ou séance
- remarques: Remarques éventuelles (Noms passagers si manifeste)

Format JSON attendu :
[
  { "date": "1999-05-12", "role": "PIC", "pil_name": "Dupont", "aircraft_type": "C152", "aircraft_num": "4215", "aircraft_reg": "F-GTAB", "j": 1.2, "n": 0, "vtn": 0, "vsv": 0, "sil": 0, "percee": 0, "att": 2, "seance_type": "", "remarques": "" }
]
`;

        const model = localStorage.getItem('geminiModel') || 'gemini-3.6-flash';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: systemPrompt },
                        { inline_data: { mime_type: mimeType, data: base64Image } }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1 // Low temp for extraction tasks
                }
            })
        });

        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error.message);
        }

        const rawText = result.candidates[0].content.parts[0].text;
        // Clean markdown backticks if Gemini ignored instruction
        const jsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const flights = JSON.parse(jsonString);

        if (!Array.isArray(flights) || flights.length === 0) {
            throw new Error("Aucun vol n'a été détecté sur l'image.");
        }

        // Add flights to DB
        for (const f of flights) {
            let r = (f.aircraft_reg || '').trim().toUpperCase();
            let n = (f.aircraft_num || '').trim().toUpperCase();
            if (!n && r && /^[0-9]+$/.test(r)) { n = r; r = ''; }
            else if (!r && n && /[A-Z]/.test(n)) { r = n; n = ''; }
            
            await addFlight({
                date: f.date || new Date().toISOString().split('T')[0],
                role: (f.role || '').toUpperCase(),
                pil_name: f.pil_name || '',
                aircraft_type: (f.aircraft_type || '').toUpperCase(),
                aircraft_reg: r,
                aircraft_num: n,
                j: parseFloat(f.j) || 0,
                n: parseFloat(f.n) || 0,
                vtn: parseFloat(f.vtn) || 0,
                vsv: parseFloat(f.vsv) || 0,
                sil: parseFloat(f.sil) || 0,
                percee: f.percee || 0,
                att: parseInt(f.att) || 0,
                seance_type: f.seance_type || '',
                remarques: f.remarques || '',
                customData: {}
            });
        }

        alert(`${flights.length} vol(s) importé(s) avec succès ! Veuillez vérifier les données.`);
        await updateUI();
        autoSyncWithPC(true);
        navigateTo('view-synthese');

    } catch (err) {
        console.error(err);
        alert(`Erreur lors de l'analyse : ${err.message}`);
    } finally {
        ocrLoadingOverlay.style.display = 'none';
        cameraInput.disabled = false;
        cameraInput.value = ''; // Reset input
    }
});
// ------------------------------------------

// --- GESTION DES PERCÉES ---
const perceeModal = document.getElementById('perceeModal');
const btnOpenPerceeModal = document.getElementById('btnOpenPerceeModal');
const closePerceeModalBtn = document.getElementById('closePerceeModalBtn');
const validatePerceesBtn = document.getElementById('validatePerceesBtn');
const perceesList = document.getElementById('perceesList');
const newPerceeTypeInput = document.getElementById('newPerceeType');
const addPerceeTypeBtn = document.getElementById('addPerceeTypeBtn');

function saveApproachTypes() {
    localStorage.setItem('approachTypes', JSON.stringify(approachTypes));
}

function updatePerceesButtonLabel() {
    let total = 0;
    for (const count of Object.values(currentFlightPercees)) {
        total += parseInt(count) || 0;
    }
    btnOpenPerceeModal.textContent = `Gérer Percées (${total})`;
}

function renderPerceesList() {
    perceesList.innerHTML = '';
    approachTypes.forEach(type => {
        const val = currentFlightPercees[type] || '';
        const item = document.createElement('div');
        item.className = 'percee-item';
        item.innerHTML = `
            <div class="percee-item-left">
                <input type="number" min="0" placeholder="0" class="percee-input-val" data-type="${type}" value="${val}">
                <span>${type}</span>
            </div>
            <button type="button" class="btn-icon-delete delete-type-btn" data-type="${type}" title="Supprimer ce type">🗑️</button>
        `;
        perceesList.appendChild(item);
    });

    // Event listeners on inputs to save temporarily
    document.querySelectorAll('.percee-input-val').forEach(input => {
        input.addEventListener('input', (e) => {
            const t = e.target.getAttribute('data-type');
            const v = parseInt(e.target.value);
            if (v > 0) currentFlightPercees[t] = v;
            else delete currentFlightPercees[t];
        });
    });

    // Event listeners to delete a type globally
    document.querySelectorAll('.delete-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const t = e.target.getAttribute('data-type');
            if (confirm(`Voulez-vous supprimer le type de percée "${t}" de la base ?`)) {
                approachTypes = approachTypes.filter(x => x !== t);
                saveApproachTypes();
                delete currentFlightPercees[t];
                renderPerceesList();
            }
        });
    });
}

btnOpenPerceeModal.addEventListener('click', () => {
    renderPerceesList();
    perceeModal.classList.add('active');
});

const closePerceeModal = () => {
    perceeModal.classList.remove('active');
    updatePerceesButtonLabel();
};
closePerceeModalBtn.addEventListener('click', closePerceeModal);
validatePerceesBtn.addEventListener('click', closePerceeModal);

addPerceeTypeBtn.addEventListener('click', () => {
    const val = newPerceeTypeInput.value.trim().toUpperCase();
    if (val && !approachTypes.includes(val)) {
        approachTypes.push(val);
        saveApproachTypes();
        newPerceeTypeInput.value = '';
        renderPerceesList();
    }
});
// ---------------------------

// Form logic (Create or Update)
function resetFormState() {
    flightForm.reset();
    document.getElementById('f_date').valueAsDate = new Date();
    customFieldsContainer.innerHTML = '';
    customFieldCount = 0;
    currentEditId = null;
    currentFlightPercees = {};
    updatePerceesButtonLabel();
    
    formTitle.textContent = "Nouveau Vol";
    submitFlightBtn.textContent = "Enregistrer le vol";
    cancelEditBtn.style.display = "none";
    deleteFlightBtn.style.display = "none";
}

cancelEditBtn.addEventListener('click', resetFormState);

deleteFlightBtn.addEventListener('click', async () => {
    if (!currentEditId) return;
    if (confirm("Êtes-vous sûr de vouloir supprimer ce vol définitivement ?")) {
        try {
            await deleteFlight(currentEditId);
            alert("Vol supprimé avec succès.");
            resetFormState();
            await updateUI();
            autoSyncWithPC(true);
            navigateTo('view-synthese');
        } catch (err) {
            alert("Erreur lors de la suppression.");
        }
    }
});

flightForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Deep copy of percees
    const perceesToSave = JSON.parse(JSON.stringify(currentFlightPercees));

    const flightData = {
        date: document.getElementById('f_date').value,
        role: document.getElementById('f_role').value.trim().toUpperCase(),
        pil_name: document.getElementById('f_pil').value.trim(),
        aircraft_type: document.getElementById('f_type').value.trim().toUpperCase(),
        aircraft_reg: document.getElementById('f_aircraft').value.trim().toUpperCase(),
        aircraft_num: document.getElementById('f_num').value.trim().toUpperCase(),
        
        j: parseFloat(document.getElementById('f_j').value) || 0,
        n: parseFloat(document.getElementById('f_n').value) || 0,
        vtn: parseFloat(document.getElementById('f_vtn').value) || 0,
        vsv: parseFloat(document.getElementById('f_vsv').value) || 0,
        sil: parseFloat(document.getElementById('f_sil').value) || 0,
        
        percee: perceesToSave,
        att: parseInt(document.getElementById('f_att').value) || 0,
        
        seance_type: document.getElementById('f_seance').value,
        remarques: document.getElementById('f_remarques').value,
        
        customData: {}
    };
    
    const customRows = customFieldsContainer.querySelectorAll('.custom-field-row');
    customRows.forEach(row => {
        const name = row.querySelector('.custom-name').value;
        const val = row.querySelector('.custom-value').value;
        if (name && val) {
            flightData.customData[name] = val;
        }
    });
    
    try {
        if (currentEditId) {
            flightData.id = currentEditId;
            await updateFlight(flightData);
            alert("Vol modifié avec succès !");
        } else {
            await addFlight(flightData);
            alert("Vol enregistré avec succès !");
        }
        
        resetFormState();
        await updateUI();
        autoSyncWithPC(true);
        
        if (currentEditId) {
            navigateTo('view-synthese');
        }
    } catch (err) {
        alert("Erreur lors de l'enregistrement du vol.");
        console.error(err);
    }
});

// Edit function
window.editFlightAction = function(id) {
    const flight = allFlightsData.find(f => f.id === id);
    if (!flight) return;
    
    currentEditId = id;
    
    document.getElementById('f_date').value = flight.date;
    document.getElementById('f_role').value = flight.role || '';
    document.getElementById('f_pil').value = flight.pil_name || '';
    document.getElementById('f_type').value = flight.aircraft_type || '';
    document.getElementById('f_aircraft').value = flight.aircraft_reg || '';
    if (document.getElementById('f_num')) document.getElementById('f_num').value = flight.aircraft_num || '';
    
    document.getElementById('f_j').value = flight.j || '';
    document.getElementById('f_n').value = flight.n || '';
    document.getElementById('f_vtn').value = flight.vtn || '';
    document.getElementById('f_vsv').value = flight.vsv || '';
    document.getElementById('f_sil').value = flight.sil || '';
    
    // Retro-compatibility : Si percee est un nombre (ancienne version)
    if (typeof flight.percee === 'number' && flight.percee > 0) {
        currentFlightPercees = { 'Standard': flight.percee };
        if (!approachTypes.includes('Standard')) {
            approachTypes.push('Standard');
            saveApproachTypes();
        }
    } else if (typeof flight.percee === 'object' && flight.percee !== null) {
        currentFlightPercees = JSON.parse(JSON.stringify(flight.percee)); // Deep copy
    } else {
        currentFlightPercees = {};
    }
    updatePerceesButtonLabel();
    
    document.getElementById('f_att').value = flight.att || '';
    
    document.getElementById('f_seance').value = flight.seance_type || '';
    document.getElementById('f_remarques').value = flight.remarques || '';
    
    customFieldsContainer.innerHTML = '';
    customFieldCount = 0;
    if (flight.customData) {
        for (const [key, value] of Object.entries(flight.customData)) {
            addCustomFieldRow(key, value);
        }
    }
    
    formTitle.textContent = "Modifier le Vol";
    submitFlightBtn.textContent = "Mettre à jour";
    cancelEditBtn.style.display = "block";
    deleteFlightBtn.style.display = "block";
    
    navigateTo('view-saisie');
};

const filterInputs = [filterDate, filterType, filterReg, filterRole, filterPil];
filterInputs.forEach(input => {
    input.addEventListener('input', renderTable);
    input.addEventListener('change', renderTable);
});

// Update Autocomplete Datalists based on db_config
function updateDatalists() {
    if (typeof getDbConfig !== 'function') return;
    const config = getDbConfig();

    const populateDatalist = (element, arr) => {
        if (!element) return;
        element.innerHTML = '';
        arr.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            element.appendChild(opt);
        });
    };

    populateDatalist(datalistRoles, config.roles);
        // Custom pilot datalist population with grades
    datalistPils.innerHTML = '';
    config.pilots.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        if (p.grade) opt.text = p.grade + " " + p.name;
        datalistPils.appendChild(opt);
    });
    populateDatalist(datalistNums, config.machines.map(m => m.num));
}

const fNumInput = document.getElementById('f_num');
const fTypeInput = document.getElementById('f_type');
const fAircraftInput = document.getElementById('f_aircraft');

if (fNumInput) {
    fNumInput.addEventListener('input', () => {
        const currentNum = fNumInput.value.trim().toUpperCase();
        fAircraftInput.value = '';
        fTypeInput.value = '';
        if (!currentNum || typeof getDbConfig !== 'function') return;
        
        const config = getDbConfig();
        const machine = config.machines.find(m => m.num.toUpperCase() === currentNum);
        
        if (machine) {
            fAircraftInput.value = machine.reg;
            fTypeInput.value = machine.type;
        }
    });

    fNumInput.addEventListener('change', () => {
        const currentNum = fNumInput.value.trim().toUpperCase();
        if (!currentNum || typeof getDbConfig !== 'function') return;
        
        const config = getDbConfig();
        const machine = config.machines.find(m => m.num.toUpperCase() === currentNum);
        
        if (!machine) {
            if (confirm("Ce numéro de machine est inconnu. Voulez-vous l'ajouter à la base de données ?")) {
                if (typeof switchDbTab === 'function') {
                    navigateTo('view-database');
                    switchDbTab('machines');
                    editMachine(null);
                    setTimeout(() => {
                        document.getElementById('m_num').value = currentNum;
                    }, 100);
                }
            }
        }
    });
}

// Logic for Pilot
const fPilInput = document.getElementById('f_pil');
if (fPilInput) {
    fPilInput.addEventListener('change', () => {
        const currentPil = fPilInput.value.trim().toUpperCase();
        if (!currentPil || typeof getDbConfig !== 'function') return;
        
        const config = getDbConfig();
        const pilot = config.pilots.find(p => p.name.toUpperCase() === currentPil);
        
        if (!pilot) {
            if (confirm("Ce pilote est inconnu. Voulez-vous l'ajouter à la base de données ?")) {
                if (typeof switchDbTab === 'function') {
                    navigateTo('view-database');
                    switchDbTab('pilots');
                    editPilot(null);
                    setTimeout(() => {
                        document.getElementById('p_name').value = currentPil;
                    }, 100);
                }
            }
        }
    });
}

// Fetch all and Update UI
async function updateUI() {
    try { allFlightsData = await getAllFlights(); } catch(e) { console.error(e); }
    try { updateDatalists(); } catch(e) { console.error(e); }
    
    let totalDecimalHours = 0;
    try {
        allFlightsData.forEach(f => {
            totalDecimalHours += (f.j || 0) + (f.n || 0);
        });
    } catch(e) { console.error(e); }
    
    try { renderTable(); } catch(e) { console.error(e); }
    try { if(typeof renderCompetences === 'function') renderCompetences(); } catch(e) { console.error(e); }
    try { if(typeof renderHDV === 'function') renderHDV(); } catch(e) { console.error(e); }
    try { if(typeof autoLearnFromAllFlights === 'function') autoLearnFromAllFlights(); } catch(e) { console.error(e); }
}

// Render Table
function renderTable() {
    const fDate = filterDate.value; 
    const fType = filterType.value.toLowerCase();
    const fReg = filterReg.value.toLowerCase();
    const fRole = filterRole.value.toLowerCase();
    const fPil = filterPil.value.toLowerCase();
    
    const filtered = allFlightsData.filter(f => {
        if (fDate && !f.date.startsWith(fDate)) return false;
        if (fType && !(f.aircraft_type || '').toLowerCase().includes(fType)) return false;
        if (fReg && !(f.aircraft_reg || '').toLowerCase().includes(fReg)) return false;
        if (fRole && !(f.role || '').toLowerCase().includes(fRole)) return false;
        if (fPil && !(f.pil_name || '').toLowerCase().includes(fPil)) return false;
        return true;
    });
    
    flightsTableBody.innerHTML = '';
    
    // Compute duplicate signatures
    const signatureCount = {};
    allFlightsData.forEach(f => {
        if (f.ignore_duplicate) return;
        const sig = `${f.date}_${f.aircraft_type}_${f.aircraft_reg}_${f.aircraft_num}_${f.seance_type}_${f.pil_name}_${f.role}_${f.j}_${f.n}_${f.vsv}_${f.vtn}_${f.sil}_${f.remarques}`.toLowerCase();
        signatureCount[sig] = (signatureCount[sig] || 0) + 1;
    });

    if (filtered.length === 0) {
        emptyStateTable.style.display = 'block';
        document.querySelector('.table-container').style.display = 'none';
        return;
    }
    
    emptyStateTable.style.display = 'none';
    document.querySelector('.table-container').style.display = 'block';
    
    filtered.forEach(f => {
        let customText = '';
        if (f.customData && Object.keys(f.customData).length > 0) {
            customText = ' | ' + Object.entries(f.customData).map(([k, v]) => `${k}:${v}`).join(', ');
        }
        
        const rem = (f.remarques || '') + customText;
        
        // Sum percees for synthesis view
        let totalPercees = 0;
        if (typeof f.percee === 'number') totalPercees = f.percee;
        else if (typeof f.percee === 'object' && f.percee) {
            for (const v of Object.values(f.percee)) totalPercees += (parseInt(v) || 0);
        }

        const tr = document.createElement('tr');
        
        const sig = `${f.date}_${f.aircraft_type}_${f.aircraft_reg}_${f.aircraft_num}_${f.seance_type}_${f.pil_name}_${f.role}_${f.j}_${f.n}_${f.vsv}_${f.vtn}_${f.sil}_${f.remarques}`.toLowerCase();
        const isDuplicate = !f.ignore_duplicate && signatureCount[sig] > 1;
        if (isDuplicate) tr.classList.add('duplicate-row');
        
        // Ouvre le résumé du vol pour éviter les clics malheureux
        tr.onclick = () => showFlightSummary(f.id);
        
        let alertIcon = isDuplicate ? `<span class="duplicate-alert-icon" title="Ce vol semble être un doublon. Cliquez sur l'icône ✔️ pour l'ignorer.">⚠️</span> <span title="Valider qu'il ne s'agit pas d'un doublon" style="cursor:pointer; font-size:1rem;" onclick="ignoreFlightDuplicateAction(${f.id}, event)">✔️</span> ` : '';
        
        tr.innerHTML = `
            <td>
                <button class="btn-icon-delete" onclick="deleteFlightDirectAction(${f.id}, event)" title="Supprimer ce vol">🗑️</button>
            </td>
            <td style="display: flex; align-items: center;">${alertIcon}${formatDate(f.date)}</td>
            <td>${f.role || ''}</td>
            <td>${f.pil_name || ''}</td>
            <td>${f.aircraft_type || ''}</td>
            <td>${f.aircraft_reg || ''}</td>
            <td>${f.j ? f.j.toFixed(1) : ''}</td>
            <td>${f.n ? f.n.toFixed(1) : ''}</td>
            <td>${f.vsv ? f.vsv.toFixed(1) : ''}</td>
            <td>${f.sil ? f.sil.toFixed(1) : ''}</td>
            <td>${f.vtn ? f.vtn.toFixed(1) : ''}</td>
            <td>${totalPercees || ''}</td>
            <td>${f.att || ''}</td>
            <td>${f.seance_type || ''}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${rem}">${rem}</td>
        `;
        flightsTableBody.appendChild(tr);
    });
}

// Action de suppression directe depuis le tableau
window.deleteFlightDirectAction = async function(id, event) {
    // Empêche l'ouverture de la modale de résumé
    event.stopPropagation();
    
    if (confirm("Attention, êtes-vous sûr de vouloir supprimer définitivement ce vol ?")) {
        try {
            await deleteFlight(id);
            await updateUI();
            autoSyncWithPC(true);
        } catch (err) {
            alert("Erreur lors de la suppression.");
            console.error(err);
        }
    }
};

window.ignoreFlightDuplicateAction = async function(id, event) {
    event.stopPropagation();
    const f = allFlightsData.find(x => x.id === id);
    if (!f) return;
    f.ignore_duplicate = true;
    try {
        await updateFlight(f);
        await updateUI();
    } catch (err) {
        console.error(err);
    }
};

// Summary Modal Logic
window.showFlightSummary = function(id) {
    const flight = allFlightsData.find(f => f.id === id);
    if (!flight) return;
    
    currentEditId = id; 
    
    // Format custom data
    let customHtml = '';
    if (flight.customData && Object.keys(flight.customData).length > 0) {
        customHtml = '<div style="grid-column: 1 / -1; margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 10px; color: var(--accent-color);"><strong>Champs Personnalisés</strong></div>';
        for (const [k, v] of Object.entries(flight.customData)) {
            customHtml += `<div class="summary-item"><span class="label">${k}</span><span class="value">${v}</span></div>`;
        }
    }

    // Format percees
    let perceesText = '0';
    if (typeof flight.percee === 'number') {
        perceesText = flight.percee.toString();
    } else if (typeof flight.percee === 'object' && flight.percee) {
        const details = [];
        let total = 0;
        for (const [k, v] of Object.entries(flight.percee)) {
            details.push(`${k} (${v})`);
            total += parseInt(v);
        }
        if (total > 0) perceesText = `${total} : ${details.join(', ')}`;
    }

    document.getElementById('summaryGrid').innerHTML = `
        <div class="summary-item"><span class="label">Date</span><span class="value">${formatDate(flight.date)}</span></div>
        <div class="summary-item"><span class="label">Fonction</span><span class="value">${flight.role || '-'}</span></div>
        <div class="summary-item"><span class="label">Pilote</span><span class="value">${flight.pil_name || '-'}</span></div>
        <div class="summary-item"><span class="label">Aéronef</span><span class="value">${flight.aircraft_type || '-'} (${flight.aircraft_reg || '-'})</span></div>
        <div class="summary-item"><span class="label">Jour (J)</span><span class="value">${flight.j || '0'}</span></div>
        <div class="summary-item"><span class="label">Nuit (N)</span><span class="value">${flight.n || '0'}</span></div>
        <div class="summary-item"><span class="label">dont VSV</span><span class="value">${flight.vsv || '0'}</span></div>
        <div class="summary-item"><span class="label">dont SIL</span><span class="value">${flight.sil || '0'}</span></div>
        <div class="summary-item"><span class="label">dont VTN</span><span class="value">${flight.vtn || '0'}</span></div>
        <div class="summary-item"><span class="label">Percées</span><span class="value">${perceesText}</span></div>
        <div class="summary-item"><span class="label">ATT</span><span class="value">${flight.att || '0'}</span></div>
        <div class="summary-item" style="grid-column: 1 / -1;"><span class="label">Type de séance</span><span class="value">${flight.seance_type || '-'}</span></div>
        <div class="summary-item" style="grid-column: 1 / -1;"><span class="label">Remarques</span><span class="value">${flight.remarques || '-'}</span></div>
        ${customHtml}
    `;

    document.getElementById('flightSummaryModal').classList.add('active');
};

document.getElementById('closeSummaryBtn').addEventListener('click', () => {
    document.getElementById('flightSummaryModal').classList.remove('active');
});

document.getElementById('startEditBtn').addEventListener('click', () => {
    document.getElementById('flightSummaryModal').classList.remove('active');
    editFlightAction(currentEditId);
});


async function fetchGeminiModels() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    if (!apiKey) {
        alert("Veuillez d'abord saisir votre clé API.");
        return;
    }
    const select = document.getElementById('geminiModelSelect');
    const helpText = document.getElementById('modelHelpText');
    
    try {
        helpText.textContent = "Recherche des modèles en cours...";
        helpText.style.color = "orange";
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) throw new Error("Erreur de clé API ou réseau");
        
        const data = await response.json();
        
        // Filter models that support generateContent
        const validModels = data.models.filter(m => 
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
        );
        
        select.innerHTML = '';
        validModels.forEach(m => {
            const shortName = m.name.replace('models/', '');
            const opt = document.createElement('option');
            opt.value = shortName;
            opt.textContent = shortName;
            select.appendChild(opt);
        });
        const savedModel = localStorage.getItem('geminiModel');
        if (savedModel && Array.from(select.options).some(o => o.value === savedModel)) {
            select.value = savedModel;
        } else if (Array.from(select.options).some(o => o.value === 'gemini-1.5-flash')) {
            select.value = 'gemini-1.5-flash';
        }
        
        helpText.textContent = `${validModels.length} modèles trouvés !`;
        helpText.style.color = "green";
        
    } catch (e) {
        console.error(e);
        helpText.textContent = "Erreur de chargement. Vérifiez votre clé API.";
        helpText.style.color = "red";
    }
}

// --- RESET FUNCTIONS ---
window.resetDbConfig = function() {
    if (confirm("Voulez-vous VRAIMENT réinitialiser la base de données métier (Machines, Pilotes, Fonctions) ?\nTous vos réglages manuels seront perdus.")) {
        localStorage.removeItem('carnet_db_config');
        alert("Base de données réinitialisée. L'application va se recharger pour réapprendre depuis vos vols existants.");
        window.location.reload();
    }
};

window.resetAllFlights = function() {
    if (confirm("⚠️ ATTENTION ! Voulez-vous VRAIMENT effacer TOUS VOS VOLS ?\nCette action est irréversible ! Avez-vous pensé à exporter avant ?")) {
        const req = indexedDB.deleteDatabase('CarnetDeVolDB');
        req.onsuccess = function() {
            alert("Tous les vols ont été effacés. L'application va se recharger.");
            window.location.reload();
        };
        req.onerror = function() {
            alert("Erreur lors de la suppression des vols.");
        };
    }
};
