const CACHE_NAME = 'carnet-de-vol-cache-v129';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
    './chat.js',
  './db.js',
  './database.js',
  './stats.js',
  './cloture.js',
  './manifest.json',
  './icon.svg'
];

// Installation : Mise en cache des fichiers statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Mise en cache des ressources locales');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Activation : Nettoyage des anciens caches si version changée
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Suppression de l\'ancien cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interception des requêtes réseau : Stratégie "Network First, fallback to Cache"
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes externes (Gemini, GitHub)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      // Si on est en ligne, on met à jour le cache silencieusement avec la nouvelle version
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      });
    }).catch(() => {
      // Si on est HORS LIGNE, on utilise le cache
      return caches.match(event.request);
    })
  );
});
