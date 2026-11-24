/* Panel de dirección PTH: guarda la estructura para abrir al instante; se actualiza en segundo plano. */
const CACHE = 'pth-panel-v2';
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
  // Primero la red, así siempre se usa la versión nueva. Lo guardado solo si no hay conexión o la red tarda más de 3 s.
  const red = fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
    return r;
  });
  const lenta = new Promise(res => setTimeout(res, 3000)).then(() => caches.match(e.request, { ignoreSearch: true }));
  e.respondWith(Promise.race([red.catch(() => caches.match(e.request, { ignoreSearch: true })), lenta.then(g => g || red)]));
});
