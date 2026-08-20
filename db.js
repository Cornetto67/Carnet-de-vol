// db.js - Gestion de la base de données locale (IndexedDB)
const DB_NAME = 'CarnetDeVolDB';
const DB_VERSION = 1;
const STORE_NAME = 'flights';

let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Erreur IndexedDB:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            // Création de la table 'flights' avec 'id' comme clé primaire auto-incrémentée
            const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            
            // Création d'index pour faciliter les recherches
            objectStore.createIndex('date', 'date', { unique: false });
            objectStore.createIndex('synced', 'synced', { unique: false });
        };
    });
}

function addFlight(flightData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        
        flightData.synced = false;
        flightData.createdAt = new Date().toISOString();

        const request = objectStore.add(flightData);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

function updateFlight(flightData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        
        flightData.synced = false; // Need to resync

        const request = objectStore.put(flightData);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

function deleteFlight(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        
        const request = objectStore.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

function getAllFlights() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const index = objectStore.index('date');
        
        const request = index.getAll();
        request.onsuccess = (event) => {
            resolve(event.target.result.reverse());
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

// Utilitaires
function decimalToTime(decimalHours) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h ${minutes.toString().padStart(2, '0')}`;
}

async function importFlights(flightsArray) {
    if (!flightsArray || !Array.isArray(flightsArray)) return;
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    
    // 1. Clear existing store
    await new Promise((resolve, reject) => {
        const req = objectStore.clear();
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
    });
    
    // 2. Add new items
    for (const f of flightsArray) {
        delete f.id; // force auto-increment
        await new Promise((resolve, reject) => {
            const req = objectStore.add(f);
            req.onsuccess = resolve;
            req.onerror = () => reject(req.error);
        });
    }
}
window.importFlights = importFlights;
