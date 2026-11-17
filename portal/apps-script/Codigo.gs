/**
 * Portal del alumno · Professional Training Hub
 * Proyecto de Apps Script (cuenta de Google de PTH) que trabaja sobre la planilla «Portal del alumno PTH».
 *
 * Qué hace:
 *  - doPost: recibe el pedido del portal (proftraininghub.com.ar/alumnos/), valida el ingreso con Google
 *    y devuelve SOLO los datos de ese alumno. También guarda las opiniones.
 *  - configurar(): crea las pestañas de la planilla con sus encabezados (se corre una vez).
 *  - crearFormularioDevoluciones(): crea el formulario para las docentes (se corre una vez).
 *  - actualizarFormulario(): refresca la lista de alumnos del formulario (se dispara solo).
 *
 * El ID de cliente de Google se guarda en Propiedades del script con la clave CLIENT_ID.
 */

const ZONA = 'America/Argentina/Buenos_Aires';
const PLANILLA_ID = '1mwn40Wy51VBr_okTq6Ep3iRctiQs1rv8OHONMGg2Lxc';
let _planilla = null;
function planilla() { return _planilla || (_planilla = SpreadsheetApp.openById(PLANILLA_ID)); }

const HOJAS = {
  alumnos: ['Mail de Google', 'Nombre', 'Curso', 'Nivel', 'Módulo actual', 'Día', 'Hora inicio', 'Hora fin',
            'Link de Meet', 'Link de Classroom', 'Activo'],
  cuotas: ['Mail de Google', 'Mes', 'Monto', 'Vence', 'Estado', 'Fecha de pago', 'Medio'],
  programas: ['Curso', 'Nivel', 'Módulo N°', 'Módulo', 'Temas', 'Bibliografía', 'Link de tareas',
              'Link de práctica', 'Fecha de examen', 'Link del examen'],
  opiniones: ['Fecha', 'Mail de Google', 'Nombre', 'Curso', 'Nota', 'Tema', 'Lo que más sirve', 'Qué cambiaría'],
  config: ['Clave', 'Valor'],
  docentes: ['Docente'],
  niveles: ['Curso', 'Nivel', 'Total de módulos'],
  suscripciones: ['Mail de Google', 'Nombre', 'Token', 'Clase', 'Cuota', 'Novedades', 'Dispositivo', 'Actualizado'],
  avisos: ['Fecha y hora', 'Para', 'Título', 'Mensaje', 'Link', 'Estado']
};
const NOMBRES = { alumnos: 'Alumnos', cuotas: 'Cuotas', programas: 'Programas', opiniones: 'Opiniones',
                  config: 'Config', docentes: 'Docentes', niveles: 'Niveles',
                  suscripciones: 'Suscripciones', avisos: 'Avisos', devoluciones: 'Devoluciones' };
const CONFIG_INICIAL = [
  ['Cuenta 1 · Titular', ''], ['Cuenta 1 · Entidad', ''], ['Cuenta 1 · Alias', ''], ['Cuenta 1 · CVU', ''], ['Cuenta 1 · WhatsApp', ''],
  ['Cuenta 2 · Titular', ''], ['Cuenta 2 · Entidad', ''], ['Cuenta 2 · Alias', ''], ['Cuenta 2 · CVU', ''], ['Cuenta 2 · WhatsApp', ''],
  ['WhatsApp Caro', '5491134953141'], ['WhatsApp Marian', '5491153350085'],
  ['Mensaje del inicio', '']
];

/* ---------------- Web app ---------------- */

function doGet() {
  return json({ ok: true, servicio: 'Portal del alumno PTH' });
}

