const fs = require('fs');

const css = `
/* =======================
   COMPETENCES & HDV
   ======================= */
.environments-grid {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    text-align: center;
}
.env-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 15px 5px;
    flex: 1;
    border-radius: var(--radius);
    transition: background-color 0.2s;
    background: var(--surface-light);
}
.env-item:hover {
    background-color: var(--surface-lighter);
}
.env-label {
    font-weight: 600;
    font-size: 1rem;
}
.status-badge {
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: bold;
    color: #fff;
}
.status-green { background-color: #4CAF50; }
.status-orange { background-color: #FF9800; }
.status-red { background-color: #F44336; }
.status-gray { background-color: #9E9E9E; }

.machines-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 15px;
    margin-top: 15px;
}
.machine-card {
    background: var(--surface-color);
    padding: 15px;
    border-radius: var(--radius);
    border: 1px solid var(--border-color);
}
.machine-card h4 {
    margin: 0 0 10px 0;
    font-size: 1.1rem;
    color: var(--accent-color);
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 5px;
}
.machine-stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
}
.machine-stat:hover {
    background-color: var(--surface-light);
}
`;

fs.appendFileSync('style.css', css);
console.log('Appended successfully');
