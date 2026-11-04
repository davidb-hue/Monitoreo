/**
 * PIZARRA DE MONITOREO – Lactolac  (versión 2, revisada)
 * ------------------------------------------------------------
 * Página web (Google Apps Script) con datos en esta hoja de cálculo.
 *  - Cada operador entra con su nombre + PIN personal (la cuenta Gmail es compartida).
 *  - Toda acción queda en la hoja "Historial" con operador, fecha, hora y cuenta Google.
 *  - Los operadores NO tienen acceso a la hoja: solo a la pizarra.
 *  - No existe "eliminar": solo el coordinador puede ANULAR (queda registrado).
 *
 * Archivos del proyecto: Codigo.gs (este), Index.html y appsscript.json.
 * Instalación: ver GUIA_INSTALACION.md.
 *
 * NOTA DE SEGURIDAD: en Apps Script, toda función SIN guion bajo final puede ser
 * llamada desde el navegador. Por eso las funciones de administración exigen
 * SpreadsheetApp.getUi() (solo existe al ejecutarlas desde la hoja) y las demás
 * validan sesión.
 */

const CFG = {
  TZ: 'America/El_Salvador',
  PREFIJO_ID: 'SM-',
  HOJAS: { REG: 'Registros', HIST: 'Historial', CONF: 'Configuración' },
  TIPOS: ['Seguimiento', 'Aviso importante', 'Instrucción nueva', 'Cambio de actividad', 'Otro'],
  TIPOS_AVISO: ['Aviso importante', 'Instrucción nueva', 'Cambio de actividad'],
  TIPOS_SOLO_COORD: ['Instrucción nueva'],
  CATEGORIAS: ['Revisión de video', 'Seguimiento GPS', 'Cámara / equipo', 'Incidente', 'Relevo / turno', 'Otro'],
  SITIOS: ['El Salvador', 'Guatemala', 'Honduras', 'Nicaragua', 'Costa Rica', 'Regional'],
  TURNOS: ['Mañana (06:00–14:00)', 'Tarde (14:00–22:00)', 'Noche (22:00–06:00)', 'Administrativo'],
  PRIORIDADES: ['Alta', 'Media', 'Baja'],
  ESTADOS: ['Abierto', 'En seguimiento', 'Cerrado'],
  ACCIONES: ['Avance', 'Mover a Abierto', 'Mover a En seguimiento', 'Cerrar', 'Reabrir', 'Anular', 'Confirmar lectura'],
  DIAS_CERRADOS_VISIBLES: 7,
  SESION_SEG: 21600, // 6 horas (máximo permitido por Google)
  MAX_INTENTOS: 5,
  BLOQUEO_SEG: 900,
  ROL_COORD: 'Coordinador',
};

const ENC_REG = [
  'ID', 'Fecha de creación', 'Creado por', 'Tipo', 'Categoría', 'País / sitio', 'Turno',
  'Título', 'Detalle', 'Prioridad', 'Responsable', 'Fecha compromiso', 'Estado',
  'Última actualización', 'Actualizado por', 'Último comentario', 'N.º de actualizaciones', 'Leído por',
];
const C = {
  ID: 1, CREACION: 2, CREADO_POR: 3, TIPO: 4, CAT: 5, SITIO: 6, TURNO: 7, TITULO: 8, DETALLE: 9,
  PRIO: 10, RESP: 11, FECHA: 12, ESTADO: 13, ULT_ACT: 14, ACT_POR: 15, ULT_COM: 16, N_ACT: 17, LEIDO: 18,
};
const ENC_HIST = ['Fecha y hora', 'Operador', 'Cuenta Google', 'Acción', 'ID', 'Detalle', 'Valor anterior', 'Valor nuevo'];
const ENC_CONF = ['Nombre', 'Rol (Coordinador / Operador)', 'PIN nuevo (se borra al protegerlo)', 'PIN protegido (no tocar)', 'Activo (Sí / No)'];

/* =========================================================
 * INSTALACIÓN Y MENÚ
 * ========================================================= */

