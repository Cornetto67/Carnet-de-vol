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
    // Calculs du mois
    const monthPrefix = `${year}-${monthStr}`;
    const flightsMonth = allFlightsData.filter(f => f.date && f.date.startsWith(monthPrefix));
    
    let mJour=0, mNuit=0, mJVN=0, mVTN=0, mVSV=0;
    let mEC120_J=0, mEC120_N=0;
    let mSimuEPSA=0, mSimuEDITH=0;
    let mTotal=0, mME=0;
    
    flightsMonth.forEach(f => {
        const j = f.j || 0;
        const n = f.n || 0;
        const vtn = f.vtn || 0;
        const vsv = f.vsv || 0;
        
        mJour += j;
        mNuit += n;
        mVTN += vtn;
        mVSV += vsv;
        // JVN approximation (nuit sans vtn)
        mJVN += Math.max(0, n - vtn);
        mTotal += (j+n);
        
        if (!isPilot(f.role)) mME += (j+n);
        
        if (f.aircraft_type && f.aircraft_type.toUpperCase().includes('EC120')) {
            mEC120_J += j;
            mEC120_N += n;
        }
        if (f.seance_type && f.seance_type.toUpperCase().includes('SIMU')) {
            if (f.aircraft_type && f.aircraft_type.toUpperCase().includes('EDITH')) mSimuEDITH += (j+n);
            else mSimuEPSA += (j+n);
        }
    });

    // Calculs Année (Cumul du 1er janvier jusqu'à la fin de ce mois)
    const flightsYear = allFlightsData.filter(f => f.date && f.date.startsWith(year) && f.date <= `${year}-${monthStr}-31`);
    
    let yJour=0, yNuit=0, yJVN=0, yVTN=0;
    let yEC120_J=0, yEC120_N=0;
    let ySimuEPSA=0, ySimuEDITH=0;
    let yTotal=0, yME=0;
    
    flightsYear.forEach(f => {
        const j = f.j || 0;
        const n = f.n || 0;
        const vtn = f.vtn || 0;
        
        yJour += j;
        yNuit += n;
        yVTN += vtn;
        yJVN += Math.max(0, n - vtn);
        yTotal += (j+n);
        
        if (!isPilot(f.role)) yME += (j+n);
        
        if (f.aircraft_type && f.aircraft_type.toUpperCase().includes('EC120')) {
            yEC120_J += j;
            yEC120_N += n;
        }
        if (f.seance_type && f.seance_type.toUpperCase().includes('SIMU')) {
            if (f.aircraft_type && f.aircraft_type.toUpperCase().includes('EDITH')) ySimuEDITH += (j+n);
            else ySimuEPSA += (j+n);
        }
    });

    const sk = (key) => `cloture_mois_${key}`;

    let html = `
        <div style="padding: 10px; background: white;">
        <table class="excel-table">
            <tr class="header-row">
                <th colspan="3">${monthName}</th>
                <th colspan="3">${year}</th>
                <th colspan="2">VI</th>
                <th colspan="3">EC120</th>
                <th>OPEX</th>
                <th colspan="2">TOTAL MOIS</th>
                <th colspan="2">SIMU</th>
                <th colspan="2">HDV 12 GAZL</th>
            </tr>
            <tr class="sub-header-row">
                <th style="background:#fff"></th>
                <th>Jour</th>
                <th>Nuit</th>
                <th><span style="color:red">dont JVN</span></th>
                <th><span style="color:green">dont VTN</span></th>
                <th>J+N GZL</th>
                <th>VOL</th>
                <th>SIMU</th>
                <th>Jour</th>
                <th><span style="color:red">Nuit</span></th>
                <th>J+N</th>
                <th>J+N</th>
                <th>J+N</th>
                <th>dont ME</th>
                <th>EPSA / FNPT</th>
                <th>EDITH</th>
                <th>Jour</th>
                <th><span style="color:red">Nuit</span></th>
            </tr>
            <tr>
                <td class="label-cell">Mois</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_jour')}">${formatHour(mJour)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_nuit')}"><span style="color:red">${formatHour(mNuit)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_jvn')}"><span style="color:red">${formatHour(mJVN)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_vtn')}"><span style="color:green">${formatHour(mVTN)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_jngzl')}">${formatHour(mJour+mNuit)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_vi_vol')}">${getSavedCell(sk('m_vi_vol'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_vi_simu')}">${getSavedCell(sk('m_vi_simu'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_ec120_j')}">${formatHour(mEC120_J)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_ec120_n')}"><span style="color:red">${formatHour(mEC120_N)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_ec120_tot')}">${formatHour(mEC120_J+mEC120_N)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_opex')}">${getSavedCell(sk('m_opex'))}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_tot')}">${formatHour(mTotal)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_me')}">${formatHour(mME)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_epsa')}"><span style="color:blue">${formatHour(mSimuEPSA)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_edith')}"><span style="color:blue">${formatHour(mSimuEDITH)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_gaz_j')}">${getSavedCell(sk('m_gaz_j'))}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('m_gaz_n')}"><span style="color:red">${getSavedCell(sk('m_gaz_n'))}</span></td>
            </tr>
            <tr class="total-row">
                <td class="label-cell">Année</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_jour')}">${formatHour(yJour)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_nuit')}"><span style="color:red">${formatHour(yNuit)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_jvn')}"><span style="color:red">${formatHour(yJVN)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_vtn')}"><span style="color:green">${formatHour(yVTN)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_jngzl')}">${formatHour(yJour+yNuit)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_vi_vol')}">${getSavedCell(sk('y_vi_vol'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_vi_simu')}">${getSavedCell(sk('y_vi_simu'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_ec120_j')}">${formatHour(yEC120_J)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_ec120_n')}"><span style="color:red">${formatHour(yEC120_N)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_ec120_tot')}">${formatHour(yEC120_J+yEC120_N)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_opex')}">${getSavedCell(sk('y_opex'))}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_tot')}">${formatHour(yTotal)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_me')}">${formatHour(yME)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_epsa')}"><span style="color:blue">${formatHour(ySimuEPSA)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_edith')}"><span style="color:blue">${formatHour(ySimuEDITH)}</span></td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_gaz_j')}">${getSavedCell(sk('y_gaz_j'))}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('y_gaz_n')}"><span style="color:red">${getSavedCell(sk('y_gaz_n'))}</span></td>
            </tr>
            <tr>
                <td colspan="4" class="label-cell">VI depuis le :</td>
                <td colspan="2" contenteditable="true" class="editable-cell" data-save-key="${sk('vi_date')}">${getSavedCell(sk('vi_date'), '01/01/2025')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('vi_vol_depuis')}">${getSavedCell(sk('vi_vol_depuis'))}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('vi_simu_depuis')}">${getSavedCell(sk('vi_simu_depuis'))}</td>
                <td colspan="3" style="background:#555"></td>
                <td colspan="4" style="text-align: center; font-weight: bold; padding-top: 15px;">L'intéressé</td>
                <td colspan="3" style="text-align: center; font-weight: bold; padding-top: 15px;">Le commandant d'unité</td>
            </tr>
            <tr>
                <td rowspan="2" class="label-cell">TAG</td>
                <td class="label-cell">Jour</td>
                <td class="label-cell"><span style="color:red">Nuit</span></td>
                <td colspan="5" rowspan="2" style="background:#555"></td>
                <td colspan="3" rowspan="2" style="text-align: center; vertical-align: middle;">Certifié exact et conforme au registre journal des services aériens</td>
                <td colspan="4" rowspan="2" style="height: 60px;"></td>
                <td colspan="3" rowspan="2" style="height: 60px;"></td>
            </tr>
            <tr>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('tag_j')}">${getSavedCell(sk('tag_j'), '0,0')}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="${sk('tag_n')}"><span style="color:red">${getSavedCell(sk('tag_n'), '0,0')}</span></td>
            </tr>
        </table>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportPreviewContainer').style.display = 'block';

    currentEmailBody = `Bonjour,\n\nVeuillez trouver ci-joint ma clôture mensuelle pour ${monthName} ${year}.\n\nTotal du mois: ${formatHour(mTotal)}h (dont J: ${formatHour(mJour)} / N: ${formatHour(mNuit)})\nCumul annuel: ${formatHour(yTotal)}h\n\nCordialement,`;
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