function doPost(e) {
  let pedido;
  try { pedido = JSON.parse(e.postData.contents); } catch (err) { return json({ error: 'pedido' }); }

  // Sesión propia (30 días) para no validar con Google en cada pedido; si no hay, se valida el ingreso con Google.
  let usuario = leerSesion(pedido.sesion), sesion = null;
  if (!usuario && pedido.token) {
    usuario = verificarToken(pedido.token);
    if (usuario) sesion = crearSesion(usuario);
  }
  if (!usuario) return json({ error: 'sesion' });

  const cache = CacheService.getScriptCache();
  const claveCache = 'datos:' + versionDatos() + ':' + usuario.email;
  if (pedido.accion === 'datos') {
    const guardado = cache.get(claveCache);
    if (guardado) {
      const r = JSON.parse(guardado);
      if (sesion) r.sesion = sesion;
      return json(r);
    }
  }

  const alumno = buscarAlumno(usuario.email);
  if (!alumno) return json({ error: 'no-alumno', email: usuario.email });

  if (pedido.accion === 'datos') {
    const r = datosDelAlumno(alumno, usuario);
    try { cache.put(claveCache, JSON.stringify(r), 600); } catch (e) { /* demasiado grande: sin caché */ }
    if (sesion) r.sesion = sesion;
    return json(r);
  }
  if (pedido.accion === 'opinion') return json(guardarOpinion(alumno, pedido.opinion || {}));
  if (pedido.accion === 'avisos') { cache.remove(claveCache); return json(guardarSuscripcion(alumno, pedido)); }
  if (pedido.accion === 'avisos-baja') { cache.remove(claveCache); return json(borrarSuscripcion(usuario.email, pedido.fcm)); }
  return json({ error: 'accion' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function verificarToken(token) {
  if (!token || typeof token !== 'string') return null;
  const clientId = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
                              { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const d = JSON.parse(r.getContentText());
  const emisorOk = d.iss === 'accounts.google.com' || d.iss === 'https://accounts.google.com';
  const verificado = d.email_verified === true || d.email_verified === 'true';
  const vigente = Number(d.exp) * 1000 > Date.now();
  if (!emisorOk || !verificado || !vigente || d.aud !== clientId) return null;
  return { email: String(d.email).toLowerCase().trim(), nombre: d.name || '', foto: d.picture || '' };
}

/* ---------------- Sesión propia y caché ---------------- */

// Firma HMAC con un secreto que solo conoce el script: el alumno no tiene que validar con Google en cada visita.
function secretoSesion() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SESION_SECRETO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SESION_SECRETO', s); }
  return s;
}
function b64(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function firmar(txt) { return b64(Utilities.computeHmacSha256Signature(txt, secretoSesion())); }

function crearSesion(u) {
  const cuerpo = b64(Utilities.newBlob(JSON.stringify({
    e: u.email, n: u.nombre, f: u.foto, x: Date.now() + 30 * 24 * 3600 * 1000
  })).getBytes());
  return cuerpo + '.' + firmar(cuerpo);
}

function leerSesion(s) {
  if (!s || typeof s !== 'string') return null;
  const partes = s.split('.');
  if (partes.length !== 2 || firmar(partes[0]) !== partes[1]) return null;
  try {
    const c = partes[0] + '==='.slice((partes[0].length + 3) % 4);
    const d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(c)).getDataAsString());
    if (!d.e || d.x < Date.now()) return null;
    return { email: d.e, nombre: d.n || '', foto: d.f || '' };
  } catch (e) { return null; }
}

// Cada cambio en la planilla invalida la caché de datos de todos los alumnos.
function versionDatos() { return PropertiesService.getScriptProperties().getProperty('VERSION_DATOS') || '0'; }
function datosCambiaron() { PropertiesService.getScriptProperties().setProperty('VERSION_DATOS', String(Date.now())); }

/* ---------------- Lectura de la planilla ---------------- */

function hoja(clave) {
  return planilla().getSheetByName(NOMBRES[clave]);
}

const _filas = {};
function filas(clave) {
  if (_filas[clave]) return _filas[clave];
  const h = hoja(clave);
  if (!h || h.getLastRow() < 2) return (_filas[clave] = []);
  const valores = h.getDataRange().getValues();
  const encabezados = valores.shift().map(String);
  return (_filas[clave] = valores
    .filter(f => f.some(c => c !== '' && c !== null))
    .map(f => Object.fromEntries(encabezados.map((e, i) => [e, f[i]]))));
}

function texto(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'dd/MM/yyyy');
  return String(v).trim();
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Sheets convierte «Octubre 2026» en fecha: la devolvemos como texto en castellano.
function mes(v) {
  if (v instanceof Date) {
    return MESES[Number(Utilities.formatDate(v, ZONA, 'M')) - 1] + ' ' + Utilities.formatDate(v, ZONA, 'yyyy');
  }
  const t = texto(v);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// 100000 → «$ 100.000». Si escribieron el monto como texto, se respeta.
function plata(v) {
  if (typeof v === 'number') return '$ ' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return texto(v);
}

function hora(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'HH:mm');
  return String(v || '').trim();
}

function buscarAlumno(email) {
  return filas('alumnos').find(a =>
    texto(a['Mail de Google']).toLowerCase() === email &&
    !/^no$/i.test(texto(a['Activo'])));
}

function config() {
  const c = {};
  filas('config').forEach(f => { c[texto(f['Clave'])] = texto(f['Valor']); });
  return c;
}

// Cuentas para transferir: filas «Cuenta N · Titular / Entidad / Alias / CVU / WhatsApp» de Config.
function cuentasDePago(c) {
  const cuentas = [];
  for (let n = 1; n <= 4; n++) {
    const k = 'Cuenta ' + n + ' · ';
    const alias = c[k + 'Alias'] || '', cvu = (c[k + 'CVU'] || '').replace(/\D/g, '');
    if (!alias && !cvu) continue;
    cuentas.push({ titular: c[k + 'Titular'] || '', entidad: c[k + 'Entidad'] || '', alias: alias, cvu: cvu,
                   wa: (c[k + 'WhatsApp'] || '').replace(/\D/g, '') });
  }
  return cuentas;
}

function bibliografia(valor) {
  // Una línea por material: «Texto | link» (el link es opcional)
  return texto(valor).split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
    const partes = l.split('|').map(p => p.trim());
    return { texto: partes[0], link: partes[1] || '' };
  });
}

