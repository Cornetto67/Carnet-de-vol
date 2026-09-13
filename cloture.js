// cloture.js - Logique de génération des rapports (Mois / Année)

document.addEventListener('DOMContentLoaded', () => {
    // Populate year dropdown
    const yearSelect = document.getElementById('reportYearSelect');
    if (yearSelect) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear + 2; y >= currentYear - 10; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }
        yearSelect.value = currentYear;
        
        // Set current month automatically
        const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
        const monthSelect = document.getElementById('reportMonthSelect');
        if (monthSelect) monthSelect.value = currentMonth;
    }
});

function toggleReportType() {
    const type = document.getElementById('reportTypeSelect').value;
    document.getElementById('reportMonthGroup').style.display = type === 'month' ? 'block' : 'none';
}

let currentReportTitle = "";
let currentEmailBody = "";

function saveEditableCell(event) {
    const el = event.target;
    if (el.dataset.saveKey) {
        localStorage.setItem(el.dataset.saveKey, el.innerText);
    }
}

function getSavedCell(key, defaultVal = '') {
    return localStorage.getItem(key) || defaultVal;
}

function attachEditableListeners() {
    document.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('input', saveEditableCell);
        cell.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                cell.blur();
            }
        });
    });
}

function generateReport() {
    const type = document.getElementById('reportTypeSelect').value;
    const year = document.getElementById('reportYearSelect').value;
    const monthStr = document.getElementById('reportMonthSelect').value;
    const monthNum = parseInt(monthStr, 10);
    const monthNames = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    
    currentReportTitle = type === 'month' ? `Clôture Mensuelle - ${monthNames[monthNum]} ${year}` : `Clôture Annuelle - ${year}`;

    if (type === 'month') {
        generateMonthlyReport(year, monthStr, monthNames[monthNum]);
    } else {
        generateAnnualReport(year);
    }
    
    attachEditableListeners();
}

const isPilot = (role) => {
    if (!role) return false;
    const r = role.toUpperCase();
    return r.includes('PIC') || r.includes('COP') || r.includes('PIL') || r.includes('CDB');
};

const formatHour = (h) => (h && h > 0) ? h.toFixed(1) : '0,0';

