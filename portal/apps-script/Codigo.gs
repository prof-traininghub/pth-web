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
  if (String(pedido.accion || '').indexOf('panel') === 0) return json(panel(pedido, usuario, sesion));

  const cache = CacheService.getScriptCache();
  const claveCache = 'datos:' + claveVersion() + ':' + usuario.email;
  if (pedido.accion === 'datos') {
    const r = descomprimir(cache.get(claveCache));
    if (r) {
      if (usuario.foto) r.alumno.foto = usuario.foto;
      if (sesion) r.sesion = sesion;
      return json(r);
    }
  }

  const alumno = buscarAlumno(usuario.email);
  if (!alumno) return json({ error: 'no-alumno', email: usuario.email });

  if (pedido.accion === 'datos') {
    precargar(['alumnos', 'cuotas', 'programas', 'niveles', 'suscripciones', 'devoluciones', 'config']);
    const r = datosDelAlumno(alumno, usuario);
    guardarEnCache({ [claveCache]: r });
    if (sesion) r.sesion = sesion;
    return json(r);
  }
  if (pedido.accion === 'opinion') return json(guardarOpinion(alumno, pedido.opinion || {}));
  if (pedido.accion === 'avisos') { const r = guardarSuscripcion(alumno, pedido); datosCambiaron(); return json(r); }
  if (pedido.accion === 'avisos-baja') { const r = borrarSuscripcion(usuario.email, pedido.fcm); datosCambiaron(); return json(r); }
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
// La caché cambia con cada edición de la planilla y también cada día (cuotas vencidas, mes que empieza).
function claveVersion() { return versionDatos() + ':' + Utilities.formatDate(new Date(), ZONA, 'yyyyMMdd'); }
function comprimir(obj) { return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json')).getBytes()); }
function descomprimir(z) {
  if (!z) return null;
  try { return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(z), 'application/x-gzip')).getDataAsString()); }
  catch (e) { return null; }
}
function guardarEnCache(lote) {
  const ok = {};
  Object.keys(lote).forEach(k => { const z = comprimir(lote[k]); if (z.length < 95000) ok[k] = z; });
  try { CacheService.getScriptCache().putAll(ok, 21600); } catch (e) { console.warn('caché: ' + e.message); }
}

// Deja listos los datos del panel y de cada alumno para que el próximo pedido salga de la caché.
// Lo llama el activador de cada 5 minutos, solo si la planilla cambió o cambió el día.
function calentar(forzar) {
  const props = PropertiesService.getScriptProperties();
  const clave = claveVersion();
  if (!forzar && props.getProperty('CALENTADO') === clave) return;
  precargar();
  const lote = {};
  lote['panel:' + clave] = datosPanel({ email: '', nombre: '' });
  const vistos = {};
  filas('alumnos').forEach(a => {
    const email = texto(a['Mail de Google']).toLowerCase();
    if (!email || vistos[email] || /^no$/i.test(texto(a['Activo']))) return;
    vistos[email] = 1;
    lote['datos:' + clave + ':' + email] = datosDelAlumno(a, { email: email, nombre: '', foto: '' });
  });
  guardarEnCache(lote);
  props.setProperty('CALENTADO', clave);
}
function datosCambiaron() { PropertiesService.getScriptProperties().setProperty('VERSION_DATOS', String(Date.now())); }

/* ---------------- Lectura de la planilla ---------------- */

function hoja(clave) {
  return planilla().getSheetByName(NOMBRES[clave]);
}