function datosDelAlumno(a, usuario) {
  const curso = texto(a['Curso']);
  const nivel = texto(a['Nivel']);
  const actual = Number(a['Módulo actual']) || 0;

  const programa = filas('programas')
    .filter(p => texto(p['Curso']) === curso && (!texto(p['Nivel']) || texto(p['Nivel']) === nivel))
    .map(p => {
      const n = Number(p['Módulo N°']) || 0;
      return {
        n: n,
        nombre: texto(p['Módulo']),
        temas: texto(p['Temas']),
        bibliografia: bibliografia(p['Bibliografía']),
        tareas: texto(p['Link de tareas']),
        practica: texto(p['Link de práctica']),
        examenFecha: texto(p['Fecha de examen']),
        examenLink: texto(p['Link del examen']),
        estado: !actual ? '' : n < actual ? 'completado' : n === actual ? 'en curso' : 'proximo'
      };
    })
    .sort((x, y) => x.n - y.n);

  // Avance: módulos completados sobre el total del nivel (pestaña Niveles; si no está, los módulos cargados).
  const nivelCfg = filas('niveles').find(n => texto(n['Curso']) === curso && texto(n['Nivel']) === nivel);
  const total = Math.max(Number(nivelCfg && nivelCfg['Total de módulos']) || 0, programa.length);
  const avance = { completados: actual ? Math.max(0, Math.min(actual - 1, total)) : 0, total: total };

  const email = usuario.email;
  const cuotas = filas('cuotas')
    .filter(c => texto(c['Mail de Google']).toLowerCase() === email)
    .map(c => ({
      mes: mes(c['Mes']), monto: plata(c['Monto']), vence: texto(c['Vence']),
      estado: texto(c['Estado']) || 'Pendiente', fechaPago: texto(c['Fecha de pago']), medio: texto(c['Medio'])
    }))
    .reverse();

  const devoluciones = filas('devoluciones')
    .filter(d => extraerMail(d['Alumno']) === email)
    .map(d => ({
      fecha: texto(Object.values(d)[0]),
      habilidades: ['Speaking', 'Listening', 'Reading', 'Writing'].map(h => ({
        nombre: h, nivel: texto(d['¿Cómo está en cada habilidad? [' + h + ']'])
      })),
      docente: texto(d['Docente']),
      bien: texto(d['Lo que hace muy bien']),
      seguir: texto(d['Para seguir trabajando']),
      mensaje: texto(d['Mensaje para el alumno'])
    }))
    .reverse();

  const c = config();
  return {
    alumno: {
      nombre: texto(a['Nombre']) || usuario.nombre, foto: usuario.foto, email: email,
      curso: curso, nivel: nivel, moduloActual: actual,
      dia: texto(a['Día']), horaInicio: hora(a['Hora inicio']), horaFin: hora(a['Hora fin']),
      meet: texto(a['Link de Meet']), classroom: texto(a['Link de Classroom'])
    },
    programa: programa,
    avance: avance,
    avisos: preferenciasDeAvisos(email),
    cuotas: cuotas,
    devoluciones: devoluciones,
    config: {
      cuentas: cuentasDePago(c),
      waCaro: c['WhatsApp Caro'] || '', waMarian: c['WhatsApp Marian'] || '',
      mensaje: c['Mensaje del inicio'] || ''
    }
  };
}