function instalar() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('INSTALADO')) throw new Error('Ya está instalado. No vuelvas a ejecutar "instalar".');

  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(CFG.TZ);

  const reg = hoja_(ss, CFG.HOJAS.REG, ENC_REG);
  const hist = hoja_(ss, CFG.HOJAS.HIST, ENC_HIST);
  const conf = hoja_(ss, CFG.HOJAS.CONF, ENC_CONF);

  reg.getRange('B2:B').setNumberFormat('dd/mm/yyyy hh:mm');
  reg.getRange('L2:L').setNumberFormat('dd/mm/yyyy');
  reg.getRange('N2:N').setNumberFormat('dd/mm/yyyy hh:mm');
  hist.getRange('A2:A').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  // Texto plano: conserva ceros iniciales del PIN (0123) y evita que se interprete como número.
  conf.getRange('C2:D').setNumberFormat('@');

  if (conf.getLastRow() < 2) {
    conf.getRange(2, 1, 6, 5).setValues([
      ['Oscar', CFG.ROL_COORD, '', '', 'Sí'],
      ['Operador 1', 'Operador', '', '', 'Sí'],
      ['Operador 2', 'Operador', '', '', 'Sí'],
      ['Operador 3', 'Operador', '', '', 'Sí'],
      ['Operador 4', 'Operador', '', '', 'Sí'],
      ['Operador 5', 'Operador', '', '', 'Sí'],
    ]);
  }
  conf.autoResizeColumns(1, 5);

  [reg, hist, conf].forEach(proteger_);

  ss.getSheets().forEach(function (s) {
    const n = s.getName();
    if (['Hoja 1', 'Hoja1', 'Sheet1'].indexOf(n) > -1 && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  // Evita disparadores duplicados si "instalar" se interrumpió y se repite.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['alEditarHoja', 'alCambiarHoja'].indexOf(t.getHandlerFunction()) > -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('alEditarHoja').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('alCambiarHoja').forSpreadsheet(ss).onChange().create();

  props.setProperty('SAL', Utilities.getUuid());
  props.setProperty('CONTADOR', '0');
  props.setProperty('INSTALADO', '1');

  log_({ operador: 'Sistema', accion: 'INSTALACIÓN', detalle: 'Pizarra instalada.' });
  Logger.log('Listo. Ahora: 1) escribe nombres y PIN en "Configuración", 2) menú Pizarra > Proteger PINs, 3) Implementar > Nueva implementación > Aplicación web.');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Pizarra')
    .addItem('Proteger PINs escritos', 'protegerPines')
    .addItem('Desbloquear operadores', 'desbloquearOperadores')
    .addItem('Activar resumen semanal por correo', 'activarResumenSemanal')
    .addItem('Ver enlace de la pizarra', 'verEnlace')
    .addToUi();
}

function verEnlace() {
  const ui = SpreadsheetApp.getUi();
  const url = ScriptApp.getService().getUrl();
  ui.alert(url ? 'Enlace de la pizarra:\n\n' + url : 'Aún no has implementado la aplicación web (Implementar > Nueva implementación).');
}

/** Convierte los PIN escritos en la columna C en huella protegida (columna D) y los borra. */
function protegerPines() {
  const ui = SpreadsheetApp.getUi(); // lanza error si se llama desde el navegador (web app)
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let msg;
  try {
    const h = SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.CONF);
    const n = h.getLastRow() - 1;
    if (n < 1) return;
    const datos = h.getRange(2, 1, n, 5).getValues();
    const cambiados = [];
    const errores = [];
    datos.forEach(function (f, i) {
      const nombre = String(f[0]).trim();
      const pin = String(f[2]).trim();
      if (!nombre || !pin) return;
      if (!/^\d{4,6}$/.test(pin) || pinDebil_(pin)) { errores.push(nombre); return; }
      h.getRange(i + 2, 4).setNumberFormat('@').setValue(huella_(nombre, pin));
      h.getRange(i + 2, 3).setValue('');
      cambiados.push(nombre);
    });
    if (cambiados.length) log_({ operador: 'Coordinador', accion: 'CONFIGURACIÓN', detalle: 'PIN asignado o cambiado para: ' + cambiados.join(', ') });
    msg = (cambiados.length ? 'PIN protegido para: ' + cambiados.join(', ') : 'No había PIN nuevos.') +
      (errores.length ? '\nPIN rechazado (4 a 6 números, sin repetir un solo dígito ni secuencias como 1234): ' + errores.join(', ') : '');
  } finally {
    lock.releaseLock();
  }
  ui.alert(msg);
}

function pinDebil_(pin) {
  return /^(\d)\1+$/.test(pin) || ['1234', '4321', '123456', '654321', '2580', '0123', '012345'].indexOf(pin) > -1;
}

function desbloquearOperadores() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const todas = props.getKeys().filter(function (k) { return k.indexOf('BLQ_') === 0; });
  todas.forEach(function (k) { props.deleteProperty(k); });
  log_({ operador: 'Coordinador', accion: 'CONFIGURACIÓN', detalle: 'Bloqueos de acceso eliminados (' + todas.length + ').' });
  ui.alert('Bloqueos eliminados: ' + todas.length);
}

/* =========================================================
 * APLICACIÓN WEB
 * ========================================================= */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Pizarra de Monitoreo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function listarOperadores() {
  return leerConf_().filter(function (o) { return o.activo; }).map(function (o) { return o.nombre; });
}

