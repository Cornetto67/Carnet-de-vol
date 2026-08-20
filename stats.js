// stats.js - Logique des Compétences et Graphiques HDV

function calculateDaysDifference(dateStr) {
    if (!dateStr) return Infinity;
    const now = new Date();
    const flightDate = new Date(dateStr);
    const diffTime = Math.abs(now - flightDate);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getCompetenceStatus(days, pcbLimit, pilLimit) {
    if (days <= pcbLimit) return { text: 'PCB', class: 'status-green' };
    if (days <= pilLimit) return { text: 'PIL', class: 'status-orange' };
    return { text: 'HC', class: 'status-red' };
}

function renderCompetences() {
    const rules = typeof getRules === 'function' ? getRules() : { pcb: 60, pil: 90, machine: 180, panne6: 180, panne12: 365 };
    const envGrid = document.getElementById('envGrid');
    const machinesGrid = document.getElementById('machinesGrid');
    if (!envGrid || !machinesGrid) return;
    
    // 1. ENVIRONNEMENTS
    let maxDates = { VAV: null, VN: null, SIL: null, VTN: null, VSV: null };
    
    allFlightsData.forEach(f => {
        if (!f.date) return;
        if (f.j >= 0.1 && (!maxDates.VAV || f.date > maxDates.VAV)) maxDates.VAV = f.date;
        if (f.n >= 0.1 && (!maxDates.VN || f.date > maxDates.VN)) maxDates.VN = f.date;
        if (f.sil >= 0.1 && (!maxDates.SIL || f.date > maxDates.SIL)) maxDates.SIL = f.date;
        if (f.vtn >= 0.1 && (!maxDates.VTN || f.date > maxDates.VTN)) maxDates.VTN = f.date;
        if (f.vsv >= 0.1 && (!maxDates.VSV || f.date > maxDates.VSV)) maxDates.VSV = f.date;
    });

    envGrid.innerHTML = '';
    const envs = ['VAV', 'VN', 'SIL', 'VTN', 'VSV'];
    envs.forEach(env => {
        const lastDate = maxDates[env];
        const days = lastDate ? calculateDaysDifference(lastDate) : Infinity;
        const status = getCompetenceStatus(days, rules.pcb, rules.pil);
        
        const div = document.createElement('div');
        div.className = 'env-item card';
        div.title = lastDate ? `Dernier vol : ${formatDate(lastDate)} (${days} jours)` : "Aucun vol enregistré";
        div.innerHTML = `
            <span class="env-label">${env}</span>
            <span class="status-badge ${status.class}">${status.text}</span>
        `;
        // Interaction au clic
        div.onclick = () => alert(`${env}\nDernier vol : ${lastDate ? formatDate(lastDate) : 'Aucun'}\nIl y a ${days === Infinity ? 'Jamais' : days + ' jours'}`);
        envGrid.appendChild(div);
    });

    // 2. MACHINES
    let machinesData = {};
    const config = typeof getDbConfig === 'function' ? getDbConfig() : null;
    
    allFlightsData.forEach(f => {
        if (!f.date || !f.aircraft_type) return;
        
        let type = f.aircraft_type.trim().toUpperCase();
        let isSimu = false;
        let simuType = 'none';
        let baseType = type;

        // Utilisation de la nouvelle base de données si possible
        
        if (config && f.aircraft_num) {
            const m = config.machines.find(x => x.num === f.aircraft_num);
            if (m) {
                if (m.is_simu) {
                    isSimu = true;
                    simuType = m.simu_type;
                    if (simuType === 'dedie' && m.simu_for) {
                        baseType = m.simu_for;
                    } else if (simuType === 'tactique') {
                        // On ignore le simu tactique pour la récence machine
                        return;
                    }
                } else {
                    baseType = m.type;
                }
            }
        } else {
            // Legacy fallback
            isSimu = type.endsWith(' SIMU');
            baseType = isSimu ? type.replace(' SIMU', '').trim() : type;
            if (isSimu) simuType = 'dedie';
        }

        // Normalize SA342 variants (SA342M1, SA342MA, etc.) to SA342
        if (baseType.startsWith('SA342')) baseType = 'SA342';
        
        // Ignore generic SIMULATEUR for machine competency cards
        if (baseType === 'SIMULATEUR') return;

        // Ignore untracked machines (marked as passenger only)
        if (config) {
            const m = config.machines.find(x => (x.type||'').trim().toUpperCase() === type || (x.type||'').trim().toUpperCase() === baseType);
            if (m && m.tracked === false) return;
        }
        
        if (!machinesData[baseType]) {
            machinesData[baseType] = { lastFlight: null, lastPanne6: null, lastPanne12: null };
        }
        
        // Vol Machine (Réel ou Simu Dédié)
        if (!machinesData[baseType].lastFlight || f.date > machinesData[baseType].lastFlight) {
            machinesData[baseType].lastFlight = f.date;
        }
        
        // Pannes
        let seance = (f.seance_type || '').toUpperCase();
        let isPanne = seance.includes('PANNE') || seance.includes('PU');
        
        if (isPanne) {
            // Pannes 6 mois (Réel ou Simu Dédié)
            if (!machinesData[baseType].lastPanne6 || f.date > machinesData[baseType].lastPanne6) {
                machinesData[baseType].lastPanne6 = f.date;
            }
            // Pannes 1 an (Réel Uniquement)
            if (!isSimu) {
                if (!machinesData[baseType].lastPanne12 || f.date > machinesData[baseType].lastPanne12) {
                    machinesData[baseType].lastPanne12 = f.date;
                }
            }
        }
    });

    machinesGrid.innerHTML = '';
    Object.keys(machinesData).sort().forEach(type => {
        const d = machinesData[type];
        
        const dFlight = d.lastFlight ? calculateDaysDifference(d.lastFlight) : Infinity;
        const dPanne6 = d.lastPanne6 ? calculateDaysDifference(d.lastPanne6) : Infinity;
        const dPanne12 = d.lastPanne12 ? calculateDaysDifference(d.lastPanne12) : Infinity;
        
        const formatStat = (dateStr, days, limit) => {
            if (!dateStr) return `<span class="status-badge status-gray" title="Non réalisé">X</span>`;
            if (days <= limit) return `<span class="status-badge status-green" title="${formatDate(dateStr)}">OK</span>`;
            return `<span class="status-badge status-red" title="Périmé (${formatDate(dateStr)})">HC</span>`;
        };

        const card = document.createElement('div');
        card.className = 'machine-card';
        card.innerHTML = `
            <h4>${type}</h4>
            <div class="machine-stat" onclick="alert('Dernier vol : ${d.lastFlight ? formatDate(d.lastFlight) : 'Aucun'}')">
                <span>Récence Machine (< ${rules.machine}j)</span>
                ${formatStat(d.lastFlight, dFlight, rules.machine)}
            </div>
            <div class="machine-stat" onclick="alert('Dernière panne : ${d.lastPanne6 ? formatDate(d.lastPanne6) : 'Aucune'}')">
                <span>Pannes (< ${rules.panne6}j)</span>
                ${formatStat(d.lastPanne6, dPanne6, rules.panne6)}
            </div>
            <div class="machine-stat" onclick="alert('Dernière panne (Réel) : ${d.lastPanne12 ? formatDate(d.lastPanne12) : 'Aucune'}')">
                <span>Pannes Réel (< ${rules.panne12}j)</span>
                ${formatStat(d.lastPanne12, dPanne12, rules.panne12)}
            </div>
        `;
        machinesGrid.appendChild(card);
    });
}

// ----------------------------------------------------
// GRAPHIQUES (HDV)
// ----------------------------------------------------
let annualChartInstance = null;
let careerChartInstance = null;
let rollingChartInstance = null;

function renderHDV() {
    const yearSelect = document.getElementById('hdvYearSelect');
    if (!yearSelect) return;

    // 1. Préparation des filtres (Années) depuis les vols
    const years = new Set();
    allFlightsData.forEach(f => {
        if (f.date) years.add(f.date.substring(0, 4));
    });

    const currentYear = new Date().getFullYear().toString();
    if (!years.has(currentYear)) years.add(currentYear);
    
    if (yearSelect.options.length === 0) {
        Array.from(years).sort().reverse().forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        });
        const savedYear = localStorage.getItem('hdv_year');
        yearSelect.value = savedYear && years.has(savedYear) ? savedYear : currentYear;
        yearSelect.addEventListener('change', () => {
            localStorage.setItem('hdv_year', yearSelect.value);
            drawAnnualChart();
        });
    }

    // 2. Préparation des filtres multi-sélection (Chips)
    if (typeof getDbConfig !== 'function') return;
    const config = getDbConfig();
    const machines = config.machines.map(m => m.type).filter((v, i, a) => a.indexOf(v) === i); // Unique types
    const roles = config.roles;

    const buildChips = (containerId, items, changeCallback, storageKey) => {
        const container = document.getElementById(containerId);
        if (!container || container.innerHTML.trim() !== '') return; // Already built
        
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        
        let html = `<div class="filter-chip ${saved.length === 0 ? 'active' : ''}" data-val="ALL">Toutes</div>`;
        items.forEach(item => {
            const isActive = saved.includes(item) ? 'active' : '';
            html += `<div class="filter-chip ${isActive}" data-val="${item}">${item}</div>`;
        });
        container.innerHTML = html;

        container.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const val = e.target.dataset.val;
                if (val === 'ALL') {
                    container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                    e.target.classList.add('active');
                } else {
                    container.querySelector('[data-val="ALL"]').classList.remove('active');
                    e.target.classList.toggle('active');
                    // Si plus rien n'est coché, recocher 'ALL'
                    if (container.querySelectorAll('.filter-chip.active').length === 0) {
                        container.querySelector('[data-val="ALL"]').classList.add('active');
                    }
                }
                changeCallback();
            });
        });
    };

    buildChips('careerFiltersMachine', machines, drawCareerChart, 'hdv_careerMacs');
    buildChips('careerFiltersRole', roles, drawCareerChart, 'hdv_careerRols');
    buildChips('rollingFiltersMachine', machines, drawRollingChart, 'hdv_rollingMacs');
    buildChips('rollingFiltersRole', roles, drawRollingChart, 'hdv_rollingRols');

    drawAnnualChart();
    drawCareerChart();
    if (typeof drawRollingChart === 'function') drawRollingChart();
}
function drawAnnualChart() {
    const year = document.getElementById('hdvYearSelect').value;
    const ctx = document.getElementById('annualChart');
    if (!ctx) return;

    // Calcul des données par mois (0 à 11)
    let monthlyJ = new Array(12).fill(0);
    let monthlyN = new Array(12).fill(0);

    allFlightsData.forEach(f => {
        if (!f.date || !f.date.startsWith(year)) return;
        const monthIndex = parseInt(f.date.substring(5, 7)) - 1;
        if (monthIndex >= 0 && monthIndex <= 11) {
            monthlyJ[monthIndex] += (f.j || 0);
            monthlyN[monthIndex] += (f.n || 0);
        }
    });

    if (annualChartInstance) annualChartInstance.destroy();

    const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    annualChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Jour (J)',
                    data: monthlyJ.map(v => v.toFixed(1)),
                    backgroundColor: '#121212', // Noir (Dark Mode compliant)
                    borderColor: '#ffffff',
                    borderWidth: 1
                },
                {
                    label: 'Nuit (N)',
                    data: monthlyN.map(v => v.toFixed(1)),
                    backgroundColor: '#F44336', // Rouge
                    borderColor: '#ffffff',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Heures' } }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        footer: (tooltipItems) => {
                            let total = 0;
                            tooltipItems.forEach(item => total += parseFloat(item.raw));
                            return 'Total: ' + total.toFixed(1) + 'h';
                        }
                    }
                }
            }
        }
    });
}