function extraerMail(v) {
  const m = texto(v).match(/[^\s<>()]+@[^\s<>()]+/);
  return m ? m[0].toLowerCase() : '';
}

/* ---------------- Opiniones ---------------- */

function guardarOpinion(a, o) {
  const nota = Math.min(5, Math.max(1, Number(o.nota) || 0));
  const limpiar = s => String(s || '').slice(0, 2000);
  const anonimo = o.anonimo === true;
  hoja('opiniones').appendRow([
    new Date(),
    anonimo ? 'Anónimo' : texto(a['Mail de Google']),
    anonimo ? 'Anónimo' : texto(a['Nombre']),
    texto(a['Curso']),
    nota || '',
    limpiar(o.tema),
    limpiar(o.sirve),
    limpiar(o.cambiaria)
  ]);
  return { ok: true };
}

/* ---------------- Avisos (notificaciones al celular) ---------------- */

const PROYECTO_FIREBASE = 'portal-alumno-pth';
const URL_PORTAL = 'https://proftraininghub.com.ar/alumnos/';
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const sinTildes = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const siNo = v => (v === false || v === 'No') ? 'No' : 'Sí';

function preferenciasDeAvisos(email) {
  const mias = filas('suscripciones').filter(f => texto(f['Mail de Google']).toLowerCase() === email);
  const f = mias[mias.length - 1];
  return {
    dispositivos: mias.length,
    clase: !f || texto(f['Clase']) !== 'No',
    cuota: !f || texto(f['Cuota']) !== 'No',
    novedades: !f || texto(f['Novedades']) !== 'No'
  };
}

// Alta o actualización de un dispositivo; las preferencias valen para todos los dispositivos del alumno.
function guardarSuscripcion(a, p) {
  const fcm = String(p.fcm || '').trim();
  if (!fcm || fcm.length > 4096) return { error: 'token' };
  const email = texto(a['Mail de Google']).toLowerCase();
  const pref = p.preferencias || {};
  const h = hoja('suscripciones');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const valores = h.getDataRange().getValues();
    for (let r = valores.length - 1; r >= 1; r--) {
      const tok = String(valores[r][2]);
      if (tok === fcm || (p.anterior && tok === p.anterior)) h.deleteRow(r + 1);
    }
    h.appendRow([email, texto(a['Nombre']), fcm, siNo(pref.clase), siNo(pref.cuota), siNo(pref.novedades),
                 String(p.dispositivo || '').slice(0, 80), new Date()]);
    const todas = h.getDataRange().getValues();
    for (let r = 1; r < todas.length; r++) {
      if (String(todas[r][0]).toLowerCase() === email) {
        h.getRange(r + 1, 4, 1, 3).setValues([[siNo(pref.clase), siNo(pref.cuota), siNo(pref.novedades)]]);
      }
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function borrarSuscripcion(email, fcm) {
  if (!fcm) return { ok: true };
  borrarTokens([String(fcm)]);
  return { ok: true };
}

function borrarTokens(tokens) {
  const h = hoja('suscripciones');
  const valores = h.getDataRange().getValues();
  for (let r = valores.length - 1; r >= 1; r--) {
    if (tokens.indexOf(String(valores[r][2])) >= 0) h.deleteRow(r + 1);
  }
}

// Manda un aviso a una lista de dispositivos por Firebase Cloud Messaging. Devuelve cuántos llegaron.
function enviarPush(tokens, aviso, ttl) {
  tokens = tokens.filter((t, i) => t && tokens.indexOf(t) === i);
  if (!tokens.length) return 0;
  const url = 'https://fcm.googleapis.com/v1/projects/' + PROYECTO_FIREBASE + '/messages:send';
  const auth = 'Bearer ' + ScriptApp.getOAuthToken();
  const pedidos = tokens.map(t => ({
    url: url, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: auth },
    payload: JSON.stringify({ message: {
      token: t,
      data: { title: aviso.titulo, body: aviso.cuerpo || '', link: aviso.link || URL_PORTAL, tag: aviso.tag || '' },
      webpush: { headers: { TTL: String(ttl || 86400), Urgency: 'high' } }
    } })
  }));
  const vencidos = [];
  let ok = 0;
  UrlFetchApp.fetchAll(pedidos).forEach((r, i) => {
    const codigo = r.getResponseCode();
    if (codigo === 200) { ok++; return; }
    const cuerpo = r.getContentText();
    if (codigo === 404 || /UNREGISTERED|NOT_FOUND/.test(cuerpo)) vencidos.push(tokens[i]);
    else console.warn('FCM ' + codigo + ': ' + cuerpo.slice(0, 300));
  });
  if (vencidos.length) borrarTokens(vencidos);
  return ok;
}

// Lo dispara un activador cada 5 minutos.
function enviarAvisos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return;
  try {
    const subs = filas('suscripciones');
    if (!subs.length) return;
    const activos = filas('alumnos').filter(a => texto(a['Mail de Google']) && !/^no$/i.test(texto(a['Activo'])));
    avisosManuales(subs, activos);
    avisosDeClase(subs, activos);
    avisosDeCuota(subs, activos);
  } finally { lock.releaseLock(); }
}