// Lee varias pestañas en UN solo pedido a la API de Sheets (leerlas una por una tarda ~0,4 s cada una).
// Las fechas llegan como número de serie y se pasan a Date (igual que antes); si la API falla, filas() lee pestaña por pestaña.
const _crudo = {};
function precargar(claves) {
  claves = (claves || Object.keys(NOMBRES)).filter(k => !_crudo[k] && !_filas[k]);
  if (!claves.length) return;
  try {
    const r = Sheets.Spreadsheets.Values.batchGet(PLANILLA_ID, {
      ranges: claves.map(k => "'" + NOMBRES[k] + "'"),
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
    });
    (r.valueRanges || []).forEach((vr, i) => { _crudo[claves[i]] = vr.values || []; });
  } catch (e) {
    if (claves.length > 1) claves.forEach(k => precargar([k]));   // falta una pestaña: las demás igual
    else console.warn('precargar ' + claves[0] + ': ' + e.message);
  }
}

// Columnas con fecha: el número de serie de Sheets (días desde 30/12/1899) se pasa a Date en la zona de PTH.
const COLUMNAS_FECHA = ['Vence', 'Fecha de pago', 'Fecha', 'Fecha y hora', 'Marca temporal', 'Mes'];
function deSerie(n) {
  const utc = new Date(Math.round((n - 25569) * 86400000));
  return Utilities.parseDate(Utilities.formatDate(utc, 'UTC', 'yyyy-MM-dd HH:mm:ss'), ZONA, 'yyyy-MM-dd HH:mm:ss');
}