function iniciarSesion(nombre, pin) {
  nombre = String(nombre || '').trim().slice(0, 80);
  pin = String(pin || '').trim().slice(0, 12);
  const op = leerConf_().filter(function (o) { return o.nombre === nombre && o.activo; })[0];
  if (!op) throw new Error('Operador no válido.'); // no se registra: evita llenar el historial con basura

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    const clave = 'BLQ_' + op.nombre;
    let est = { n: 0, t: 0 };
    try { est = JSON.parse(props.getProperty(clave) || '') || est; } catch (e) { }
    const ahora = Date.now();
    if (est.n >= CFG.MAX_INTENTOS) {
      const resta = Math.ceil((CFG.BLOQUEO_SEG * 1000 - (ahora - est.t)) / 60000);
      if (resta > 0) throw new Error('Acceso bloqueado por 5 intentos fallidos. Espera ' + resta + ' min o pide al coordinador desbloquear.');
      est = { n: 0, t: 0 };
    }
    if (!op.huella) throw new Error('Este operador aún no tiene PIN asignado.');
    if (op.huella !== huella_(op.nombre, pin)) {
      est = { n: est.n + 1, t: ahora };
      props.setProperty(clave, JSON.stringify(est));
      log_({ operador: op.nombre, accion: 'PIN INCORRECTO', detalle: 'Intento ' + est.n + ' de ' + CFG.MAX_INTENTOS + (est.n >= CFG.MAX_INTENTOS ? ' — ACCESO BLOQUEADO' : '') });
      throw new Error(est.n >= CFG.MAX_INTENTOS ? 'PIN incorrecto. Acceso bloqueado 15 min.' : 'PIN incorrecto. Intentos restantes: ' + (CFG.MAX_INTENTOS - est.n) + '.');
    }
    props.deleteProperty(clave);
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put('S_' + token, JSON.stringify({ nombre: op.nombre }), CFG.SESION_SEG);
    log_({ operador: op.nombre, accion: 'INICIO DE SESIÓN' });
    return { token: token, nombre: op.nombre, rol: op.rol };
  } finally {
    lock.releaseLock();
  }
}

function cerrarSesion(token) {
  const s = leerSesion_(token);
  if (s) {
    CacheService.getScriptCache().remove('S_' + token);
    log_({ operador: s.nombre, accion: 'CIERRE DE SESIÓN' });
  }
  return true;
}

function obtenerTablero(token) {
  const s = sesion_(token);
  const reg = SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.REG);
  const n = reg.getLastRow() - 1;
  const limite = new Date(Date.now() - CFG.DIAS_CERRADOS_VISIBLES * 86400000);
  const tarjetas = [];
  if (n > 0) {
    reg.getRange(2, 1, n, ENC_REG.length).getValues().forEach(function (f) {
      if (!f[C.ID - 1]) return;
      const estado = f[C.ESTADO - 1];
      if (CFG.ESTADOS.indexOf(estado) === -1) return; // Anulado o valor inválido
      if (estado === 'Cerrado' && f[C.ULT_ACT - 1] instanceof Date && f[C.ULT_ACT - 1] < limite) return;
      tarjetas.push(filaATarjeta_(f));
    });
  }
  return {
    usuario: s,
    tarjetas: tarjetas,
    operadores: listarOperadores(),
    catalogos: {
      tipos: s.rol === CFG.ROL_COORD ? CFG.TIPOS : CFG.TIPOS.filter(function (t) { return CFG.TIPOS_SOLO_COORD.indexOf(t) === -1; }),
      tiposAviso: CFG.TIPOS_AVISO,
      tiposSoloCoord: CFG.TIPOS_SOLO_COORD,
      categorias: CFG.CATEGORIAS, sitios: CFG.SITIOS, turnos: CFG.TURNOS, prioridades: CFG.PRIORIDADES,
    },
    ahora: new Date().toISOString(),
  };
}

function crearTarjeta(token, d) {
  const s = sesion_(token);
  d = d || {};
  const tipo = String(d.tipo || ''), cat = String(d.categoria || ''), sitio = String(d.sitio || ''),
    turno = String(d.turno || ''), prio = String(d.prioridad || ''), resp = String(d.responsable || '').trim();
  const titulo = String(d.titulo || '').trim(), detalle = String(d.detalle || '').trim();
  if (!titulo) throw new Error('Falta completar: título.');
  if (!detalle) throw new Error('Falta completar: detalle.');
  if (CFG.TIPOS.indexOf(tipo) === -1) throw new Error('Tipo no válido.');
  if (CFG.CATEGORIAS.indexOf(cat) === -1) throw new Error('Categoría no válida.');
  if (CFG.SITIOS.indexOf(sitio) === -1) throw new Error('Sitio no válido.');
  if (CFG.TURNOS.indexOf(turno) === -1) throw new Error('Turno no válido.');
  if (CFG.PRIORIDADES.indexOf(prio) === -1) throw new Error('Prioridad no válida.');
  if (CFG.TIPOS_SOLO_COORD.indexOf(tipo) > -1 && s.rol !== CFG.ROL_COORD) throw new Error('Solo el coordinador puede publicar instrucciones nuevas.');
  if (resp && listarOperadores().indexOf(resp) === -1) throw new Error('Responsable no válido.');
  let fecha = '';
  if (String(d.fecha || '').trim()) {
    fecha = textoAFecha_(d.fecha);
    if (!fecha) throw new Error('Fecha compromiso no válida.');
  }
  const reqId = String(d.reqId || '').slice(0, 64);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const cache = CacheService.getScriptCache();
    if (reqId && cache.get('R_' + reqId)) return obtenerTablero(token); // doble clic / reintento: ya se creó
    const ahora = new Date();
    const id = siguienteId_();
    const f = new Array(ENC_REG.length).fill('');
    f[C.ID - 1] = id;
    f[C.CREACION - 1] = ahora;
    f[C.CREADO_POR - 1] = s.nombre;
    f[C.TIPO - 1] = tipo;
    f[C.CAT - 1] = cat;
    f[C.SITIO - 1] = sitio;
    f[C.TURNO - 1] = turno;
    f[C.TITULO - 1] = txt_(titulo, 150);
    f[C.DETALLE - 1] = txt_(detalle, 5000);
    f[C.PRIO - 1] = prio;
    f[C.RESP - 1] = resp;
    f[C.FECHA - 1] = fecha;
    f[C.ESTADO - 1] = 'Abierto';
    f[C.ULT_ACT - 1] = ahora;
    f[C.ACT_POR - 1] = s.nombre;
    f[C.N_ACT - 1] = 0;
    SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.REG).appendRow(f);
    if (reqId) cache.put('R_' + reqId, id, 600);
    log_({ fecha: ahora, operador: s.nombre, accion: 'CREAR', id: id,
      detalle: tipo + ' · ' + titulo + ' · ' + detalle, nuevo: 'Abierto' });
  } finally {
    lock.releaseLock();
  }
  return obtenerTablero(token);
}

