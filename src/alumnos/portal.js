/* Portal del alumno · Professional Training Hub
   Ingreso con Google → pide los datos del alumno al Apps Script de la planilla → muestra las pantallas. */
(function () {
  'use strict';

  const CFG = window.PTH_PORTAL || {};
  const vista = document.getElementById('vista');
  const nav = document.getElementById('nav');
  const usuarioBox = document.getElementById('usuario');
  const RUTAS = ['inicio', 'material', 'abono', 'progreso', 'opinion'];
  const CLAVE = 'pth-portal-token';
  let datos = null;
  let token = null;

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const url = s => /^https?:\/\//i.test(String(s || '').trim()) ? esc(String(s).trim()) : '';
  const ext = 'target="_blank" rel="noopener"';
  const guardar = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} };
  const leer = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || '';
  const wa = (num, msj) => num ? `https://wa.me/${encodeURIComponent(num)}?text=${encodeURIComponent(msj)}` : '';

  const ICONOS = {
    meet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'
  };

  /* ---------- próxima clase ---------- */
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function normalizarDia(d) { return String(d || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function proximaClase(a) {
    const objetivo = DIAS.map(normalizarDia).indexOf(normalizarDia(a.dia));
    if (objetivo < 0 || !a.horaInicio) return null;
    const [hf, mf] = (a.horaFin || a.horaInicio).split(':').map(Number);
    const ahora = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + i);
      if (d.getDay() !== objetivo) continue;
      const fin = new Date(d); fin.setHours(hf || 0, mf || 0, 0, 0);
      if (fin <= ahora) continue;
      const cuando = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' :
        `${DIAS[d.getDay()][0].toUpperCase()}${DIAS[d.getDay()].slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`;
      return `${cuando}, de ${a.horaInicio} a ${a.horaFin || ''} h`.replace(' a  h', ' h');
    }
    return null;
  }

  /* ---------- sesión ---------- */
  function tokenVigente(t) {
    try {
      const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.exp * 1000 > Date.now() + 60000;
    } catch (e) { return false; }
  }

  function iniciarGoogle() {
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(iniciarGoogle, 150); return; }
    google.accounts.id.initialize({
      client_id: CFG.clientId,
      callback: r => { token = r.credential; guardar(CLAVE, token); cargar(); },
      auto_select: true,
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true
    });
    const guardado = leer(CLAVE);
    if (guardado && tokenVigente(guardado)) { token = guardado; cargar(); }
    else pantallaIngreso();
  }

  function salir() {
    guardar(CLAVE, null); token = null; datos = null;
    if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    nav.hidden = true; usuarioBox.hidden = true;
    pantallaIngreso();
  }
  document.getElementById('salir').addEventListener('click', salir);

  async function api(accion, extra) {
    const r = await fetch(CFG.api, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ accion, token }, extra || {}))
    });
    return r.json();
  }

  async function cargar() {
    vista.innerHTML = '<p class="p-cargando">Cargando tus datos…</p>';
    try {
      const r = await api('datos');
      if (r.error === 'sesion') { guardar(CLAVE, null); pantallaIngreso('Tu sesión venció. Volvé a entrar.'); return; }
      if (r.error === 'no-alumno') { pantallaNoAlumno(r.email); return; }
      if (r.error) throw new Error(r.error);
      datos = r;
      mostrarUsuario();
      mostrar();
    } catch (e) {
      vista.innerHTML = `<section class="p-card p-centro"><h1 class="p-h1">No pudimos cargar tus datos</h1>
        <p class="p-muted">Revisá tu conexión y probá de nuevo.</p>
        <button class="btn btn-primario" type="button" id="reintentar">Reintentar</button></section>`;
      document.getElementById('reintentar').addEventListener('click', cargar);
    }
  }

  function mostrarUsuario() {
    const a = datos.alumno;
    const av = document.getElementById('avatar');
    av.textContent = iniciales(a.nombre);
    usuarioBox.hidden = false; nav.hidden = false;
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
  function mostrar() {
    if (!datos) return;
    const r = rutaActual();
    nav.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.dataset.ruta === r));
    const fn = { inicio: vInicio, material: vMaterial, abono: vAbono, progreso: vProgreso, opinion: vOpinion }[r];
    vista.innerHTML = fn();
    enlazar(r);
    window.scrollTo(0, 0);
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
    const a = datos.alumno, c = cuotaActual(), prox = proximaClase(a);
    const modulo = datos.programa.find(m => m.estado === 'en curso');
    return `
      <div class="p-head">
        <p class="p-eyebrow">${esc(a.curso)}${a.nivel ? ' · ' + esc(a.nivel) : ''}</p>
        <h1 class="p-h1">¡Hola, ${esc(primerNombre(a.nombre))}!</h1>
        ${datos.config.mensaje ? `<p class="p-lead">${esc(datos.config.mensaje)}</p>` : ''}
      </div>
      <div class="p-grid p-grid-3">
        <section class="p-card p-negro p-span2" aria-labelledby="clase-t">
          <p class="p-eyebrow p-amarillo">Tu próxima clase</p>
          <h2 id="clase-t" class="p-h2">${prox ? esc(prox) : 'Consultá tu horario con PTH'}</h2>
          <dl class="p-datos">
            ${a.dia ? `<div><dt>Cursada</dt><dd>Todos los ${esc(a.dia.toLowerCase())}</dd></div>` : ''}
            ${modulo ? `<div><dt>Módulo actual</dt><dd>${esc(modulo.n)} · ${esc(modulo.nombre)}</dd></div>` : ''}
          </dl>
          <div class="p-btns">
            ${url(a.meet) ? `<a class="btn btn-acento" ${ext} href="${url(a.meet)}">${ICONOS.meet}Entrar a la clase en Meet</a>` : ''}
            ${url(a.classroom) ? `<a class="btn btn-sec" ${ext} href="${url(a.classroom)}">Abrir Classroom</a>` : ''}
          </div>
        </section>
        <section class="p-card" aria-labelledby="abono-t">
          <p class="p-eyebrow">Abono</p>
          <h2 id="abono-t" class="p-h3">${c ? 'Cuota de ' + esc(c.mes) : 'Tu abono'}</h2>
          ${c ? chipCuota(c) : '<p class="p-muted">Todavía no hay cuotas cargadas.</p>'}
          <a class="btn btn-primario p-full" href="#abono">${c && !/pagad/i.test(c.estado) ? 'Ver cómo pagar' : 'Ver mis pagos'}</a>
        </section>
      </div>
      <section class="p-sec" aria-labelledby="mat-t">
        <h2 id="mat-t" class="p-h2">Tu material</h2>
        <div class="p-accesos">
          <a href="#material"><b>Programa</b><span>Módulos y temas de tu nivel.</span></a>
          <a href="#material"><b>Bibliografía</b><span>Lo que usamos en cada módulo.</span></a>
          ${url(a.classroom) ? `<a ${ext} href="${url(a.classroom)}"><b>Material extra</b><span>Tareas y práctica, en Classroom.</span></a>` : ''}
          <a href="#progreso"><b>Tu progreso</b><span>Las devoluciones de tu profe.</span></a>
          ${datos.libro.titulo ? `<a href="#material"><b>Literatura</b><span>${esc(datos.libro.titulo)}</span></a>` : ''}
        </div>
      </section>
      ${pieContacto()}`;
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
    const a = datos.alumno, p = datos.programa, l = datos.libro;
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
      <div class="p-head"><p class="p-eyebrow">${esc(a.curso)}${a.nivel ? ' · ' + esc(a.nivel) : ''}</p><h1 class="p-h1">Programa y material</h1></div>
      <div class="p-grid p-grid-3">
        <section class="p-span2" aria-labelledby="prog-t"><h2 id="prog-t" class="p-h3 p-tit">Programa y bibliografía por módulo</h2>${modulos}</section>
        <div class="p-col">
          <section class="p-card" aria-labelledby="ex-t"><h2 id="ex-t" class="p-h3">Exámenes</h2>
            ${examenes.length ? `<ul class="p-lista p-lista-col">${examenes.map(m => `<li><b>Examen del módulo ${esc(m.n)}</b>
              <span class="p-muted">${m.examenFecha ? esc(m.examenFecha) : ''}${url(m.examenLink) ? ` · <a ${ext} href="${url(m.examenLink)}">ver en Classroom</a>` : ''}</span></li>`).join('')}</ul>`
              : '<p class="p-muted">No hay exámenes programados por ahora.</p>'}
          </section>
          ${l.titulo ? `<section class="p-card p-crema" aria-labelledby="lit-t">
            <p class="p-eyebrow">Literatura · estás leyendo</p>
            <h2 id="lit-t" class="p-h3" lang="en">${esc(l.titulo)}</h2>
            ${l.autor ? `<p class="p-muted">${esc(l.autor)}</p>` : ''}
            ${l.consigna ? `<p>${esc(l.consigna)}</p>` : ''}
            ${url(l.link) ? `<a class="btn btn-primario p-full" ${ext} href="${url(l.link)}">Abrir el libro</a>` : ''}
          </section>` : ''}
        </div>
      </div>`;
  }

  function vAbono() {
    const cuotas = datos.cuotas, cfg = datos.config, a = datos.alumno;
    const pend = cuotas.filter(c => !/pagad/i.test(c.estado));
    const tarjetas = pend.length ? pend.map(c => `
      <section class="p-card" aria-label="Cuota de ${esc(c.mes)}">
        <div class="p-fila"><h2 class="p-h3">Cuota de ${esc(c.mes)}</h2>${chipCuota(c)}</div>
        ${c.monto ? `<p class="p-monto">${esc(c.monto)}</p>` : ''}
        ${cfg.alias ? `<div class="p-pago">
          <p class="p-eyebrow p-mini">Pagá por transferencia</p>
          <dl class="p-datos p-datos-claro">
            <div><dt>Alias</dt><dd><span id="alias">${esc(cfg.alias)}</span> <button class="p-copiar" type="button" data-copiar="${esc(cfg.alias)}">${ICONOS.copiar}Copiar</button></dd></div>
            ${cfg.titular ? `<div><dt>Titular</dt><dd>${esc(cfg.titular)}</dd></div>` : ''}
            ${cfg.banco ? `<div><dt>Banco</dt><dd>${esc(cfg.banco)}</dd></div>` : ''}
          </dl>
          ${cfg.waCaro ? `<a class="btn btn-sec" ${ext} href="${wa(cfg.waCaro, 'Hola, te mando el comprobante de la cuota de ' + c.mes + ' de ' + a.nombre + '.')}">Ya transferí: mandar el comprobante</a>` : ''}
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
  function nombreModulo(m) {
    const a = datos.alumno;
    let t = String(m || '');
    [a.curso, a.nivel].forEach(p => { if (p && t.indexOf(p + ' · ') === 0) t = t.slice(p.length + 3); });
    return /^\d+\s·/.test(t) ? 'Módulo ' + t : t;
  }
  function lineas(t) { return String(t || '').split(/\n+/).map(s => s.trim()).filter(Boolean); }

  function vProgreso() {
    const d = datos.devoluciones;
    if (!d.length) return `<div class="p-head"><p class="p-eyebrow">${esc(datos.alumno.curso)}</p><h1 class="p-h1">Tu progreso</h1></div>
      <section class="p-card"><p class="p-muted">Al cerrar cada módulo, tu profe te deja una devolución con lo que ya lográs y en qué seguir trabajando. Cuando esté lista, la vas a ver acá.</p></section>`;
    const sel = Math.min(Number(leer('pth-dev') || 0), d.length - 1);
    const u = d[sel];
    const habil = u.habilidades.filter(h => h.nivel).map(h => {
      const n = NIVELES.indexOf(h.nivel) + 1;
      return `<div class="p-hab"><div class="p-fila"><b lang="en">${esc(h.nombre)}</b><span>${esc(h.nivel)}</span></div>
        <div class="p-barra" role="img" aria-label="${n} de 4">${[1, 2, 3, 4].map(i => `<span${i <= n ? ' class="on"' : ''}></span>`).join('')}</div></div>`;
    }).join('');
    const lista = t => `<ul class="p-puntos">${lineas(t).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return `<div class="p-head"><p class="p-eyebrow">${esc(datos.alumno.curso)}</p><h1 class="p-h1">Tu progreso</h1>
        <p class="p-lead">Al cerrar cada módulo, tu profe te deja una devolución: lo que ya lográs y en qué seguir trabajando.</p></div>
      <div class="p-grid p-grid-3">
        <section class="p-card p-span2" aria-labelledby="dev-t">
          <div class="p-fila"><div><p class="p-eyebrow">${sel === 0 ? 'Última devolución' : 'Devolución'}</p><h2 id="dev-t" class="p-h2">${esc(nombreModulo(u.modulo))}</h2></div><span class="p-muted">${esc(u.fecha)}</span></div>
          ${u.mensaje ? `<figure class="p-mensaje"><blockquote>${esc(u.mensaje)}</blockquote><figcaption>Tu profe</figcaption></figure>` : ''}
          ${habil ? `<h3 class="p-h4">Cómo vas en cada habilidad</h3><div class="p-habs">${habil}</div><p class="p-chico">Escala: ${NIVELES.join(' · ')}</p>` : ''}
          <div class="p-grid p-grid-2">
            ${u.bien ? `<div class="p-caja"><h3 class="p-h4">Lo que hacés muy bien</h3>${lista(u.bien)}</div>` : ''}
            ${u.seguir ? `<div class="p-caja p-crema"><h3 class="p-h4">Para seguir trabajando</h3>${lista(u.seguir)}</div>` : ''}
          </div>
        </section>
        <section class="p-card" aria-labelledby="ant-t"><h2 id="ant-t" class="p-h3">Todas tus devoluciones</h2>
          <ul class="p-lista p-lista-col">${d.map((x, i) => `<li><button type="button" class="p-link" data-dev="${i}"${i === sel ? ' aria-current="true"' : ''}><b>${esc(nombreModulo(x.modulo))}</b><span class="p-muted">${esc(x.fecha)}</span></button></li>`).join('')}</ul>
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
          <ul class="p-puntos"><li>Lo leen Marian y Caro, nadie más.</li><li>Si dejás tu nombre, te respondemos.</li><li>Al cerrar cada módulo te pedimos una opinión corta.</li></ul>
        </aside>
      </div>`;
  }

  /* ---------- interacción ---------- */
  function enlazar(r) {
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

  /* ---------- instalación en el celular ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  iniciarGoogle();
})();
