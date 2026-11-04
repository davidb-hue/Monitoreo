// Lógica de negocio: equivale a Codigo.gs, con PostgreSQL (Neon) en lugar de Google Sheets.
// Concurrencia: las escrituras van en transacciones; actualizar una tarjeta bloquea su fila (FOR UPDATE).
import crypto from 'node:crypto'
import PDFDocument from 'pdfkit'
import { pool, tx } from './db.js'

export const CFG = {
  TZ: 'America/El_Salvador',
  TIPOS: ['Seguimiento', 'Aviso importante', 'Instrucción nueva', 'Cambio de actividad', 'Otro'],
  TIPOS_AVISO: ['Aviso importante', 'Instrucción nueva', 'Cambio de actividad'],
  TIPOS_SOLO_COORD: ['Instrucción nueva'],
  CATEGORIAS: ['Revisión de video', 'Seguimiento GPS', 'Cámara / equipo', 'Incidente', 'Relevo / turno', 'Otro'],
  SITIOS: ['El Salvador', 'Guatemala', 'Honduras', 'Nicaragua', 'Costa Rica', 'Regional'],
  TURNOS: ['Mañana (06:00–14:00)', 'Tarde (14:00–22:00)', 'Noche (22:00–06:00)', 'Administrativo'],
  PRIORIDADES: ['Alta', 'Media', 'Baja'],
  ACCIONES: ['Avance', 'Mover a Abierto', 'Mover a En seguimiento', 'Cerrar', 'Reabrir', 'Anular', 'Confirmar lectura'],
  DIAS_CERRADOS_VISIBLES: 7,
  SESION_MS: 6 * 3600 * 1000,
  MAX_INTENTOS: 5,
  BLOQUEO_MS: 15 * 60 * 1000,
  ROL_COORD: 'Coordinador',
}

export class ErrorApp extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status }
}

/* ---------- utilidades ---------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const PEPPER = process.env.PEPPER || ''
export const huella = (sal, nombre, pin) => sha(`${PEPPER}|${sal}|${nombre}|${pin}`) // SHA-256 con sal por operador
const iguales = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
export const pinDebil = (pin) => /^(\d)\1+$/.test(pin) || ['1234', '4321', '123456', '654321', '2580', '0123', '012345'].includes(pin)
export const pinValido = (pin) => /^\d{4,6}$/.test(pin) && !pinDebil(pin)

const fmtTZ = (d) => new Date(d).toLocaleString('sv-SE', { timeZone: CFG.TZ }) // yyyy-mm-dd hh:mm:ss
const hoyTZ = () => new Date().toLocaleDateString('en-CA', { timeZone: CFG.TZ })

/** 'yyyy-mm-dd' -> Date (medianoche de El Salvador, UTC-6 sin horario de verano); null si no es fecha real. */
function textoAFecha(t) {
  const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(`${m[0]}T00:00:00-06:00`)
  return !isNaN(d) && d.toLocaleDateString('en-CA', { timeZone: CFG.TZ }) === m[0] ? d : null
}

function rango(desde, hasta) {
  const a = textoAFecha(desde), b = textoAFecha(hasta)
  if (!a || !b) throw new ErrorApp('Fechas no válidas.')
  const d1 = new Date(b.getTime() + 86400000)
  if (d1 <= a) throw new ErrorApp('La fecha final es anterior a la inicial.')
  if ((d1 - a) / 86400000 > 366) throw new ErrorApp('El rango máximo es de 366 días.')
  return { d0: a, d1 }
}

/** Registra en el historial. `c` puede ser el pool o el cliente de una transacción. */
export function log(o, c = pool) {
  return c.query(
    'INSERT INTO historial(fecha,operador,accion,tarjeta_id,detalle,anterior,nuevo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [o.fecha || new Date(), String(o.operador || ''), o.accion || '', o.id || '', String(o.detalle || '').slice(0, 6000), String(o.anterior || ''), String(o.nuevo || '')],
  )
}