const _filas = {};
function filas(clave) {
  if (_filas[clave]) return _filas[clave];
  let valores = _crudo[clave];
  if (valores && valores.length > 1) {
    const enc = valores[0].map(String);
    const cols = enc.map((e, i) => COLUMNAS_FECHA.indexOf(e) >= 0 || i === 0 && clave === 'devoluciones' ? i : -1).filter(i => i >= 0);
    valores = [valores[0]].concat(valores.slice(1).map(f => {
      const g = f.slice();
      cols.forEach(i => { if (typeof g[i] === 'number' && g[i] > 20000) g[i] = deSerie(g[i]); });
      return g;
    }));
  }
  if (!valores) {
    const h = hoja(clave);
    if (!h || h.getLastRow() < 2) return (_filas[clave] = []);
    valores = h.getDataRange().getValues();
  }
  valores = valores.slice();
  if (valores.length < 2) return (_filas[clave] = []);
  const encabezados = valores.shift().map(String);
  // _fila: número de fila en la planilla (lo usa el panel para escribir en el lugar justo).
  return (_filas[clave] = valores
    .map((f, n) => [f, n + 2])
    .filter(([f]) => f.some(c => c !== '' && c !== null))
    .map(([f, n]) => Object.assign(Object.fromEntries(encabezados.map((e, i) => [e, f[i] === undefined ? '' : f[i]])), { _fila: n })));
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
  const f = texto(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);   // fecha leída como texto: 1/12/2026
  if (f && Number(f[2]) >= 1 && Number(f[2]) <= 12) return MESES[Number(f[2]) - 1] + ' ' + f[3];
  const t = texto(v);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// 100000 → «$ 100.000». Si escribieron el monto como texto, se respeta.
function plata(v) {
  if (typeof v === 'number') return '$ ' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return texto(v);
}

// Acepta «19:00», «19», «8.30», «8,30», «19 hs» o una hora de Sheets, y devuelve siempre «HH:mm».
// Las cuotas se pagan del 1 al 10: la de un mes que todavía no empezó no se le muestra al alumno.
function mesEmpezo(c) {
  const t = sinTildes(mes(c['Mes']));
  const m = MESES.findIndex(x => t.indexOf(sinTildes(x)) === 0);
  if (m < 0) return true;
  const y = Number((t.match(/(\d{4})/) || [])[1] || (texto(c['Vence']).match(/(\d{4})/) || [])[1] ||
                   Utilities.formatDate(new Date(), ZONA, 'yyyy'));
  const ahora = Number(Utilities.formatDate(new Date(), ZONA, 'yyyy')) * 12 + Number(Utilities.formatDate(new Date(), ZONA, 'M')) - 1;
  return y * 12 + m <= ahora;
}

function hora(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'HH:mm');
  if (typeof v === 'number' && v > 0 && v < 1) {   // fracción de día
    const min = Math.round(v * 1440);
    return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2);
  }
  const t = String(v == null ? '' : v).trim();
  const m = t.match(/^(\d{1,2})(?:\s*[:.,h]\s*(\d{1,2}))?(?::\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\s*(?:hs?\.?|horas?)?$/i);
  if (!m || Number(m[1]) > 23) return t;
  let h = Number(m[1]);
  if (m[3] && /^p/i.test(m[3]) && h < 12) h += 12;
  if (m[3] && /^a/i.test(m[3]) && h === 12) h = 0;
  const min = m[2] ? (m[2].length === 1 ? m[2] + '0' : m[2]) : '00';
  return ('0' + h).slice(-2) + ':' + min;
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

// Un alumno puede tener varios cursos: una fila por curso con el mismo mail (recomendado),
// o «Curso A + Curso B» en una misma fila (mismo horario; nivel y módulo se separan igual con «+»).
function filasDelAlumno(email) {
  return filas('alumnos').filter(a =>
    texto(a['Mail de Google']).toLowerCase() === email && !/^no$/i.test(texto(a['Activo'])));
}

function partes(v) { return texto(v).split(/\s*\+\s*/).map(x => x.trim()); }

function cursosDeFila(a) {
  const cursos = partes(a['Curso']).filter(Boolean);
  if (!cursos.length) cursos.push('');
  const niveles = partes(a['Nivel']), modulos = partes(a['Módulo actual']);
  const elegir = (lista, i) => (lista.length === cursos.length ? lista[i] : lista[0]) || '';
  return cursos.map((curso, i) => ({
    curso: curso, nivel: elegir(niveles, i), moduloActual: Number(elegir(modulos, i)) || 0,
    dia: texto(a['Día']), horaInicio: hora(a['Hora inicio']), horaFin: hora(a['Hora fin']),
    meet: texto(a['Link de Meet']), classroom: texto(a['Link de Classroom'])
  }));
}

// Programa y avance de un curso.
function armarCurso(c) {
  const actual = c.moduloActual;
  const programa = filas('programas')
    .filter(p => texto(p['Curso']) === c.curso && (!texto(p['Nivel']) || texto(p['Nivel']) === c.nivel))
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
  const nivelCfg = filas('niveles').find(n => texto(n['Curso']) === c.curso && texto(n['Nivel']) === c.nivel);
  const total = Math.max(Number(nivelCfg && nivelCfg['Total de módulos']) || 0, programa.length);
  const avance = { completados: actual ? Math.max(0, Math.min(actual - 1, total)) : 0, total: total };
  return Object.assign({}, c, { programa: programa, avance: avance });
}

function datosDelAlumno(a, usuario) {
  const cursos = filasDelAlumno(usuario.email).reduce((t, f) => t.concat(cursosDeFila(f)), []).map(armarCurso);
  if (!cursos.length) cursos.push(armarCurso(cursosDeFila(a)[0]));
  const p = cursos[0];

  const email = usuario.email;
  const cuotas = filas('cuotas')
    .filter(c => texto(c['Mail de Google']).toLowerCase() === email && mesEmpezo(c))
    .map(c => ({
      mes: mes(c['Mes']), monto: plata(c['Monto']), vence: texto(c['Vence']),
      estado: texto(c['Estado']) || 'Pendiente', fechaPago: texto(c['Fecha de pago']), medio: texto(c['Medio'])
    }))
    .reverse();

  const devoluciones = filas('devoluciones')
    .filter(d => extraerMail(d['Alumno']) === email)
    .map(d => ({
      fecha: soloFecha(Object.values(d)[0]),
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
      curso: p.curso, nivel: p.nivel, moduloActual: p.moduloActual,
      dia: p.dia, horaInicio: p.horaInicio, horaFin: p.horaFin, meet: p.meet, classroom: p.classroom
    },
    cursos: cursos,
    programa: p.programa,
    avance: p.avance,
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
  datosCambiaron();
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
    precargar(['suscripciones', 'alumnos', 'cuotas']);
    const subs = filas('suscripciones');
    if (subs.length) {
      const activos = filas('alumnos').filter(a => texto(a['Mail de Google']) && !/^no$/i.test(texto(a['Activo'])));
      avisosManuales(subs, activos);
      avisosDeClase(subs, activos);
      avisosDeCuota(subs, activos);
    }
  } finally { lock.releaseLock(); }
  try { calentar(); } catch (e) { console.warn('calentar: ' + e.message); }
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
  let cambio = false;
  valores.forEach((f, i) => {
    const [cuando, para, titulo, mensaje, link, estado] = f;
    if (!texto(titulo) || texto(estado)) return;
    if (cuando instanceof Date && cuando > ahora) return;
    const emails = destinatarios(texto(para), activos);
    const n = enviarPush(tokensDe(subs, emails, 'Novedades'),
      { titulo: texto(titulo), cuerpo: texto(mensaje), link: texto(link), tag: 'aviso-' + (i + 2) });
    cambio = true;
    h.getRange(i + 2, 6).setValue(n ? 'Enviado el ' + Utilities.formatDate(ahora, ZONA, 'dd/MM HH:mm') + ' a ' + n + ' dispositivo' + (n === 1 ? '' : 's')
                                     : 'Sin destinatarios con avisos activados');
  });
  if (cambio) datosCambiaron();
}

// «Todos» (o vacío), un curso, «Curso · Nivel», un nivel, un día («Lunes»), un día y horario («Lunes 19:00»)
// o mails; varios separados por coma.
function destinatarios(para, activos) {
  const mail = a => texto(a['Mail de Google']).toLowerCase();
  if (!para || /^todos$/i.test(para)) return activos.map(mail);
  const partes = para.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
  return activos.filter(a => partes.some(p => {
    const q = sinTildes(p);
    if (p.indexOf('@') > 0) return q === mail(a);
    const dh = p.match(/^([a-záéíóúü]+)\s+(\d{1,2}:\d{2})$/i);
    return cursosDeFila(a).some(k => {
      if (dh) return sinTildes(k.dia) === sinTildes(dh[1]) && k.horaInicio === hora(dh[2]);
      const curso = sinTildes(k.curso), nivel = sinTildes(k.nivel);
      if (q.indexOf('·') > 0) { const [c, n] = q.split('·').map(x => x.trim()); return c === curso && n === nivel; }
      return q === curso || q === nivel || q === sinTildes(k.dia);
    });
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
    const clave = 'clase:' + email + ':' + fecha + ':' + hora(a['Hora inicio']);
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
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  const iso = texto(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12) : null;
}

// «24/11/2026 14:03:10» → «24/11/2026» (marcas de tiempo de formularios y opiniones).
function soloFecha(v) { return texto(v).replace(/^(\d{1,2}\/\d{1,2}\/\d{4})\s.*$/, '$1'); }

/* ---------------- Panel de PTH (proftraininghub.com.ar/panel/) ---------------- */

// Cuentas que entran al panel. Para sumar otra: Propiedades del script → ADMINS, mails separados por coma.
const ADMINS = ['prof.traininghub@gmail.com'];
function esAdmin(email) {
  const extra = (PropertiesService.getScriptProperties().getProperty('ADMINS') || '')
    .split(/[,;\s]+/).map(m => m.toLowerCase()).filter(Boolean);
  return ADMINS.concat(extra).indexOf(String(email || '').toLowerCase()) >= 0;
}

function panel(pedido, usuario, sesion) {
  if (!esAdmin(usuario.email)) return { error: 'no-admin', email: usuario.email };
  const acciones = {
    'panel': () => null,
    'panel-cuota': () => panelCuota(pedido),
    'panel-modulo': () => panelModulo(pedido),
    'panel-aviso': () => panelAviso(pedido),
    'panel-mensaje': () => panelMensaje(pedido)
  };
  const accion = acciones[pedido.accion];
  if (!accion) return { error: 'accion' };
  let problema = null;
  if (pedido.accion !== 'panel') {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try { problema = accion(); } finally { lock.releaseLock(); }
    if (!problema) datosCambiaron();
    Object.keys(_filas).forEach(k => delete _filas[k]);   // releer lo que se acaba de escribir
    Object.keys(_crudo).forEach(k => delete _crudo[k]);
  }
  if (problema && problema.error) return problema;
  if (pedido.accion === 'panel-aviso' && !pedido.cuando) enviarAvisos();   // sale ya, sin esperar el ciclo de 5 min
  const clave = 'panel:' + claveVersion();
  let r = pedido.accion === 'panel' ? descomprimir(CacheService.getScriptCache().get(clave)) : null;
  if (!r) {
    precargar();
    r = datosPanel(usuario);
    guardarEnCache({ [clave]: r });
  }
  r.admin = { email: usuario.email, nombre: usuario.nombre };
  if (sesion) r.sesion = sesion;
  return r;
}

function datosPanel(usuario) {
  const mail = a => texto(a['Mail de Google']).toLowerCase();
  const subs = filas('suscripciones');
  const nombres = {};
  filas('alumnos').forEach(a => { if (mail(a)) nombres[mail(a)] = texto(a['Nombre']); });

  const alumnos = filas('alumnos').filter(a => mail(a) || texto(a['Nombre'])).map(a => {
    const suyas = subs.filter(x => texto(x['Mail de Google']).toLowerCase() === mail(a));
    return {
      fila: a._fila, email: mail(a), nombre: texto(a['Nombre']),
      activo: !/^no$/i.test(texto(a['Activo'])),
      cursos: cursosDeFila(a).map(c => {
        const k = armarCurso(c);
        return { curso: c.curso, nivel: c.nivel, modulo: c.moduloActual, total: k.avance.total,
                 programa: k.programa.length, dia: c.dia, horaInicio: c.horaInicio, horaFin: c.horaFin,
                 meet: c.meet, classroom: c.classroom };
      }),
      app: suyas.length,
      novedades: !suyas.length || texto(suyas[suyas.length - 1]['Novedades']) !== 'No'
    };
  });

  const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const cuotas = filas('cuotas').map(c => {
    const vence = fechaDe(c['Vence']);
    const estado = texto(c['Estado']) || 'Pendiente';
    return {
      fila: c._fila, email: mail(c), nombre: nombres[mail(c)] || mail(c),
      mes: mes(c['Mes']), monto: plata(c['Monto']), importe: typeof c['Monto'] === 'number' ? c['Monto'] : Number(String(c['Monto']).replace(/\D/g, '')) || 0,
      vence: texto(c['Vence']), estado: estado, fechaPago: texto(c['Fecha de pago']), medio: texto(c['Medio']),
      vencida: !/pagad/i.test(estado) && !!vence && Utilities.formatDate(vence, ZONA, 'yyyy-MM-dd') < hoy
    };
  });

  const devoluciones = filas('devoluciones').map(d => ({
    fecha: soloFecha(Object.values(d)[0]), docente: texto(d['Docente']),
    alumno: texto(d['Alumno']).replace(/\s*<[^>]*>\s*$/, ''), email: extraerMail(d['Alumno']),
    habilidades: ['Speaking', 'Listening', 'Reading', 'Writing'].map(h => ({
      nombre: h, nivel: texto(d['¿Cómo está en cada habilidad? [' + h + ']']) })),
    bien: texto(d['Lo que hace muy bien']), seguir: texto(d['Para seguir trabajando']),
    mensaje: texto(d['Mensaje para el alumno'])
  })).reverse();

  const opiniones = filas('opiniones').map(o => ({
    fecha: soloFecha(o['Fecha']), nombre: texto(o['Nombre']), curso: texto(o['Curso']),
    nota: Number(o['Nota']) || 0, tema: texto(o['Tema']), sirve: texto(o['Lo que más sirve']),
    cambiaria: texto(o['Qué cambiaría'])
  })).reverse();

  const avisos = filas('avisos').map(v => ({
    fila: v._fila,
    cuando: v['Fecha y hora'] instanceof Date ? Utilities.formatDate(v['Fecha y hora'], ZONA, 'dd/MM/yyyy HH:mm') : texto(v['Fecha y hora']),
    para: texto(v['Para']) || 'Todos', titulo: texto(v['Título']), mensaje: texto(v['Mensaje']),
    link: texto(v['Link']), estado: texto(v['Estado'])
  })).reverse().slice(0, 40);

  const c = config();
  return {
    admin: { email: usuario.email, nombre: usuario.nombre },
    hoy: Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy'),
    alumnos: alumnos, cuotas: cuotas, devoluciones: devoluciones, opiniones: opiniones, avisos: avisos,
    docentes: filas('docentes').map(d => texto(d['Docente'])).filter(Boolean),
    mensaje: c['Mensaje del inicio'] || '',
    enlaces: {
      planilla: 'https://docs.google.com/spreadsheets/d/' + PLANILLA_ID + '/edit',
      formulario: 'https://docs.google.com/forms/d/e/1FAIpQLSejBacaN-zO864Pw8H9DArlEU3I1hpHtb4TNJJNotvClMBGeA/viewform'
    }
  };
}

// Columna (1, 2, …) de un encabezado en una pestaña.
function columna(clave, titulo) {
  const h = hoja(clave);
  const i = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String).indexOf(titulo);
  if (i < 0) throw new Error('Falta la columna «' + titulo + '» en ' + NOMBRES[clave]);
  return i + 1;
}

// Antes de escribir, confirma que la fila sigue siendo la misma (alguien pudo ordenar o borrar filas).
function filaConfirmada(clave, fila, email) {
  fila = Number(fila);
  const h = hoja(clave);
  if (!fila || fila < 2 || fila > h.getLastRow()) return 0;
  const m = texto(h.getRange(fila, columna(clave, 'Mail de Google')).getValue()).toLowerCase();
  return m === String(email || '').toLowerCase() ? fila : 0;
}

function panelCuota(p) {
  const fila = filaConfirmada('cuotas', p.fila, p.email);
  if (!fila) return { error: 'cambio' };
  const h = hoja('cuotas');
  if (mes(h.getRange(fila, columna('cuotas', 'Mes')).getValue()) !== p.mes) return { error: 'cambio' };
  const pagado = p.estado === 'Pagado';
  h.getRange(fila, columna('cuotas', 'Estado')).setValue(pagado ? 'Pagado' : 'Pendiente');
  const fecha = h.getRange(fila, columna('cuotas', 'Fecha de pago'));
  if (pagado) fecha.setValue(Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy'));
  else fecha.clearContent();
  return null;
}

function panelModulo(p) {
  const fila = filaConfirmada('alumnos', p.fila, p.email);
  if (!fila) return { error: 'cambio' };
  const valor = Math.max(0, Math.min(99, Math.round(Number(p.valor) || 0)));   // 0 = sin módulo
  const h = hoja('alumnos');
  const cursos = partes(h.getRange(fila, columna('alumnos', 'Curso')).getValue()).filter(Boolean);
  const celda = h.getRange(fila, columna('alumnos', 'Módulo actual'));
  if (cursos.length <= 1) { if (valor) celda.setValue(valor); else celda.clearContent(); return null; }
  let mods = partes(celda.getValue());
  if (mods.length !== cursos.length) mods = cursos.map(() => mods[0] || '');
  const i = Math.max(0, Math.min(cursos.length - 1, Number(p.indice) || 0));
  mods[i] = String(valor);
  celda.setNumberFormat('@').setValue(mods.join(' + '));
  return null;
}

function panelAviso(p) {
  const corto = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const titulo = corto(p.titulo, 80), mensaje = corto(p.mensaje, 300), link = corto(p.link, 500);
  if (!titulo) return { error: 'titulo' };
  if (link && !/^https?:\/\//i.test(link)) return { error: 'link' };
  let cuando = '';
  const m = String(p.cuando || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (m) cuando = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  hoja('avisos').appendRow([cuando, corto(p.para, 5000) || 'Todos', titulo, mensaje, link, '']);
  SpreadsheetApp.flush();
  return null;
}

function panelMensaje(p) {
  const valor = String(p.mensaje || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const h = hoja('config');
  const f = filas('config').find(x => texto(x['Clave']) === 'Mensaje del inicio');
  if (f) h.getRange(f._fila, 2).setValue(valor);
  else h.appendRow(['Mensaje del inicio', valor]);
  return null;
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
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FORM_ID');
  if (!id) return;
  precargar(['alumnos', 'docentes']);
  const docentes = unicos(filas('docentes').map(d => texto(d['Docente'])).filter(Boolean));
  const alumnos = unicos(filas('alumnos')
    .filter(a => texto(a['Mail de Google']) && !/^no$/i.test(texto(a['Activo'])))
    .map(a => texto(a['Nombre']) + ' <' + texto(a['Mail de Google']).toLowerCase() + '>'));
  // La mayoría de las ediciones no cambian nombres ni mails: entonces no hace falta abrir el formulario (es lo lento).
  const firma = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify([docentes, alumnos])));
  if (props.getProperty('FORM_FIRMA') === firma) return;
  const form = FormApp.openById(id);
  const listas = form.getItems(FormApp.ItemType.LIST).map(i => i.asListItem());
  const lista = listas.find(i => i.getTitle() === 'Alumno');
  const listaDocentes = listas.find(i => i.getTitle() === 'Docente');
  if (listaDocentes && docentes.length) listaDocentes.setChoiceValues(docentes);
  if (lista && alumnos.length) lista.setChoiceValues(alumnos);
  props.setProperty('FORM_FIRMA', firma);
}

// Forms no acepta opciones repetidas (un alumno cargado dos veces, una fila a medio completar).
function unicos(lista) { return lista.filter((v, i) => lista.indexOf(v) === i); }

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

// Diagnóstico: valida el permiso para enviar con Firebase sin mandar nada (debe responder 400 por el token falso).
function probarFirebase() {
  const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROYECTO_FIREBASE + '/messages:send', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ validate_only: true, message: { token: 'prueba', data: { title: 'prueba' } } })
  });
  Logger.log(r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
}

// Diagnóstico: cuánto tarda cada parte (Ejecutar desde el editor y mirar el registro).
function medirTiempos() {
  const t0 = Date.now(), log = [];
  let t = Date.now();
  precargar(); log.push('leer todo en un pedido ' + (Date.now() - t) + ' ms');
  ['alumnos', 'cuotas', 'programas', 'niveles', 'suscripciones', 'devoluciones', 'opiniones', 'avisos', 'config', 'docentes'].forEach(k => {
    t = Date.now(); const n = filas(k).length; log.push(k + ' ' + n + ' filas ' + (Date.now() - t) + ' ms');
  });
  t = Date.now(); const p = datosPanel({ email: 'prof.traininghub@gmail.com', nombre: '' });
  log.push('armar panel ' + (Date.now() - t) + ' ms, ' + JSON.stringify(p).length + ' caracteres');
  const a = filas('alumnos').find(x => texto(x['Mail de Google']));
  if (a) { t = Date.now(); datosDelAlumno(a, { email: texto(a['Mail de Google']).toLowerCase(), nombre: '', foto: '' }); log.push('armar alumno ' + (Date.now() - t) + ' ms'); }
  t = Date.now(); const z = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(p))).getBytes());
  log.push('gzip ' + (Date.now() - t) + ' ms, ' + z.length + ' caracteres');
  log.push('total ' + (Date.now() - t0) + ' ms');
  Logger.log(log.join('\n'));
}