function generateMonthlyReport(year, monthStr, monthName) {
    const config = typeof getDbConfig === 'function' ? getDbConfig() : null;
    const isFlightSimu = (f) => {
        if (f.seance_type && f.seance_type.toUpperCase().includes('SIMU')) return true;
        let type = (f.aircraft_type || '').trim().toUpperCase();
        if (type.endsWith(' SIMU') || type === 'SIMULATEUR' || type === 'EPSA' || type === 'EDITH') return true;
        if (config) {
            if (f.aircraft_num) {
                const m = config.machines.find(x => x.num === f.aircraft_num);
                if (m && m.is_simu) return true;
            }
            const m = config.machines.find(x => (x.type||'').trim().toUpperCase() === type);
            if (m && m.is_simu) return true;
        }
        return false;
    };

    const normalizeType = (f) => {
        let type = (f.aircraft_type || 'INCONNU').trim().toUpperCase();
        if (type.startsWith('SA342')) return 'SA342';
        return type;
    };

    const monthPrefix = `${year}-${monthStr}`;
    const flightsMonth = allFlightsData.filter(f => f.date && f.date.startsWith(monthPrefix));
    
    const machinesMap = new Map();
    let totalSimu = 0;
    let mJour=0, mNuit=0, mJVN=0, mVTN=0, mTotal=0, mME=0;
    
    flightsMonth.forEach(f => {
        const j = f.j || 0;
        const n = f.n || 0;
        const vtn = f.vtn || 0;
        const jvn = Math.max(0, n - vtn);
        const me = !isPilot(f.role) ? (j+n) : 0;
        
        if (isFlightSimu(f)) {
            totalSimu += (j+n);
        } else {
            let t = normalizeType(f);
            if (!machinesMap.has(t)) {
                machinesMap.set(t, { j:0, n:0, jvn:0, vtn:0, total:0, me:0 });
            }
            let d = machinesMap.get(t);
            d.j += j;
            d.n += n;
            d.jvn += jvn;
            d.vtn += vtn;
            d.total += (j+n);
            d.me += me;
            
            mJour += j;
            mNuit += n;
            mJVN += jvn;
            mVTN += vtn;
            mTotal += (j+n);
            mME += me;
        }
    });

    const flightsYear = allFlightsData.filter(f => f.date && f.date.startsWith(year) && f.date <= `${year}-${monthStr}-31`);
    const yMachinesMap = new Map();
    let yTotalSimu = 0;
    let yJour=0, yNuit=0, yJVN=0, yVTN=0, yTotal=0, yME=0;
    
    flightsYear.forEach(f => {
        const j = f.j || 0;
        const n = f.n || 0;
        const vtn = f.vtn || 0;
        const jvn = Math.max(0, n - vtn);
        const me = !isPilot(f.role) ? (j+n) : 0;
        
        if (isFlightSimu(f)) {
            yTotalSimu += (j+n);
        } else {
            let t = normalizeType(f);
            if (!yMachinesMap.has(t)) {
                yMachinesMap.set(t, { j:0, n:0, jvn:0, vtn:0, total:0, me:0 });
            }
            let d = yMachinesMap.get(t);
            d.j += j;
            d.n += n;
            d.jvn += jvn;
            d.vtn += vtn;
            d.total += (j+n);
            d.me += me;
            
            yJour += j;
            yNuit += n;
            yJVN += jvn;
            yVTN += vtn;
            yTotal += (j+n);
            yME += me;
        }
    });

    const sk = (key) => `cloture_mois_${key}`;

    let html = `
        <div style="padding: 10px; background: white; color: black;">
        <h2 style="text-align: center; margin-bottom: 20px;">Synthèse Mensuelle - ${monthName} ${year}</h2>
        
        <table class="excel-table" style="width: 100%; text-align: center; margin-bottom: 20px;">
            <tr class="header-row">
                <th style="text-align: left; padding: 5px; background: #d9e1f2;">Machine</th>
                <th style="background: #d9e1f2;">Jour</th>
                <th style="background: #d9e1f2;"><span style="color:red">Nuit</span></th>
                <th style="background: #d9e1f2;"><span style="color:red">dont JVN</span></th>
                <th style="background: #d9e1f2;"><span style="color:green">dont VTN</span></th>
                <th style="background: #d9e1f2;">TOTAL</th>
                <th style="background: #d9e1f2;">dont ME</th>
                <th style="background: #d9e1f2;">OPEX</th>
            </tr>
    `;

    // Sort machines for consistent rendering
    Array.from(machinesMap.keys()).sort().forEach(t => {
        let d = machinesMap.get(t);
        let safeT = t.replace(/[^a-zA-Z0-9]/g, '');
        html += `
            <tr>
                <td style="text-align: left; font-weight: bold;">${t}</td>
                <td>${formatHour(d.j)}</td>
                <td><span style="color:red">${formatHour(d.n)}</span></td>
                <td><span style="color:red">${formatHour(d.jvn)}</span></td>
                <td><span style="color:green">${formatHour(d.vtn)}</span></td>
                <td style="font-weight: bold;">${formatHour(d.total)}</td>
                <td>${formatHour(d.me)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('opex_m_'+safeT)}">${getSavedCell(sk('opex_m_'+safeT))}</td>
            </tr>
        `;
    });
    
    html += `
            <tr class="total-row" style="background: #f0f0f0;">
                <td style="text-align: left; font-weight: bold;">TOTAL VOLS (Exclu Simu)</td>
                <td>${formatHour(mJour)}</td>
                <td><span style="color:red">${formatHour(mNuit)}</span></td>
                <td><span style="color:red">${formatHour(mJVN)}</span></td>
                <td><span style="color:green">${formatHour(mVTN)}</span></td>
                <td style="font-weight: bold;">${formatHour(mTotal)}</td>
                <td>${formatHour(mME)}</td>
                <td style="background: #555"></td>
            </tr>
            <tr>
                <td style="text-align: left; font-weight: bold;">SIMULATEURS</td>
                <td colspan="7" style="font-weight: bold; text-align: left; padding-left: 20px;">${formatHour(totalSimu)} h</td>
            </tr>
        </table>
    `;

    html += `
        <h3 style="margin-bottom: 10px; color: black;">Cumul Annuel (depuis le 1er Janvier ${year})</h3>
        <table class="excel-table" style="width: 100%; text-align: center; margin-bottom: 30px;">
            <tr class="header-row">
                <th style="text-align: left; padding: 5px; background: #fce4d6;">Machine</th>
                <th style="background: #fce4d6;">Jour</th>
                <th style="background: #fce4d6;"><span style="color:red">Nuit</span></th>
                <th style="background: #fce4d6;"><span style="color:red">dont JVN</span></th>
                <th style="background: #fce4d6;"><span style="color:green">dont VTN</span></th>
                <th style="background: #fce4d6;">TOTAL</th>
                <th style="background: #fce4d6;">dont ME</th>
                <th style="background: #fce4d6;">OPEX</th>
            </tr>
    `;
    
    Array.from(yMachinesMap.keys()).sort().forEach(t => {
        let d = yMachinesMap.get(t);
        let safeT = t.replace(/[^a-zA-Z0-9]/g, '');
        html += `
            <tr>
                <td style="text-align: left; font-weight: bold;">${t}</td>
                <td>${formatHour(d.j)}</td>
                <td><span style="color:red">${formatHour(d.n)}</span></td>
                <td><span style="color:red">${formatHour(d.jvn)}</span></td>
                <td><span style="color:green">${formatHour(d.vtn)}</span></td>
                <td style="font-weight: bold;">${formatHour(d.total)}</td>
                <td>${formatHour(d.me)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('opex_y_'+safeT)}">${getSavedCell(sk('opex_y_'+safeT))}</td>
            </tr>
        `;
    });
    
    html += `
            <tr class="total-row" style="background: #f0f0f0;">
                <td style="text-align: left; font-weight: bold;">TOTAL VOLS (Exclu Simu)</td>
                <td>${formatHour(yJour)}</td>
                <td><span style="color:red">${formatHour(yNuit)}</span></td>
                <td><span style="color:red">${formatHour(yJVN)}</span></td>
                <td><span style="color:green">${formatHour(yVTN)}</span></td>
                <td style="font-weight: bold;">${formatHour(yTotal)}</td>
                <td>${formatHour(yME)}</td>
                <td style="background: #555"></td>
            </tr>
            <tr>
                <td style="text-align: left; font-weight: bold;">SIMULATEURS</td>
                <td colspan="7" style="font-weight: bold; text-align: left; padding-left: 20px;">${formatHour(yTotalSimu)} h</td>
            </tr>
        </table>
    `;

    html += `
            <table style="width: 100%; margin-top: 30px; border: none; color: black;">
                <tr>
                    <td style="width: 50%; text-align: center; font-weight: bold; padding: 20px; border: none;">L'intéressé</td>
                    <td style="width: 50%; text-align: center; font-weight: bold; padding: 20px; border: none;">Le commandant d'unité</td>
                </tr>
                <tr>
                    <td style="height: 80px; border: none;"></td>
                    <td style="height: 80px; border: none;"></td>
                </tr>
            </table>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportPreviewContainer').style.display = 'block';
    currentEmailBody = `Bonjour,\n\nVeuillez trouver ci-joint ma clôture mensuelle pour ${monthName} ${year}.\n\nTotal vols du mois: ${formatHour(mTotal)}h (dont J: ${formatHour(mJour)} / N: ${formatHour(mNuit)})\nSimulateurs du mois: ${formatHour(totalSimu)}h\n\nCumul annuel vols: ${formatHour(yTotal)}h\n\nCordialement,`;
}

function generateAnnualReport(year) {
    const sk = (key) => `cloture_annee_${year}_${key}`;
    const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    
    let html = `
        <div style="padding: 10px; background: white;">
        <table class="excel-table">
            <tr class="header-row">
                <th rowspan="2">ANNEE<br><br>${year}</th>
                <th colspan="6">HEURES DE VOL DANS LA SPECIALITE : PILOTE</th>
                <th colspan="3">Membre d'équipage</th>
                <th rowspan="2">Appontages</th>
                <th colspan="2">SIMULATEUR</th>
                <th>TOTAL du mois</th>
                <th colspan="2">TOTAL des mois</th>
                <th colspan="2">TOTALISATION</th>
                <th rowspan="2">TOTAL général</th>
            </tr>
            <tr class="sub-header-row">
                <th>Jour</th>
                <th>Dont V.S.V.<br><span style="font-size:0.6rem">Sous capote / Dans les nuages</span></th>
                <th><span style="color:red">Nuit</span><br><span style="font-size:0.6rem">JVN</span></th>
                <th><span style="color:green">dont VTN</span></th>
                <th>A.M.V.</th>
                <th>Jour</th>
                <th><span style="color:red">Nuit</span></th>
                <th>Jour</th>
                <th><span style="color:red">Nuit</span></th>
                <th><span style="color:red">Nuit</span></th>
                <th>Jour</th>
                <th><span style="color:red">Nuit</span></th>
                <th>J+N+ME</th>
                <th>Jour</th>
                <th><span style="color:red">Nuit</span></th>
                <th>Jour</th>
                <th><span style="color:red">Nuit</span></th>
            </tr>
            <tr class="total-row">
                <td>TOTAL au 1er janvier</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_p_j')}">${getSavedCell(sk('base_p_j'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_p_vsv')}">${getSavedCell(sk('base_p_vsv'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_p_n')}"><span style="color:red">${getSavedCell(sk('base_p_n'), '0,0')}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_p_vtn')}"><span style="color:green">${getSavedCell(sk('base_p_vtn'), '0,0')}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_amv')}">${getSavedCell(sk('base_amv'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_me_j')}">${getSavedCell(sk('base_me_j'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_me_n')}"><span style="color:red">${getSavedCell(sk('base_me_n'), '0,0')}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_app')}">${getSavedCell(sk('base_app'), '0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_sim_j')}">${getSavedCell(sk('base_sim_j'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_sim_n')}"><span style="color:red">${getSavedCell(sk('base_sim_n'), '0,0')}</span></td>
                <td style="background:#555"></td>
                <td style="background:#555"></td>
                <td style="background:#555"></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_tot_j')}">${getSavedCell(sk('base_tot_j'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_tot_n')}"><span style="color:red">${getSavedCell(sk('base_tot_n'), '0,0')}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('base_general')}">${getSavedCell(sk('base_general'), '0,0')}</td>
            </tr>
    `;

    let cumPilJ=0, cumPilN=0, cumMeJ=0, cumMeN=0;
    
    months.forEach((mName, index) => {
        const mStr = (index + 1).toString().padStart(2, '0');
        const mPrefix = `${year}-${mStr}`;
        const flightsMonth = allFlightsData.filter(f => f.date && f.date.startsWith(mPrefix));
        
        let pJ=0, pN=0, pVSV=0, pVTN=0, pAMV=0;
        let meJ=0, meN=0;
        let sJ=0, sN=0; // Simu Jour/Nuit if applicable, but usually simu doesn't have Nuit in the same way, let's just map J to J
        let mTotal = 0;

        flightsMonth.forEach(f => {
            const j = f.j || 0;
            const n = f.n || 0;
            if (isPilot(f.role)) {
                pJ += j;
                pN += n;
                pVSV += (f.vsv || 0);
                pVTN += (f.vtn || 0);
            } else {
                meJ += j;
                meN += n;
            }
            if (f.seance_type && f.seance_type.toUpperCase().includes('SIMU')) {
                sJ += (j+n);
            }
            mTotal += (j+n);
        });

        cumPilJ += pJ;
        cumPilN += pN;
        cumMeJ += meJ;
        cumMeN += meN;

        html += `
            <tr>
                <td class="label-cell">${mName}</td>
                <td>${formatHour(pJ)}</td>
                <td>${formatHour(pVSV)}</td>
                <td><span style="color:red">${formatHour(pN)}</span></td>
                <td><span style="color:green">${formatHour(pVTN)}</span></td>
                <td>${formatHour(pAMV)}</td>
                <td>${formatHour(meJ)}</td>
                <td><span style="color:red">${formatHour(meN)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('app_'+mStr)}">${getSavedCell(sk('app_'+mStr), '0')}</td>
                <td>${formatHour(sJ)}</td>
                <td><span style="color:red">${formatHour(sN)}</span></td>
                <td>${formatHour(mTotal)}</td>
                <td>${formatHour(cumPilJ + cumMeJ)}</td>
                <td><span style="color:red">${formatHour(cumPilN + cumMeN)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('tot_j_'+mStr)}">${getSavedCell(sk('tot_j_'+mStr), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('tot_n_'+mStr)}"><span style="color:red">${getSavedCell(sk('tot_n_'+mStr), '0,0')}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('gen_'+mStr)}">${getSavedCell(sk('gen_'+mStr), '0,0')}</td>
            </tr>
        `;
    });

    html += `
            <tr class="total-row">
                <td>Total au 31 décembre</td>
                <td>${formatHour(cumPilJ)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_p_vsv')}"></td>
                <td><span style="color:red">${formatHour(cumPilN)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_p_vtn')}"></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_p_amv')}"></td>
                <td>${formatHour(cumMeJ)}</td>
                <td><span style="color:red">${formatHour(cumMeN)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_app')}"></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_sim_j')}"></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_sim_n')}"></td>
                <td style="background:#555"></td>
                <td>Total année</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_tot_annee')}"></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_tot_j')}"></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_tot_n')}"></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('end_gen')}"></td>
            </tr>
        </table>
        <p style="margin-top: 15px; font-size: 0.8rem; color: #666; text-align: center;">Toutes les cases gris clair sont modifiables ! Cliquez dessus pour reporter vos totaux (ils seront sauvegardés automatiquement sur votre téléphone).</p>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportPreviewContainer').style.display = 'block';

    currentEmailBody = `Bonjour,\n\nVeuillez trouver ci-joint ma clôture annuelle pour l'année ${year}.\n\nTotal vols Pilote (J/N): ${formatHour(cumPilJ)} / ${formatHour(cumPilN)}\nTotal vols Membre équipage: ${formatHour(cumMeJ)} / ${formatHour(cumMeN)}\n\nCordialement,`;
}

function exportPdfAndMail() {
    const element = document.getElementById('reportContent');
    const filename = currentReportTitle.replace(/[\/\s]/g, '_') + '.pdf';
    
    const opt = {
        margin:       10,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' } // Landscape because tables are wide!
    };

    html2pdf().set(opt).from(element).save().then(() => {
        const mailtoLink = `mailto:guillaume.cornet@intradef.gouv.fr?subject=${encodeURIComponent(currentReportTitle)}&body=${encodeURIComponent(currentEmailBody)}`;
        window.location.href = mailtoLink;
    });
}