const COLS = `id, creacion, creado_por, tipo, categoria, sitio, turno, titulo, detalle, prioridad, responsable,
  COALESCE(fecha::text, '') AS fecha, estado, ult_act, act_por, ult_com, n_act, leido`
const aTarjeta = (r) => ({
  id: r.id, creacion: r.creacion.toISOString(), creadoPor: r.creado_por, tipo: r.tipo, categoria: r.categoria, sitio: r.sitio, turno: r.turno,
  titulo: r.titulo, detalle: r.detalle, prioridad: r.prioridad, responsable: r.responsable, fecha: r.fecha, estado: r.estado,
  ultAct: r.ult_act.toISOString(), actPor: r.act_por, ultCom: r.ult_com, nAct: r.n_act, leido: r.leido,
})

/* ---------- operadores y sesión ---------- */
export async function listarOperadores() {
  const { rows } = await pool.query('SELECT nombre FROM operadores WHERE activo ORDER BY id')
  return rows.map((o) => o.nombre)
}

export async function iniciarSesion(nombre, pin) {
  nombre = String(nombre || '').trim().slice(0, 80)
  pin = String(pin || '').trim().slice(0, 12)
  // La transacción devuelve el resultado (no lanza) para que el conteo de intentos fallidos SÍ se guarde.
  const r = await tx(async (c) => {
    const { rows: [op] } = await c.query('SELECT * FROM operadores WHERE nombre=$1 AND activo FOR UPDATE', [nombre])
    if (!op) return { error: 'Operador no válido.' } // no se registra: evita llenar el historial con basura
    const ahora = Date.now()
    let intentos = op.intentos
    if (intentos >= CFG.MAX_INTENTOS) {
      const hasta = op.bloqueado_hasta ? op.bloqueado_hasta.getTime() : 0
      if (hasta > ahora) return { error: `Acceso bloqueado por ${CFG.MAX_INTENTOS} intentos fallidos. Espera ${Math.ceil((hasta - ahora) / 60000)} min o pide al coordinador desbloquear.` }
      intentos = 0
    }
    if (!op.huella) return { error: 'Este operador aún no tiene PIN asignado.' }
    if (!iguales(op.huella, huella(op.sal, op.nombre, pin))) {
      intentos++
      const bloquea = intentos >= CFG.MAX_INTENTOS
      await c.query('UPDATE operadores SET intentos=$1, bloqueado_hasta=$2 WHERE id=$3', [intentos, bloquea ? new Date(ahora + CFG.BLOQUEO_MS) : null, op.id])
      await log({ operador: op.nombre, accion: 'PIN INCORRECTO', detalle: `Intento ${intentos} de ${CFG.MAX_INTENTOS}${bloquea ? ' — ACCESO BLOQUEADO' : ''}` }, c)
      return { error: bloquea ? 'PIN incorrecto. Acceso bloqueado 15 min.' : `PIN incorrecto. Intentos restantes: ${CFG.MAX_INTENTOS - intentos}.` }
    }
    await c.query('UPDATE operadores SET intentos=0, bloqueado_hasta=NULL WHERE id=$1', [op.id])
    await c.query('DELETE FROM sesiones WHERE expira < now()')
    await c.query("DELETE FROM solicitudes WHERE creado < now() - interval '1 day'")
    const token = crypto.randomBytes(32).toString('hex')
    await c.query('INSERT INTO sesiones(token_hash,nombre,expira) VALUES ($1,$2,$3)', [sha(token), op.nombre, new Date(ahora + CFG.SESION_MS)])
    await log({ operador: op.nombre, accion: 'INICIO DE SESIÓN' }, c)
    return { ok: { token, nombre: op.nombre, rol: op.rol } }
  })
  if (r.error) throw new ErrorApp(r.error, 401)
  return r.ok
}

