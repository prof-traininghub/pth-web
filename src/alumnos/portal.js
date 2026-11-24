/* Portal del alumno · Professional Training Hub
   Ingreso con Google → pide los datos del alumno al Apps Script de la planilla → muestra las pantallas. */
(function () {
  'use strict';

  const CFG = window.PTH_PORTAL || {};
  const vista = document.getElementById('vista');
  const nav = document.getElementById('nav');
  const usuarioBox = document.getElementById('usuario');
  const RUTAS = ['inicio', 'material', 'abono', 'progreso', 'opinion', 'avisos'];
  const CLAVE = 'pth-portal-token';          // ingreso de Google (dura 1 hora, solo para entrar)
  const CLAVE_SESION = 'pth-portal-sesion';  // sesión propia del portal (30 días)
  const CLAVE_DATOS = 'pth-portal-datos';    // últimos datos, para mostrar al instante
  const CLAVE_FCM = 'pth-portal-fcm';        // este dispositivo tiene los avisos activados
  let datos = null;
  let token = null;
  let sesion = null;

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const url = s => /^https?:\/\//i.test(String(s || '').trim()) ? esc(String(s).trim()) : '';
  const ext = 'target="_blank" rel="noopener"';
  const guardar = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} };
  const leer = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const guardarL = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const leerL = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || '';
  const wa = (num, msj) => num ? `https://wa.me/${encodeURIComponent(num)}?text=${encodeURIComponent(msj)}` : '';

  const ICONOS = {
    meet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    campana: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    wa: '<svg class="p-ico-wa" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.7 15l-1.3 5 5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>'
  };

  /* ---------- próxima clase ---------- */
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function normalizarDia(d) { return String(d || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Próxima clase de un curso: { inicio, texto } o null.
  function claseInfo(a) {
    const objetivo = DIAS.map(normalizarDia).indexOf(normalizarDia(a.dia));
    if (objetivo < 0 || !a.horaInicio) return null;
    const [hi, mi] = a.horaInicio.split(':').map(Number);
    const [hf, mf] = (a.horaFin || a.horaInicio).split(':').map(Number);
    const ahora = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + i);
      if (d.getDay() !== objetivo) continue;
      const fin = new Date(d); fin.setHours(hf || 0, mf || 0, 0, 0);
      if (fin <= ahora) continue;
      const inicio = new Date(d); inicio.setHours(hi || 0, mi || 0, 0, 0);
      const cuando = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' :
        `${DIAS[d.getDay()][0].toUpperCase()}${DIAS[d.getDay()].slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`;
      return { inicio, texto: `${cuando}, de ${a.horaInicio} a ${a.horaFin || ''} h`.replace(' a  h', ' h') };
    }
    return null;
  }
  function proximaClase(a) { const c = claseInfo(a); return c ? c.texto : null; }

  // Cursos del alumno (si el script todavía no los manda, se arma uno con los datos de siempre).
  function cursos() {
    if (datos.cursos && datos.cursos.length) return datos.cursos;
    return [Object.assign({}, datos.alumno, { programa: datos.programa || [], avance: datos.avance || {} })];
  }
  function nombreCurso(c) { return (c.curso || 'Tu curso') + (c.nivel ? ' · ' + c.nivel : ''); }
  // El curso de la próxima clase (o el primero).
  function cursoProximo() {
    const cs = cursos();
    const con = cs.map((c, i) => ({ i, p: claseInfo(c) })).filter(x => x.p).sort((x, y) => x.p.inicio - y.p.inicio);
    return con.length ? con[0].i : 0;
  }
  let cursoSel = null;

  /* ---------- sesión ---------- */
  function tokenVigente(t) {
    try {
      const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.exp * 1000 > Date.now() + 60000;
    } catch (e) { return false; }
  }

  // Espera a que cargue el botón de Google (solo hace falta para entrar).
  // El botón de Google se carga solo si hace falta entrar (con sesión guardada no se descarga).
  let gsiPedido = false;
  function cargarGoogle() {
    if (gsiPedido) return;
    gsiPedido = true;
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    document.head.appendChild(sc);
  }
  let googleListo = false;
  function conGoogle(fn) {
    if (!window.google || !google.accounts || !google.accounts.id) { cargarGoogle(); setTimeout(() => conGoogle(fn), 120); return; }
    if (!googleListo) {
      google.accounts.id.initialize({
        client_id: CFG.clientId,
        callback: r => { token = r.credential; guardar(CLAVE, token); cargar(); },
        auto_select: true,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true
      });
      googleListo = true;
    }
    fn();
  }

  // Con sesión guardada se muestra al instante lo último que se vio y se actualiza en segundo plano.
  function iniciar() {
    sesion = leerL(CLAVE_SESION);
    if (sesion) {
      const guardado = leerL(CLAVE_DATOS);
      if (guardado) { try { datos = JSON.parse(guardado); mostrarUsuario(); mostrar(); } catch (e) { datos = null; } }
      cargar(!!datos);
      return;
    }
    const t = leer(CLAVE);
    if (t && tokenVigente(t)) { token = t; cargar(); return; }
    conGoogle(() => pantallaIngreso());
  }

  function olvidarSesion() {
    guardar(CLAVE, null); guardarL(CLAVE_SESION, null); guardarL(CLAVE_DATOS, null);
    token = null; sesion = null; datos = null;
  }

  function salir() {
    const fcm = leerL(CLAVE_FCM);
    if (fcm) { api('avisos-baja', { fcm }).catch(() => {}); guardarL(CLAVE_FCM, null); quitarTokenFirebase(); }
    olvidarSesion();
    nav.hidden = true; usuarioBox.hidden = true;
    document.querySelectorAll('.p-solo-sesion').forEach(e => { e.hidden = true; });
    conGoogle(() => { google.accounts.id.disableAutoSelect(); pantallaIngreso(); });
  }
  document.getElementById('salir').addEventListener('click', salir);

  async function api(accion, extra) {
    const r = await fetch(CFG.api, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ accion, sesion, token }, extra || {}))
    });
    return r.json();
  }

  async function cargar(enSegundoPlano) {
    if (!enSegundoPlano) vista.innerHTML = '<p class="p-cargando">Cargando tus datos…</p>';
    try {
      const r = await api('datos');
      if (r.error === 'sesion') { olvidarSesion(); nav.hidden = true; usuarioBox.hidden = true; conGoogle(() => pantallaIngreso('Tu sesión venció. Volvé a entrar.')); return; }
      if (r.error === 'no-alumno') { olvidarSesion(); conGoogle(() => pantallaNoAlumno(r.email)); return; }
      if (r.error) throw new Error(r.error);
      if (r.sesion) { sesion = r.sesion; guardarL(CLAVE_SESION, sesion); guardar(CLAVE, null); token = null; }
      delete r.sesion;
      const nuevo = JSON.stringify(r);
      const cambio = nuevo !== leerL(CLAVE_DATOS);
      guardarL(CLAVE_DATOS, nuevo);
      const primera = !datos;
      if (primera || cambio) {
        datos = r;
        mostrarUsuario();
        // Si está escribiendo su opinión, no le borramos el formulario.
        if (primera || rutaActual() !== 'opinion') mostrar(!primera);
      }
      prepararAvisos();
    } catch (e) {
      if (enSegundoPlano) return;
      vista.innerHTML = `<section class="p-card p-centro"><h1 class="p-h1">No pudimos cargar tus datos</h1>
        <p class="p-muted">Revisá tu conexión y probá de nuevo.</p>
        <button class="btn btn-primario" type="button" id="reintentar">Reintentar</button></section>`;
      document.getElementById('reintentar').addEventListener('click', () => cargar());
    }
  }

  function mostrarUsuario() {
    const a = datos.alumno;
    const av = document.getElementById('avatar');
    av.textContent = iniciales(a.nombre);
    usuarioBox.hidden = false; nav.hidden = false;
    document.querySelectorAll('.p-solo-sesion').forEach(e => { e.hidden = false; });
  }

  /* ---------- pantallas sin sesión ---------- */
  function pantallaIngreso(aviso) {
    if (!CFG.clientId || CFG.clientId.indexOf('{{') === 0) {
      vista.innerHTML = '<section class="p-card p-centro"><h1 class="p-h1">Portal en preparación</h1><p class="p-muted">Muy pronto vas a poder entrar desde acá.</p></section>';
      return;
    }
    vista.innerHTML = `
      <section class="p-card p-ingreso">
        <span class="p-marco p-marco-a" aria-hidden="true"></span><span class="p-marco p-marco-b" aria-hidden="true"></span>
        <p class="p-eyebrow">Portal del alumno</p>
        <h1 class="p-h1">¡Hola de nuevo!</h1>
        <p class="p-muted">Entrá con la misma cuenta de Google que usás en Classroom para ver tu curso, tu material y tu abono.</p>
        ${aviso ? `<p class="p-aviso" role="status">${esc(aviso)}</p>` : ''}
        <div id="boton-google" class="p-google"></div>
        <p class="p-chico">¿No podés entrar? Puede que tu mail todavía no esté cargado. Escribinos por WhatsApp y lo resolvemos.</p>
      </section>`;
    google.accounts.id.renderButton(document.getElementById('boton-google'),
      { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'es', width: 300 });
    google.accounts.id.prompt();
  }

  function pantallaNoAlumno(email) {
    nav.hidden = true; usuarioBox.hidden = true;
    vista.innerHTML = `
      <section class="p-card p-centro">
        <h1 class="p-h1">Tu cuenta no está registrada</h1>
        <p class="p-muted">Entraste con <b>${esc(email)}</b>, pero ese mail no figura como alumno de PTH.
        Si usás otra cuenta de Google para Classroom, entrá con esa. Si no, escribinos y te damos de alta.</p>
        <div class="p-btns">
          <button class="btn btn-primario" type="button" id="otra">Entrar con otra cuenta</button>
          <a class="btn btn-sec" ${ext} href="${wa('5491134953141', 'Hola, quiero acceder al portal del alumno con el mail ' + email)}">Escribir por WhatsApp</a>
        </div>
      </section>`;
    document.getElementById('otra').addEventListener('click', salir);
  }

  /* ---------- ruteo ---------- */
  function rutaActual() {
    const h = location.hash.replace('#', '');
    return RUTAS.indexOf(h) >= 0 ? h : 'inicio';
  }
  function mostrar(sinMover) {
    if (!datos) return;
    const r = rutaActual();
    nav.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.dataset.ruta === r));
    const fn = { inicio: vInicio, material: vMaterial, abono: vAbono, progreso: vProgreso, opinion: vOpinion, avisos: vAvisos }[r];
    vista.innerHTML = fn();
    enlazar(r);
    if (!sinMover) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { mostrar(); vista.focus({ preventScroll: true }); });

  /* ---------- vistas ---------- */
  function cuotaActual() {
    const pend = datos.cuotas.find(c => !/pagad/i.test(c.estado));
    return pend || datos.cuotas[0] || null;
  }

  function chipCuota(c) {
    if (!c) return '';
    return /pagad/i.test(c.estado)
      ? `<span class="p-chip p-chip-ok">${ICONOS.ok}Al día</span>`
      : `<span class="p-chip p-chip-pend">${ICONOS.reloj}Pendiente${c.vence ? ' · vence el ' + esc(c.vence) : ''}</span>`;
  }

  function vInicio() {
    const a = datos.alumno, c = cuotaActual(), cs = cursos(), k = cs[cursoProximo()], prox = proximaClase(k);
    const modulo = (k.programa || []).find(m => m.estado === 'en curso');
    const varios = cs.length > 1;
    const tarjetasCursos = varios ? `<section class="p-sec" aria-labelledby="cursos-t">
        <h2 id="cursos-t" class="p-h2">Tus cursos</h2>
        <div class="p-cursos">${cs.map((x, i) => {
          const mod = (x.programa || []).find(m => m.estado === 'en curso');
          const horario = x.dia ? `Los ${esc(x.dia.toLowerCase())}${x.horaInicio ? ` de ${esc(x.horaInicio)}${x.horaFin ? ' a ' + esc(x.horaFin) : ''} h` : ''}` : '';
          return `<article class="p-card p-curso">
            <h3 class="p-h3">${esc(nombreCurso(x))}</h3>
            ${horario || mod ? `<p class="p-muted">${[horario, mod ? `Módulo ${esc(mod.n)} · ${esc(mod.nombre)}` : ''].filter(Boolean).join('<br>')}</p>` : ''}
            ${barraAvance(true, x)}
            <div class="p-btns">
              <a class="btn btn-primario" href="#material" data-curso="${i}">Ver programa</a>
              ${url(x.meet) ? `<a class="btn btn-sec" ${ext} href="${url(x.meet)}">${ICONOS.meet}Meet</a>` : ''}
              ${url(x.classroom) ? `<a class="btn btn-sec" ${ext} href="${url(x.classroom)}">Classroom</a>` : ''}
            </div>
          </article>`;
        }).join('')}</div>
      </section>` : '';
    return `
      <div class="p-head">
        <h1 class="p-h1">¡Hola, ${esc(primerNombre(a.nombre))}!</h1>
        ${datos.config.mensaje ? `<p class="p-lead">${esc(datos.config.mensaje)}</p>` : ''}
      </div>
      <div class="p-grid p-grid-3">
        <section class="p-card p-negro p-span2" aria-labelledby="clase-t">
          <p class="p-eyebrow p-amarillo">Tu próxima clase</p>
          <h2 id="clase-t" class="p-h2">${prox ? esc(prox) : 'Consultá tu horario con PTH'}</h2>
          <dl class="p-datos">
            ${k.curso ? `<div><dt>Programa</dt><dd>${esc(nombreCurso(k))}</dd></div>` : ''}
            ${k.dia ? `<div><dt>Cursada</dt><dd>Todos los ${esc(k.dia.toLowerCase())}</dd></div>` : ''}
            ${modulo ? `<div><dt>Módulo actual</dt><dd>${esc(modulo.n)} · ${esc(modulo.nombre)}</dd></div>` : ''}
          </dl>
          ${varios ? '' : barraAvance(false, k)}
          <div class="p-btns">
            ${url(k.meet) ? `<a class="btn btn-acento" ${ext} href="${url(k.meet)}">${ICONOS.meet}Entrar a la clase en Meet</a>` : ''}
            ${url(k.classroom) ? `<a class="btn btn-sec" ${ext} href="${url(k.classroom)}">Abrir Classroom</a>` : ''}
          </div>
        </section>
        <section class="p-card" aria-labelledby="abono-t">
          <p class="p-eyebrow">Abono</p>
          <h2 id="abono-t" class="p-h3">${c ? 'Cuota de ' + esc(c.mes) : 'Tu abono'}</h2>
          ${c ? chipCuota(c) : '<p class="p-muted">Todavía no hay cuotas cargadas.</p>'}
          <a class="btn btn-primario p-full" href="#abono">${c && !/pagad/i.test(c.estado) ? 'Ver cómo pagar' : 'Ver mis pagos'}</a>
        </section>
      </div>
      ${tarjetasCursos}
      <section class="p-sec" aria-labelledby="mat-t">
        <h2 id="mat-t" class="p-h2">Tu material</h2>
        <div class="p-accesos">
          <a href="#material"><b>Programa</b><span>Módulos, temas, bibliografía y exámenes de ${varios ? 'tus cursos' : 'tu nivel'}.</span></a>
          ${url(k.classroom) ? `<a ${ext} href="${url(k.classroom)}"><b>Material extra</b><span>Tareas y práctica, en Classroom.</span></a>` : ''}
          <a href="#progreso"><b>Tu progreso</b><span>Las devoluciones de tus profes.</span></a>
        </div>
      </section>
      ${pieContacto()}`;
  }

  // Avance del nivel: un segmento por módulo (completados, el actual y los que faltan).
  function barraAvance(claro, c) {
    c = c || cursos()[0];
    const av = c.avance || {};
    const total = Number(av.total) || 0, hechos = Math.min(Number(av.completados) || 0, total);
    if (!total) return '';
    const actual = c.moduloActual;
    const seg = Array.from({ length: total }, (_, i) =>
      `<span class="${i < hechos ? 'on' : i + 1 === actual ? 'act' : ''}"></span>`).join('');
    const pct = Math.round(hechos / total * 100);
    return `<div class="p-avance${claro ? ' p-avance-claro' : ''}">
      <div class="p-fila"><span class="p-avance-tit">Avance del nivel</span><span><b>${hechos} de ${total}</b> módulos completados</span></div>
      <div class="p-avance-barra" style="grid-template-columns:repeat(${total},1fr)" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${hechos}" aria-valuetext="${hechos} de ${total} módulos completados, ${pct} %">${seg}</div>
    </div>`;
  }

  function pieContacto() {
    const c = datos.config, n = primerNombre(datos.alumno.nombre);
    const links = [
      c.waCaro ? `<a ${ext} href="${wa(c.waCaro, 'Hola Caro, soy ' + n + ' del portal del alumno.')}">Caro</a>` : '',
      c.waMarian ? `<a ${ext} href="${wa(c.waMarian, 'Hola Marian, soy ' + n + ' del portal del alumno.')}">Marian</a>` : ''
    ].filter(Boolean).join(' o a ');
    return links ? `<p class="p-nota">¿Algo no está bien? Escribile por WhatsApp a ${links}.</p>` : '';
  }

  function vMaterial() {
    const cs = cursos();
    if (cursoSel === null || !cs[cursoSel]) cursoSel = cursoProximo();
    const a = cs[cursoSel], p = a.programa || [];
    const pestanas = cs.length > 1 ? `<div class="p-tabs" role="tablist" aria-label="Tus cursos">${cs.map((x, i) =>
      `<button type="button" role="tab" class="p-tab" data-sel="${i}" aria-selected="${i === cursoSel}">${esc(nombreCurso(x))}</button>`).join('')}</div>` : '';
    const modulos = p.length ? p.map(m => {
      const abierto = m.estado === 'en curso' || (!a.moduloActual && m === p[0]);
      const etiqueta = m.estado === 'completado' ? `<span class="p-estado">${ICONOS.ok}Completado</span>`
        : m.estado === 'en curso' ? '<span class="p-chip p-chip-acento">En curso</span>'
        : m.estado === 'proximo' ? '<span class="p-estado p-muted">Próximo</span>' : '';
      const biblio = m.bibliografia.length ? `<p class="p-eyebrow p-mini">Bibliografía</p><ul class="p-lista">${m.bibliografia.map(b =>
        `<li><span>${esc(b.texto)}</span>${url(b.link) ? `<a ${ext} href="${url(b.link)}">Abrir</a>` : ''}</li>`).join('')}</ul>` : '';
      const extra = (url(m.tareas) || url(m.practica)) ? `<p class="p-eyebrow p-mini">Material extra</p><div class="p-btns">
        ${url(m.tareas) ? `<a class="btn btn-primario" ${ext} href="${url(m.tareas)}">Tareas del módulo</a>` : ''}
        ${url(m.practica) ? `<a class="btn btn-sec" ${ext} href="${url(m.practica)}">Links de práctica</a>` : ''}</div>` : '';
      return `<details class="p-modulo${m.estado === 'en curso' ? ' p-modulo-actual' : ''}"${abierto ? ' open' : ''}>
        <summary><span><b>Módulo ${esc(m.n)} · ${esc(m.nombre)}</b>${m.temas ? `<small>${esc(m.temas)}</small>` : ''}</span>${etiqueta}</summary>
        <div class="p-modulo-cuerpo">${biblio}${extra}${!biblio && !extra ? '<p class="p-muted">Pronto vas a ver acá el material de este módulo.</p>' : ''}</div>
      </details>`;
    }).join('') : '<p class="p-muted">Tu programa todavía no está cargado.</p>';

    const examenes = p.filter(m => m.examenFecha || m.examenLink);
    return `
      <div class="p-head"><p class="p-eyebrow">${esc(nombreCurso(a))}</p><h1 class="p-h1">Programa y material</h1></div>
      ${pestanas}
      ${barraAvance(true, a) ? `<div class="p-card p-sec-sm">${barraAvance(true, a)}</div>` : ''}
      <div class="p-grid p-grid-3">
        <section class="p-span2" aria-labelledby="prog-t"><h2 id="prog-t" class="p-h3 p-tit">Programa y bibliografía por módulo</h2>${modulos}</section>
        <div class="p-col">
          <section class="p-card" aria-labelledby="ex-t"><h2 id="ex-t" class="p-h3">Exámenes</h2>
            ${examenes.length ? `<ul class="p-lista p-lista-col">${examenes.map(m => `<li><b>Examen del módulo ${esc(m.n)}</b>
              <span class="p-muted">${m.examenFecha ? esc(m.examenFecha) : ''}${url(m.examenLink) ? ` · <a ${ext} href="${url(m.examenLink)}">ver en Classroom</a>` : ''}</span></li>`).join('')}</ul>`
              : '<p class="p-muted">No hay exámenes programados por ahora.</p>'}
          </section>
        </div>
      </div>`;
  }

  // Caro y Marian se reconocen por su WhatsApp de Config; si no, el primer nombre del titular.
  function apodo(k) {
    const cfg = datos.config;
    if (k.wa && k.wa === String(cfg.waCaro || '').replace(/\D/g, '')) return 'Caro';
    if (k.wa && k.wa === String(cfg.waMarian || '').replace(/\D/g, '')) return 'Marian';
    return primerNombre(k.titular);
  }

  function vAbono() {
    const cuotas = datos.cuotas, a = datos.alumno, cuentas = datos.config.cuentas || [];
    const pend = cuotas.filter(c => !/pagad/i.test(c.estado));
    const tarjetas = pend.length ? pend.map(c => `
      <section class="p-card" aria-label="Cuota de ${esc(c.mes)}">
        <div class="p-fila"><h2 class="p-h3">Cuota de ${esc(c.mes)}</h2>${chipCuota(c)}</div>
        ${c.monto ? `<p class="p-monto">${esc(c.monto)}</p>` : ''}
        ${cuentas.length ? `<div class="p-pago">
          <p class="p-eyebrow p-mini">${cuentas.length > 1 ? 'Pagá por transferencia a cualquiera de estas cuentas' : 'Pagá por transferencia'}</p>
          <div class="p-cuentas">${cuentas.map(k => `<div class="p-cuenta">
            <p class="p-cuenta-tit"><b>${esc(k.titular)}</b>${k.entidad ? `<span>${esc(k.entidad)}</span>` : ''}</p>
            <dl class="p-datos p-datos-claro">
              ${k.alias ? `<div><dt>Alias</dt><dd><span>${esc(k.alias)}</span> <button class="p-copiar" type="button" data-copiar="${esc(k.alias)}">${ICONOS.copiar}Copiar</button></dd></div>` : ''}
              ${k.cvu ? `<div><dt>CVU</dt><dd><span class="p-cvu">${esc(k.cvu)}</span> <button class="p-copiar" type="button" data-copiar="${esc(k.cvu)}">${ICONOS.copiar}Copiar</button></dd></div>` : ''}
            </dl>
            ${k.wa ? `<div class="p-comprobante"><p class="p-comprobante-tit">¿Ya transferiste?</p>
              <a class="btn btn-sec" ${ext} href="${wa(k.wa, 'Hola, te mando el comprobante de la cuota de ' + c.mes + ' de ' + a.nombre + '.')}">${ICONOS.wa}Enviale el comprobante a ${esc(apodo(k))}</a></div>` : ''}
          </div>`).join('')}</div>
          <p class="p-chico">La marcamos como pagada cuando la confirmamos.</p>
        </div>` : '<p class="p-muted">Consultá con PTH cómo pagar.</p>'}
      </section>`).join('') : `<section class="p-card"><div class="p-fila"><h2 class="p-h3">Estás al día</h2><span class="p-chip p-chip-ok">${ICONOS.ok}Al día</span></div>
        <p class="p-muted">No tenés cuotas pendientes.</p></section>`;

    const hist = cuotas.length ? `<div class="p-tabla"><table><thead><tr><th scope="col">Mes</th><th scope="col">Estado</th><th scope="col">Medio</th></tr></thead><tbody>
      ${cuotas.map(c => `<tr><td><b>${esc(c.mes)}</b></td><td>${/pagad/i.test(c.estado) ? 'Pagado' + (c.fechaPago ? ' el ' + esc(c.fechaPago) : '') : 'Pendiente'}</td><td class="p-muted">${esc(c.medio) || '—'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="p-muted">Todavía no hay pagos registrados.</p>';

    return `<div class="p-head"><p class="p-eyebrow">Abono</p><h1 class="p-h1">Tu cuota</h1></div>
      <div class="p-grid p-grid-5">
        <div class="p-span3 p-col">${tarjetas}</div>
        <section class="p-card p-span2" aria-labelledby="hist-t"><h2 id="hist-t" class="p-h3">Tus pagos</h2>${hist}</section>
      </div>`;
  }

  const NIVELES = ['Inicial', 'En progreso', 'Logrado', 'Destacado'];
  function fechaLarga(f) {
    const m = String(f || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${Number(m[1])} de ${MESES[Number(m[2]) - 1]} de ${m[3]}` : String(f || '');
  }
  function lineas(t) { return String(t || '').split(/\n+/).map(s => s.trim()).filter(Boolean); }

  function vProgreso() {
    const d = datos.devoluciones;
    if (!d.length) return `<div class="p-head"><p class="p-eyebrow">${esc(cursos().map(x => x.curso).filter(Boolean).join(' + '))}</p><h1 class="p-h1">Tu progreso</h1></div>
      <section class="p-card"><p class="p-muted">Cada tanto, tu profe te deja una devolución con lo que ya lográs y en qué seguir trabajando. Cuando esté lista, la vas a ver acá.</p></section>`;
    const sel = Math.min(Number(leer('pth-dev') || 0), d.length - 1);
    const u = d[sel];
    const habil = u.habilidades.filter(h => h.nivel).map(h => {
      const n = NIVELES.indexOf(h.nivel) + 1;
      return `<div class="p-hab"><div class="p-fila"><b lang="en">${esc(h.nombre)}</b><span>${esc(h.nivel)}</span></div>
        <div class="p-barra" role="img" aria-label="${n} de 4">${[1, 2, 3, 4].map(i => `<span${i <= n ? ' class="on"' : ''}></span>`).join('')}</div></div>`;
    }).join('');
    const lista = t => `<ul class="p-puntos">${lineas(t).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return `<div class="p-head"><p class="p-eyebrow">${esc(cursos().map(x => x.curso).filter(Boolean).join(' + '))}</p><h1 class="p-h1">Tu progreso</h1>
        <p class="p-lead">Cada tanto, tu profe te deja una devolución: lo que ya lográs y en qué seguir trabajando.</p></div>
      <div class="p-grid p-grid-3">
        <section class="p-card p-span2" aria-labelledby="dev-t">
          <div class="p-fila"><div><p class="p-eyebrow">${sel === 0 ? 'Última devolución' : 'Devolución'}</p><h2 id="dev-t" class="p-h2">${esc(fechaLarga(u.fecha))}</h2></div></div>
          ${u.mensaje ? `<figure class="p-mensaje"><blockquote>${esc(u.mensaje)}</blockquote><figcaption>${esc(u.docente || 'Tu profe')}</figcaption></figure>` : ''}
          ${habil ? `<h3 class="p-h4">Cómo vas en cada habilidad</h3><div class="p-habs">${habil}</div><p class="p-chico">Escala: ${NIVELES.join(' · ')}</p>` : ''}
          <div class="p-grid p-grid-2">
            ${u.bien ? `<div class="p-caja"><h3 class="p-h4">Lo que hacés muy bien</h3>${lista(u.bien)}</div>` : ''}
            ${u.seguir ? `<div class="p-caja p-crema"><h3 class="p-h4">Para seguir trabajando</h3>${lista(u.seguir)}</div>` : ''}
          </div>
        </section>
        <section class="p-card" aria-labelledby="ant-t"><h2 id="ant-t" class="p-h3">Todas tus devoluciones</h2>
          <ul class="p-lista p-lista-col">${d.map((x, i) => `<li><button type="button" class="p-link" data-dev="${i}"${i === sel ? ' aria-current="true"' : ''}><b>${esc(fechaLarga(x.fecha))}</b>${i === 0 ? '<span class="p-muted">Última</span>' : ''}</button></li>`).join('')}</ul>
        </section>
      </div>`;
  }

  function vOpinion() {
    return `<div class="p-head"><p class="p-eyebrow">Tu opinión</p><h1 class="p-h1">¿Cómo venís con las clases?</h1>
        <p class="p-lead">Contanos qué te sirve y qué cambiarías. Nos ayuda a armar mejores clases para vos.</p></div>
      <div class="p-grid p-grid-3">
        <section class="p-card p-span2" id="op-caja">
          <form id="op-form" class="p-form" novalidate>
            <fieldset><legend>En general, ¿cómo te sentís con las clases?</legend>
              <div class="p-notas">${['Nada bien', 'Regular', 'Bien', 'Muy bien', 'Excelente'].map((t, i) =>
                `<label><input type="radio" name="nota" value="${i + 1}"${i === 3 ? ' checked' : ''}><span><b>${i + 1}</b>${t}</span></label>`).join('')}</div>
            </fieldset>
            <label for="op-tema">¿Sobre qué querés opinar?</label>
            <select id="op-tema" name="tema"><option>Las clases en general</option><option>El material</option><option>Mi docente</option><option>Los horarios</option><option>El portal</option><option>Otro tema</option></select>
            <label for="op-sirve">¿Qué te está sirviendo más?</label>
            <textarea id="op-sirve" name="sirve" rows="3" maxlength="2000" placeholder="Por ejemplo: las charlas del principio de la clase"></textarea>
            <label for="op-cambiar">¿Qué cambiarías o te gustaría sumar?</label>
            <textarea id="op-cambiar" name="cambiaria" rows="3" maxlength="2000" placeholder="Contanos con confianza"></textarea>
            <label class="p-check"><input type="checkbox" name="anonimo"> Enviar sin mi nombre</label>
            <button class="btn btn-primario" type="submit">Enviar mi opinión</button>
            <p class="p-error" id="op-error" role="alert" hidden></p>
          </form>
        </section>
        <aside class="p-card p-crema"><h2 class="p-h3">¿Qué hacemos con lo que nos contás?</h2>
          <ul class="p-puntos"><li>Lo leen Marian y Caro, nadie más.</li><li>Si dejás tu nombre, te respondemos.</li><li>Cada tanto te pedimos una opinión corta.</li></ul>
        </aside>
      </div>`;
  }

  /* ---------- interacción ---------- */
  function enlazar(r) {
    vista.querySelectorAll('[data-curso]').forEach(el => el.addEventListener('click', () => { cursoSel = Number(el.dataset.curso); }));
    vista.querySelectorAll('[data-sel]').forEach(el => el.addEventListener('click', () => { cursoSel = Number(el.dataset.sel); mostrar(true); }));
    if (r === 'avisos') enlazarAvisos();
    vista.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.copiar;
      const listo = () => { b.lastChild.textContent = 'Copiado'; setTimeout(() => { b.lastChild.textContent = 'Copiar'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(listo).catch(() => {});
    }));
    vista.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', () => {
      guardar('pth-dev', b.dataset.dev); mostrar();
    }));
    if (r === 'opinion') {
      const f = document.getElementById('op-form');
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = document.getElementById('op-error');
        const boton = f.querySelector('button[type=submit]');
        boton.disabled = true; boton.textContent = 'Enviando…'; err.hidden = true;
        const fd = new FormData(f);
        try {
          const res = await api('opinion', { opinion: {
            nota: fd.get('nota'), tema: fd.get('tema'), sirve: fd.get('sirve'),
            cambiaria: fd.get('cambiaria'), anonimo: fd.get('anonimo') === 'on' } });
          if (!res.ok) throw new Error();
          document.getElementById('op-caja').innerHTML = `<div class="p-gracias">${ICONOS.ok}<h2 class="p-h2" lang="en">Thank you, ${esc(primerNombre(datos.alumno.nombre))}!</h2>
            <p class="p-muted">Recibimos tu opinión. La leen Marian y Caro y, si hace falta, te responden.</p>
            <a class="btn btn-sec" href="#inicio">Volver al inicio</a></div>`;
        } catch (e) {
          err.textContent = 'No pudimos enviarla. Probá de nuevo en un rato.'; err.hidden = false;
          boton.disabled = false; boton.textContent = 'Enviar mi opinión';
        }
      });
    }
  }

  /* ---------- avisos al celular ---------- */
  const FB = CFG.firebase || {};
  const FB_VERSION = '12.19.0';
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const soportaPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let fb = null;

  async function firebase() {
    if (fb) return fb;
    const [app, m] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-messaging.js`)
    ]);
    if (!(await m.isSupported())) throw new Error('no-soportado');
    const a = app.initializeApp({ apiKey: FB.apiKey, projectId: FB.projectId, messagingSenderId: FB.messagingSenderId, appId: FB.appId });
    fb = { m, messaging: m.getMessaging(a) };
    return fb;
  }

  async function tokenDeEsteDispositivo() {
    const { m, messaging } = await firebase();
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    return m.getToken(messaging, { vapidKey: FB.vapidKey, serviceWorkerRegistration: reg });
  }

  function quitarTokenFirebase() {
    firebase().then(({ m, messaging }) => m.deleteToken(messaging)).catch(() => {});
  }

  function estadoAvisos() {
    if (!FB.vapidKey) return 'no-soportado';
    if (esIOS && !instalada) return 'instalar';
    if (!soportaPush) return 'no-soportado';
    if (Notification.permission === 'denied') return 'bloqueado';
    if (Notification.permission === 'granted' && leerL(CLAVE_FCM)) return 'activo';
    return 'inactivo';
  }

  function nombreDispositivo() {
    const ua = navigator.userAgent;
    const so = /android/i.test(ua) ? 'Android' : esIOS ? 'iPhone/iPad' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Otro';
    const nav = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : '';
    return so + (nav ? ' · ' + nav : '') + (instalada ? ' · app' : '');
  }

  function preferencias() {
    const p = datos.avisos || {};
    return { clase: p.clase !== false, cuota: p.cuota !== false, novedades: p.novedades !== false };
  }

  function guardarPreferenciasLocales(p) {
    datos.avisos = Object.assign({}, datos.avisos, p);
    guardarL(CLAVE_DATOS, JSON.stringify(datos));
  }

  // Ojo: el pedido de permiso tiene que ser lo primero que pasa al tocar el botón.
  async function activarAvisos(p) {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return permiso;
    return suscribir(p);
  }

  async function suscribir(p) {
    const t = await tokenDeEsteDispositivo();
    const r = await api('avisos', { fcm: t, anterior: leerL(CLAVE_FCM), preferencias: p, dispositivo: nombreDispositivo() });
    if (!r.ok) throw new Error(r.error || 'avisos');
    guardarL(CLAVE_FCM, t);
    guardarPreferenciasLocales(Object.assign({ dispositivos: (datos.avisos && datos.avisos.dispositivos || 0) + 1 }, p));
    return 'granted';
  }

  // Los tokens de Firebase cambian cada tanto: al entrar se renueva en segundo plano.
  async function refrescarAvisos() {
    if (estadoAvisos() !== 'activo') return;
    try {
      const t = await tokenDeEsteDispositivo();
      if (t && t !== leerL(CLAVE_FCM)) {
        const r = await api('avisos', { fcm: t, anterior: leerL(CLAVE_FCM), preferencias: preferencias(), dispositivo: nombreDispositivo() });
        if (r.ok) guardarL(CLAVE_FCM, t);
      }
    } catch (e) { /* sin conexión o sin permiso: se reintenta la próxima vez */ }
  }



  // Los avisos vienen activados: al primer toque en el portal el navegador pide permiso una sola vez.
  // Si ya lo había dado (otra sesión), se suscribe sin preguntar nada.
  const CLAVE_PEDIDO = 'pth-avisos-pedido';
  const CLAVE_PEDIDO_APP = 'pth-avisos-pedido-app';
  let esperandoToque = false;
  function prepararAvisos() {
    const e = estadoAvisos();
    if (e === 'activo') { refrescarAvisos(); return; }
    if (e !== 'inactivo') return;
    if (Notification.permission === 'granted') { suscribir(preferencias()).catch(() => {}); return; }
    if (esperandoToque) return;
    // Con la app instalada se pide apenas abre (aunque en el navegador lo haya salteado).
    // Si el celular exige un toque (iPhone), queda para el primer toque.
    if (instalada && !leerL(CLAVE_PEDIDO_APP)) {
      guardarL(CLAVE_PEDIDO_APP, '1');
      let pedido;
      try { pedido = Notification.requestPermission(); } catch (e) { pedido = null; }
      if (pedido && pedido.then) {
        pedido.then(r => {
          if (r === 'granted') { guardarL(CLAVE_PEDIDO, '1'); return suscribir(preferencias()).then(() => { if (rutaActual() === 'avisos') mostrar(true); }); }
          if (r === 'denied') { guardarL(CLAVE_PEDIDO, '1'); return; }
          esperarToque(true);
        }).catch(() => esperarToque(true));
        return;
      }
      esperarToque(true);
      return;
    }
    esperarToque();
  }

  function esperarToque(forzar) {
    if (esperandoToque || (leerL(CLAVE_PEDIDO) && !forzar) || Notification.permission !== 'default') return;
    esperandoToque = true;
    const alTocar = ev => {
      if (ev.target.closest && ev.target.closest('#salir, #av-form')) return;
      document.removeEventListener('click', alTocar, true);
      esperandoToque = false;
      guardarL(CLAVE_PEDIDO, '1');
      activarAvisos(preferencias()).then(() => { if (rutaActual() === 'avisos') mostrar(true); }).catch(() => {});
    };
    document.addEventListener('click', alTocar, true);
  }

  // Instalar la app (Android/compu: el navegador lo ofrece; iPhone: desde Safari).
  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; });

  const TIPOS = [
    ['clase', 'Tu clase está por empezar', '10 minutos antes, con el link para entrar a Meet.'],
    ['cuota', 'Tu cuota está pendiente', 'Si se pasó el vencimiento y todavía no la registramos.'],
    ['novedades', 'Novedades de PTH', 'Seminarios, encuentros, cambios de horario y avisos de tus profes.']
  ];

  function vAvisos() {
    const e = estadoAvisos(), p = preferencias();
    const activo = e === 'activo';
    const llaves = TIPOS.map(([k, t, d]) => `<label class="p-llave">
        <span><b>${t}</b><small>${d}</small></span>
        <input type="checkbox" role="switch" name="${k}" ${p[k] ? 'checked' : ''}><i aria-hidden="true"></i>
      </label>`).join('');
    let avisos;
    if (e === 'instalar') {
      avisos = `<section class="p-card"><h2 class="p-h3">Avisos</h2>
        <p class="p-muted">En iPhone, los avisos llegan cuando instalás la app (abajo te mostramos cómo). Después abrila desde el ícono y listo: quedan activados.</p></section>`;
    } else if (e === 'no-soportado') {
      avisos = `<section class="p-card"><h2 class="p-h3">Avisos</h2>
        <p class="p-muted">Este navegador no permite avisos. Probá desde Chrome en tu celular Android o en la compu.</p></section>`;
    } else if (e === 'bloqueado') {
      avisos = `<section class="p-card"><h2 class="p-h3">Los avisos están bloqueados</h2>
        <p class="p-muted">Para recibirlos, tocá el candado al lado de la dirección del sitio, entrá a <b>Notificaciones</b> y elegí <b>Permitir</b>.</p></section>`;
    } else {
      avisos = `<form class="p-card p-avisos" id="av-form">
          <div class="p-fila"><h2 class="p-h3">Avisos</h2>${activo ? `<span class="p-chip p-chip-ok">${ICONOS.ok}Activados</span>` : ''}</div>
          <p class="p-muted">${activo ? 'Están todos activados. Si alguno no te sirve, apagalo acá.' : 'Tocá <b>Activar avisos</b> y después <b>Permitir</b>. Si alguno no te sirve, apagalo antes.'}</p>
          <div class="p-llaves">${llaves}</div>
          <p class="p-error" id="av-error" role="alert" hidden></p>
          <div class="p-btns">${activo
            ? '<button class="p-link-chico" type="button" id="av-baja">Desactivar todos en este dispositivo</button><span class="p-chico" id="av-ok" role="status"></span>'
            : `<button class="btn btn-primario" type="submit" id="av-alta">${ICONOS.campana}Activar avisos</button>`}</div>
        </form>`;
    }
    let app;
    if (instalada) app = '<p class="p-muted">Ya tenés la app instalada en este dispositivo.</p>';
    else if (esIOS) app = `<ol class="p-pasos">
          <li>Abrí <b>proftraininghub.com.ar/alumnos</b> en <b>Safari</b>.</li>
          <li>Tocá <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
          <li>Elegí <b>Agregar a inicio</b> y después <b>Agregar</b>.</li>
        </ol>`;
    else if (pedidoInstalar) app = `<div class="p-btns"><button class="btn btn-primario" type="button" id="instalar">Instalar la app</button></div>`;
    else app = '<p class="p-muted">Abrí el menú del navegador (⋮) y elegí <b>Instalar app</b> o <b>Agregar a la pantalla de inicio</b>.</p>';
    return `<div class="p-head"><p class="p-eyebrow">Portal del alumno</p><h1 class="p-h1">Avisos y app</h1></div>
      <div class="p-col">${avisos}
        <section class="p-card"><h2 class="p-h3">La app en tu celular</h2>
          <p class="p-muted">Con el logo de PTH en tu pantalla de inicio, para entrar con un toque.</p>${app}</section>
      </div>`;
  }

  function enlazarAvisos() {
    const inst = document.getElementById('instalar');
    if (inst) inst.addEventListener('click', async () => {
      pedidoInstalar.prompt();
      let eleccion = null;
      try { eleccion = await pedidoInstalar.userChoice; } catch (e) { /* nada */ }
      pedidoInstalar = null;
      // Recién instalada: se piden los avisos (el permiso vale también para la app).
      if (eleccion && eleccion.outcome === 'accepted' && estadoAvisos() === 'inactivo') {
        guardarL(CLAVE_PEDIDO, '1');
        try { await activarAvisos(preferencias()); } catch (e) { /* se reintenta al abrir la app */ }
      }
      mostrar(true);
    });
    const f = document.getElementById('av-form');
    if (!f) return;
    const err = document.getElementById('av-error');
    const leerLlaves = () => ({ clase: f.clase.checked, cuota: f.cuota.checked, novedades: f.novedades.checked });
    const alta = document.getElementById('av-alta');
    if (alta) f.addEventListener('submit', ev => {
      ev.preventDefault();
      err.hidden = true;
      const p = leerLlaves();
      const pedido = activarAvisos(p);   // sin esperas antes: así el celular muestra el permiso
      alta.disabled = true; alta.lastChild.textContent = 'Activando…';
      pedido.then(res => {
        if (res === 'denied') { mostrar(true); return; }
        if (res !== 'granted') { alta.disabled = false; alta.lastChild.textContent = 'Activar avisos'; return; }
        guardarL(CLAVE_PEDIDO, '1');
        mostrar(true);
      }).catch(() => {
        err.textContent = 'No pudimos activar los avisos. Revisá tu conexión y probá de nuevo.'; err.hidden = false;
        alta.disabled = false; alta.lastChild.textContent = 'Activar avisos';
      });
    });
    const baja = document.getElementById('av-baja');
    if (baja) {
      const ok = document.getElementById('av-ok');
      f.querySelectorAll('input[role=switch]').forEach(i => i.addEventListener('change', async () => {
        const p = leerLlaves();
        ok.textContent = 'Guardando…';
        try {
          const r = await api('avisos', { fcm: leerL(CLAVE_FCM), preferencias: p, dispositivo: nombreDispositivo() });
          if (!r.ok) throw new Error();
          guardarPreferenciasLocales(p);
          ok.textContent = 'Guardado';
        } catch (e) { ok.textContent = ''; err.textContent = 'No se pudo guardar. Probá de nuevo.'; err.hidden = false; i.checked = !i.checked; }
      }));
      baja.addEventListener('click', async () => {
        baja.disabled = true;
        const fcm = leerL(CLAVE_FCM);
        try { await api('avisos-baja', { fcm }); } catch (e) { /* igual se borra acá */ }
        guardarL(CLAVE_FCM, null);
        quitarTokenFirebase();
        mostrar(true);
      });
    }
  }

  /* ---------- instalación en el celular ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  iniciar();
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