function tokensDe(subs, emails, tipo) {
  return subs.filter(s => emails.indexOf(texto(s['Mail de Google']).toLowerCase()) >= 0 && texto(s[tipo]) !== 'No')
             .map(s => texto(s['Token']));
}

// Pestaña Avisos: una fila por aviso. Si «Fecha y hora» está vacía, sale en el próximo ciclo.
function avisosManuales(subs, activos) {
  const h = hoja('avisos');
  if (!h || h.getLastRow() < 2) return;
  const valores = h.getRange(2, 1, h.getLastRow() - 1, 6).getValues();
  const ahora = new Date();
  valores.forEach((f, i) => {
    const [cuando, para, titulo, mensaje, link, estado] = f;
    if (!texto(titulo) || texto(estado)) return;
    if (cuando instanceof Date && cuando > ahora) return;
    const emails = destinatarios(texto(para), activos);
    const n = enviarPush(tokensDe(subs, emails, 'Novedades'),
      { titulo: texto(titulo), cuerpo: texto(mensaje), link: texto(link), tag: 'aviso-' + (i + 2) });
    h.getRange(i + 2, 6).setValue(n ? 'Enviado el ' + Utilities.formatDate(ahora, ZONA, 'dd/MM HH:mm') + ' a ' + n + ' dispositivo' + (n === 1 ? '' : 's')
                                     : 'Sin destinatarios con avisos activados');
  });
}

// «Todos» (o vacío), un curso, «Curso · Nivel», un nivel o mails; varios separados por coma.
function destinatarios(para, activos) {
  const mail = a => texto(a['Mail de Google']).toLowerCase();
  if (!para || /^todos$/i.test(para)) return activos.map(mail);
  const partes = para.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
  return activos.filter(a => partes.some(p => {
    const q = sinTildes(p), curso = sinTildes(texto(a['Curso'])), nivel = sinTildes(texto(a['Nivel']));
    if (p.indexOf('@') > 0) return q === mail(a);
    if (q.indexOf('·') > 0) { const [c, n] = q.split('·').map(x => x.trim()); return c === curso && n === nivel; }
    return q === curso || q === nivel;
  })).map(mail);
}

// «Tu clase empieza en N minutos», entre 5 y 14 minutos antes (una vez por clase).
function avisosDeClase(subs, activos) {
  const ahora = new Date();
  const hoy = DIAS_SEMANA[Number(Utilities.formatDate(ahora, ZONA, 'u')) % 7];
  const fecha = Utilities.formatDate(ahora, ZONA, 'yyyyMMdd');
  const minutosAhora = Number(Utilities.formatDate(ahora, ZONA, 'H')) * 60 + Number(Utilities.formatDate(ahora, ZONA, 'm'));
  const cache = CacheService.getScriptCache();
  activos.forEach(a => {
    if (sinTildes(texto(a['Día'])) !== hoy) return;
    const ini = hora(a['Hora inicio']).split(':').map(Number);
    if (ini.length < 2 || isNaN(ini[0])) return;
    const faltan = ini[0] * 60 + ini[1] - minutosAhora;
    if (faltan <= 4 || faltan > 14) return;
    const email = texto(a['Mail de Google']).toLowerCase();
    const clave = 'clase:' + email + ':' + fecha;
    if (cache.get(clave)) return;
    cache.put(clave, '1', 21600);
    const meet = texto(a['Link de Meet']);
    enviarPush(tokensDe(subs, [email], 'Clase'), {
      titulo: 'Tu clase empieza en ' + faltan + ' minutos',
      cuerpo: 'Hoy de ' + hora(a['Hora inicio']) + (hora(a['Hora fin']) ? ' a ' + hora(a['Hora fin']) : '') + ' h. ' +
              (meet ? 'Tocá para entrar a Meet.' : 'Te esperamos.'),
      link: /^https?:/.test(meet) ? meet : URL_PORTAL + '#inicio', tag: 'clase'
    }, 900);
  });
}

