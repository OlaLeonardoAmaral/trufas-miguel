const CACHE = 'trufas-mig-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap'
];

// Instala e faz cache dos assets essenciais
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cacheia os assets locais primeiro (críticos), fontes opcionalmente
      return cache.addAll(['./index.html', './manifest.json', './icon.svg'])
        .then(() => cache.add(ASSETS[3]).catch(() => {})); // fontes: falha silenciosa
    }).then(() => self.skipWaiting())
  );
});

// Remove caches antigas ao ativar
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estratégia: Cache-first para assets locais, Network-first para fontes
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora requisições não-GET
  if (event.request.method !== 'GET') return;

  // Fontes do Google: network-first com fallback no cache
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets locais: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