function drawCareerChart() {
    const ctx = document.getElementById('careerChart');
    if (!ctx) return;

    // Get Active Chips
    const getActive = (containerId) => {
        const container = document.getElementById(containerId);
        if(!container) return [];
        const active = Array.from(container.querySelectorAll('.filter-chip.active')).map(c => c.dataset.val);
        if (active.includes('ALL')) return [];
        return active;
    };

    const activeMacs = getActive('careerFiltersMachine');
    const activeRols = getActive('careerFiltersRole');
    localStorage.setItem('hdv_careerMacs', JSON.stringify(activeMacs));
    localStorage.setItem('hdv_careerRols', JSON.stringify(activeRols));

    // Grouper les heures par année
    const yearlyJ = {};
    const yearlyN = {};

    allFlightsData.forEach(f => {
        if (!f.date) return;
        const year = f.date.substring(0, 4);
        
        let t = (f.aircraft_type || '').trim().toUpperCase();
        if (t.endsWith(' SIMU')) t = t.replace(' SIMU', '').trim(); // Legacy fallback
        
        if (activeMacs.length > 0 && !activeMacs.includes(t)) return;
        if (activeRols.length > 0 && !activeRols.includes((f.role || '').toUpperCase())) return;

        if (!yearlyJ[year]) yearlyJ[year] = 0;
        if (!yearlyN[year]) yearlyN[year] = 0;

        yearlyJ[year] += (f.j || 0);
        yearlyN[year] += (f.n || 0);
    });

    const years = Object.keys(yearlyJ).sort();
    const dataJ = years.map(y => yearlyJ[y].toFixed(1));
    const dataN = years.map(y => yearlyN[y].toFixed(1));

    // Cumul total année par année pour la ligne
    let cumulative = 0;
    const dataCumul = years.map(y => {
        cumulative += yearlyJ[y] + yearlyN[y];
        return cumulative.toFixed(1);
    });

    if (careerChartInstance) careerChartInstance.destroy();

    careerChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    type: 'line',
                    label: 'Cumul HDV (J+N)',
                    data: dataCumul,
                    borderColor: '#2196F3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Heures Cumulées' }
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            }
        }
    });
}

