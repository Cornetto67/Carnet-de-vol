const fs = require('fs');

let js = fs.readFileSync('cloture.js', 'utf8');

const start = js.indexOf('function generateMonthlyReport(year, monthStr, monthName)');
const end = js.indexOf('function generateAnnualReport(year)');

if (start === -1 || end === -1) {
    console.log("Could not find functions");
    process.exit(1);
}

const newFunc = `function generateMonthlyReport(year, monthStr, monthName) {
    const monthPrefix = \`\${year}-\${monthStr}\`;
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
        
        if (f.seance_type && f.seance_type.toUpperCase().includes('SIMU')) {
            totalSimu += (j+n);
        } else {
            let t = (f.aircraft_type || 'INCONNU').trim().toUpperCase();
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

    const flightsYear = allFlightsData.filter(f => f.date && f.date.startsWith(year) && f.date <= \`\${year}-\${monthStr}-31\`);
    const yMachinesMap = new Map();
    let yTotalSimu = 0;
    let yJour=0, yNuit=0, yJVN=0, yVTN=0, yTotal=0, yME=0;
    
    flightsYear.forEach(f => {
        const j = f.j || 0;
        const n = f.n || 0;
        const vtn = f.vtn || 0;
        const jvn = Math.max(0, n - vtn);
        const me = !isPilot(f.role) ? (j+n) : 0;
        
        if (f.seance_type && f.seance_type.toUpperCase().includes('SIMU')) {
            yTotalSimu += (j+n);
        } else {
            let t = (f.aircraft_type || 'INCONNU').trim().toUpperCase();
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

    const sk = (key) => \`cloture_mois_\${key}\`;

    let html = \`
        <div style="padding: 10px; background: white; color: black;">
        <h2 style="text-align: center; margin-bottom: 20px;">Synthèse Mensuelle - \${monthName} \${year}</h2>
        
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
    \`;

    machinesMap.forEach((d, t) => {
        let safeT = t.replace(/[^a-zA-Z0-9]/g, '');
        html += \`
            <tr>
                <td style="text-align: left; font-weight: bold;">\${t}</td>
                <td>\${formatHour(d.j)}</td>
                <td><span style="color:red">\${formatHour(d.n)}</span></td>
                <td><span style="color:red">\${formatHour(d.jvn)}</span></td>
                <td><span style="color:green">\${formatHour(d.vtn)}</span></td>
                <td style="font-weight: bold;">\${formatHour(d.total)}</td>
                <td>\${formatHour(d.me)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="\${sk('opex_m_'+safeT)}">\${getSavedCell(sk('opex_m_'+safeT))}</td>
            </tr>
        \`;
    });
    
    html += \`
            <tr class="total-row" style="background: #f0f0f0;">
                <td style="text-align: left; font-weight: bold;">TOTAL VOLS</td>
                <td>\${formatHour(mJour)}</td>
                <td><span style="color:red">\${formatHour(mNuit)}</span></td>
                <td><span style="color:red">\${formatHour(mJVN)}</span></td>
                <td><span style="color:green">\${formatHour(mVTN)}</span></td>
                <td style="font-weight: bold;">\${formatHour(mTotal)}</td>
                <td>\${formatHour(mME)}</td>
                <td style="background: #555"></td>
            </tr>
            <tr>
                <td style="text-align: left; font-weight: bold;">SIMULATEURS</td>
                <td colspan="7" style="font-weight: bold; text-align: left; padding-left: 20px;">\${formatHour(totalSimu)} h</td>
            </tr>
        </table>
    \`;

    html += \`
        <h3 style="margin-bottom: 10px; color: black;">Cumul Annuel (depuis le 1er Janvier \${year})</h3>
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
    \`;
    
    yMachinesMap.forEach((d, t) => {
        let safeT = t.replace(/[^a-zA-Z0-9]/g, '');
        html += \`
            <tr>
                <td style="text-align: left; font-weight: bold;">\${t}</td>
                <td>\${formatHour(d.j)}</td>
                <td><span style="color:red">\${formatHour(d.n)}</span></td>
                <td><span style="color:red">\${formatHour(d.jvn)}</span></td>
                <td><span style="color:green">\${formatHour(d.vtn)}</span></td>
                <td style="font-weight: bold;">\${formatHour(d.total)}</td>
                <td>\${formatHour(d.me)}</td>
                <td contenteditable="true" class="editable-cell" data-save-key="\${sk('opex_y_'+safeT)}">\${getSavedCell(sk('opex_y_'+safeT))}</td>
            </tr>
        \`;
    });
    
    html += \`
            <tr class="total-row" style="background: #f0f0f0;">
                <td style="text-align: left; font-weight: bold;">TOTAL VOLS</td>
                <td>\${formatHour(yJour)}</td>
                <td><span style="color:red">\${formatHour(yNuit)}</span></td>
                <td><span style="color:red">\${formatHour(yJVN)}</span></td>
                <td><span style="color:green">\${formatHour(yVTN)}</span></td>
                <td style="font-weight: bold;">\${formatHour(yTotal)}</td>
                <td>\${formatHour(yME)}</td>
                <td style="background: #555"></td>
            </tr>
            <tr>
                <td style="text-align: left; font-weight: bold;">SIMULATEURS</td>
                <td colspan="7" style="font-weight: bold; text-align: left; padding-left: 20px;">\${formatHour(yTotalSimu)} h</td>
            </tr>
        </table>
    \`;

    html += \`
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
    \`;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('reportPreviewContainer').style.display = 'block';
    currentEmailBody = \`Bonjour,\\n\\nVeuillez trouver ci-joint ma clôture mensuelle pour \${monthName} \${year}.\\n\\nTotal du mois: \${formatHour(mTotal)}h (dont J: \${formatHour(mJour)} / N: \${formatHour(mNuit)})\\nCumul annuel: \${formatHour(yTotal)}h\\n\\nCordialement,\`;
}

`;

js = js.substring(0, start) + newFunc + js.substring(end);
fs.writeFileSync('cloture.js', js);
console.log('Replaced');
