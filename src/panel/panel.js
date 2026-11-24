/* Panel de dirección · Professional Training Hub
   Ingreso con Google (solo la cuenta de PTH) → pide todo a la planilla vía Apps Script → tablero y acciones simples. */
(function () {
  'use strict';

  const CFG = window.PTH_PANEL || {};
  const vista = document.getElementById('vista');
  const nav = document.getElementById('nav');
  const RUTAS = ['inicio', 'alumnos', 'cuotas', 'avisos', 'devoluciones', 'opiniones'];
  const CLAVE_TOKEN = 'pth-panel-token';
  const CLAVE_SESION = 'pth-panel-sesion';
  const CLAVE_DATOS = 'pth-panel-datos';
  let datos = null, sesion = null, token = null, ultimaCarga = 0;

  // Lo que se eligió en cada pantalla (se mantiene al cambiar de sección).
  const st = {
    buscar: '', curso: '', inactivos: false, abierto: null,
    mes: null, filtro: 'pendientes', buscarCuota: '',
    aviso: { todos: true, dest: [], para: 'Todos', titulo: '', mensaje: '', link: '', programar: false, cuando: '' }, buscarDest: '',
    confirmar: false, enviando: false, docente: '', buscarDev: ''
  };

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const url = s => /^https?:\/\//i.test(String(s || '').trim()) ? esc(String(s).trim()) : '';
  const ext = 'target="_blank" rel="noopener"';
  const ses = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
                set: (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} } };
  const loc = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
                set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const sinTildes = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
  const plata = n => '$ ' + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : (varios || uno + 's'));
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const hoy = () => new Date();
  const mesActual = () => { const d = hoy(); return cap(MESES[d.getMonth()]) + ' ' + d.getFullYear(); };
  const nombreCurso = c => (c.curso || 'Sin curso') + (c.nivel ? ' · ' + c.nivel : '');
  const horario = c => c.dia ? cap(c.dia) + (c.horaInicio ? ' ' + c.horaInicio + (c.horaFin ? '–' + c.horaFin : '') : '') : 'Sin día cargado';

  const I = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
    campana: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    meet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/></svg>',
    afuera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 10 14"/><path d="M21 3 14.5 21l-4.5-7-7-4.5z"/></svg>'
  };

  let toastTimer = null;
  function aviso(txt, mal, deshacer) {
    const t = document.getElementById('toast');
    t.innerHTML = `<span>${esc(txt)}</span>` + (deshacer ? '<button class="pn-toast-btn" type="button">Deshacer</button>' : '');
    t.hidden = false; t.classList.toggle('pn-toast-mal', !!mal);
    if (deshacer) t.querySelector('button').addEventListener('click', () => { t.hidden = true; deshacer(); });
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, deshacer ? 8000 : 4200);
  }

  /* ---------- datos derivados ---------- */
  // Un alumno puede estar en varias filas (una por curso): se agrupa por mail.
  function alumnos() {
    const porMail = new Map();
    datos.alumnos.forEach(f => {
      const k = f.email || 'fila-' + f.fila;
      if (!porMail.has(k)) porMail.set(k, { email: f.email, nombre: f.nombre, activo: false, app: f.app, novedades: f.novedades, cursos: [], filas: [] });
      const a = porMail.get(k);
      if (!a.nombre) a.nombre = f.nombre;
      a.filas.push(f.fila);
      if (f.activo) a.activo = true;
      f.cursos.forEach((c, i) => a.cursos.push(Object.assign({}, c, { fila: f.fila, indice: i, email: f.email, activo: f.activo })));
    });
    return Array.from(porMail.values()).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  }
  const activos = () => alumnos().filter(a => a.activo);
  // Mes de una cuota como número comparable (año*12 + mes). Si no dice el año, se toma el del vencimiento.
  function mesNum(c) {
    const t = sinTildes(c.mes);
    const m = MESES.findIndex(x => t.indexOf(x) === 0);
    if (m < 0) return null;
    const y = (t.match(/(\d{4})/) || [])[1] || (String(c.vence).match(/(\d{4})/) || [])[1] || hoy().getFullYear();
    return Number(y) * 12 + m;
  }
  const mesHoy = () => hoy().getFullYear() * 12 + hoy().getMonth();
  const esFutura = c => { const n = mesNum(c); return n !== null && n > mesHoy(); };
  const esDelMes = c => mesNum(c) === mesHoy();
  const desde = c => { const n = mesNum(c); return n === null ? '' : 'Se paga desde el 1/' + (n % 12 + 1); };
  function chipEstado(c) {
    if (estaPagada(c)) return `<span class="pn-chip pn-ok">${I.ok}Pagada${c.fechaPago ? ' el ' + esc(c.fechaPago.slice(0, 5)) : ''}</span>`;
    if (c.vencida) return `<span class="pn-chip pn-mal">${I.alerta}Vencida</span>`;
    if (esFutura(c)) return `<span class="pn-chip pn-gris">${I.reloj}${desde(c)}</span>`;
    return `<span class="pn-chip pn-pend">${I.reloj}Pendiente</span>`;
  }
  const vigentes = () => datos.cuotas.filter(c => !esFutura(c));
  const cuotasDe = email => datos.cuotas.filter(c => c.email === email);
  function estadoCuota(email) {
    const todas = cuotasDe(email);
    const cs = todas.filter(c => !esFutura(c));
    if (!cs.length) return todas.length ? 'al-dia' : null;   // solo tiene cuotas de un mes que no empezó
    if (cs.some(c => c.vencida)) return 'vencida';
    if (cs.some(c => !/pagad/i.test(c.estado))) return 'pendiente';
    return 'al-dia';
  }
  function chipCuota(e) {
    if (e === 'vencida') return `<span class="pn-chip pn-mal">${I.alerta}Cuota vencida</span>`;
    if (e === 'pendiente') return `<span class="pn-chip pn-pend">${I.reloj}Cuota pendiente</span>`;
    if (e === 'al-dia') return `<span class="pn-chip pn-ok">${I.ok}Al día</span>`;
    return '<span class="pn-chip pn-gris">Sin cuotas</span>';
  }
  const chipApp = a => a.app ? `<span class="pn-chip pn-ok" title="Le llegan los avisos al celular">${I.campana}Recibe avisos</span>`
                             : '<span class="pn-chip pn-gris" title="Todavía no instaló la app del portal o no aceptó las notificaciones">Sin avisos</span>';
  const listaCursos = () => Array.from(new Set(datos.alumnos.flatMap(a => a.cursos.map(c => c.curso)).filter(Boolean))).sort();
  const listaCursoNivel = () => Array.from(new Set(datos.alumnos.flatMap(a => a.cursos.filter(c => c.curso && c.nivel).map(c => c.curso + ' · ' + c.nivel)))).sort();
  const estaPagada = c => /pagad/i.test(c.estado);

  // Mismo criterio que el script: «Todos», un curso, «Curso · Nivel», un nivel, un día («Lunes»),
  // un día y horario («Lunes 19:00») o mails; varios separados por coma.
  const DIA_HORA = /^([a-záéíóúü]+)\s+(\d{1,2}:\d{2})$/i;
  function coincide(p, a) {
    const q = sinTildes(p);
    if (p.indexOf('@') > 0) return q === a.email;
    const dh = p.match(DIA_HORA);
    return a.cursos.some(k => {
      if (dh) return sinTildes(k.dia) === sinTildes(dh[1]) && k.horaInicio === dh[2].padStart(5, '0');
      const curso = sinTildes(k.curso), nivel = sinTildes(k.nivel);
      if (q.indexOf('·') > 0) { const [c, n] = q.split('·').map(x => x.trim()); return c === curso && n === nivel; }
      return q === curso || q === nivel || q === sinTildes(k.dia);
    });
  }
  function alcance(para) {
    const lista = activos();
    let elegidos;
    if (para === '') elegidos = [];
    else if (!para || /^todos$/i.test(para)) elegidos = lista;
    else {
      const partes = para.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
      elegidos = lista.filter(a => partes.some(p => coincide(p, a)));
    }
    return { total: elegidos.length, conApp: elegidos.filter(a => a.app && a.novedades).length };
  }

  /* ---------- sesión ---------- */
  function tokenVigente(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000 > Date.now() + 60000; }
    catch (e) { return false; }
  }
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
        callback: r => { token = r.credential; ses.set(CLAVE_TOKEN, token); cargar(); },
        auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true
      });
      googleListo = true;
    }
    fn();
  }

  function iniciar() {
    sesion = loc.get(CLAVE_SESION);
    if (sesion) {
      const g = loc.get(CLAVE_DATOS);
      if (g) { try { datos = JSON.parse(g); conSesion(); mostrar(); } catch (e) { datos = null; } }
      cargar(!!datos);
      return;
    }
    const t = ses.get(CLAVE_TOKEN);
    if (t && tokenVigente(t)) { token = t; cargar(); return; }
    conGoogle(() => pantallaIngreso());
  }

  function olvidar() {
    ses.set(CLAVE_TOKEN, null); loc.set(CLAVE_SESION, null); loc.set(CLAVE_DATOS, null);
    token = null; sesion = null; datos = null;
    document.body.classList.remove('pn-con-sesion');
    nav.hidden = true;
    document.getElementById('lado-pie').hidden = true;
    document.querySelectorAll('.pn-solo-movil').forEach(e => { e.hidden = true; });
  }
  function salir() { olvidar(); conGoogle(() => { google.accounts.id.disableAutoSelect(); pantallaIngreso(); }); }

  async function api(accion, extra) {
    const r = await fetch(CFG.api, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ accion, sesion, token }, extra || {}))
    });
    return r.json();
  }

  // Respuesta del script: datos frescos del panel (o un error).
  function recibir(r) {
    if (r.error === 'sesion') { olvidar(); conGoogle(() => pantallaIngreso('Tu sesión venció. Volvé a entrar.')); return false; }
    if (r.error === 'no-admin') { olvidar(); conGoogle(() => pantallaSinAcceso(r.email)); return false; }
    if (r.error) throw new Error(r.error);
    if (r.sesion) { sesion = r.sesion; loc.set(CLAVE_SESION, sesion); ses.set(CLAVE_TOKEN, null); token = null; }
    delete r.sesion;
    datos = r; ultimaCarga = Date.now();
    loc.set(CLAVE_DATOS, JSON.stringify(r));
    return true;
  }

  async function cargar(enSegundoPlano) {
    if (!enSegundoPlano) vista.innerHTML = '<p class="pn-cargando">Cargando los datos de PTH…</p>';
    try {
      const antes = loc.get(CLAVE_DATOS);
      const r = await api('panel');
      if (!recibir(r)) return;
      conSesion();
      // En segundo plano solo se redibuja si algo cambió y no hay un formulario a medio escribir.
      if (!enSegundoPlano || (JSON.stringify(datos) !== antes && !escribiendo())) mostrar();
    } catch (e) {
      if (enSegundoPlano) return;
      vista.innerHTML = `<section class="pn-card" style="max-width:560px;margin:48px auto">
        <h1 class="pn-h2">No pudimos cargar los datos</h1>
        <p class="pn-muted">Revisá la conexión y probá de nuevo.</p>
        <div><button class="pn-btn pn-btn-negro" type="button" data-accion="reintentar">Reintentar</button></div></section>`;
    }
  }
  const escribiendo = () => rutaActual() === 'avisos' && (st.aviso.titulo || st.aviso.mensaje);

  function conSesion() {
    document.body.classList.add('pn-con-sesion');
    nav.hidden = false;
    document.getElementById('lado-pie').hidden = false;
    document.querySelectorAll('.pn-solo-movil').forEach(e => { e.hidden = false; });
    document.getElementById('cuenta-mail').textContent = (datos.admin && datos.admin.email) || '';
    if (datos.enlaces) document.getElementById('enlace-planilla').href = datos.enlaces.planilla;
  }

  /* ---------- pantallas sin sesión ---------- */
  function pantallaIngreso(msj) {
    vista.innerHTML = `
      <div class="pn-ingreso-pag">
        <section class="pn-ingreso">
          <img class="pn-ingreso-logo" src="../assets/img/pth-logo-horizontal.svg" alt="Professional Training Hub" width="133" height="52">
          <p class="pn-eyebrow">Panel de dirección</p>
          <h1 class="pn-h1">Todo PTH en un <em>solo lugar</em></h1>
          <p class="pn-muted">Alumnos, cuotas, avisos y devoluciones. Entrá con la cuenta de Google de PTH.</p>
          ${msj ? `<p class="pn-aviso" role="status">${esc(msj)}</p>` : ''}
          <div id="boton-google" class="pn-google"></div>
          <p class="pn-chico">Solo entra la cuenta prof.traininghub@gmail.com.</p>
        </section>
      </div>`;
    google.accounts.id.renderButton(document.getElementById('boton-google'),
      { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'es', width: 300 });
    google.accounts.id.prompt();
  }

  function pantallaSinAcceso(email) {
    vista.innerHTML = `
      <div class="pn-ingreso-pag">
        <section class="pn-ingreso">
          <img class="pn-ingreso-logo" src="../assets/img/pth-logo-horizontal.svg" alt="Professional Training Hub" width="133" height="52">
          <h1 class="pn-h2">Esta cuenta no tiene acceso al panel</h1>
          <p class="pn-muted">Entraste con <b>${esc(email)}</b>. El panel es solo para la cuenta de PTH (prof.traininghub@gmail.com).</p>
          <div><button class="pn-btn pn-btn-negro" type="button" data-accion="salir">Entrar con otra cuenta</button></div>
        </section>
      </div>`;
  }

  /* ---------- navegación ---------- */
  function rutaActual() { const r = location.hash.replace('#', ''); return RUTAS.indexOf(r) >= 0 ? r : 'inicio'; }
  function mostrar(conservarScroll) {
    if (!datos) return;
    const ruta = rutaActual();
    nav.querySelectorAll('a').forEach(a => {
      if (a.dataset.ruta === ruta) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const y = window.scrollY;
    vista.innerHTML = ({ inicio: vInicio, alumnos: vAlumnos, cuotas: vCuotas, avisos: vAvisos,
                         devoluciones: vDevoluciones, opiniones: vOpiniones })[ruta]();
    document.title = (ruta === 'inicio' ? 'Panel' : cap(ruta)) + ' | Panel de dirección PTH';
    if (conservarScroll) window.scrollTo(0, y);
  }
  window.addEventListener('hashchange', () => { st.confirmar = false; mostrar(); window.scrollTo(0, 0); vista.focus({ preventScroll: true }); });
  window.addEventListener('focus', () => { if (datos && Date.now() - ultimaCarga > 60000) cargar(true); });

  /* ---------- Inicio ---------- */
  function vInicio() {
    const d = hoy();
    const lista = activos();
    const cursos = new Set(lista.flatMap(a => a.cursos.map(nombreCurso)));
    const pendientes = vigentes().filter(c => !estaPagada(c));
    const vencidas = pendientes.filter(c => c.vencida);
    const delMes = datos.cuotas.filter(esDelMes);
    const cobrado = delMes.filter(estaPagada);
    const conApp = lista.filter(a => a.app).length;

    // Clases de hoy, agrupadas por curso y horario.
    const hoyNom = sinTildes(DIAS[d.getDay()]);
    const grupos = new Map();
    lista.forEach(a => a.cursos.forEach(c => {
      if (!c.activo || sinTildes(c.dia) !== hoyNom) return;
      const k = [c.horaInicio, c.horaFin, c.curso, c.nivel, c.meet].join('|');
      if (!grupos.has(k)) grupos.set(k, Object.assign({}, c, { alumnos: [] }));
      grupos.get(k).alumnos.push(a.nombre);
    }));
    const clases = Array.from(grupos.values()).sort((x, y) => String(x.horaInicio).localeCompare(String(y.horaInicio)));

    const prom = promedio();
    return `
      <header class="pn-cab"><div>
        <p class="pn-eyebrow">${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}</p>
        <h1 class="pn-h1">Hola, <em>Marian y Caro</em></h1>
        <p class="pn-lead">Así está PTH hoy.</p>
      </div></header>

      <section class="pn-kpis" aria-label="Resumen">
        <a class="pn-kpi pn-kpi-negro" href="#alumnos"><span class="pn-kpi-label">Alumnos activos</span>
          <span class="pn-kpi-valor">${lista.length}</span><span class="pn-kpi-sub">en ${plural(cursos.size, 'curso')}</span></a>
        <a class="pn-kpi" href="#cuotas" data-accion="ver-cuotas" data-filtro="pendientes"><span class="pn-kpi-label">Cuotas pendientes</span>
          <span class="pn-kpi-valor">${pendientes.length}</span>
          <span class="pn-kpi-sub">${plata(pendientes.reduce((t, c) => t + c.importe, 0))}${vencidas.length ? ' · ' + plural(vencidas.length, 'vencida') : ''}</span></a>
        <a class="pn-kpi" href="#cuotas" data-accion="ver-cuotas" data-filtro="pagadas" data-mes="${esc((delMes[0] || {}).mes || '')}"><span class="pn-kpi-label">Cobrado en ${esc(MESES[d.getMonth()])}</span>
          <span class="pn-kpi-valor">${plata(cobrado.reduce((t, c) => t + c.importe, 0))}</span>
          <span class="pn-kpi-sub">${cobrado.length} de ${plural(delMes.length, 'cuota')}</span></a>
        <a class="pn-kpi" href="#avisos"><span class="pn-kpi-label">Reciben avisos</span>
          <span class="pn-kpi-valor">${conApp}<small class="pn-muted" style="font-size:.5em;font-weight:700"> / ${lista.length}</small></span>
          <span class="pn-kpi-sub">${lista.length ? Math.round(conApp * 100 / lista.length) : 0}% tiene la app con avisos</span></a>
      </section>

      <div class="pn-grid pn-grid-2">
        <section class="pn-card">
          <div class="pn-card-cab"><h2 class="pn-h2">Clases de hoy</h2><span class="pn-chico">${plural(clases.length, 'clase')}</span></div>
          ${clases.length ? `<ul class="pn-lista">${clases.map(c => `
            <li><span class="pn-hora">${esc(c.horaInicio || '—')}</span>
              <span class="pn-lista-txt"><b>${esc(nombreCurso(c))}</b>
              <span class="pn-chico">${esc(plural(c.alumnos.length, 'alumno'))}: ${esc(c.alumnos.slice(0, 4).join(', '))}${c.alumnos.length > 4 ? '…' : ''}</span></span>
              ${url(c.meet) ? `<a class="pn-btn pn-btn-borde pn-btn-chico" ${ext} href="${url(c.meet)}" aria-label="Abrir Meet de ${esc(nombreCurso(c))}">${I.meet}Meet</a>` : ''}
            </li>`).join('')}</ul>` : '<p class="pn-vacio">Hoy no hay clases cargadas.</p>'}
        </section>

        <section class="pn-card">
          <div class="pn-card-cab"><h2 class="pn-h2">Cuotas vencidas</h2>
            ${vencidas.length > 5 ? `<a class="pn-link" href="#cuotas" data-accion="ver-cuotas" data-filtro="vencidas">Ver las ${vencidas.length}</a>` : ''}</div>
          ${vencidas.length ? `<ul class="pn-lista">${vencidas.slice(0, 5).map(c => `
            <li><span class="pn-lista-txt"><b>${esc(c.nombre)}</b><span class="pn-chico">${esc(c.mes)} · ${esc(c.monto)} · venció el ${esc(c.vence)}</span></span>
              ${botonCuota(c)}</li>`).join('')}</ul>` : '<p class="pn-vacio">No hay cuotas vencidas.</p>'}
        </section>
      </div>

      <div class="pn-grid pn-grid-2">
        <section class="pn-card">
          <div class="pn-card-cab"><h2 class="pn-h2">Últimas devoluciones</h2><a class="pn-link" href="#devoluciones">Ver todas</a></div>
          ${datos.devoluciones.length ? `<ul class="pn-lista">${datos.devoluciones.slice(0, 3).map(v => `
            <li><span class="pn-ini">${esc(iniciales(v.alumno))}</span><span class="pn-lista-txt"><b>${esc(v.alumno)}</b>
              <span class="pn-chico">${esc(v.docente || 'Docente')} · ${esc(v.fecha)}</span></span></li>`).join('')}</ul>`
            : '<p class="pn-vacio">Todavía no hay devoluciones.</p>'}
        </section>
        <section class="pn-card">
          <div class="pn-card-cab"><h2 class="pn-h2">Lo que opinan</h2><a class="pn-link" href="#opiniones">Ver todas</a></div>
          ${datos.opiniones.length ? `
            <div class="pn-acciones" style="gap:16px"><span class="pn-promedio">${prom.toFixed(1).replace('.', ',')}</span>
              <span><span class="pn-estrellas" aria-hidden="true">${estrellas(Math.round(prom))}</span><br><span class="pn-chico">${plural(datos.opiniones.length, 'opinión', 'opiniones')}</span></span></div>
            ${datos.opiniones[0].sirve || datos.opiniones[0].cambiaria ? `<p class="pn-muted">«${esc(datos.opiniones[0].sirve || datos.opiniones[0].cambiaria)}» <span class="pn-chico">— ${esc(datos.opiniones[0].nombre)}</span></p>` : ''}`
            : '<p class="pn-vacio">Todavía no hay opiniones.</p>'}
        </section>
      </div>
      ${vPendientesDeCarga(lista)}`;
  }

  // Lo que falta completar en la planilla para que el portal se vea bien.
  function vPendientesDeCarga(lista) {
    const tareas = [];
    const nombres = arr => arr.slice(0, 12).map(esc).join(', ') + (arr.length > 12 ? ` y ${arr.length - 12} más` : '');
    const sinMail = datos.alumnos.filter(a => a.activo && !a.email).map(a => a.nombre || 'Fila ' + a.fila);
    if (sinMail.length) tareas.push(['sin mail de Google: no pueden entrar al portal', sinMail]);
    const sinNivel = lista.filter(a => a.cursos.some(c => !c.nivel)).map(a => a.nombre);
    if (sinNivel.length) tareas.push(['sin nivel: no ven su programa', sinNivel]);
    const sinDia = lista.filter(a => a.cursos.some(c => !c.dia || !c.horaInicio)).map(a => a.nombre);
    if (sinDia.length) tareas.push(['sin día u horario: no reciben el aviso de clase', sinDia]);
    const sinPrograma = Array.from(new Set(lista.flatMap(a => a.cursos.filter(c => c.curso && c.nivel && !c.programa).map(nombreCurso))));
    if (sinPrograma.length) tareas.push(['cursos sin módulos en Programas', sinPrograma]);
    // Solo si ya empezaron a cargar las cuotas del mes: muestra a quién le falta.
    const conCuota = new Set(datos.cuotas.filter(esDelMes).map(c => c.email));
    const sinCuota = conCuota.size ? lista.filter(a => a.email && !conCuota.has(a.email)).map(a => a.nombre) : [];
    if (sinCuota.length) tareas.push([`sin la cuota de ${mesActual()} cargada`, sinCuota]);
    if (!tareas.length) return '';
    return `
      <section class="pn-card pn-card-crema">
        <div class="pn-card-cab"><h2 class="pn-h2">Para completar en la planilla</h2>
          ${datos.enlaces ? `<a class="pn-link" ${ext} href="${url(datos.enlaces.planilla)}">Abrir la planilla</a>` : ''}</div>
        <div class="pn-tareas">${tareas.map(([t, l]) => `
          <details><summary><b>${l.length}</b><span>${t.charAt(0) === 'c' ? cap(t) : 'Alumnos ' + t}</span></summary><p>${nombres(l)}</p></details>`).join('')}</div>
      </section>`;
  }

  /* ---------- Alumnos ---------- */
  function vAlumnos() {
    return `
      <header class="pn-cab"><div><p class="pn-eyebrow">Alumnos</p><h1 class="pn-h1">Quién cursa y cómo va</h1>
        <p class="pn-lead">Con los botones − y + pasan a un alumno de módulo; el portal y su barra de avance se actualizan solos.</p>
        <p class="pn-chico">«Recibe avisos»: instaló la app del portal y le llegan las notificaciones al celular. «Sin avisos»: todavía no, así que los avisos no le llegan.</p></div></header>
      <div class="pn-herr">
        <label class="pn-buscar">${I.buscar}
          <input class="pn-input" type="search" id="buscar-alumno" placeholder="Buscar por nombre o mail" aria-label="Buscar alumno" value="${esc(st.buscar)}" autocomplete="off"></label>
        <select class="pn-select" id="filtro-curso" aria-label="Filtrar por curso">
          <option value="">Todos los cursos</option>
          ${listaCursos().map(c => `<option${c === st.curso ? ' selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <label class="pn-check"><input type="checkbox" id="ver-inactivos"${st.inactivos ? ' checked' : ''}> Ver inactivos</label>
      </div>
      <div id="resultados">${listaAlumnos()}</div>`;
  }

  function listaAlumnos() {
    const q = sinTildes(st.buscar);
    const lista = alumnos().filter(a =>
      (st.inactivos || a.activo) &&
      (!st.curso || a.cursos.some(c => c.curso === st.curso)) &&
      (!q || sinTildes(a.nombre).indexOf(q) >= 0 || a.email.indexOf(q) >= 0));
    if (!lista.length) return '<p class="pn-vacio">No hay alumnos con ese filtro.</p>';
    return `<p class="pn-cuenta-n">${plural(lista.length, 'alumno')}</p><div class="pn-alumnos">${lista.map(fichaAlumno).join('')}</div>`;
  }

  function fichaAlumno(a) {
    const id = a.email || 'f' + a.filas[0];
    const abierto = st.abierto === id;
    const cs = cuotasDe(a.email).slice().reverse();
    const devs = datos.devoluciones.filter(v => v.email && v.email === a.email);
    return `
      <article class="pn-alumno${a.activo ? '' : ' pn-inactivo'}">
        <div class="pn-alumno-cab">
          <span class="pn-ini" aria-hidden="true">${esc(iniciales(a.nombre))}</span>
          <span class="pn-alumno-nom"><b>${esc(a.nombre || 'Sin nombre')}</b><span>${esc(a.email || 'Sin mail cargado')}</span></span>
          <span class="pn-alumno-est">${a.activo ? '' : '<span class="pn-chip pn-gris">Inactivo</span>'}${chipCuota(estadoCuota(a.email))}${chipApp(a)}
            <button class="pn-link" type="button" data-accion="ficha" data-id="${esc(id)}" aria-expanded="${abierto}">${abierto ? 'Cerrar' : 'Ver ficha'}</button></span>
        </div>
        ${a.cursos.map(c => {
          const pct = c.total ? Math.min(100, Math.round(Math.max(0, c.modulo - 1) * 100 / c.total)) : 0;
          const terminado = c.total && c.modulo > c.total;
          return `
          <div class="pn-curso">
            <span class="pn-curso-nom"><b>${esc(nombreCurso(c))}</b><span>${esc(horario(c))}</span></span>
            <span class="pn-avance"><span>${terminado ? 'Nivel terminado' : c.modulo ? `Módulo ${c.modulo}${c.total ? ' de ' + c.total : ''} · ${pct}% del nivel` : 'Sin módulo cargado'}</span>
              <span class="pn-barra" aria-hidden="true"><span style="width:${pct}%"></span></span></span>
            <span class="pn-paso" role="group" aria-label="Módulo actual de ${esc(a.nombre)} en ${esc(c.curso)}">
              <button type="button" data-accion="modulo" data-fila="${c.fila}" data-indice="${c.indice}" data-email="${esc(c.email)}" data-valor="${c.modulo - 1}"
                aria-label="${c.modulo === 1 ? 'Volver a sin módulo' : 'Bajar un módulo'}"${c.modulo < 1 || !c.email ? ' disabled' : ''}>−</button>
              <output>${terminado ? 'Terminado' : c.modulo ? 'Módulo ' + c.modulo : 'Sin módulo'}</output>
              <button type="button" data-accion="modulo" data-fila="${c.fila}" data-indice="${c.indice}" data-email="${esc(c.email)}" data-valor="${(c.modulo || 0) + 1}"
                aria-label="${c.total && c.modulo === c.total ? 'Marcar el nivel como terminado' : 'Pasar al módulo siguiente'}"${!c.email || terminado ? ' disabled' : ''}>+</button>
            </span>
          </div>`;
        }).join('')}
        ${abierto ? `
        <div class="pn-ficha">
          <div><h3>Clase</h3><ul>${a.cursos.map(c => `<li><span>${esc(c.curso || 'Curso')}</span><span class="pn-acciones">
            ${url(c.meet) ? `<a class="pn-link" ${ext} href="${url(c.meet)}">Meet</a>` : ''}${url(c.classroom) ? `<a class="pn-link" ${ext} href="${url(c.classroom)}">Classroom</a>` : ''}
            ${!url(c.meet) && !url(c.classroom) ? '<span class="pn-muted">Sin links</span>' : ''}</span></li>`).join('')}
            ${a.email ? `<li><button class="pn-link" type="button" data-accion="copiar" data-texto="${esc(a.email)}">Copiar mail</button></li>` : ''}</ul></div>
          <div><h3>Cuotas</h3>${cs.length ? `<ul>${cs.slice(0, 4).map(c => `<li><span>${esc(c.mes)} · ${esc(c.monto)}</span>${chipEstado(c)}</li>`).join('')}</ul>` : '<p class="pn-muted">Sin cuotas cargadas.</p>'}</div>
          <div><h3>Devoluciones</h3>${devs.length ? `<ul>${devs.slice(0, 3).map(v => `<li><span>${esc(v.fecha)}</span><span class="pn-muted">${esc(v.docente)}</span></li>`).join('')}</ul>` : '<p class="pn-muted">Todavía no tiene.</p>'}</div>
        </div>` : ''}
      </article>`;
  }

  /* ---------- Cuotas ---------- */
  function mesesDeCuotas() {
    const ms = [];
    datos.cuotas.forEach(c => { if (c.mes && ms.indexOf(c.mes) < 0) ms.push(c.mes); });
    return ms;
  }
  function botonCuota(c) {
    const a = `data-accion="cuota" data-fila="${c.fila}" data-email="${esc(c.email)}" data-mes="${esc(c.mes)}"`;
    return estaPagada(c)
      ? `<button class="pn-link" type="button" ${a} data-estado="Pendiente">Deshacer</button>`
      : `<button class="pn-btn pn-btn-amarillo pn-btn-chico" type="button" ${a} data-estado="Pagado">${I.ok}Marcar pagada</button>`;
  }
  function vCuotas() {
    const meses = mesesDeCuotas();
    if (st.mes === null) {
      // Por defecto, el mes en curso; si no está cargado, el último mes que ya empezó.
      const pasados = meses.filter(m => !esFutura(datos.cuotas.find(c => c.mes === m)));
      const actual = meses.find(m => esDelMes(datos.cuotas.find(c => c.mes === m)));
      st.mes = actual || pasados[pasados.length - 1] || '';
    }
    const etiquetaMes = m => { const c = datos.cuotas.find(x => x.mes === m); return esFutura(c) ? m + ' (todavía no empezó)' : m; };
    const filtros = [['pendientes', 'Pendientes'], ['vencidas', 'Vencidas'], ['pagadas', 'Pagadas'], ['todas', 'Todas']];
    return `
      <header class="pn-cab"><div><p class="pn-eyebrow">Cuotas</p><h1 class="pn-h1">Quién pagó y quién no</h1>
        <p class="pn-lead">Cuando confirman una transferencia, toquen «Marcar pagada»: el alumno lo ve en su portal y dejan de llegarle recordatorios.</p></div></header>
      <div class="pn-herr">
        <select class="pn-select" id="filtro-mes" aria-label="Mes">
          <option value="">Todos los meses que ya empezaron</option>
          ${meses.map(m => `<option value="${esc(m)}"${m === st.mes ? ' selected' : ''}>${esc(etiquetaMes(m))}</option>`).join('')}
        </select>
        <div class="pn-seg" role="group" aria-label="Estado">${filtros.map(([k, t]) =>
          `<button type="button" data-accion="filtro-cuota" data-filtro="${k}" aria-pressed="${st.filtro === k}">${t}</button>`).join('')}</div>
        <label class="pn-buscar">${I.buscar}<input class="pn-input" type="search" id="buscar-cuota" placeholder="Buscar alumno" value="${esc(st.buscarCuota)}" aria-label="Buscar alumno" autocomplete="off"></label>
      </div>
      <div id="resultados">${listaCuotas()}</div>`;
  }
  function listaCuotas() {
    const delMes = st.mes ? datos.cuotas.filter(c => c.mes === st.mes) : vigentes();
    const futuro = delMes.length && delMes.every(esFutura);
    const total = delMes.reduce((t, c) => t + c.importe, 0);
    const pagadas = delMes.filter(estaPagada);
    const cobrado = pagadas.reduce((t, c) => t + c.importe, 0);
    const vencidas = delMes.filter(c => c.vencida).length;
    const pct = total ? Math.round(cobrado * 100 / total) : 0;
    const q = sinTildes(st.buscarCuota);
    const lista = delMes.filter(c =>
      (st.filtro === 'todas' || (st.filtro === 'pagadas' ? estaPagada(c) : st.filtro === 'vencidas' ? c.vencida : !estaPagada(c))) &&
      (!q || sinTildes(c.nombre).indexOf(q) >= 0 || c.email.indexOf(q) >= 0))
      .sort((x, y) => (estaPagada(x) - estaPagada(y)) || (y.vencida - x.vencida) || x.nombre.localeCompare(y.nombre, 'es'));
    return `
      <section class="pn-card pn-resumen-cobro">
        <div class="pn-cifras"><b>${plata(cobrado)}</b><span class="pn-muted">cobrado de ${plata(total)}${st.mes ? ' en ' + esc(st.mes.toLowerCase()) : ''}</span></div>
        <div class="pn-barra pn-barra-grande" role="img" aria-label="${pct}% cobrado"><span style="width:${pct}%"></span></div>
        ${futuro ? '<p class="pn-chico">Este mes todavía no empezó: estas cuotas cuentan como pendientes desde el día 1. Si alguien paga antes, ya pueden marcarla.</p>' : ''}
        <p class="pn-chico">${plural(pagadas.length, 'pagada')} · ${plural(delMes.length - pagadas.length, 'pendiente')}${vencidas ? ' · ' + plural(vencidas, 'vencida') : ''}</p>
      </section>
      <section class="pn-card">
        ${lista.length ? `<ul class="pn-lista pn-tabla-cuotas">${lista.map(c => `
          <li><span class="pn-lista-txt"><b>${esc(c.nombre)}</b><span class="pn-chico">${esc(c.mes)}</span></span>
            <span class="pn-cuota-info"><span class="pn-cuota-dato">${esc(c.monto)}</span>
            <span class="pn-cuota-dato"><small>Vence</small>${esc(c.vence || '—')}</span>
            <span class="pn-cuota-dato">${chipEstado(c)}</span></span>
            <span class="pn-cuota-acc">${botonCuota(c)}</span></li>`).join('')}</ul>`
          : `<p class="pn-vacio">${datos.cuotas.length ? 'No hay cuotas con ese filtro.' : 'Todavía no hay cuotas cargadas en la planilla.'}</p>`}
      </section>`;
  }

  /* ---------- Avisos ---------- */
  function vAvisos() {
    const v = st.aviso;
    return `
      <header class="pn-cab"><div><p class="pn-eyebrow">Avisos</p><h1 class="pn-h1">Mandá una notificación al celular</h1>
        <p class="pn-lead">Les llega a los alumnos que tienen la app con los avisos activados. Para todo lo demás, sigue estando WhatsApp.</p></div></header>
      <div class="pn-grid pn-grid-3-1">
        <section class="pn-card">
          <div class="pn-campo"><span>Para</span>
            <div class="pn-seg" role="group" aria-label="Destinatarios">
              <button type="button" data-accion="dest-todos" data-valor="1" aria-pressed="${v.todos}">Todos los alumnos</button>
              <button type="button" data-accion="dest-todos" data-valor="0" aria-pressed="${!v.todos}">Elegir</button>
            </div>
            <div id="av-dest">${v.todos ? '' : selectorDestinos()}</div>
          </div>
          <label class="pn-campo"><span>Título</span>
            <input class="pn-input" id="av-titulo" maxlength="80" value="${esc(v.titulo)}" placeholder="Ej.: Seminario con Debs" autocomplete="off">
            <small>Corto: es lo primero que se lee.</small></label>
          <label class="pn-campo"><span>Mensaje</span>
            <textarea class="pn-textarea" id="av-mensaje" maxlength="300" placeholder="Ej.: Inscribite al encuentro del jueves a las 19 h.">${esc(v.mensaje)}</textarea></label>
          <label class="pn-campo"><span>Link <span class="pn-muted" style="font-weight:400">(opcional)</span></span>
            <input class="pn-input" id="av-link" type="url" inputmode="url" value="${esc(v.link)}" placeholder="https://…" autocomplete="off">
            <small>Se abre al tocar el aviso. Si lo dejan vacío, abre el portal.</small></label>
          <label class="pn-check"><input type="checkbox" id="av-programar"${v.programar ? ' checked' : ''}> Programarlo para más tarde</label>
          ${v.programar ? `<label class="pn-campo"><span>Fecha y hora</span><input class="pn-input" id="av-cuando" type="datetime-local" value="${esc(v.cuando)}"></label>` : ''}
          <div class="pn-acciones" id="av-botones">${botonesAviso()}</div>
        </section>
        <div class="pn-grid">
          <div id="av-preview">${previewAviso()}</div>
          ${vMensajeInicio()}
        </div>
      </div>
      <section class="pn-card">
        <div class="pn-card-cab"><h2 class="pn-h2">Enviados y programados</h2><span class="pn-chico">Los automáticos de clase y de cuota no aparecen acá</span></div>
        ${datos.avisos.length ? `<ul class="pn-lista pn-historial">${datos.avisos.map(a => `
          <li><span class="pn-lista-txt"><b>${esc(a.titulo)}</b>${a.mensaje ? `<p>${esc(a.mensaje)}</p>` : ''}
            <span class="pn-chico">Para: ${esc(paraLegible(a.para))}${a.cuando ? ' · ' + esc(a.cuando) : ''}</span></span>
            ${a.estado ? `<span class="pn-chip ${/^Enviado/.test(a.estado) ? 'pn-ok' : 'pn-gris'}">${esc(a.estado.replace(/ dispositivos?$/, ' disp.'))}</span>` : `<span class="pn-chip pn-pend">${I.reloj}${a.cuando ? 'Programado' : 'En camino'}</span>`}</li>`).join('')}</ul>`
          : '<p class="pn-vacio">Todavía no mandaron avisos.</p>'}
      </section>`;
  }
  // Nombre legible de un destinatario: mail → nombre del alumno; «Lunes» → «Todo el lunes».
  function etiquetaDest(t) {
    if (t.indexOf('@') > 0) { const a = datos.alumnos.find(x => x.email === t.toLowerCase()); return a ? a.nombre : t; }
    if (DIAS.some(d => sinTildes(d) === sinTildes(t))) return 'Todo el ' + t.toLowerCase();
    return t;
  }
  function paraLegible(p) {
    if (!p || /^todos$/i.test(p)) return 'Todos';
    const ts = p.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).map(etiquetaDest);
    return ts.length > 4 ? ts.slice(0, 4).join(', ') + ' y ' + (ts.length - 4) + ' más' : ts.join(', ');
  }
  const ORDEN_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

  // Selector de varios destinatarios: por día, por día y horario, por curso o alumno por alumno.
  function selectorDestinos() {
    const v = st.aviso, sel = new Set(v.dest);
    const chip = (token, texto, extra) => `<button type="button" class="pn-opcion" data-accion="dest" data-token="${esc(token)}" aria-pressed="${sel.has(token)}"${extra || ''}>${esc(texto)}</button>`;
    // Clases agrupadas por día y horario
    const dias = new Map();
    activos().forEach(a => a.cursos.forEach(c => {
      if (!c.activo || !c.dia || !c.horaInicio) return;
      const d = cap(c.dia.trim());
      if (!dias.has(d)) dias.set(d, new Map());
      const hs = dias.get(d);
      if (!hs.has(c.horaInicio)) hs.set(c.horaInicio, { alumnos: new Set(), cursos: new Set() });
      hs.get(c.horaInicio).alumnos.add(a.email || a.nombre);
      hs.get(c.horaInicio).cursos.add(c.curso);
    }));
    const diasOrd = Array.from(dias.keys()).sort((x, y) => ORDEN_DIAS.indexOf(sinTildes(x)) - ORDEN_DIAS.indexOf(sinTildes(y)));
    const q = sinTildes(st.buscarDest);
    return `
      <div class="pn-elegidos">${v.dest.length ? v.dest.map(t => `<button type="button" class="pn-elegido" data-accion="dest" data-token="${esc(t)}" aria-label="Quitar ${esc(etiquetaDest(t))}">${esc(etiquetaDest(t))}<span aria-hidden="true">×</span></button>`).join('')
        + '<button type="button" class="pn-link" data-accion="dest-limpiar">Quitar todos</button>' : '<span class="pn-chico">Elegí alumnos, días u horarios. Pueden ser varios.</span>'}</div>
      <details class="pn-grupo"${q ? ' open' : ''}><summary>Alumnos</summary>
        <label class="pn-buscar">${I.buscar}<input class="pn-input" type="search" id="buscar-dest" placeholder="Buscar alumno" aria-label="Buscar alumno" value="${esc(st.buscarDest)}" autocomplete="off"></label>
        <div class="pn-opciones" id="av-alumnos">${opcionesAlumnos()}</div>
      </details>
      <details class="pn-grupo"><summary>Por día y horario <span class="pn-chico">ideal para feriados</span></summary>
        ${diasOrd.length ? diasOrd.map(d => {
          const todoElDia = sel.has(d);
          const hs = Array.from(dias.get(d).entries()).sort((x, y) => x[0].localeCompare(y[0]));
          return `<div class="pn-dia"><b>${esc(d)}</b><div class="pn-opciones">${chip(d, 'Todo el día')}
            ${hs.map(([h, x]) => chip(d + ' ' + h, h + ' · ' + x.alumnos.size, todoElDia ? ' disabled title="Ya está todo el día"' : ` title="${esc(Array.from(x.cursos).join(', '))}"`)).join('')}</div></div>`;
        }).join('') : '<p class="pn-chico">No hay días y horarios cargados en Alumnos.</p>'}
      </details>`;
  }
  function opcionesAlumnos() {
    const sel = new Set(st.aviso.dest), q = sinTildes(st.buscarDest);
    const lista = activos().filter(a => a.email && (!q || sinTildes(a.nombre).indexOf(q) >= 0));
    return lista.length ? lista.map(a => `<button type="button" class="pn-opcion" data-accion="dest" data-token="${esc(a.email)}" aria-pressed="${sel.has(a.email)}">${esc(a.nombre)}</button>`).join('')
      : '<span class="pn-chico">Ningún alumno con ese nombre.</span>';
  }
  function actualizarDestinos(redibujar) {
    const v = st.aviso;
    v.para = v.todos ? 'Todos' : v.dest.join(', ');
    st.confirmar = false;
    if (redibujar) {
      const y = window.scrollY;
      const abiertos = Array.from(document.querySelectorAll('#av-dest details')).map(d => d.open);
      pintar('av-dest', v.todos ? '' : selectorDestinos());
      document.querySelectorAll('#av-dest details').forEach((d, i) => { if (abiertos[i] !== undefined) d.open = abiertos[i]; });
      document.querySelectorAll('[data-accion="dest-todos"]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.valor === '1') === v.todos)));
      window.scrollTo(0, y);
    }
    pintar('av-preview', previewAviso()); pintar('av-botones', botonesAviso());
  }
  function botonesAviso() {
    const v = st.aviso, n = alcance(v.para);
    if (st.enviando) return '<button class="pn-btn pn-btn-negro" type="button" disabled>Enviando…</button>';
    if (st.confirmar) return `
      <button class="pn-btn pn-btn-amarillo" type="button" data-accion="aviso-enviar">${I.enviar}${v.programar ? 'Sí, programarlo' : `Sí, enviar a ${plural(n.conApp, 'alumno')}`}</button>
      <button class="pn-link" type="button" data-accion="aviso-cancelar">Cancelar</button>`;
    if (!v.todos && !v.dest.length) return `<button class="pn-btn pn-btn-negro" type="button" disabled>${I.enviar}Enviar aviso</button>
      <span class="pn-chico">Elegí a quién mandarlo.</span>`;
    if (!v.programar && !n.conApp) return `<button class="pn-btn pn-btn-negro" type="button" disabled>${I.enviar}Enviar aviso</button>
      <span class="pn-chico">Ninguno de los elegidos tiene la app con avisos todavía.</span>`;
    return `<button class="pn-btn pn-btn-negro" type="button" data-accion="aviso-confirmar"${!v.titulo.trim() ? ' disabled' : ''}>${I.enviar}${v.programar ? 'Programar aviso' : 'Enviar aviso'}</button>`;
  }
  function previewAviso() {
    const v = st.aviso, n = alcance(v.para), d = hoy();
    const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return `
      <div class="pn-preview" aria-label="Así se ve en el celular">
        <p class="pn-preview-hora">${hh}</p><p class="pn-preview-fecha">${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}</p>
        <div class="pn-notif"><img src="../assets/img/pth-app-192.png" alt="" width="36" height="36">
          <small>PTH · ahora</small><b>${esc(v.titulo || 'Título del aviso')}</b><p>${esc(v.mensaje || 'El mensaje aparece acá.')}</p></div>
      </div>
      <div class="pn-alcance" style="margin-top:12px"><b>${n.conApp}</b><span>${n.conApp === 1 ? 'alumno lo recibe' : 'alumnos lo reciben'} ahora, de ${plural(n.total, 'elegido')}. ${n.total > n.conApp ? 'Al resto avísenle por WhatsApp.' : ''}</span></div>`;
  }
  function vMensajeInicio() {
    return `
      <section class="pn-card">
        <h2 class="pn-h2">Mensaje en el portal</h2>
        <p class="pn-chico">Aparece arriba de todo en el inicio del portal de todos los alumnos. Ej.: «El lunes 24 no hay clases por feriado».</p>
        <textarea class="pn-textarea" id="mensaje-inicio" maxlength="300" aria-label="Mensaje del inicio">${esc(datos.mensaje)}</textarea>
        <div class="pn-acciones"><button class="pn-btn pn-btn-negro pn-btn-chico" type="button" data-accion="mensaje-guardar">Guardar</button>
          ${datos.mensaje ? '<button class="pn-link" type="button" data-accion="mensaje-quitar">Quitar el mensaje</button>' : ''}</div>
      </section>`;
  }

  /* ---------- Devoluciones ---------- */
  function vDevoluciones() {
    const docentes = Array.from(new Set(datos.devoluciones.map(v => v.docente).filter(Boolean))).sort();
    return `
      <header class="pn-cab"><div><p class="pn-eyebrow">Devoluciones</p><h1 class="pn-h1">Lo que escriben las docentes</h1>
        <p class="pn-lead">Cada devolución aparece también en «Tu progreso», en el portal del alumno.</p></div>
        ${datos.enlaces ? `<div class="pn-acciones"><a class="pn-btn pn-btn-borde pn-btn-chico" ${ext} href="${url(datos.enlaces.formulario)}">${I.afuera}Abrir el formulario</a>
          <button class="pn-btn pn-btn-negro pn-btn-chico" type="button" data-accion="copiar" data-texto="${esc(datos.enlaces.formulario)}">Copiar link para docentes</button></div>` : ''}
      </header>
      <div class="pn-herr">
        <label class="pn-buscar">${I.buscar}<input class="pn-input" type="search" id="buscar-dev" placeholder="Buscar alumno" value="${esc(st.buscarDev)}" aria-label="Buscar alumno" autocomplete="off"></label>
        <select class="pn-select" id="filtro-docente" aria-label="Docente"><option value="">Todas las docentes</option>
          ${docentes.map(d => `<option${d === st.docente ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select>
      </div>
      <div id="resultados">${listaDevoluciones()}</div>`;
  }
  function listaDevoluciones() {
    const q = sinTildes(st.buscarDev);
    const lista = datos.devoluciones.filter(v => (!st.docente || v.docente === st.docente) && (!q || sinTildes(v.alumno).indexOf(q) >= 0));
    if (!lista.length) return `<p class="pn-vacio">${datos.devoluciones.length ? 'No hay devoluciones con ese filtro.' : 'Todavía no hay devoluciones. Pásenles a las docentes el link del formulario.'}</p>`;
    return `<p class="pn-cuenta-n">${plural(lista.length, 'devolución', 'devoluciones')}</p><div class="pn-devs">${lista.map(v => `
      <article class="pn-dev">
        <div class="pn-dev-cab"><span class="pn-lista-txt"><b>${esc(v.alumno)}</b><span class="pn-chico">${esc(v.docente || 'Docente')} · ${esc(v.fecha)}</span></span></div>
        ${v.habilidades.some(h => h.nivel) ? `<div class="pn-habs">${v.habilidades.map(h => `<span class="pn-hab${h.nivel === 'Destacado' ? ' pn-hab-destacado' : ''}">${esc(h.nombre)}<b>${esc(h.nivel || '—')}</b></span>`).join('')}</div>` : ''}
        <dl>${[['Lo que hace muy bien', v.bien], ['Para seguir trabajando', v.seguir], ['Mensaje para el alumno', v.mensaje]]
          .filter(x => x[1]).map(x => `<div><dt>${x[0]}</dt><dd>${esc(x[1])}</dd></div>`).join('')}</dl>
      </article>`).join('')}</div>`;
  }

  /* ---------- Opiniones ---------- */
  function promedio() {
    const con = datos.opiniones.filter(o => o.nota);
    return con.length ? con.reduce((t, o) => t + o.nota, 0) / con.length : 0;
  }
  const estrellas = n => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
  function vOpiniones() {
    const ops = datos.opiniones, prom = promedio();
    const dist = [5, 4, 3, 2, 1].map(n => [n, ops.filter(o => o.nota === n).length]);
    const max = Math.max(1, ...dist.map(d => d[1]));
    return `
      <header class="pn-cab"><div><p class="pn-eyebrow">Opiniones</p><h1 class="pn-h1">Lo que dicen los alumnos</h1>
        <p class="pn-lead">Las mandan desde «Tu opinión» en el portal. Pueden ser anónimas.</p></div></header>
      ${ops.length ? `
      <div class="pn-grid pn-grid-3-1">
        <section class="pn-card">${ops.map(o => `
          <article class="pn-lista-txt" style="gap:6px;padding-bottom:14px;border-bottom:1px solid var(--linea)">
            <div class="pn-dev-cab"><b>${esc(o.nombre || 'Anónimo')}</b><span class="pn-estrellas" aria-label="${o.nota} de 5">${estrellas(o.nota)}</span></div>
            <span class="pn-chico">${esc(o.fecha)}${o.curso ? ' · ' + esc(o.curso) : ''}${o.tema ? ' · ' + esc(o.tema) : ''}</span>
            ${o.sirve ? `<p><b>Lo que más le sirve:</b> ${esc(o.sirve)}</p>` : ''}
            ${o.cambiaria ? `<p><b>Qué cambiaría:</b> ${esc(o.cambiaria)}</p>` : ''}
          </article>`).join('')}</section>
        <section class="pn-card">
          <div class="pn-acciones" style="gap:16px"><span class="pn-promedio">${prom.toFixed(1).replace('.', ',')}</span>
            <span><span class="pn-estrellas" aria-hidden="true">${estrellas(Math.round(prom))}</span><br><span class="pn-chico">promedio de ${plural(ops.length, 'opinión', 'opiniones')}</span></span></div>
          <div class="pn-dist">${dist.map(([n, c]) => `<div><span>${n}★</span><span class="pn-barra"><span style="width:${Math.round(c * 100 / max)}%"></span></span><span>${c}</span></div>`).join('')}</div>
        </section>
      </div>` : '<section class="pn-card"><p class="pn-vacio">Todavía no llegaron opiniones.</p></section>'}`;
  }

  /* ---------- acciones ---------- */
  async function accion(nombre, extra, cambioLocal, ok, deshacer) {
    const copia = JSON.stringify(datos);
    if (cambioLocal) { cambioLocal(); mostrar(true); }
    try {
      const r = await api(nombre, extra);
      if (r.error === 'cambio') { aviso('La planilla cambió mientras tanto. Ya actualizamos los datos: probá de nuevo.', true); await cargar(true); mostrar(true); return false; }
      if (r.error === 'titulo') { aviso('Falta el título del aviso.', true); datos = JSON.parse(copia); mostrar(true); return false; }
      if (r.error === 'link') { aviso('El link tiene que empezar con https://', true); datos = JSON.parse(copia); mostrar(true); return false; }
      if (!recibir(r)) return false;
      mostrar(true);
      if (ok) aviso(typeof ok === 'function' ? ok() : ok, false, deshacer);
      return true;
    } catch (e) {
      datos = JSON.parse(copia); mostrar(true);
      aviso('No se pudo guardar. Revisá la conexión y probá de nuevo.', true);
      return false;
    }
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const d = b.dataset;
    switch (d.accion) {
      case 'salir': salir(); break;
      case 'reintentar': cargar(); break;
      case 'ficha': st.abierto = st.abierto === d.id ? null : d.id; refrescarResultados(); break;
      case 'ver-cuotas': st.filtro = d.filtro || 'pendientes'; if (d.mes) st.mes = d.mes; else if (d.filtro !== 'pagadas') st.mes = ''; break;
      case 'filtro-cuota': st.filtro = d.filtro; mostrar(true); break;
      case 'copiar': copiar(d.texto); break;
      case 'cuota': cambiarCuota(Number(d.fila), d.email, d.mes, d.estado); break;
      case 'modulo': {
        const fila = Number(d.fila), indice = Number(d.indice), valor = Number(d.valor);
        cambiarModulo(fila, indice, d.email, valor);
        break;
      }
      case 'dest-todos': st.aviso.todos = d.valor === '1'; actualizarDestinos(true); break;
      case 'dest-limpiar': st.aviso.dest = []; actualizarDestinos(true); break;
      case 'dest': {
        const v = st.aviso, i = v.dest.indexOf(d.token);
        if (i >= 0) v.dest.splice(i, 1);
        else {
          v.dest.push(d.token);
          // Si eligen todo el día, sobran los horarios sueltos de ese día.
          if (DIAS.some(x => sinTildes(x) === sinTildes(d.token))) v.dest = v.dest.filter(t => !(DIA_HORA.test(t) && sinTildes(t.split(' ')[0]) === sinTildes(d.token)));
        }
        actualizarDestinos(true);
        break;
      }
      case 'aviso-confirmar': if (st.aviso.titulo.trim()) { st.confirmar = true; pintar('av-botones', botonesAviso()); } break;
      case 'aviso-cancelar': st.confirmar = false; pintar('av-botones', botonesAviso()); break;
      case 'aviso-enviar': enviarAviso(); break;
      case 'mensaje-guardar': guardarMensaje(document.getElementById('mensaje-inicio').value); break;
      case 'mensaje-quitar': guardarMensaje(''); break;
    }
  });

  function cambiarModulo(fila, indice, email, valor) {
    const f = datos.alumnos.find(x => x.fila === fila);
    const antes = f && f.cursos[indice] ? f.cursos[indice].modulo : 0;
    accion('panel-modulo', { fila, indice, email, valor }, () => {
      const g = datos.alumnos.find(x => x.fila === fila);
      if (g && g.cursos[indice]) g.cursos[indice].modulo = valor;
    }, valor ? 'Módulo ' + valor + ' guardado.' : 'Quedó sin módulo.', () => cambiarModulo(fila, indice, email, antes));
  }

  function cambiarCuota(fila, email, mes, estado) {
    const c0 = datos.cuotas.find(x => x.fila === fila);
    const antes = c0 ? { vencida: c0.vencida, fechaPago: c0.fechaPago } : {};
    const pagar = estado === 'Pagado';
    accion('panel-cuota', { fila, email, mes, estado }, () => {
      const c = datos.cuotas.find(x => x.fila === fila);
      if (c) { c.estado = estado; c.vencida = pagar ? false : !!antes.vencida; c.fechaPago = pagar ? datos.hoy : ''; }
    }, pagar ? 'Cuota marcada como pagada.' : 'La cuota volvió a pendiente.',
       () => cambiarCuota(fila, email, mes, pagar ? 'Pendiente' : 'Pagado'));
  }

  async function enviarAviso() {
    const v = st.aviso;
    if (v.programar && !v.cuando) { aviso('Elegí la fecha y la hora.', true); return; }
    st.enviando = true; st.confirmar = false; pintar('av-botones', botonesAviso());
    const titulo = v.titulo.trim();
    const ok = await accion('panel-aviso', { para: v.para, titulo, mensaje: v.mensaje, link: v.link.trim(), cuando: v.programar ? v.cuando : '' }, null, () => {
      const a = datos.avisos.find(x => x.titulo === titulo);
      return v.programar ? 'Aviso programado.' : a && a.estado ? a.estado + '.' : 'Aviso en camino: sale en los próximos minutos.';
    });
    st.enviando = false;
    if (ok) st.aviso = { todos: true, dest: [], para: 'Todos', titulo: '', mensaje: '', link: '', programar: false, cuando: '' }; st.buscarDest = '';
    mostrar(true);
  }

  function guardarMensaje(texto) {
    accion('panel-mensaje', { mensaje: texto }, () => { datos.mensaje = texto.trim(); },
      texto.trim() ? 'Mensaje publicado en el portal.' : 'Mensaje quitado del portal.');
  }

  function copiar(texto) {
    const listo = () => aviso('Copiado.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, () => aviso(texto));
    else aviso(texto);
  }

  function pintar(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function refrescarResultados() {
    const ruta = rutaActual();
    const html = ruta === 'alumnos' ? listaAlumnos() : ruta === 'cuotas' ? listaCuotas() : ruta === 'devoluciones' ? listaDevoluciones() : null;
    if (html !== null) pintar('resultados', html);
  }

  // Búsquedas y filtros: se redibuja solo la lista, así no se pierde lo que se está escribiendo.
  document.addEventListener('input', e => {
    const t = e.target;
    const v = st.aviso;
    switch (t.id) {
      case 'buscar-alumno': st.buscar = t.value; refrescarResultados(); break;
      case 'buscar-cuota': st.buscarCuota = t.value; refrescarResultados(); break;
      case 'buscar-dev': st.buscarDev = t.value; refrescarResultados(); break;
      case 'buscar-dest': st.buscarDest = t.value; pintar('av-alumnos', opcionesAlumnos()); break;
      case 'av-titulo': v.titulo = t.value; st.confirmar = false; pintar('av-preview', previewAviso()); pintar('av-botones', botonesAviso()); break;
      case 'av-mensaje': v.mensaje = t.value; pintar('av-preview', previewAviso()); break;
      case 'av-link': v.link = t.value; break;
      case 'av-cuando': v.cuando = t.value; break;
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    switch (t.id) {
      case 'filtro-curso': st.curso = t.value; refrescarResultados(); break;
      case 'ver-inactivos': st.inactivos = t.checked; refrescarResultados(); break;
      case 'filtro-mes': st.mes = t.value; refrescarResultados(); break;
      case 'filtro-docente': st.docente = t.value; refrescarResultados(); break;
      case 'av-programar': st.aviso.programar = t.checked; st.confirmar = false; mostrar(true); break;
    }
  });

  if (!CFG.api || CFG.api.indexOf('{{') === 0) { vista.innerHTML = '<p class="pn-cargando">Panel en preparación.</p>'; return; }
  iniciar();
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
