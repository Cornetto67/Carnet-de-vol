
window.autoMergePilots = async function() {
    if(!confirm("L'application va chercher tous les pilotes ayant exactement le même nom et prénom (sans tenir compte des accents ni des majuscules/minuscules) et les fusionner automatiquement. Continuer ?")) return;
    
    const config = getDbConfig();
    const normalize = (str) => (str||'').normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    
    let mergedCount = 0;
    let groups = {};
    
    config.pilots.forEach(p => {
        const norm = normalize(p.name);
        if(!groups[norm]) groups[norm] = [];
        groups[norm].push(p);
    });

    const flightsToUpdate = [];

    for (const norm in groups) {
        const pilots = groups[norm];
        if (pilots.length > 1) {
            // Keep the best pilot profile (the one with photo or longest history)
            pilots.sort((a,b) => {
                let scoreA = (a.photo ? 100 : 0) + (a.grade_history?.length || 0);
                let scoreB = (b.photo ? 100 : 0) + (b.grade_history?.length || 0);
                return scoreB - scoreA;
            });
            const keepP = pilots[0];
            const badPilots = pilots.slice(1);
            
            const badIds = badPilots.map(x => x.id);
            config.pilots = config.pilots.filter(p => !badIds.includes(p.id));
            mergedCount += badPilots.length;

            if (typeof allFlightsData !== 'undefined') {
                for (let f of allFlightsData) {
                    const extracted = typeof extractGradeAndName === 'function' ? extractGradeAndName(f.pil_name).name : (f.pil_name||'').trim().toUpperCase();
                    // If flight uses one of the bad pilot names exactly
                    if (badPilots.some(bp => bp.name === extracted)) {
                        // Replace the name part, keep the grade if it was there
                        f.pil_name = f.pil_name.replace(extracted, keepP.name);
                        flightsToUpdate.push(f);
                    }
                }
            }
        }
    }

    if (mergedCount > 0) {
        saveDbConfig(config);
        
        if (flightsToUpdate.length > 0) {
            console.log("Updating " + flightsToUpdate.length + " flights after auto-merge...");
            for(let f of flightsToUpdate) {
                if (typeof updateFlight === 'function') await updateFlight(f);
            }
        }
        
        alert(mergedCount + " doublon(s) strict(s) fusionné(s) automatiquement !");
        renderDatabaseView();
        if (typeof updateUI === 'function') updateUI();
    } else {
        alert("Aucun doublon strict (nom et prénom identiques) n'a été trouvé.");
    }
};


window.pilotSearchTerm = '';
window.pilotSortCol = 'name';
window.pilotSortAsc = true;

window.sortPilots = function(col) {
    if (window.pilotSortCol === col) {
        window.pilotSortAsc = !window.pilotSortAsc;
    } else {
        window.pilotSortCol = col;
        window.pilotSortAsc = true;
    }
    renderDatabaseView();
};


function extractGradeAndName(rawName) {
    if (!rawName) return { grade: '', name: '' };
    const parts = String(rawName).trim().toUpperCase().split(' ');
    if (parts.length > 1) {
        const firstWord = parts[0];
        const knownGrades = ['GEN','COL','LCL','CDT','CBA','CES','CNE','LTN','SLT','ASP','MAJ','ADC','ADJ','MDL/C','BCH','MCH','MDL','BRI','CPL','1CL','2CL','ADO','MADC'];
        if (knownGrades.includes(firstWord)) {
            return { grade: firstWord, name: parts.slice(1).join(' ') };
        }
    }
    return { grade: '', name: rawName.trim().toUpperCase() };
}


let currentDbSort = { column: 'type', asc: true };

window.sortDbMachines = function(column) {
    if (currentDbSort.column === column) {
        currentDbSort.asc = !currentDbSort.asc;
    } else {
        currentDbSort.column = column;
        currentDbSort.asc = true;
    }
    renderDatabaseView();
};
// database.js - Gestionnaire de Base de Données (Machines, Pilotes, Rôles)

const DB_CONFIG_KEY = 'carnet_db_config';

function getDefaultConfig() {
    return {
        machines: [], // { id, num, reg, type, is_simu, simu_type (none, dedie, tactique), simu_for }
        pilots: [],   // { id, name, grade }
        roles: ['PIC', 'COPIL', 'MONITEUR', 'ELEVE', 'PAX']
    };
}

function getDbConfig() {
    const data = localStorage.getItem(DB_CONFIG_KEY);
    let config = getDefaultConfig();
    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed && typeof parsed === 'object') {
                config = { ...config, ...parsed };
            }
        } catch (e) {
            console.error("Erreur lecture db_config", e);
        }
    }
    
    // Safety check arrays
    if (!Array.isArray(config.machines)) config.machines = [];
    if (!Array.isArray(config.pilots)) config.pilots = [];
    if (!Array.isArray(config.roles)) config.roles = getDefaultConfig().roles;
    
    return config;
}

function saveDbConfig(config) {
    if (!window.isImportingCloud) {
        config.db_version = (config.db_version || 0) + 1;
        config.last_updated = new Date().toISOString();
    }
    localStorage.setItem(DB_CONFIG_KEY, JSON.stringify(config));
    if (typeof updateDatalists === 'function') updateDatalists();
    if (typeof autoSyncWithPC === 'function') autoSyncWithPC(true);
    renderDatabaseView(); // Refresh UI if open
}