/** Valida el token y relee rol/activo en cada llamada: una baja o cambio de rol surte efecto de inmediato. */
export async function sesion(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 128) throw new ErrorApp('SESION_VENCIDA', 401)
  const { rows: [f] } = await pool.query(
    `SELECT o.nombre, o.rol FROM sesiones s JOIN operadores o ON o.nombre = s.nombre AND o.activo
     WHERE s.token_hash=$1 AND s.expira > now()`, [sha(token)])
  if (!f) throw new ErrorApp('SESION_VENCIDA', 401)
  return { nombre: f.nombre, rol: f.rol }
}

export async function cerrarSesion(token, s) {
  await pool.query('DELETE FROM sesiones WHERE token_hash=$1', [sha(token)])
  await log({ operador: s.nombre, accion: 'CIERRE DE SESIÓN' })
  return true
}

const soloCoord = (s) => { if (s.rol !== CFG.ROL_COORD) throw new ErrorApp('Solo el coordinador puede exportar.', 403) }

/* ---------- tablero ---------- */
export async function tablero(s) {
  const limite = new Date(Date.now() - CFG.DIAS_CERRADOS_VISIBLES * 86400000)
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM tarjetas WHERE estado IN ('Abierto','En seguimiento') OR (estado='Cerrado' AND ult_act >= $1)`, [limite])
  const coord = s.rol === CFG.ROL_COORD
  return {
    usuario: s,
    tarjetas: rows.map(aTarjeta),
    operadores: await listarOperadores(),
    catalogos: {
      tipos: coord ? CFG.TIPOS : CFG.TIPOS.filter((t) => !CFG.TIPOS_SOLO_COORD.includes(t)),
      tiposAviso: CFG.TIPOS_AVISO, tiposSoloCoord: CFG.TIPOS_SOLO_COORD,
      categorias: CFG.CATEGORIAS, sitios: CFG.SITIOS, turnos: CFG.TURNOS, prioridades: CFG.PRIORIDADES,
    },
    ahora: new Date().toISOString(),
  }
}

export async function crearTarjeta(s, d) {
  const v = {
    tipo: String(d.tipo || ''), categoria: String(d.categoria || ''), sitio: String(d.sitio || ''), turno: String(d.turno || ''),
    prioridad: String(d.prioridad || ''), responsable: String(d.responsable || '').trim(),
    titulo: String(d.titulo || '').trim().slice(0, 150), detalle: String(d.detalle || '').trim().slice(0, 5000),
    fecha: String(d.fecha || '').trim(), reqId: String(d.reqId || '').slice(0, 64),
  }
  if (!v.titulo) throw new ErrorApp('Falta completar: título.')
  if (!v.detalle) throw new ErrorApp('Falta completar: detalle.')
  if (!CFG.TIPOS.includes(v.tipo)) throw new ErrorApp('Tipo no válido.')
  if (!CFG.CATEGORIAS.includes(v.categoria)) throw new ErrorApp('Categoría no válida.')
  if (!CFG.SITIOS.includes(v.sitio)) throw new ErrorApp('Sitio no válido.')
  if (!CFG.TURNOS.includes(v.turno)) throw new ErrorApp('Turno no válido.')
  if (!CFG.PRIORIDADES.includes(v.prioridad)) throw new ErrorApp('Prioridad no válida.')
  if (CFG.TIPOS_SOLO_COORD.includes(v.tipo) && s.rol !== CFG.ROL_COORD) throw new ErrorApp('Solo el coordinador puede publicar instrucciones nuevas.', 403)
  if (v.responsable && !(await listarOperadores()).includes(v.responsable)) throw new ErrorApp('Responsable no válido.')
  if (v.fecha && !textoAFecha(v.fecha)) throw new ErrorApp('Fecha compromiso no válida.')

  await tx(async (c) => {
    if (v.reqId) { // doble clic / reintento: la clave primaria garantiza que solo uno cree la tarjeta
      const r = await c.query('INSERT INTO solicitudes(req_id) VALUES ($1) ON CONFLICT DO NOTHING', [v.reqId])
      if (!r.rowCount) return
    }
    const { rows: [t] } = await c.query(
      `INSERT INTO tarjetas(creado_por,tipo,categoria,sitio,turno,titulo,detalle,prioridad,responsable,fecha,act_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$1) RETURNING id`,
      [s.nombre, v.tipo, v.categoria, v.sitio, v.turno, v.titulo, v.detalle, v.prioridad, v.responsable, v.fecha || null])
    if (v.reqId) await c.query('UPDATE solicitudes SET tarjeta_id=$1 WHERE req_id=$2', [t.id, v.reqId])
    await log({ operador: s.nombre, accion: 'CREAR', id: t.id, detalle: `${v.tipo} · ${v.titulo} · ${v.detalle}`, nuevo: 'Abierto' }, c)
  })
  return tablero(s)
}

export async function actualizarTarjeta(s, id, accion, comentario, estadoVisto) {
  accion = String(accion || '')
  if (!CFG.ACCIONES.includes(accion)) throw new ErrorApp('Acción no válida.')
  comentario = String(comentario || '').trim().slice(0, 3000)
  if (accion !== 'Confirmar lectura' && !comentario) throw new ErrorApp('Escribe un comentario: queda en el historial.')
  if (accion === 'Anular' && s.rol !== CFG.ROL_COORD) throw new ErrorApp('Solo el coordinador puede anular.', 403)
  id = String(id || ''); estadoVisto = String(estadoVisto || '')

  await tx(async (c) => {
    const { rows: [t] } = await c.query('SELECT id, tipo, estado, leido FROM tarjetas WHERE id=$1 FOR UPDATE', [id])
    if (!t) throw new ErrorApp(`No se encontró la tarjeta ${id}.`, 404)
    const ant = t.estado
    if (ant === 'Anulado') throw new ErrorApp('Esta tarjeta está anulada.')

    if (accion === 'Confirmar lectura') {
      if (!CFG.TIPOS_AVISO.includes(t.tipo)) throw new ErrorApp('Esta tarjeta no requiere confirmar lectura.')
      if (t.leido.includes(s.nombre)) return
      // La lectura NO altera estado, "última actualización" ni "último comentario".
      await c.query('UPDATE tarjetas SET leido = array_append(leido, $1) WHERE id=$2', [s.nombre, id])
      await log({ operador: s.nombre, accion: 'LECTURA', id, detalle: 'Confirmó lectura' }, c)
      return
    }

    if (estadoVisto && estadoVisto !== ant) {
      throw new ErrorApp(`Otro operador cambió esta tarjeta mientras la veías (ahora está en «${ant}»). Se actualizó el tablero; revisa y repite si hace falta.`, 409)
    }
    if (CFG.TIPOS_SOLO_COORD.includes(t.tipo) && s.rol !== CFG.ROL_COORD && accion !== 'Avance') {
      throw new ErrorApp('Las instrucciones solo las mueve, cierra o anula el coordinador. Puedes registrar un avance o confirmar lectura.', 403)
    }
    let nuevo = ant, codigo
    switch (accion) {
      case 'Avance':
        if (ant === 'Cerrado') throw new ErrorApp('La tarjeta está cerrada: reábrela para registrar avances.')
        codigo = 'AVANCE'; if (ant === 'Abierto') nuevo = 'En seguimiento'; break
      case 'Mover a Abierto':
      case 'Reabrir':
        if (ant === 'Abierto') throw new ErrorApp('La tarjeta ya está en «Abierto».')
        codigo = ant === 'Cerrado' ? 'REABRIR' : 'MOVER'; nuevo = 'Abierto'; break
      case 'Mover a En seguimiento':
        if (ant === 'En seguimiento') throw new ErrorApp('La tarjeta ya está en «En seguimiento».')
        codigo = ant === 'Cerrado' ? 'REABRIR' : 'MOVER'; nuevo = 'En seguimiento'; break
      case 'Cerrar':
        if (ant === 'Cerrado') throw new ErrorApp('La tarjeta ya está cerrada.')
        codigo = 'CERRAR'; nuevo = 'Cerrado'; break
      case 'Anular': codigo = 'ANULAR'; nuevo = 'Anulado'; break
      default: throw new ErrorApp('Acción no válida.')
    }
    const ahora = new Date()
    await c.query('UPDATE tarjetas SET estado=$1, ult_act=$2, act_por=$3, ult_com=$4, n_act=n_act+1 WHERE id=$5', [nuevo, ahora, s.nombre, comentario, id])
    await log({ fecha: ahora, operador: s.nombre, accion: codigo, id, detalle: comentario, anterior: ant, nuevo }, c)
  })
  return tablero(s)
}

export async function historial(id) {
  const { rows } = await pool.query(
    'SELECT fecha, operador, accion, detalle, anterior, nuevo FROM historial WHERE tarjeta_id=$1 ORDER BY id DESC', [String(id || '')])
  return rows.map((r) => ({ ...r, fecha: r.fecha.toISOString() }))
}

/* ---------- exportación (coordinador) ---------- */
const pdfBuffer = (dibujar) => new Promise((res, rej) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36 })
  const partes = []
  doc.on('data', (c) => partes.push(c)); doc.on('end', () => res(Buffer.concat(partes))); doc.on('error', rej)
  dibujar(doc); doc.end()
})
const archivo = (nombre, mime, buf) => ({ nombre, mime, base64: buf.toString('base64') })

export async function exportarHistorial(s, formato, desde, hasta) {
  soloCoord(s)
  const r = rango(desde, hasta)
  const { rows: filas } = await pool.query('SELECT * FROM historial WHERE fecha >= $1 AND fecha < $2 ORDER BY id', [r.d0, r.d1])
  const base = `Historial_${desde}_a_${hasta}`
  let res
  if (formato === 'csv') {
    const q = (v) => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"' }
    const lineas = [['Fecha y hora', 'Operador', 'Acción', 'ID', 'Detalle', 'Valor anterior', 'Valor nuevo'].map(q).join(',')]
      .concat(filas.map((f) => [fmtTZ(f.fecha), f.operador, f.accion, f.tarjeta_id, f.detalle, f.anterior, f.nuevo].map(q).join(',')))
    res = archivo(base + '.csv', 'text/csv', Buffer.from('﻿' + lineas.join('\r\n'), 'utf8')) // BOM: Excel lee bien los acentos
  } else if (formato === 'pdf') {
    if (filas.length > 3000) throw new ErrorApp(`Son ${filas.length} registros; para el PDF reduce el rango (máx. 3000) o usa CSV.`)
    const buf = await pdfBuffer((doc) => {
      doc.fontSize(14).text('Pizarra de Monitoreo – Historial de actividad')
      doc.fontSize(8).text(`Período: ${desde} a ${hasta} · ${filas.length} registros · Generado ${fmtTZ(new Date())} por ${s.nombre} (${CFG.TZ})`).moveDown()
      filas.forEach((f) => {
        const cambio = f.anterior || f.nuevo ? ` (${f.anterior || '—'} → ${f.nuevo || '—'})` : ''
        doc.fontSize(7).text(`${fmtTZ(f.fecha)} | ${f.operador} | ${f.accion} | ${f.tarjeta_id} | ${f.detalle}${cambio}`)
      })
    })
    res = archivo(base + '.pdf', 'application/pdf', buf)
  } else throw new ErrorApp('Formato no válido.')
  await log({ operador: s.nombre, accion: 'EXPORTAR', detalle: `Historial ${formato.toUpperCase()} · ${desde} a ${hasta} · ${filas.length} registros` })
  return res
}

export async function exportarResumen(s, desde, hasta) {
  soloCoord(s)
  const r = rango(desde, hasta)
  const hoy = hoyTZ()
  const nOper = (await listarOperadores()).length
  const { rows: todas } = await pool.query(`SELECT ${COLS} FROM tarjetas`)
  const unicos = async (accion) => (await pool.query(
    "SELECT COUNT(DISTINCT tarjeta_id)::int AS n FROM historial WHERE accion=$1 AND fecha>=$2 AND fecha<$3 AND tarjeta_id<>''", [accion, r.d0, r.d1])).rows[0].n
  const creadas = todas.filter((t) => t.creacion >= r.d0 && t.creacion < r.d1)
  const pend = todas.filter((t) => t.estado === 'Abierto' || t.estado === 'En seguimiento')
  const venc = pend.filter((t) => t.fecha && t.fecha < hoy)
  const sinMov = pend.filter((t) => Date.now() - t.ult_act > 48 * 3600000)
  const sinLeer = pend.filter((t) => CFG.TIPOS_AVISO.includes(t.tipo) && t.leido.length < nOper)
  const nCerradas = await unicos('CERRAR'), nAnuladas = await unicos('ANULAR')
  const grupos = (arr, k) => arr.reduce((o, t) => { o[t[k] || '—'] = (o[t[k] || '—'] || 0) + 1; return o }, {})
  const nombre = `Resumen_${desde}_a_${hasta}`
  const buf = await pdfBuffer((doc) => {
    const h = (t) => doc.moveDown(0.8).fontSize(11).text(t).fontSize(8)
    const lista = (arr) => {
      if (!arr.length) doc.text('Ninguno.')
      arr.slice(0, 40).forEach((t) => doc.text(`${t.id} | ${t.sitio} | ${t.titulo} | ${t.prioridad} | ${t.responsable || '—'} | ${t.estado} | ${t.fecha || '—'}`))
      if (arr.length > 40) doc.text(`… y ${arr.length - 40} más.`)
    }
    const tabla = (o) => { const k = Object.keys(o); if (!k.length) doc.text('—'); k.forEach((x) => doc.text(`${x}: ${o[x]}`)) }
    doc.fontSize(14).text(`Pizarra de Monitoreo – Resumen del ${desde} al ${hasta}`)
    doc.fontSize(8).text(`Generado ${fmtTZ(new Date())} (${CFG.TZ})`)
    h('Indicadores del período')
    doc.text(`Registros creados: ${creadas.length}`)
    doc.text(`Tarjetas cerradas: ${nCerradas}`)
    doc.text(`Tarjetas anuladas: ${nAnuladas}`)
    doc.text(`Incidentes registrados: ${creadas.filter((t) => t.categoria === 'Incidente').length}`)
    doc.text(`Pendientes hoy (abiertos + en seguimiento): ${pend.length}`)
    doc.text(`Pendientes con compromiso vencido: ${venc.length}`)
    doc.text(`Pendientes sin movimiento en más de 48 h: ${sinMov.length}`)
    doc.text(`Avisos vigentes sin lectura de todos: ${sinLeer.length}`)
    h('Creados por sitio'); tabla(grupos(creadas, 'sitio'))
    h('Creados por categoría'); tabla(grupos(creadas, 'categoria'))
    h('Pendientes con compromiso vencido'); lista(venc)
    h('Pendientes de prioridad alta'); lista(pend.filter((t) => t.prioridad === 'Alta'))
    h('Pendientes sin movimiento en más de 48 h'); lista(sinMov)
  })
  await log({ operador: s.nombre, accion: 'EXPORTAR', detalle: `Resumen PDF · ${desde} a ${hasta}` })
  return archivo(nombre + '.pdf', 'application/pdf', buf)
}
