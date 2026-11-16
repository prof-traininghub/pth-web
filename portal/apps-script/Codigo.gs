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
function planilla() { return SpreadsheetApp.openById(PLANILLA_ID); }

const HOJAS = {
  alumnos: ['Mail de Google', 'Nombre', 'Curso', 'Nivel', 'Módulo actual', 'Día', 'Hora inicio', 'Hora fin',
            'Link de Meet', 'Link de Classroom', 'Libro', 'Autor', 'Consigna de lectura', 'Link del libro', 'Activo'],
  cuotas: ['Mail de Google', 'Mes', 'Monto', 'Vence', 'Estado', 'Fecha de pago', 'Medio'],
  programas: ['Curso', 'Nivel', 'Módulo N°', 'Módulo', 'Temas', 'Bibliografía', 'Link de tareas',
              'Link de práctica', 'Fecha de examen', 'Link del examen'],
  opiniones: ['Fecha', 'Mail de Google', 'Nombre', 'Curso', 'Nota', 'Tema', 'Lo que más sirve', 'Qué cambiaría'],
  config: ['Clave', 'Valor'],
  docentes: ['Docente']
};
const NOMBRES = { alumnos: 'Alumnos', cuotas: 'Cuotas', programas: 'Programas', opiniones: 'Opiniones',
                  config: 'Config', docentes: 'Docentes', devoluciones: 'Devoluciones' };
const CONFIG_INICIAL = [
  ['Alias', ''], ['Titular de la cuenta', ''], ['Banco', ''],
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

  const usuario = verificarToken(pedido.token);
  if (!usuario) return json({ error: 'sesion' });

  const alumno = buscarAlumno(usuario.email);
  if (!alumno) return json({ error: 'no-alumno', email: usuario.email });

  if (pedido.accion === 'datos') return json(datosDelAlumno(alumno, usuario));
  if (pedido.accion === 'opinion') return json(guardarOpinion(alumno, pedido.opinion || {}));
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

/* ---------------- Lectura de la planilla ---------------- */

function hoja(clave) {
  return planilla().getSheetByName(NOMBRES[clave]);
}

function filas(clave) {
  const h = hoja(clave);
  if (!h || h.getLastRow() < 2) return [];
  const valores = h.getDataRange().getValues();
  const encabezados = valores.shift().map(String);
  return valores
    .filter(f => f.some(c => c !== '' && c !== null))
    .map(f => Object.fromEntries(encabezados.map((e, i) => [e, f[i]])));
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
    libro: {
      titulo: texto(a['Libro']), autor: texto(a['Autor']),
      consigna: texto(a['Consigna de lectura']), link: texto(a['Link del libro'])
    },
    programa: programa,
    cuotas: cuotas,
    devoluciones: devoluciones,
    config: {
      alias: c['Alias'] || '', titular: c['Titular de la cuenta'] || '', banco: c['Banco'] || '',
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
  hoja('alumnos').getRange('O2:O').setDataValidation(sino);
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
  const form = FormApp.create('Devolución de fin de módulo · PTH');
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