// Initial migration from existing flights to populate DB
async function initDbConfigMigration() {
    const config = getDbConfig();
    if (config.machines.length > 0 || config.pilots.length > 0) {
        renderDatabaseView();
        return; // Already initialized
    }

    if (typeof getAllFlights !== 'function') return;
    const flights = await getAllFlights();
    if (!flights || flights.length === 0) {
        renderDatabaseView();
        return;
    }

    let machineIdCounter = 1;
    let pilotIdCounter = 1;

    flights.forEach(f => {
        // Migrate Machines
        if (f.aircraft_type || f.aircraft_reg) {
            let type = (f.aircraft_type || '').trim().toUpperCase();
            let reg = (f.aircraft_reg || '').trim().toUpperCase();
            
            let is_simu = false;
            let simu_type = 'none';
            let simu_for = '';
            
            if (type.startsWith('SA342')) type = 'SA342';
            
            if (type.endsWith(' SIMU')) {
                is_simu = true;
                simu_type = 'dedie';
                simu_for = type.replace(' SIMU', '').trim();
                type = 'SIMULATEUR';
            }

            const exists = config.machines.find(m => m.reg === reg && m.type === type);
            if (!exists && (type || reg)) {
                config.machines.push({
                    id: 'm' + machineIdCounter++,
                    num: reg.length > 3 ? reg.substring(reg.length - 3) : reg, 
                    reg: reg,
                    type: type,
                    is_simu: is_simu,
                    simu_type: simu_type,
                    simu_for: simu_for
                });
            }
        }

        // Migrate Pilots
        if (f.pil_name) {
            let name = f.pil_name.trim().toUpperCase();
            const exists = config.pilots.find(p => p.name === name);
            if (!exists) {
                config.pilots.push({
                    id: 'p' + pilotIdCounter++,
                    name: name,
                    grade: ''
                });
            }
        }

        // Migrate Roles
        if (f.role) {
            let role = f.role.trim().toUpperCase();
            if (!config.roles.includes(role)) {
                config.roles.push(role);
            }
        }
    });

    saveDbConfig(config);
    console.log("Migration DB terminée.");
}

// ----------------------------------------------------
// UI RENDERING
// ----------------------------------------------------

function renderDatabaseView() {
    const container = document.getElementById('db-container');
    if (!container) return;
    const config = getDbConfig();

    let html = `
        <div style="display: flex; gap: 10px; margin-bottom: 20px; overflow-x: auto;">
            <button class="btn secondary" onclick="switchDbTab('machines')">Machines & Simus</button>
            <button class="btn secondary" onclick="switchDbTab('pilots')">Pilotes</button>
            <button class="btn secondary" onclick="switchDbTab('roles')">Fonctions</button>
            <button class="btn secondary outline" style="margin-left: auto; border-color: var(--primary-color);" onclick="window.autoLearnFromAllFlights(true)">Forcer l'analyse globale</button>
        </div>
        <div id="db-content"></div>
    `;
    container.innerHTML = html;
    
    // Default tab
    switchDbTab(window.currentDbTab || 'machines');
}

