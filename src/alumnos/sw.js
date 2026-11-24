/* Portal del alumno PTH: guarda la estructura de la app para abrirla rápido
   y muestra los avisos que llegan por Firebase Cloud Messaging. */
const CACHE = 'pth-portal-v5';
const BASE = ['./', 'portal.css', 'portal.js', 'manifest.webmanifest',
  '../assets/css/site.css', '../assets/img/pth-logo-horizontal.svg', '../assets/img/pth-app-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('pth-portal-') === 0 && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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

// Avisos: el script de la planilla manda { title, body, link, tag } como datos.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { data: { body: e.data && e.data.text() } }; }
  const m = Object.assign({}, d.notification || {}, d.data || {});
  const titulo = m.title || 'Professional Training Hub';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: m.body || '',
    icon: '../assets/img/pth-app-192.png',
    badge: '../assets/img/pth-favicon-180.png',
    tag: m.tag || undefined,
    renotify: !!m.tag,
    data: { link: m.link || './#inicio' },
    lang: 'es-AR'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.link) || './#inicio', self.registration.scope).href;
  const enPortal = destino.indexOf(self.registration.scope) === 0;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
    if (enPortal) {
      for (const v of ventanas) {
        if (v.url.indexOf(self.registration.scope) === 0 && 'focus' in v) { v.navigate(destino); return v.focus(); }
      }
    }
    return self.clients.openWindow(destino);
  }));
});