/**
 * acciones: 'Avance' | 'Mover a Abierto' | 'Mover a En seguimiento' | 'Cerrar' | 'Reabrir' | 'Anular' | 'Confirmar lectura'
 * estadoVisto: estado que el operador veía en pantalla; si ya cambió (otro operador), se rechaza el cambio.
 */
function actualizarTarjeta(token, id, accion, comentario, estadoVisto) {
  const s = sesion_(token);
  accion = String(accion || '');
  if (CFG.ACCIONES.indexOf(accion) === -1) throw new Error('Acción no válida.');
  comentario = String(comentario || '').trim().slice(0, 3000);
  if (accion !== 'Confirmar lectura' && !comentario) throw new Error('Escribe un comentario: queda en el historial.');
  if (accion === 'Anular' && s.rol !== CFG.ROL_COORD) throw new Error('Solo el coordinador puede anular.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const reg = SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.REG);
    const fila = buscarFila_(reg, id);
    if (fila < 0) throw new Error('No se encontró la tarjeta ' + id + '.');
    const datos = reg.getRange(fila, 1, 1, ENC_REG.length).getValues()[0];
    const ant = datos[C.ESTADO - 1];
    const tipo = datos[C.TIPO - 1];
    if (ant === 'Anulado') throw new Error('Esta tarjeta está anulada.');

    if (accion === 'Confirmar lectura') {
      if (CFG.TIPOS_AVISO.indexOf(tipo) === -1) throw new Error('Esta tarjeta no requiere confirmar lectura.');
      const lista = String(datos[C.LEIDO - 1] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (lista.indexOf(s.nombre) > -1) return obtenerTablero(token);
      lista.push(s.nombre);
      // La lectura NO altera estado, "última actualización" ni "último comentario".
      reg.getRange(fila, C.LEIDO).setValue(lista.join(', '));
      log_({ operador: s.nombre, accion: 'LECTURA', id: id, detalle: 'Confirmó lectura' });
      return obtenerTablero(token);
    }

    if (estadoVisto && estadoVisto !== ant) {
      throw new Error('Otro operador cambió esta tarjeta mientras la veías (ahora está en «' + ant + '»). Se actualizó el tablero; revisa y repite si hace falta.');
    }
    if (CFG.TIPOS_SOLO_COORD.indexOf(tipo) > -1 && s.rol !== CFG.ROL_COORD && accion !== 'Avance') {
      throw new Error('Las instrucciones solo las mueve, cierra o anula el coordinador. Puedes registrar un avance o confirmar lectura.');
    }

    let nuevo = ant;
    let codigo;
    switch (accion) {
      case 'Avance':
        if (ant === 'Cerrado') throw new Error('La tarjeta está cerrada: reábrela para registrar avances.');
        codigo = 'AVANCE'; if (ant === 'Abierto') nuevo = 'En seguimiento'; break;
      case 'Mover a Abierto':
      case 'Reabrir':
        if (ant === 'Abierto') throw new Error('La tarjeta ya está en «Abierto».');
        codigo = ant === 'Cerrado' ? 'REABRIR' : 'MOVER'; nuevo = 'Abierto'; break;
      case 'Mover a En seguimiento':
        if (ant === 'En seguimiento') throw new Error('La tarjeta ya está en «En seguimiento».');
        codigo = ant === 'Cerrado' ? 'REABRIR' : 'MOVER'; nuevo = 'En seguimiento'; break;
      case 'Cerrar':
        if (ant === 'Cerrado') throw new Error('La tarjeta ya está cerrada.');
        codigo = 'CERRAR'; nuevo = 'Cerrado'; break;
      case 'Anular': codigo = 'ANULAR'; nuevo = 'Anulado'; break;
      default: throw new Error('Acción no válida.');
    }

    const ahora = new Date();
    reg.getRange(fila, C.ESTADO, 1, 5).setValues([[
      nuevo, ahora, s.nombre, txt_(comentario, 3000), (Number(datos[C.N_ACT - 1]) || 0) + 1,
    ]]);
    log_({ fecha: ahora, operador: s.nombre, accion: codigo, id: id, detalle: comentario, anterior: ant, nuevo: nuevo });
  } finally {
    lock.releaseLock();
  }
  return obtenerTablero(token);
}

function obtenerHistorial(token, id) {
  sesion_(token);
  id = String(id || '');
  const h = SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.HIST);
  const n = h.getLastRow() - 1;
  if (n < 1 || !id) return [];
  // Lee primero solo la columna ID y después únicamente el bloque que contiene coincidencias.
  const ids = h.getRange(2, 5, n, 1).getValues();
  let primero = -1, ultimo = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) { if (primero < 0) primero = i; ultimo = i; }
  }
  if (primero < 0) return [];
  return h.getRange(2 + primero, 1, ultimo - primero + 1, ENC_HIST.length).getValues()
    .filter(function (f) { return String(f[4]) === id; })
    .map(function (f) {
      return { fecha: f[0] instanceof Date ? f[0].toISOString() : String(f[0]), operador: f[1], accion: f[3], detalle: f[5], anterior: f[6], nuevo: f[7] };
    })
    .reverse();
}