window.switchDbTab = function(tab) {
    window.currentDbTab = tab;
    const content = document.getElementById('db-content');
    const config = getDbConfig();

    if (tab === 'machines') {
        let mHtml = `
            <h3>Machines & Simulateurs</h3>
            <button class="btn primary" onclick="editMachine(null)" style="margin-bottom: 15px;">+ Ajouter une Machine</button>
            <div class="table-container" style="padding:0;">
                <table class="flights-table">
                    <thead><tr><th onclick="sortDbMachines('num')" style="cursor: pointer;">Immat ↕️</th><th onclick="sortDbMachines('reg')" style="cursor: pointer;">Indicatif ↕️</th><th onclick="sortDbMachines('type')" style="cursor: pointer;">Type ↕️</th><th>Simu ?</th><th>Actions</th></tr></thead>
                    <tbody>
        `;
        const numCount = {};
        
        let sortedMachines = [...config.machines];
        sortedMachines.sort((a, b) => {
            let valA = (a[currentDbSort.column] || '').toString().toUpperCase();
            let valB = (b[currentDbSort.column] || '').toString().toUpperCase();
            if (valA < valB) return currentDbSort.asc ? -1 : 1;
            if (valA > valB) return currentDbSort.asc ? 1 : -1;
            return 0;
        });
        
        sortedMachines.forEach(m => {
            if (m.ignore_duplicate) return;
            const key = m.num.trim().toUpperCase();
            if(key) numCount[key] = (numCount[key] || 0) + 1;
        });
        sortedMachines.forEach(m => {
            let simuText = m.is_simu ? (m.simu_type === 'tactique' ? 'Tactique' : `Dédié (${m.simu_for})`) : 'Non';
            mHtml += `\n                <tr style="${!m.ignore_duplicate && numCount[m.num.trim().toUpperCase()] > 1 ? 'background-color: rgba(255,165,0,0.3);' : ''}">
                    <td>${m.num}</td>
                    <td>${m.reg}</td>
                    <td>${m.type}</td>
                    <td>${simuText}</td>
                    <td>
                        ${!m.ignore_duplicate && numCount[m.num.trim().toUpperCase()] > 1 ? 
            `<button class="btn secondary outline" style="padding: 2px 8px;" onclick="ignoreMachineDuplicate('${m.id}')" title="Ce n'est pas un doublon">✔️</button>
             <button class="btn secondary outline" style="padding: 2px 8px;" onclick="mergeMachine('${m.id}')" title="Fusionner (Garder cet indicatif et supprimer les autres)">🔄</button>` : ''}
         <button class="btn secondary outline" style="padding: 2px 8px;" onclick="editMachine('${m.id}')">✏️</button>
                        <button class="btn secondary outline" style="padding: 2px 8px; color: var(--danger-color);" onclick="deleteMachine('${m.id}')">❌</button>
                    </td>
                </tr>
            `;
        });
        mHtml += `</tbody></table></div>`;
        content.innerHTML = mHtml;
    } 
    else if (tab === 'pilots') {
        let pHtml = `
            <h3>Pilotes</h3>
            <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                <button class="btn primary" onclick="editPilot(null)">+ Ajouter un Pilote</button>
                <input type="text" id="pilotSearchInput" placeholder="Rechercher un pilote..." value="${window.pilotSearchTerm || ''}" oninput="window.pilotSearchTerm = this.value.toUpperCase(); window.renderPilotsTableBody();" style="flex: 1; min-width: 200px; text-transform: uppercase;">
                <button class="btn secondary outline" style="border-color: var(--primary-color);" onclick="window.autoMergePilots()">✨ Fusion Auto</button>
            </div>
            <div class="table-container" style="padding:0;">
                <table class="flights-table">
                    <thead id="pilotsThead">
                        <tr>
                            <th onclick="window.sortPilots('name')" style="cursor:pointer; user-select:none;">Nom / Prénom ${window.pilotSortCol === 'name' ? (window.pilotSortAsc ? '↑' : '↓') : '↕'}</th>
                            <th onclick="window.sortPilots('grade')" style="cursor:pointer; user-select:none;">Grade Actuel ${window.pilotSortCol === 'grade' ? (window.pilotSortAsc ? '↑' : '↓') : '↕'}</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="pilotsTbody"></tbody>
                </table>
            </div>
        `;
        content.innerHTML = pHtml;
        
        window.renderPilotsTableBody = function() {
            const tbody = document.getElementById('pilotsTbody');
            if (!tbody) return;
            const config = getDbConfig();
            const nomCount = {};
            config.pilots.forEach(p => {
                if (p.ignore_duplicate) return;
                const nom = p.name.trim().split(' ')[0].toUpperCase();
                if(nom) nomCount[nom] = (nomCount[nom] || 0) + 1;
            });

            let displayedPilots = config.pilots.filter(p => !window.pilotSearchTerm || (p.name||'').toUpperCase().includes(window.pilotSearchTerm) || (p.grade||'').toUpperCase().includes(window.pilotSearchTerm));
            
            displayedPilots.sort((a, b) => {
                let valA = (a[window.pilotSortCol] || '').toUpperCase();
                let valB = (b[window.pilotSortCol] || '').toUpperCase();
                if (valA < valB) return window.pilotSortAsc ? -1 : 1;
                if (valA > valB) return window.pilotSortAsc ? 1 : -1;
                return 0;
            });

            let tHtml = '';
            displayedPilots.forEach(p => {
                tHtml += `\n                <tr style="${!p.ignore_duplicate && nomCount[p.name.trim().split(' ')[0].toUpperCase()] > 1 ? 'background-color: rgba(255,165,0,0.3);' : ''}">
                        <td style="display:flex; align-items:center; gap:10px; border:none; padding:10px 5px;">
                            ${p.photo ? `<img src="${p.photo}" style="width:35px; height:35px; border-radius:50%; object-fit:cover; border: 1px solid var(--border-color);">` : `<div style="width:35px; height:35px; border-radius:50%; background:var(--surface-light); display:flex; align-items:center; justify-content:center; font-size:16px; border: 1px solid var(--border-color);">👤</div>`}
                            <span>${p.name}</span>
                        </td>
                        <td>${p.grade || '-'}</td>
                        <td>
                            ${!p.ignore_duplicate && nomCount[p.name.trim().split(' ')[0].toUpperCase()] > 1 ? 
                `<button class="btn secondary outline" style="padding: 2px 8px;" onclick="ignorePilotDuplicate('${p.id}')" title="Ce n'est pas un doublon">✅</button>
                 <button class="btn secondary outline" style="padding: 2px 8px;" onclick="mergePilot('${p.id}')" title="Fusionner (Garder ce nom et supprimer les autres)">🔗</button>` : ''}
             <button class="btn secondary outline" style="padding: 2px 8px;" onclick="editPilot('${p.id}')">✏️</button>
                            <button class="btn secondary outline" style="padding: 2px 8px; color: var(--danger-color);" onclick="deletePilot('${p.id}')">🗑️</button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = tHtml;
            
            const thead = document.getElementById('pilotsThead');
            if(thead) {
                thead.innerHTML = `<tr>
                    <th onclick="window.sortPilots('name')" style="cursor:pointer; user-select:none;">Nom / Prénom ${window.pilotSortCol === 'name' ? (window.pilotSortAsc ? '↑' : '↓') : '↕'}</th>
                    <th onclick="window.sortPilots('grade')" style="cursor:pointer; user-select:none;">Grade Actuel ${window.pilotSortCol === 'grade' ? (window.pilotSortAsc ? '↑' : '↓') : '↕'}</th>
                    <th>Actions</th>
                </tr>`;
            }
        };
        
        window.renderPilotsTableBody();
        
        // Put cursor at the end of input if focused previously
        setTimeout(() => {
            const input = document.getElementById('pilotSearchInput');
            if (input && window.pilotSearchTerm) {
                const val = input.value;
                input.value = '';
                input.value = val;
            }
        }, 10);
    }
    else if (tab === 'roles') {
        let rHtml = `
            <h3>Fonctions (Rôles)</h3>
            <button class="btn primary" onclick="addRole()" style="margin-bottom: 15px;">+ Ajouter une Fonction</button>
            <ul style="list-style: none; padding: 0;">
        `;
        config.roles.forEach((r, idx) => {
            rHtml += `
                <li style="display: flex; justify-content: space-between; padding: 10px; background: var(--surface-light); margin-bottom: 5px; border-radius: 4px;">
                    <span>${r}</span>
                    <button class="btn secondary outline" style="padding: 2px 8px; color: var(--danger-color);" onclick="deleteRole(${idx})">❌</button>
                </li>
            `;
        });
        rHtml += `</ul>`;
        content.innerHTML = rHtml;
    }
};

// --- CRUD MACHINES ---
window.editMachine = function(id) {
    const config = getDbConfig();
    let m = { id: 'm' + Date.now(), num: '', reg: '', type: '', is_simu: false, simu_type: 'none', simu_for: '' };
    let isNew = true;
    if (id) {
        const found = config.machines.find(x => x.id === id);
        if (found) { m = found; isNew = false; }
    }

    const modalHtml = `
        <div id="dbModal" class="modal" style="display:flex;">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isNew ? 'Nouvelle Machine' : 'Modifier Machine'}</h2>
                    <button class="close-menu-btn" onclick="document.getElementById('dbModal').remove()">&times;</button>
                </div>
                <div class="form-group">
                    <label>Immatriculation (N°)</label>
                    <input type="text" id="m_num" value="${m.num}" placeholder="ex: 4215">
                </div>
                <div class="form-group">
                    <label>Indicatif</label>
                    <input type="text" id="m_reg" value="${m.reg}" placeholder="ex: F-GXYZ" style="text-transform:uppercase;">
                </div>
                <div class="form-group">
                    <label>Type d'aéronef</label>
                    <input type="text" id="m_type" value="${m.type}" placeholder="ex: SA342" style="text-transform:uppercase;">
                </div>
                <div class="form-group" style="margin-top: 15px;">
                    <label style="display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" id="m_simu" ${m.is_simu ? 'checked' : ''} onchange="toggleSimuOptions()">
                        <strong>Est-ce un Simulateur ?</strong>
                    </label>
                </div>
                <div class="form-group" style="margin-top: 15px;">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <input type="checkbox" id="m_tracked" ${m.tracked !== false ? 'checked' : ''}>
                        <strong>Qualifié sur ce type (Suivi des compétences)</strong>
                    </label>
                    <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:5px; margin-left:25px;">Décochez si vous êtes simplement passager sur ce type d'appareil pour l'exclure du suivi.</p>
                </div>
                <div id="simu_options" style="display: ${m.is_simu ? 'block' : 'none'}; background: var(--surface-light); padding: 10px; border-radius: 4px; margin-top: 10px;">
                    <div class="form-group">
                        <label>Type de Simulateur</label>
                        <select id="m_simu_type" onchange="toggleSimuFor()">
                            <option value="dedie" ${m.simu_type === 'dedie' ? 'selected' : ''}>Dédié (valide une machine)</option>
                            <option value="tactique" ${m.simu_type === 'tactique' ? 'selected' : ''}>Tactique (transverse)</option>
                        </select>
                    </div>
                    <div class="form-group" id="simu_for_group" style="display: ${m.simu_type === 'tactique' ? 'none' : 'block'};">
                        <label>Valide la compétence pour :</label>
                        <input type="text" id="m_simu_for" value="${m.simu_for}" placeholder="ex: SA342" style="text-transform:uppercase;">
                    </div>
                </div>
                <button class="btn primary block" style="margin-top: 20px;" onclick="saveMachine('${m.id}', ${isNew})">Enregistrer</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.toggleSimuOptions = function() {
    const isSimu = document.getElementById('m_simu').checked;
    document.getElementById('simu_options').style.display = isSimu ? 'block' : 'none';
};
window.toggleSimuFor = function() {
    const isTac = document.getElementById('m_simu_type').value === 'tactique';
    document.getElementById('simu_for_group').style.display = isTac ? 'none' : 'block';
};

window.saveMachine = function(id, isNew) {
    const config = getDbConfig();
    const m = {
        id: id,
        num: document.getElementById('m_num').value.trim(),
        reg: document.getElementById('m_reg').value.trim().toUpperCase(),
        type: document.getElementById('m_type').value.trim().toUpperCase(),
        is_simu: document.getElementById('m_simu').checked,
        simu_type: document.getElementById('m_simu_type').value,
        simu_for: document.getElementById('m_simu_for').value.trim().toUpperCase(),
        tracked: document.getElementById('m_tracked').checked
    };
    
    if (isNew) config.machines.push(m);
    else {
        const idx = config.machines.findIndex(x => x.id === id);
        if (idx !== -1) config.machines[idx] = m;
    }
    
    // Apply tracked status to all machines of the same type
    config.machines.forEach(x => {
        if ((x.type || '').trim().toUpperCase() === m.type) {
            x.tracked = m.tracked;
        }
    });
    
    saveDbConfig(config);
    document.getElementById('dbModal').remove();
};

window.deleteMachine = function(id) {
    if(!confirm("Supprimer cette machine ?")) return;
    const config = getDbConfig();
    config.machines = config.machines.filter(m => m.id !== id);
    saveDbConfig(config);
};

// --- CRUD PILOTS ---
window.editPilot = function(id) {
    const config = getDbConfig();
    let p = { id: 'p' + Date.now(), name: '', grade: '' };
    let isNew = true;
    if (id) {
        const found = config.pilots.find(x => x.id === id);
        if (found) { p = found; isNew = false; }
    }

    let hdvEnsemble = 0;
    let dernierVolStr = "Aucun vol";
    if (!isNew && typeof allFlightsData !== 'undefined') {
        let datesVols = [];
        allFlightsData.forEach(f => {
            const { name } = typeof extractGradeAndName === 'function' ? extractGradeAndName(f.pil_name) : { name: (f.pil_name||'').trim().toUpperCase() };
            if (name === p.name) {
                hdvEnsemble += (f.j || 0) + (f.n || 0);
                if (f.date) datesVols.push({ date: f.date, type: f.aircraft_type || 'Inconnu' });
            }
        });
        if (datesVols.length > 0) {
            datesVols.sort((a,b) => new Date(b.date) - new Date(a.date));
            const lastVol = datesVols[0];
            const dateFmt = typeof window.formatDate === 'function' && lastVol.date ? window.formatDate(lastVol.date) : lastVol.date;
            dernierVolStr = dateFmt + (lastVol.type ? " en " + lastVol.type : "");
        }
    }

    const modalHtml = `
        <div id="dbModal" class="modal" style="display:flex;">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isNew ? 'Nouveau Pilote' : 'Modifier Pilote'}</h2>
                    <button class="close-menu-btn" onclick="document.getElementById('dbModal').remove()">&times;</button>
                </div>
                <div style="text-align:center; margin-bottom: 15px;">
                    <div style="width: 100px; height: 100px; border-radius: 50%; background-color: var(--surface-light); border: 2px solid var(--border-color); margin: 0 auto; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;" onclick="document.getElementById('p_photo_input').click()">
                        ${p.photo ? `<img src="${p.photo}" style="width:100%; height:100%; object-fit:cover;" id="p_photo_img">` : `<span style="font-size:2rem; color: var(--text-secondary);" id="p_photo_placeholder">📷</span>`}
                        <div style="position:absolute; bottom:0; width:100%; height:25px; background:rgba(0,0,0,0.5); color:white; font-size:0.7rem; display:flex; justify-content:center; align-items:center;">Modifier</div>
                    </div>
                    <input type="file" id="p_photo_input" accept="image/*" style="display:none;" onchange="handlePilotPhotoUpload(event)">
                    <input type="hidden" id="p_photo_data" value="${p.photo || ''}">
                </div>
                ${!isNew ? `
                <div style="background: var(--surface-light); padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 0.9rem; border: 1px solid var(--border-color);">
                    <div><strong>Heures de vol ensemble :</strong> ${hdvEnsemble.toFixed(1)} h</div>
                    <div style="margin-top:5px;"><strong>Dernier vol :</strong> ${dernierVolStr}</div>
                </div>
                ` : ''}
                <div class="form-group">
                    <label>Nom et Prénom</label>
                    <input type="text" id="p_name" value="${p.name}" placeholder="ex: MARTIN P." style="text-transform:uppercase;">
                </div>
                
                ${!isNew ? `
                <div class="form-group" style="margin-top: 20px; padding: 10px; border: 1px dashed var(--primary-color); border-radius: 5px; background: rgba(var(--primary-color-rgb), 0.05);">
                    <label style="color: var(--primary-color); font-size:1.1em; display:flex; align-items:center; gap:5px;"><span>🔗</span> Fusionner ce pilote</label>
                    <p style="font-size: 0.85rem; margin-bottom: 10px; line-height:1.2;">Sélectionnez ci-dessous le profil à conserver. Celui-ci (${p.name}) sera supprimé et ses vols y seront transférés.</p>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <select id="p_merge_target" style="flex:1; min-width:200px;">
                            <option value="">-- Conserver le profil... --</option>
                            ${getDbConfig().pilots.filter(other => other.id !== p.id).sort((a,b)=>a.name.localeCompare(b.name)).map(other => 
                                `<option value="${other.id}">${other.name} (${other.grade||'-'})` + (other.photo ? ' 📸' : '') + `</option>`
                            ).join('')}
                        </select>
                        <button class="btn secondary outline" onclick="manualMergePilotFromModal('${p.id}')">Fusionner</button>
                    </div>
                </div>
                ` : ''}
                <div class="form-group">
                    <label>Grade Actuel</label>
                    <input type="text" id="p_grade" value="${p.grade||''}" placeholder="ex: CNE" style="text-transform:uppercase;">
                </div>
                ${!isNew && p.grade_history && p.grade_history.length > 0 ? `
                <div class="form-group" style="margin-top:15px;">
                    <label>Historique des grades</label>
                    <ul style="margin: 5px 0 0 20px; padding:0; font-size: 0.9rem; color: var(--text-secondary);">
                        ${p.grade_history.map((gh, i) => `<li><strong>${gh.grade}</strong> - depuis le ${window.formatDate ? window.formatDate(gh.date) : gh.date} <button type="button" onclick="deleteGradeHistory('${p.id}', ${i})" style="background:none; border:none; cursor:pointer; font-size:0.8rem; margin-left:10px;" title="Supprimer">❌</button></li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                <button class="btn primary block" style="margin-top: 20px;" onclick="savePilot('${p.id}', ${isNew})">Enregistrer</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.savePilot = function(id, isNew) {
    const config = getDbConfig();
    const newName = document.getElementById('p_name').value.trim().toUpperCase();
    const newGrade = document.getElementById('p_grade').value.trim().toUpperCase();
    
    if (isNew) {
        const p = {
            id: id,
            name: newName,
            grade: newGrade,
            photo: document.getElementById('p_photo_data').value || '',
            grade_history: newGrade ? [{ grade: newGrade, date: new Date().toISOString().split('T')[0] }] : []
        };
        config.pilots.push(p);
    } else {
        const idx = config.pilots.findIndex(x => x.id === id);
        if (idx !== -1) {
            const p = config.pilots[idx];
            const oldName = p.name;
            const oldNameWithGrade = (p.grade ? p.grade + ' ' : '') + p.name;
            p.name = newName;
            
            if (typeof getAllFlights === 'function' && typeof importFlights === 'function') {
                getAllFlights().then(flights => {
                    let updated = false;
                    flights.forEach(f => {
                        if (f.pil_name && (f.pil_name.trim().toUpperCase() === oldName || f.pil_name.trim().toUpperCase() === oldNameWithGrade)) {
                            f.pil_name = newName;
                            updated = true;
                        }
                    });
                    if (updated) {
                        importFlights(flights).then(() => {
                            if(typeof autoSyncWithPC === 'function') autoSyncWithPC(true);
                        });
                    }
                });
            }
            
            p.photo = document.getElementById('p_photo_data').value || '';
            if (p.grade !== newGrade) {
                p.grade = newGrade;
                if (!p.grade_history) p.grade_history = [];
                if (newGrade) {
                    p.grade_history.push({ grade: newGrade, date: new Date().toISOString().split('T')[0] });
                }
            }
        }
    }
    
    saveDbConfig(config);
    document.getElementById('dbModal').remove();
    if(window.currentDbTab === 'pilots') switchDbTab('pilots');
};

window.deletePilot = function(id) {
    if(!confirm("Supprimer ce pilote ?")) return;
    const config = getDbConfig();
    config.pilots = config.pilots.filter(p => p.id !== id);
    saveDbConfig(config);
};

// --- CRUD ROLES ---
window.addRole = function() {
    const r = prompt("Nouvelle fonction (ex: TESTEUR) :");
    if (r && r.trim()) {
        const config = getDbConfig();
        const role = r.trim().toUpperCase();
        if (!config.roles.includes(role)) {
            config.roles.push(role);
            saveDbConfig(config);
        }
    }
};

window.deleteRole = function(idx) {
    if(!confirm("Supprimer cette fonction ?")) return;
    const config = getDbConfig();
    config.roles.splice(idx, 1);
    saveDbConfig(config);
};

window.addEventListener('load', () => {
    setTimeout(initDbConfigMigration, 500);
});

// Auto-learn missing entities from flights
window.autoLearnFromAllFlights = function(forceAlert = false) {
    let conf = getDbConfig();
    let uniqM = {};
    let keep = [];
    conf.machines.forEach(m => {
        let k = (m.type||"").trim().toUpperCase() + "|" + (m.reg||"").trim().toUpperCase() + "|" + (m.num||"").trim().toUpperCase();
        if(!uniqM[k]) { uniqM[k] = true; keep.push(m); }
    });
    if(keep.length < conf.machines.length) {
        console.log("Deduplicated " + (conf.machines.length - keep.length) + " machines.");
        conf.machines = keep;
        saveDbConfig(conf);
    }

    try {
    if (!(typeof allFlightsData !== 'undefined' ? allFlightsData : []) || (typeof allFlightsData !== 'undefined' ? allFlightsData : []).length === 0) return;
    
    const config = getDbConfig();
    let newMachinesCount = 0;
    let newPilotsCount = 0;

    
    // Process oldest flights first to build chronological grade history
    const sortedFlights = [...(typeof allFlightsData !== 'undefined' ? allFlightsData : [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // We will collect flights that need an IDB update (their pil_name was dirty)
    const flightsToUpdate = [];

    sortedFlights.forEach(f => {

        // Machines
        if (f.aircraft_type || f.aircraft_reg || f.aircraft_num) {
            let type = (f.aircraft_type || '').trim().toUpperCase();
            let reg = (f.aircraft_reg || '').trim().toUpperCase();
            let num = (f.aircraft_num || '').trim().toUpperCase();
            
            let is_simu = false;
            let simu_type = 'none';
            let simu_for = '';
            
            if (type.endsWith(' SIMU')) {
                is_simu = true;
                simu_type = 'dedie';
                simu_for = type.replace(' SIMU', '').trim();
                type = 'SIMULATEUR';
            }

            // We consider it exists if there's a machine with same type AND same reg, OR same type AND same num
            const exists = config.machines.find(m => {
                const mType = (m.type||'').trim().toUpperCase();
                const mReg = (m.reg||'').trim().toUpperCase();
                const mNum = (m.num||'').trim().toUpperCase();
                
                // If it has identical Type AND identical Registration (and registration is not empty)
                if (mType === type && mReg === reg && reg !== '') return true;
                // Or identical Type AND identical Num (and num is not empty)
                if (mType === type && mNum === num && num !== '') return true;
                // Or if both are empty and type matches
                if (mType === type && mReg === '' && mNum === '' && reg === '' && num === '') return true;
                
                return false;
            });

            if (!exists && (type || reg || num)) {
                let finalReg = reg;
                let finalNum = num;
                if (!num && reg && /^[0-9]+$/.test(reg)) { finalNum = reg; finalReg = ''; }
                else if (!reg && num && /[A-Z]/.test(num)) { finalReg = num; finalNum = ''; }

                config.machines.push({
                    id: 'm' + Date.now() + Math.floor(Math.random()*10000),
                    num: finalNum, 
                    reg: finalReg,
                    type: type,
                    is_simu: is_simu,
                    simu_type: simu_type,
                    simu_for: simu_for
                });
                newMachinesCount++;
            }
        }

        // Pilots
        if (f.pil_name) {
            const { grade, name } = extractGradeAndName(f.pil_name);
            
            // Clean the flight data if it had a grade
            if (grade && f.pil_name.toUpperCase() !== name) {
                f.pil_name = name;
                flightsToUpdate.push(f);
            }

            let pilot = config.pilots.find(p => (p.name||'').trim().toUpperCase() === name);
            if (!pilot) {
                pilot = {
                    id: 'p' + Date.now() + Math.floor(Math.random()*10000),
                    name: name,
                    grade: grade,
                    grade_history: []
                };
                config.pilots.push(pilot);
                newPilotsCount++;
            }
            
            if (!pilot.grade_history) pilot.grade_history = [];

            if (grade) {
                // Update current grade
                pilot.grade = grade;
                // Add to history if it's a new promotion
                const lastHistory = pilot.grade_history[pilot.grade_history.length - 1];
                if (!lastHistory || lastHistory.grade !== grade) {
                    pilot.grade_history.push({ grade: grade, date: f.date });
                }
            }
        }

        // Roles
        if (f.role) {
            let role = f.role.trim().toUpperCase();
            if (!config.roles.includes(role)) {
                config.roles.push(role);
            }
        }
    });

    
    let uniquePilotsInFlights = new Set((typeof allFlightsData !== 'undefined' ? allFlightsData : []).filter(f => f.pil_name).map(f => String(f.pil_name).trim().toUpperCase()));
    console.log("Total unique pilot names in flights:", uniquePilotsInFlights.size);
    console.log("Total pilots in DB:", config.pilots.length);

    if (forceAlert) {
        alert("Analyse terminée !\n" + 
              "Vols analysés : " + (typeof allFlightsData !== 'undefined' ? allFlightsData : []).length + "\n" +
              "Pilotes uniques trouvés : " + uniquePilotsInFlights.size + "\n" +
              "Pilotes créés à l'instant : " + newPilotsCount + "\n" +
              "Machines créées à l'instant : " + newMachinesCount);
    }

    if (newMachinesCount > 0 || newPilotsCount > 0 || flightsToUpdate.length > 0) {
        saveDbConfig(config);
        console.log("Database updated: " + newMachinesCount + " machines, " + newPilotsCount + " pilots.");
        
        if (flightsToUpdate.length > 0) {
            console.log("Updating " + flightsToUpdate.length + " flights to clean pilot names...");
            // Async background update
            (async () => {
                for(let fl of flightsToUpdate) {
                    await updateFlight(fl);
                }
                if (typeof updateUI === 'function') updateUI();
                alert("Mise à jour terminée : " + newPilotsCount + " pilote(s) et nettoyage de " + flightsToUpdate.length + " vol(s).");
            })();
        } else {
            alert("Base de données mise à jour ! " + newMachinesCount + " nouvelle(s) machine(s), " + newPilotsCount + " nouveau(x) pilote(s).");
        }
    }
    } catch(err) {
        alert("Erreur dans autoLearn: " + err.message + "\n" + err.stack);
        console.error(err);
    }
};

// --- GESTION DOUBLONS MACHINES & PILOTES ---
window.mergeMachine = async function(keepId) {
    if(!confirm("Fusionner : Conserver cet indicatif et écraser l'autre machine (même Numéro) dans tout l'historique des vols ?")) return;
    const config = getDbConfig();
    const keepMachine = config.machines.find(m => m.id === keepId);
    if(!keepMachine) return;
    
    const numToMatch = keepMachine.num.trim().toUpperCase();
    const badMachines = config.machines.filter(m => m.id !== keepId && m.num.trim().toUpperCase() === numToMatch && !m.ignore_duplicate);
    
    if(badMachines.length === 0) {
        alert("Aucun autre doublon non ignoré pour ce numéro.");
        return;
    }

    let flightsUpdated = 0;
    if ((typeof allFlightsData !== 'undefined' ? allFlightsData : [])) {
        for (const f of (typeof allFlightsData !== 'undefined' ? allFlightsData : [])) {
            let updated = false;
            for (const badM of badMachines) {
                if (f.aircraft_num === badM.num && f.aircraft_reg === badM.reg) {
                    f.aircraft_reg = keepMachine.reg;
                    f.aircraft_type = keepMachine.type;
                    updated = true;
                }
            }
            if (updated) {
                if(typeof updateFlight === 'function') await updateFlight(f);
                flightsUpdated++;
            }
        }
    }
    
    const badIds = badMachines.map(m => m.id);
    config.machines = config.machines.filter(m => !badIds.includes(m.id));
    saveDbConfig(config);
    
    if(flightsUpdated > 0) {
        if(typeof updateUI === 'function') await updateUI();
        alert(flightsUpdated + " vol(s) mis à jour dans l'historique !");
    }
};

window.ignoreMachineDuplicate = function(id) {
    const config = getDbConfig();
    const m = config.machines.find(x => x.id === id);
    if(m) {
        m.ignore_duplicate = true;
        saveDbConfig(config);
    }
};

window.mergePilot = async function(keepId) {
    if(!confirm("Fusionner : Conserver ce nom complet et écraser l'autre pilote (même Nom de famille) dans tout l'historique des vols ?")) return;
    const config = getDbConfig();
    const keepP = config.pilots.find(p => p.id === keepId);
    if(!keepP) return;
    
    const nomToMatch = keepP.name.trim().split(' ')[0].toUpperCase();
    const badPilots = config.pilots.filter(p => p.id !== keepId && p.name.trim().split(' ')[0].toUpperCase() === nomToMatch && !p.ignore_duplicate);
    
    if(badPilots.length === 0) {
        alert("Aucun autre doublon non ignoré pour ce nom.");
        return;
    }

    let flightsUpdated = 0;
    if ((typeof allFlightsData !== 'undefined' ? allFlightsData : [])) {
        for (const f of (typeof allFlightsData !== 'undefined' ? allFlightsData : [])) {
            let updated = false;
            for (const badP of badPilots) {
                if (f.pil_name === badP.name) {
                    f.pil_name = keepP.name;
                    updated = true;
                }
            }
            if (updated) {
                if(typeof updateFlight === 'function') await updateFlight(f);
                flightsUpdated++;
            }
        }
    }
    
    const badIds = badPilots.map(p => p.id);
    config.pilots = config.pilots.filter(p => !badIds.includes(p.id));
    saveDbConfig(config);
    
    if(flightsUpdated > 0) {
        if(typeof updateUI === 'function') await updateUI();
        alert(flightsUpdated + " vol(s) mis à jour dans l'historique !");
    }
};

window.ignorePilotDuplicate = function(id) {
    const config = getDbConfig();
    const p = config.pilots.find(x => x.id === id);
    if(p) {
        p.ignore_duplicate = true;
        saveDbConfig(config);
    }
};


window.deleteGradeHistory = function(pilotId, index) {
    if(!confirm("Supprimer ce grade de l'historique ?")) return;
    const config = getDbConfig();
    const p = config.pilots.find(x => x.id === pilotId);
    if(p && p.grade_history) {
        p.grade_history.splice(index, 1);
        saveDbConfig(config);
        document.getElementById('dbModal').remove();
        editPilot(pilotId); // reopen
    }
};

window.handlePilotPhotoUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 200;
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to highly compressed JPEG to save localStorage space
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            document.getElementById('p_photo_data').value = dataUrl;
            
            const placeholder = document.getElementById('p_photo_placeholder');
            if (placeholder) placeholder.style.display = 'none';
            
            let imgEl = document.getElementById('p_photo_img');
            if (!imgEl) {
                imgEl = document.createElement('img');
                imgEl.id = 'p_photo_img';
                imgEl.style.width = '100%';
                imgEl.style.height = '100%';
                imgEl.style.objectFit = 'cover';
                document.getElementById('p_photo_input').previousElementSibling.prepend(imgEl);
            }
            imgEl.src = dataUrl;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};


window.manualMergePilotFromModal = async function(badId) {
    const targetId = document.getElementById('p_merge_target').value;
    if (!targetId) {
        alert("Veuillez sélectionner un pilote cible.");
        return;
    }
    
    const config = getDbConfig();
    const keepP = config.pilots.find(p => p.id === targetId);
    const badP = config.pilots.find(p => p.id === badId);
    
    if(!confirm(`Êtes-vous sûr de vouloir fusionner "${badP.name}" dans "${keepP.name}" ?\nTous les vols de ${badP.name} seront réattribués.`)) return;
    
    // Remove bad pilot from DB
    config.pilots = config.pilots.filter(p => p.id !== badId);
    
    // Update flights
    let flightsUpdated = 0;
    if (typeof allFlightsData !== 'undefined') {
        for (let f of allFlightsData) {
            const extracted = typeof extractGradeAndName === 'function' ? extractGradeAndName(f.pil_name).name : (f.pil_name||'').trim().toUpperCase();
            if (extracted === badP.name) {
                f.pil_name = f.pil_name.replace(extracted, keepP.name);
                if (typeof updateFlight === 'function') await updateFlight(f);
                flightsUpdated++;
            }
        }
    }
    
    saveDbConfig(config);
    alert(`Fusion réussie ! ${flightsUpdated} vol(s) mis à jour.`);
    
    document.getElementById('dbModal').remove();
    renderDatabaseView();
    if (typeof updateUI === 'function') updateUI();
};
