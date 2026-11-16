/* Professional Training Hub · menú móvil y medición de consultas */
(function () {
  // Al llegar desde un enlace, la página arranca desde arriba (salvo que el enlace apunte a una sección).
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (!location.hash && (!nav || nav.type === 'navigate')) {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
      window.addEventListener('load', function () { window.scrollTo(0, 0); });
      if ('scrollRestoration' in history) window.addEventListener('pagehide', function () { history.scrollRestoration = 'auto'; });
    }
  } catch (e) {}
  var btn = document.querySelector('.menu-btn');
  var panel = document.getElementById('menu-movil');
  if (btn && panel) {
    btn.addEventListener('click', function () {
      var abierto = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!abierto));
      btn.querySelector('span').textContent = abierto ? 'Menú' : 'Cerrar';
      panel.hidden = abierto;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { btn.click(); btn.focus(); }
    });
  }
  // Si Google Analytics está instalado, registra los clics a WhatsApp y los envíos de formularios.
  function evento(nombre, datos) { if (typeof window.gtag === 'function') window.gtag('event', nombre, datos || {}); }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (a) evento('clic_whatsapp', { pagina: location.pathname, ubicacion: a.getAttribute('data-ubicacion') || '' });
  });
  document.querySelectorAll('form[data-netlify]').forEach(function (f) {
    f.addEventListener('submit', function () { evento('envio_formulario', { formulario: f.getAttribute('name') }); });
  });
})();