// Cuota vencida y pendiente: un aviso a las 10 h, y se repite cada 7 días mientras siga pendiente.
function avisosDeCuota(subs, activos) {
  const ahora = new Date();
  if (Number(Utilities.formatDate(ahora, ZONA, 'H')) < 10) return;
  const props = PropertiesService.getScriptProperties();
  const hoy = Utilities.formatDate(ahora, ZONA, 'yyyy-MM-dd');
  if (props.getProperty('AVISOS_CUOTA_DIA') === hoy) return;
  props.setProperty('AVISOS_CUOTA_DIA', hoy);
  const enviados = JSON.parse(props.getProperty('AVISOS_CUOTA') || '{}');
  const vigentes = {};
  const emailsActivos = activos.map(a => texto(a['Mail de Google']).toLowerCase());
  filas('cuotas').forEach(c => {
    const email = texto(c['Mail de Google']).toLowerCase();
    if (/pagad/i.test(texto(c['Estado'])) || emailsActivos.indexOf(email) < 0) return;
    const vence = fechaDe(c['Vence']);
    if (!vence || Utilities.formatDate(vence, ZONA, 'yyyy-MM-dd') >= hoy) return;
    const clave = email + '|' + mes(c['Mes']);
    const ultimo = enviados[clave];
    vigentes[clave] = ultimo;
    if (ultimo && (ahora - new Date(ultimo + 'T12:00:00')) < 6.5 * 24 * 3600 * 1000) return;
    const n = enviarPush(tokensDe(subs, [email], 'Cuota'), {
      titulo: 'Tu cuota de ' + mes(c['Mes']) + ' está pendiente',
      cuerpo: 'Venció el ' + texto(c['Vence']) + '. En el portal tenés los datos para transferir.',
      link: URL_PORTAL + '#abono', tag: 'cuota'
    });
    if (n) vigentes[clave] = hoy;
  });
  props.setProperty('AVISOS_CUOTA', JSON.stringify(vigentes));
}

function fechaDe(v) {
  if (v instanceof Date) return v;
  const m = texto(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : null;
}

/* ---------------- Puesta en marcha (se corren una vez desde el editor) ---------------- */

function configurar() {
  const ss = planilla();
  Object.keys(HOJAS).forEach(clave => {
    let h = ss.getSheetByName(NOMBRES[clave]);
    if (!h) h = ss.insertSheet(NOMBRES[clave]);
    if (h.getLastRow() === 0) {
      h.getRange(1, 1, 1, HOJAS[clave].length).setValues([HOJAS[clave]])
        .setFontWeight('bold').setBackground('#1d231f').setFontColor('#ffffff');
      h.setFrozenRows(1);
    }
  });
  const cfg = hoja('config');
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, CONFIG_INICIAL.length, 2).setValues(CONFIG_INICIAL);

  const sino = SpreadsheetApp.newDataValidation().requireValueInList(['Sí', 'No'], true).build();
  hoja('alumnos').getRange('K2:K').setDataValidation(sino);
  const dias = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], true).build();
  hoja('alumnos').getRange('F2:F').setDataValidation(dias);
  const estados = SpreadsheetApp.newDataValidation().requireValueInList(['Pendiente', 'Pagado'], true).build();
  hoja('cuotas').getRange('E2:E').setDataValidation(estados);

  const sobrante = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (sobrante && ss.getSheets().length > 1) ss.deleteSheet(sobrante);
  ss.rename('Portal del alumno PTH');
}

