/* Portal del alumno PTH: guarda la estructura de la app para abrirla rápido.
   Los datos del alumno no se guardan: siempre se piden en el momento. */
const CACHE = 'pth-portal-v1';
const BASE = ['./', 'portal.css', 'portal.js', 'manifest.webmanifest',
  '../assets/css/site.css', '../assets/img/pth-logo-horizontal.svg', '../assets/img/pth-favicon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Red primero; si no hay conexión, lo guardado.
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
