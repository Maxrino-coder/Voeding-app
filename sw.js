// Bewaart de app op het toestel zodat ze ook zonder internet werkt.
// Verhoog VERSION bij elke wijziging zodat telefoons de nieuwe versie ophalen.
const VERSION = 'v10';
const CACHE = 'voeding-' + VERSION;
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'foods.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eerst het netwerk proberen (zodat updates meteen binnenkomen), anders de opgeslagen versie.
// GitHub Pages laat browsers bestanden 10 minuten bewaren; 'no-cache' vraagt altijd na of er iets nieuws is.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    fetch(sameOrigin ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : e.request)
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./')))
  );
});
