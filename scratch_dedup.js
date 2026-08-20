const fs = require('fs');
let db = fs.readFileSync('database.js', 'utf8');

const replacement = `window.autoLearnFromAllFlights = function(forceAlert = false) {
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
`;

db = db.replace('window.autoLearnFromAllFlights = function(forceAlert = false) {', replacement);
fs.writeFileSync('database.js', db);
console.log('Patch applied successfully.');