/* =========================================================
 * EXPORTACIÓN Y RESUMEN SEMANAL (solo coordinador)
 * ========================================================= */

/** formato: 'csv' | 'pdf'. Fechas 'yyyy-mm-dd', ambas incluidas. Devuelve {nombre, mime, base64}. */
function exportarHistorial(token, formato, desde, hasta) {
  const s = soloCoord_(token);
  const r = rango_(desde, hasta);
  const filas = filasHistorial_(r);
  const tz = CFG.TZ, fmt = 'dd/MM/yyyy HH:mm:ss';
  const base = 'Historial_' + desde + '_a_' + hasta;
  let blob;
  if (formato === 'csv') {
    const q = function (v) {
      v = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return '"' + v.replace(/"/g, '""') + '"';
    };
    const lineas = [ENC_HIST.map(q).join(',')].concat(filas.map(function (f) {
      return [Utilities.formatDate(f[0], tz, fmt), f[1], f[2], f[3], f[4], f[5], f[6], f[7]].map(q).join(',');
    }));
    blob = Utilities.newBlob('﻿' + lineas.join('\r\n'), 'text/csv', base + '.csv'); // BOM: Excel lee bien los acentos
  } else if (formato === 'pdf') {
    if (filas.length > 3000) throw new Error('Son ' + filas.length + ' registros; para el PDF reduce el rango (máx. 3000) o usa CSV.');
    const cuerpo = filas.map(function (f) {
      return '<tr><td>' + h_(Utilities.formatDate(f[0], tz, fmt)) + '</td><td>' + h_(f[1]) + '</td><td>' + h_(f[3]) + '</td><td>' + h_(f[4]) +
        '</td><td>' + h_(f[5]) + '</td><td>' + h_(f[6]) + (f[6] || f[7] ? ' → ' : '') + h_(f[7]) + '</td></tr>';
    }).join('');
    const html = '<html><head><meta charset="utf-8"><style>' + ESTILO_PDF + '</style></head><body>' +
      '<h2>Pizarra de Monitoreo – Historial de actividad</h2>' +
      '<p>Período: ' + h_(desde) + ' a ' + h_(hasta) + ' · ' + filas.length + ' registros · Generado ' +
      h_(Utilities.formatDate(new Date(), tz, fmt)) + ' por ' + h_(s.nombre) + ' (zona ' + tz + ')</p>' +
      '<table><tr><th>Fecha y hora</th><th>Operador</th><th>Acción</th><th>ID</th><th>Detalle</th><th>Cambio</th></tr>' + cuerpo + '</table></body></html>';
    blob = Utilities.newBlob(html, 'text/html', base + '.html').getAs('application/pdf').setName(base + '.pdf');
  } else {
    throw new Error('Formato no válido.');
  }
  log_({ operador: s.nombre, accion: 'EXPORTAR', detalle: 'Historial ' + formato.toUpperCase() + ' · ' + desde + ' a ' + hasta + ' · ' + filas.length + ' registros' });
  return { nombre: blob.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

/** Resumen del período en PDF (base del reporte consolidado del viernes). */
function exportarResumen(token, desde, hasta) {
  const s = soloCoord_(token);
  const r = rango_(desde, hasta);
  const nombre = 'Resumen_' + desde + '_a_' + hasta;
  const blob = Utilities.newBlob(resumenHtml_(desde, hasta, r), 'text/html', nombre + '.html').getAs('application/pdf').setName(nombre + '.pdf');
  log_({ operador: s.nombre, accion: 'EXPORTAR', detalle: 'Resumen PDF · ' + desde + ' a ' + hasta });
  return { nombre: blob.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

/** Menú: guarda el correo de destino y programa el envío cada viernes a las 13:00 (antes de la entrega de las 14:00). */
function activarResumenSemanal() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Resumen semanal', 'Correo(s) de destino, separados por coma:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const correos = r.getResponseText().split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  if (!correos.length || correos.some(function (c) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c); })) { ui.alert('Correo no válido.'); return; }
  PropertiesService.getScriptProperties().setProperty('EMAIL_RESUMEN', correos.join(','));
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'enviarResumenSemanal') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('enviarResumenSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(13).inTimezone(CFG.TZ).create();
  log_({ operador: 'Coordinador', accion: 'CONFIGURACIÓN', detalle: 'Resumen semanal activado (viernes 13:00) para: ' + correos.join(', ') });
  ui.alert('Listo. Se enviará cada viernes a las 13:00 a: ' + correos.join(', '));
}

/** Disparador de tiempo. Ignora llamadas que no vengan del disparador (es invocable desde el navegador). */
function enviarResumenSemanal(e) {
  if (!e || !e.triggerUid) return;
  const para = PropertiesService.getScriptProperties().getProperty('EMAIL_RESUMEN');
  if (!para) return;
  const hasta = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  const dow = Number(Utilities.formatDate(new Date(), CFG.TZ, 'u')); // 1 = lunes
  const desde = Utilities.formatDate(new Date(Date.now() - (dow - 1) * 86400000), CFG.TZ, 'yyyy-MM-dd');
  const html = resumenHtml_(desde, hasta, rango_(desde, hasta));
  const pdf = Utilities.newBlob(html, 'text/html', 'x.html').getAs('application/pdf').setName('Resumen_semanal_' + hasta + '.pdf');
  MailApp.sendEmail({ to: para, subject: 'Pizarra de Monitoreo – Resumen semanal ' + desde + ' a ' + hasta, htmlBody: html, attachments: [pdf] });
  log_({ operador: 'Sistema', accion: 'RESUMEN SEMANAL', detalle: 'Enviado a ' + para + ' (' + desde + ' a ' + hasta + ')' });
}

const ESTILO_PDF = 'body{font-family:Arial,sans-serif;font-size:9px}h2{font-size:15px}h3{font-size:12px;margin:14px 0 4px}' +
  'table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 4px;text-align:left;vertical-align:top}th{background:#e7f1fb}';

function h_(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function soloCoord_(token) {
  const s = sesion_(token);
  if (s.rol !== CFG.ROL_COORD) throw new Error('Solo el coordinador puede exportar.');
  return s;
}

/** {d0, d1}: d1 es exclusivo (medianoche del día siguiente a "hasta"). Máximo 366 días. */
function rango_(desde, hasta) {
  const a = textoAFecha_(desde), b = textoAFecha_(hasta);
  if (!a || !b) throw new Error('Fechas no válidas.');
  const d1 = new Date(b.getTime() + 86400000);
  if (d1 <= a) throw new Error('La fecha final es anterior a la inicial.');
  if ((d1 - a) / 86400000 > 366) throw new Error('El rango máximo es de 366 días.');
  return { d0: a, d1: d1 };
}

function filasHistorial_(r) {
  const h = SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.HIST);
  const n = h.getLastRow() - 1;
  if (n < 1) return [];
  return h.getRange(2, 1, n, ENC_HIST.length).getValues().filter(function (f) {
    return f[0] instanceof Date && f[0] >= r.d0 && f[0] < r.d1;
  });
}

function resumenHtml_(desde, hasta, r) {
  const tz = CFG.TZ, hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const reg = SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.REG);
  const n = reg.getLastRow() - 1;
  const rows = n > 0 ? reg.getRange(2, 1, n, ENC_REG.length).getValues().filter(function (f) { return f[0]; }) : [];
  const hist = filasHistorial_(r);
  const nOper = listarOperadores().length;
  const cuenta = function (arr, fn) { const o = {}; arr.forEach(function (x) { const k = fn(x) || '—'; o[k] = (o[k] || 0) + 1; }); return o; };
  const tabla = function (o) {
    const k = Object.keys(o);
    return k.length ? '<table>' + k.map(function (x) { return '<tr><td>' + h_(x) + '</td><td>' + o[x] + '</td></tr>'; }).join('') + '</table>' : '<p>—</p>';
  };
  const creadas = rows.filter(function (f) { return f[C.CREACION - 1] >= r.d0 && f[C.CREACION - 1] < r.d1; });
  const idsUnicos = function (accion) { const o = {}; hist.forEach(function (f) { if (f[3] === accion && f[4]) o[f[4]] = 1; }); return Object.keys(o).length; };
  const pendientes = rows.filter(function (f) { return f[C.ESTADO - 1] === 'Abierto' || f[C.ESTADO - 1] === 'En seguimiento'; });
  const vencidas = pendientes.filter(function (f) { return soloFecha_(f[C.FECHA - 1]) && soloFecha_(f[C.FECHA - 1]) < hoy; });
  const sinMov = pendientes.filter(function (f) { return Date.now() - f[C.ULT_ACT - 1] > 48 * 3600000; });
  const sinLeer = pendientes.filter(function (f) {
    const l = String(f[C.LEIDO - 1] || '').split(',').filter(function (x) { return x.trim(); }).length;
    return CFG.TIPOS_AVISO.indexOf(f[C.TIPO - 1]) > -1 && l < nOper;
  });
  const lista = function (arr) {
    return arr.length ? '<table><tr><th>ID</th><th>Sitio</th><th>Título</th><th>Prioridad</th><th>Responsable</th><th>Estado</th><th>Compromiso</th></tr>' +
      arr.slice(0, 40).map(function (f) {
        return '<tr><td>' + h_(f[0]) + '</td><td>' + h_(f[C.SITIO - 1]) + '</td><td>' + h_(f[C.TITULO - 1]) + '</td><td>' + h_(f[C.PRIO - 1]) + '</td><td>' +
          h_(f[C.RESP - 1]) + '</td><td>' + h_(f[C.ESTADO - 1]) + '</td><td>' + h_(soloFecha_(f[C.FECHA - 1])) + '</td></tr>';
      }).join('') + '</table>' + (arr.length > 40 ? '<p>… y ' + (arr.length - 40) + ' más.</p>' : '') : '<p>Ninguno.</p>';
  };
  return '<html><head><meta charset="utf-8"><style>' + ESTILO_PDF + '</style></head><body>' +
    '<h2>Pizarra de Monitoreo – Resumen del ' + h_(desde) + ' al ' + h_(hasta) + '</h2>' +
    '<p>Generado ' + h_(Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm')) + ' (' + tz + ')</p>' +
    '<h3>Indicadores del período</h3><table>' +
    '<tr><td>Registros creados</td><td>' + creadas.length + '</td></tr>' +
    '<tr><td>Tarjetas cerradas</td><td>' + idsUnicos('CERRAR') + '</td></tr>' +
    '<tr><td>Tarjetas anuladas</td><td>' + idsUnicos('ANULAR') + '</td></tr>' +
    '<tr><td>Incidentes registrados</td><td>' + creadas.filter(function (f) { return f[C.CAT - 1] === 'Incidente'; }).length + '</td></tr>' +
    '<tr><td>Pendientes hoy (abiertos + en seguimiento)</td><td>' + pendientes.length + '</td></tr>' +
    '<tr><td>Pendientes con compromiso vencido</td><td>' + vencidas.length + '</td></tr>' +
    '<tr><td>Pendientes sin movimiento en más de 48 h</td><td>' + sinMov.length + '</td></tr>' +
    '<tr><td>Avisos vigentes sin lectura de todos</td><td>' + sinLeer.length + '</td></tr></table>' +
    '<h3>Creados por sitio</h3>' + tabla(cuenta(creadas, function (f) { return f[C.SITIO - 1]; })) +
    '<h3>Creados por categoría</h3>' + tabla(cuenta(creadas, function (f) { return f[C.CAT - 1]; })) +
    '<h3>Pendientes con compromiso vencido</h3>' + lista(vencidas) +
    '<h3>Pendientes de prioridad alta</h3>' + lista(pendientes.filter(function (f) { return f[C.PRIO - 1] === 'Alta'; })) +
    '<h3>Pendientes sin movimiento en más de 48 h</h3>' + lista(sinMov) +
    '</body></html>';
}

/* =========================================================
 * DISPARADORES DE AUDITORÍA (cambios hechos directamente en la hoja)
 * ========================================================= */

function alEditarHoja(e) {
  if (!e || !e.range) return; // llamada desde el navegador o sin evento: ignorar
  try {
    const hoja = e.range.getSheet();
    const nombre = hoja.getName();
    const unica = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
    const esPin = nombre === CFG.HOJAS.CONF && (e.range.getColumn() <= 4 && e.range.getLastColumn() >= 3);
    let id = '';
    if (nombre === CFG.HOJAS.REG && e.range.getRow() > 1) id = hoja.getRange(e.range.getRow(), C.ID).getValue();
    log_({
      operador: 'Edición directa en la hoja',
      accion: 'EDICIÓN MANUAL',
      id: id,
      detalle: nombre + '!' + e.range.getA1Notation() + (esPin ? ' (PIN: valor oculto)' : '') + (unica ? '' : ' (varias celdas)'),
      anterior: unica && !esPin && e.oldValue !== undefined ? e.oldValue : '',
      nuevo: unica && !esPin ? e.range.getDisplayValue() : '',
    });
  } catch (err) {
    log_({ operador: 'Sistema', accion: 'ERROR', detalle: String(err) });
  }
}

function alCambiarHoja(e) {
  if (!e || !/^REMOVE/.test(String(e.changeType))) return;
  log_({
    operador: 'Edición directa en la hoja',
    accion: 'ELIMINACIÓN',
    detalle: 'Cambio estructural ' + e.changeType + '. Recuperable en Archivo > Historial de versiones.',
  });
}

/* =========================================================
 * UTILIDADES (guion bajo final = no invocables desde el navegador)
 * ========================================================= */

function sesion_(token) {
  const s = leerSesion_(token);
  if (!s) throw new Error('SESION_VENCIDA');
  // Rol y estado "activo" se leen de Configuración en cada llamada: un cambio de rol
  // o una baja surten efecto de inmediato, no al vencer la sesión.
  const op = leerConf_().filter(function (o) { return o.nombre === s.nombre && o.activo; })[0];
  if (!op) {
    CacheService.getScriptCache().remove('S_' + token);
    throw new Error('SESION_VENCIDA');
  }
  return { nombre: op.nombre, rol: op.rol };
}

function leerSesion_(token) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 64) return null;
  const v = CacheService.getScriptCache().get('S_' + token);
  return v ? JSON.parse(v) : null;
}