function crearFormularioDevoluciones() {
  const ss = planilla();
  const form = FormApp.create('Devolución para el alumno · PTH');
  form.setDescription('Para las docentes de Professional Training Hub. Lo que completes aparece en «Tu progreso» ' +
                      'del portal de ese alumno.');
  form.addListItem().setTitle('Docente').setRequired(true);
  form.addListItem().setTitle('Alumno').setRequired(true);
  form.addGridItem().setTitle('¿Cómo está en cada habilidad?')
    .setRows(['Speaking', 'Listening', 'Reading', 'Writing'])
    .setColumns(['Inicial', 'En progreso', 'Logrado', 'Destacado']);
  form.addParagraphTextItem().setTitle('Lo que hace muy bien');
  form.addParagraphTextItem().setTitle('Para seguir trabajando');
  form.addParagraphTextItem().setTitle('Mensaje para el alumno');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());

  SpreadsheetApp.flush();
  const respuestas = ss.getSheets().find(h => h.getFormUrl && h.getFormUrl());
  if (respuestas) respuestas.setName(NOMBRES.devoluciones);

  actualizarFormulario();
  ScriptApp.newTrigger('actualizarFormulario').forSpreadsheet(ss).onChange().create();
  Logger.log('Formulario para docentes: ' + form.getPublishedUrl());
}

function actualizarFormulario() {
  datosCambiaron();
  const id = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!id) return;
  const form = FormApp.openById(id);
  const listas = form.getItems(FormApp.ItemType.LIST).map(i => i.asListItem());
  const lista = listas.find(i => i.getTitle() === 'Alumno');
  const listaDocentes = listas.find(i => i.getTitle() === 'Docente');
  const docentes = filas('docentes').map(d => texto(d['Docente'])).filter(Boolean);
  if (listaDocentes && docentes.length) listaDocentes.setChoiceValues(docentes);
  if (!lista) return;
  const alumnos = filas('alumnos')
    .filter(a => texto(a['Mail de Google']) && !/^no$/i.test(texto(a['Activo'])))
    .map(a => texto(a['Nombre']) + ' <' + texto(a['Mail de Google']).toLowerCase() + '>');
  if (alumnos.length) lista.setChoiceValues(alumnos);
}

// Se corrió una vez (16/11/2026) para sacar la pregunta «Módulo» del formulario ya creado.
function quitarPreguntaModulo() {
  const form = FormApp.openById(PropertiesService.getScriptProperties().getProperty('FORM_ID'));
  form.getItems().filter(i => i.getTitle() === 'Módulo').forEach(i => form.deleteItem(i));
}

// Se corrió una vez (16/11/2026): deja de pedir el correo y agrega el desplegable «Docente»,
// que se llena con la pestaña Docentes.
const DOCENTES_INICIALES = ['Antonella López', 'Carolina Capello', 'Julieta Bocalandro', 'Mariana Bianchi',
  'Martina Farinola', 'Román Pernicone', 'Romina De Rose'];
function pedirNombreDocente() {
  const ss = planilla();
  let h = ss.getSheetByName(NOMBRES.docentes);
  if (!h) {
    h = ss.insertSheet(NOMBRES.docentes);
    h.getRange(1, 1).setValue('Docente').setFontWeight('bold').setBackground('#1d231f').setFontColor('#ffffff');
    h.setFrozenRows(1);
    h.getRange(2, 1, DOCENTES_INICIALES.length, 1).setValues(DOCENTES_INICIALES.map(n => [n]));
  }
  const form = FormApp.openById(PropertiesService.getScriptProperties().getProperty('FORM_ID'));
  try { form.setEmailCollectionType(FormApp.EmailCollectionType.DO_NOT_COLLECT); }
  catch (e) { form.setCollectEmail(false); }
  if (!form.getItems().some(i => i.getTitle() === 'Docente')) {
    const item = form.addListItem().setTitle('Docente').setRequired(true);
    form.moveItem(item.getIndex(), 0);
  }
  actualizarFormulario();
}

// Se corrió una vez (16/11/2026): cambia el nombre del formulario y saca las columnas del libro.
function quitarLibroYRenombrar() {
  const form = FormApp.openById(PropertiesService.getScriptProperties().getProperty('FORM_ID'));
  form.setTitle('Devolución para el alumno · PTH');
  const h = hoja('alumnos');
  const enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];
  ['Link del libro', 'Consigna de lectura', 'Autor', 'Libro'].forEach(t => {
    const i = enc.indexOf(t);
    if (i >= 0) h.deleteColumn(i + 1);
  });
}