function drawRollingChart() {
    const ctx = document.getElementById('rollingChart');
    if (!ctx) return;

    // Get Active Chips
    const getActive = (containerId) => {
        const container = document.getElementById(containerId);
        if(!container) return [];
        const active = Array.from(container.querySelectorAll('.filter-chip.active')).map(c => c.dataset.val);
        if (active.includes('ALL')) return [];
        return active;
    };

    const activeMacs = getActive('rollingFiltersMachine');
    const activeRols = getActive('rollingFiltersRole');
    localStorage.setItem('hdv_rollingMacs', JSON.stringify(activeMacs));
    localStorage.setItem('hdv_rollingRols', JSON.stringify(activeRols));

    const now = new Date();
    const months = [];
    const labels = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear().toString();
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        months.push(`${yyyy}-${mm}`);
        
        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
        labels.push(`${monthNames[d.getMonth()]} ${yyyy.substring(2)}`);
    }

    let monthlyTotals = new Array(12).fill(0);

    allFlightsData.forEach(f => {
        if (!f.date) return;
        const fMonth = f.date.substring(0, 7);
        const monthIndex = months.indexOf(fMonth);
        if (monthIndex === -1) return;
        
        let t = (f.aircraft_type || '').trim().toUpperCase();
        if (t.endsWith(' SIMU')) t = t.replace(' SIMU', '').trim(); // Legacy fallback
        
        if (activeMacs.length > 0 && !activeMacs.includes(t)) return;
        if (activeRols.length > 0 && !activeRols.includes((f.role || '').toUpperCase())) return;
        
        monthlyTotals[monthIndex] += (f.j || 0) + (f.n || 0);
    });

    if (rollingChartInstance) rollingChartInstance.destroy();

    rollingChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Heures de vol (J+N)',
                    data: monthlyTotals.map(v => v.toFixed(1)),
                    backgroundColor: '#2196F3',
                    borderColor: '#1976D2',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Heures' }
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            }
        }
    });
}
// Initialiser les totaux à zéro pour chaque mois