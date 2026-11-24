/* Panel de dirección PTH: guarda la estructura para abrir al instante; se actualiza en segundo plano. */
const CACHE = 'pth-panel-v1';
const BASE = ['./', 'panel.css', 'panel.js', 'manifest.webmanifest',
  '../assets/img/pth-logo-horizontal-blanco.svg', '../assets/img/pth-logo-horizontal.svg', '../assets/img/pth-app-192.png',
  '../assets/fonts/archivo-latin-400-normal.woff2', '../assets/fonts/archivo-latin-700-normal.woff2',
  '../assets/fonts/archivo-latin-800-normal.woff2', '../assets/fonts/archivo-narrow-latin-700-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('pth-panel-') === 0 && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const red = fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
    return r;
  });
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(g => {
    if (g) { e.waitUntil(red.catch(() => {})); return g; }
    return red.catch(() => caches.match(e.request));
  }));
});