function leerConf_() {
  const h = SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.CONF);
  const n = h.getLastRow() - 1;
  if (n < 1) return [];
  return h.getRange(2, 1, n, 5).getValues()
    .filter(function (f) { return String(f[0]).trim(); })
    .map(function (f) {
      return {
        nombre: String(f[0]).trim(),
        rol: /^coordinador$/i.test(String(f[1]).trim()) ? CFG.ROL_COORD : 'Operador',
        huella: String(f[3]).trim(),
        activo: !/^no$/i.test(String(f[4]).trim()),
      };
    });
}

function huella_(nombre, pin) {
  const sal = PropertiesService.getScriptProperties().getProperty('SAL') || '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + nombre + '|' + pin, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Texto recortado y neutralizado: una celda que empiece con = + - @ se tomaría como fórmula. */
function txt_(v, max) {
  let s = String(v == null ? '' : v).trim();
  if (max) s = s.slice(0, max);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function fechaISO_(d) { return d instanceof Date ? d.toISOString() : ''; }
function soloFecha_(d) { return d instanceof Date ? Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd') : ''; }

function filaATarjeta_(f) {
  return {
    id: f[C.ID - 1], creacion: fechaISO_(f[C.CREACION - 1]), creadoPor: f[C.CREADO_POR - 1], tipo: f[C.TIPO - 1],
    categoria: f[C.CAT - 1], sitio: f[C.SITIO - 1], turno: f[C.TURNO - 1], titulo: f[C.TITULO - 1],
    detalle: f[C.DETALLE - 1], prioridad: f[C.PRIO - 1], responsable: f[C.RESP - 1], fecha: soloFecha_(f[C.FECHA - 1]),
    estado: f[C.ESTADO - 1], ultAct: fechaISO_(f[C.ULT_ACT - 1]), actPor: f[C.ACT_POR - 1], ultCom: f[C.ULT_COM - 1],
    nAct: f[C.N_ACT - 1], leido: f[C.LEIDO - 1] ? String(f[C.LEIDO - 1]).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [],
  };
}

function buscarFila_(reg, id) {
  const n = reg.getLastRow() - 1;
  if (n < 1) return -1;
  const ids = reg.getRange(2, C.ID, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function siguienteId_() {
  const props = PropertiesService.getScriptProperties();
  const n = (Number(props.getProperty('CONTADOR')) || 0) + 1;
  props.setProperty('CONTADOR', String(n));
  return CFG.PREFIJO_ID + ('0000' + n).slice(-Math.max(4, String(n).length));
}

/** 'yyyy-mm-dd' -> Date a medianoche de El Salvador; null si no es una fecha real. */
function textoAFecha_(t) {
  const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  try {
    const d = Utilities.parseDate(m[0], CFG.TZ, 'yyyy-MM-dd');
    return Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd') === m[0] ? d : null;
  } catch (e) { return null; }
}

function log_(o) {
  let cuenta = '';
  try { cuenta = Session.getActiveUser().getEmail(); } catch (e) { }
  SpreadsheetApp.getActive().getSheetByName(CFG.HOJAS.HIST).appendRow([
    o.fecha || new Date(), txt_(o.operador), cuenta, o.accion || '', o.id || '', txt_(o.detalle, 6000),
    txt_(o.anterior), txt_(o.nuevo),
  ]);
}

function hoja_(ss, nombre, enc) {
  let h = ss.getSheetByName(nombre);
  if (!h) h = ss.insertSheet(nombre);
  h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setBackground('#e7f1fb');
  h.setFrozenRows(1);
  return h;
}

function proteger_(h) {
  const p = h.protect().setDescription('Solo el propietario. Los cambios quedan en Historial.');
  p.addEditor(Session.getEffectiveUser());
  p.removeEditors(p.getEditors());
  if (p.canDomainEdit()) p.setDomainEdit(false);
}