// Se corrió una vez (16/11/2026): crea la pestaña Niveles con cada curso y nivel que ya figura en la planilla.
function crearPestanaNiveles() {
  const ss = planilla();
  if (ss.getSheetByName(NOMBRES.niveles)) return;
  const h = ss.insertSheet(NOMBRES.niveles);
  h.getRange(1, 1, 1, 3).setValues([HOJAS.niveles])
    .setFontWeight('bold').setBackground('#1d231f').setFontColor('#ffffff');
  h.setFrozenRows(1);
  const pares = {};
  filas('alumnos').concat(filas('programas')).forEach(f => {
    const c = texto(f['Curso']), n = texto(f['Nivel']);
    if (c) pares[c + '|' + n] = [c, n, ''];
  });
  const valores = Object.values(pares);
  if (valores.length) h.getRange(2, 1, valores.length, 3).setValues(valores);
}

// Se corrió una vez (17/11/2026): reemplaza Alias/Titular/Banco de Config por dos cuentas de Mercado Pago.
// El CVU lo carga PTH a mano (la celda queda en formato texto para que no se pierdan dígitos).
function cuentasEnConfig() {
  const h = hoja('config');
  const viejas = ['Alias', 'Titular de la cuenta', 'Banco'];
  for (let r = h.getLastRow(); r >= 2; r--) {
    if (viejas.indexOf(texto(h.getRange(r, 1).getValue())) >= 0) h.deleteRow(r);
  }
  const filasNuevas = [
    ['Cuenta 1 · Titular', 'Carolina Capello'], ['Cuenta 1 · Entidad', 'Mercado Pago'],
    ['Cuenta 1 · Alias', 'capellocarolina'], ['Cuenta 1 · CVU', ''], ['Cuenta 1 · WhatsApp', '5491134953141'],
    ['Cuenta 2 · Titular', 'Mariana Bianchi'], ['Cuenta 2 · Entidad', 'Mercado Pago'],
    ['Cuenta 2 · Alias', 'mariana.pth'], ['Cuenta 2 · CVU', ''], ['Cuenta 2 · WhatsApp', '5491153350085']
  ];
  h.insertRowsAfter(1, filasNuevas.length);
  h.getRange(2, 2, filasNuevas.length, 1).setNumberFormat('@');
  h.getRange(2, 1, filasNuevas.length, 2).setValues(filasNuevas);
}

// Se corrió una vez (17/11/2026): pestañas Suscripciones y Avisos, activador de avisos cada 5 minutos
// y activadores que invalidan la caché cuando cambia la planilla o llega una devolución.
function activarAvisos() {
  const ss = planilla();
  ['suscripciones', 'avisos'].forEach(k => {
    if (ss.getSheetByName(NOMBRES[k])) return;
    const h = ss.insertSheet(NOMBRES[k]);
    h.getRange(1, 1, 1, HOJAS[k].length).setValues([HOJAS[k]])
      .setFontWeight('bold').setBackground('#1d231f').setFontColor('#ffffff');
    h.setFrozenRows(1);
  });
  const av = hoja('avisos');
  av.getRange('A2:A').setNumberFormat('dd/MM/yyyy HH:mm');
  av.setColumnWidth(1, 140); av.setColumnWidth(2, 200); av.setColumnWidth(3, 220); av.setColumnWidth(4, 360);
  av.getRange('A1').setNote('Vacía = se envía en los próximos 5 minutos.');
  av.getRange('B1').setNote('«Todos», un curso (General English), «Curso · Nivel», un nivel o mails, separados por coma.');
  av.getRange('F1').setNote('Lo completa el sistema al enviar. Para reenviar un aviso, borrá esta celda.');
  hoja('suscripciones').getRange('A1').setNote('La completa el portal cuando un alumno activa los avisos. No hace falta tocarla.');

  const existentes = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (existentes.indexOf('enviarAvisos') < 0) ScriptApp.newTrigger('enviarAvisos').timeBased().everyMinutes(5).create();
  if (existentes.indexOf('datosCambiaron') < 0) {
    const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
    if (formId) ScriptApp.newTrigger('datosCambiaron').forForm(formId).onFormSubmit().create();
  }
  secretoSesion();
  datosCambiaron();
}
