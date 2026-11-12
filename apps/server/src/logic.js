// Lógica de negocio: equivale a Codigo.gs, con PostgreSQL (Neon) en lugar de Google Sheets.
// Concurrencia: las escrituras van en transacciones; actualizar una tarjeta bloquea su fila (FOR UPDATE).
import crypto from 'node:crypto'
import PDFDocument from 'pdfkit'
import { pool, tx } from './db.js'
import { libro, csvArchivo } from './xlsx.js'
import { construirReporte } from './reportes.js'

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
  MAX_VENCE_HORAS: 2160, // 90 días
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

/** Momento híbrido: por horas desde "base", o por fecha/hora exacta ISO. null si no se define. */
function calcMomento(base, horas, fechaISO, etiqueta) {
  if (horas !== undefined && horas !== '' && horas !== null) {
    const h = Number(horas)
    if (!Number.isFinite(h) || h <= 0 || h > CFG.MAX_VENCE_HORAS) throw new ErrorApp(`Horas de ${etiqueta} no válidas (1 a ${CFG.MAX_VENCE_HORAS}).`)
    return new Date(base.getTime() + h * 3600000)
  }
  if (fechaISO) {
    const v = new Date(fechaISO)
    if (isNaN(v)) throw new ErrorApp(`Fecha y hora de ${etiqueta} no válidas.`)
    if (v.getTime() - base.getTime() > 400 * 86400000) throw new ErrorApp(`La fecha de ${etiqueta} está demasiado lejos (máx. ~1 año).`)
    return v
  }
  return null
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
  COALESCE(fecha::text, '') AS fecha, estado, ult_act, act_por, ult_com, n_act, leido, vence, inicia, cerrado_en`
const iso = (d) => (d instanceof Date ? d.toISOString() : '')
const aTarjeta = (r) => ({
  id: r.id, creacion: iso(r.creacion), creadoPor: r.creado_por, tipo: r.tipo, categoria: r.categoria, sitio: r.sitio, turno: r.turno,
  titulo: r.titulo, detalle: r.detalle, prioridad: r.prioridad, responsable: r.responsable, fecha: r.fecha, estado: r.estado,
  ultAct: iso(r.ult_act), actPor: r.act_por, ultCom: r.ult_com, nAct: r.n_act, leido: r.leido,
  vence: iso(r.vence), inicia: iso(r.inicia), cerradoEn: iso(r.cerrado_en),
})

/* ---------- operadores y sesión ---------- */
export async function listarOperadores() {
  const { rows } = await pool.query('SELECT nombre FROM operadores WHERE activo ORDER BY id')
  return rows.map((o) => o.nombre)
}

export async function iniciarSesion(nombre, pin) {
  nombre = String(nombre || '').trim().slice(0, 80)
  pin = String(pin || '').trim().slice(0, 12)
  const r = await tx(async (c) => {
    const { rows: [op] } = await c.query('SELECT * FROM operadores WHERE nombre=$1 AND activo FOR UPDATE', [nombre])
    if (!op) return { error: 'Operador no válido.' }
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

const esCoord = (s) => s.rol === CFG.ROL_COORD
const soloCoord = (s) => { if (!esCoord(s)) throw new ErrorApp('Solo el administrador (coordinador) puede hacer esto.', 403) }

/* ---------- catálogo (listas administrables: tipo, prioridad, categoría, sitio, turno, responsable) ---------- */
export const GRUPOS = ['tipo', 'prioridad', 'categoria', 'sitio', 'turno', 'responsable']

// Caché corta por instancia: evita leer el catálogo en cada operación. Se invalida al editarlo.
let _cat = null, _catTs = 0
const invalidarCat = () => { _cat = null }
async function cat() {
  if (_cat && Date.now() - _catTs < 10000) return _cat
  const { rows } = await pool.query('SELECT grupo, valor, aviso, solo_coord FROM catalogo WHERE activo ORDER BY orden, id')
  const g = (name) => rows.filter((r) => r.grupo === name).map((r) => r.valor)
  _cat = {
    tipos: g('tipo'), prioridades: g('prioridad'), categorias: g('categoria'),
    sitios: g('sitio'), turnos: g('turno'), responsables: g('responsable'),
    tiposAviso: rows.filter((r) => r.grupo === 'tipo' && r.aviso).map((r) => r.valor),
    tiposSoloCoord: rows.filter((r) => r.grupo === 'tipo' && r.solo_coord).map((r) => r.valor),
  }
  _catTs = Date.now()
  return _cat
}

/* ---------- tablero ---------- */
export async function tablero(s) {
  const limite = new Date(Date.now() - CFG.DIAS_CERRADOS_VISIBLES * 86400000)
  const [{ rows }, c] = await Promise.all([
    pool.query(`SELECT ${COLS} FROM tarjetas WHERE estado IN ('Abierto','En seguimiento') OR (estado='Cerrado' AND ult_act >= $1)`, [limite]),
    cat(),
  ])
  return {
    usuario: s,
    tarjetas: rows.map(aTarjeta),
    operadores: await listarOperadores(),
    catalogos: {
      tipos: esCoord(s) ? c.tipos : c.tipos.filter((t) => !c.tiposSoloCoord.includes(t)),
      tiposAviso: c.tiposAviso, tiposSoloCoord: c.tiposSoloCoord,
      categorias: c.categorias, sitios: c.sitios, turnos: c.turnos, prioridades: c.prioridades, responsables: c.responsables,
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
  const c = await cat()
  if (!c.tipos.includes(v.tipo)) throw new ErrorApp('Tipo no válido.')
  if (!c.categorias.includes(v.categoria)) throw new ErrorApp('Categoría no válida.')
  if (!c.sitios.includes(v.sitio)) throw new ErrorApp('Sitio no válido.')
  if (!c.turnos.includes(v.turno)) throw new ErrorApp('Turno no válido.')
  if (!c.prioridades.includes(v.prioridad)) throw new ErrorApp('Prioridad no válida.')
  if (c.tiposSoloCoord.includes(v.tipo) && !esCoord(s)) throw new ErrorApp('Solo el coordinador puede publicar instrucciones nuevas.', 403)
  if (v.responsable && !c.responsables.includes(v.responsable)) throw new ErrorApp('Responsable no válido.')
  if (v.fecha && !textoAFecha(v.fecha)) throw new ErrorApp('Fecha compromiso no válida.')
  const ahora = new Date()
  const inicia = calcMomento(ahora, d.iniciaHoras, d.inicia, 'inicio') // «a partir de»
  const vence = calcMomento(inicia || ahora, d.venceHoras, d.vence, 'cierre') // el límite cuenta desde el inicio si lo hay

  await tx(async (c) => {
    if (v.reqId) {
      const r = await c.query('INSERT INTO solicitudes(req_id) VALUES ($1) ON CONFLICT DO NOTHING', [v.reqId])
      if (!r.rowCount) return
    }
    const { rows: [t] } = await c.query(
      `INSERT INTO tarjetas(creado_por,tipo,categoria,sitio,turno,titulo,detalle,prioridad,responsable,fecha,vence,inicia,act_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$1) RETURNING id`,
      [s.nombre, v.tipo, v.categoria, v.sitio, v.turno, v.titulo, v.detalle, v.prioridad, v.responsable, v.fecha || null, vence, inicia])
    if (v.reqId) await c.query('UPDATE solicitudes SET tarjeta_id=$1 WHERE req_id=$2', [t.id, v.reqId])
    const extra = (inicia ? ` · Inicia: ${fmtTZ(inicia)}` : '') + (vence ? ` · Límite: ${fmtTZ(vence)}` : '')
    await log({ operador: s.nombre, accion: 'CREAR', id: t.id, detalle: `${v.tipo} · ${v.titulo} · ${v.detalle}${extra}`, nuevo: 'Abierto' }, c)
  })
  return tablero(s)
}

export async function actualizarTarjeta(s, id, accion, comentario, estadoVisto) {
  accion = String(accion || '')
  if (!CFG.ACCIONES.includes(accion)) throw new ErrorApp('Acción no válida.')
  comentario = String(comentario || '').trim().slice(0, 3000)
  if (accion !== 'Confirmar lectura' && !comentario) throw new ErrorApp('Escribe un comentario: queda en el historial.')
  if (accion === 'Anular' && !esCoord(s)) throw new ErrorApp('Solo el coordinador puede anular.', 403)
  id = String(id || ''); estadoVisto = String(estadoVisto || '')
  const cfg = await cat()

  await tx(async (c) => {
    const { rows: [t] } = await c.query('SELECT id, tipo, estado, leido FROM tarjetas WHERE id=$1 FOR UPDATE', [id])
    if (!t) throw new ErrorApp(`No se encontró la tarjeta ${id}.`, 404)
    const ant = t.estado
    if (ant === 'Anulado') throw new ErrorApp('Esta tarjeta está anulada.')

    if (accion === 'Confirmar lectura') {
      if (!cfg.tiposAviso.includes(t.tipo)) throw new ErrorApp('Esta tarjeta no requiere confirmar lectura.')
      if (t.leido.includes(s.nombre)) return
      await c.query('UPDATE tarjetas SET leido = array_append(leido, $1) WHERE id=$2', [s.nombre, id])
      await log({ operador: s.nombre, accion: 'LECTURA', id, detalle: 'Confirmó lectura' }, c)
      return
    }

    if (estadoVisto && estadoVisto !== ant) {
      throw new ErrorApp(`Otro operador cambió esta tarjeta mientras la veías (ahora está en «${ant}»). Se actualizó el tablero; revisa y repite si hace falta.`, 409)
    }
    if (cfg.tiposSoloCoord.includes(t.tipo) && !esCoord(s) && accion !== 'Avance') {
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
    // Punto 5: al cerrar se marca el momento; al reabrir se borra para volver a contar como abierta.
    if (nuevo === 'Cerrado') await c.query('UPDATE tarjetas SET cerrado_en=$1 WHERE id=$2', [ahora, id])
    else if (ant === 'Cerrado') await c.query('UPDATE tarjetas SET cerrado_en=NULL WHERE id=$1', [id])
    await log({ fecha: ahora, operador: s.nombre, accion: codigo, id, detalle: comentario, anterior: ant, nuevo }, c)
  })
  return tablero(s)
}

/** Punto 6: fijar o cambiar el tiempo máximo de gestión de una tarjeta. */
export async function fijarVencimiento(s, id, d, comentario) {
  id = String(id || '')
  comentario = String(comentario || '').trim().slice(0, 3000)
  if (!comentario) throw new ErrorApp('Escribe un comentario: queda en el historial.')
  const cfg = await cat()
  await tx(async (c) => {
    const { rows: [t] } = await c.query('SELECT id, estado, tipo, vence FROM tarjetas WHERE id=$1 FOR UPDATE', [id])
    if (!t) throw new ErrorApp(`No se encontró la tarjeta ${id}.`, 404)
    if (t.estado === 'Anulado') throw new ErrorApp('Esta tarjeta está anulada.')
    if (cfg.tiposSoloCoord.includes(t.tipo) && !esCoord(s)) throw new ErrorApp('Solo el coordinador gestiona las instrucciones.', 403)
    const quitar = d.quitar === true || d.quitar === 'true'
    const vence = quitar ? null : calcMomento(new Date(), d.venceHoras, d.vence, 'cierre')
    if (!quitar && !vence) throw new ErrorApp('Indica las horas o la fecha y hora de cierre.')
    await c.query('UPDATE tarjetas SET vence=$1, ult_act=now(), act_por=$2, n_act=n_act+1 WHERE id=$3', [vence, s.nombre, id])
    await log({ operador: s.nombre, accion: 'VENCIMIENTO', id, detalle: comentario, anterior: t.vence ? fmtTZ(t.vence) : '—', nuevo: vence ? fmtTZ(vence) : 'sin límite' }, c)
  })
  return tablero(s)
}

/** Historial del seguimiento de una tarjeta. Lo ve cualquier usuario con sesión
 *  (la trazabilidad del registro es para todos; la página «Historial» global sigue siendo solo del coordinador). */
export async function obtenerHistorial(s, id) {
  const { rows } = await pool.query(
    'SELECT fecha, operador, accion, detalle, anterior, nuevo FROM historial WHERE tarjeta_id=$1 ORDER BY id DESC', [String(id || '')])
  return rows.map((r) => ({ ...r, fecha: r.fecha.toISOString() }))
}

/** Historial global con filtros. Solo administrador. */
export async function historialGlobal(s, f = {}) {
  soloCoord(s)
  const cond = [], args = []
  if (f.desde && f.hasta) { const r = rango(f.desde, f.hasta); args.push(r.d0, r.d1); cond.push(`fecha >= $${args.length - 1} AND fecha < $${args.length}`) }
  if (f.operador) { args.push(String(f.operador)); cond.push(`operador = $${args.length}`) }
  if (f.accion) { args.push(String(f.accion)); cond.push(`accion = $${args.length}`) }
  if (f.id) { args.push(String(f.id)); cond.push(`tarjeta_id = $${args.length}`) }
  if (f.q) { args.push('%' + String(f.q).toLowerCase() + '%'); cond.push(`(lower(detalle) LIKE $${args.length} OR lower(tarjeta_id) LIKE $${args.length} OR lower(operador) LIKE $${args.length})`) }
  const limite = Math.min(Math.max(Number(f.limite) || 300, 1), 1000)
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : ''
  const { rows } = await pool.query(
    `SELECT fecha, operador, accion, tarjeta_id, detalle, anterior, nuevo FROM historial ${where} ORDER BY id DESC LIMIT ${limite}`, args)
  return { total: rows.length, limite, filas: rows.map((r) => ({ ...r, fecha: r.fecha.toISOString(), tarjetaId: r.tarjeta_id })) }
}

/* ---------- dashboard (marcadores) ---------- */
export async function dashboard(s) {
  const hoy = hoyTZ()
  const semana = new Date(Date.now() - 7 * 86400000)
  const nOper = (await listarOperadores()).length
  const c = await cat()
  const { rows: todas } = await pool.query(`SELECT ${COLS} FROM tarjetas`)
  const activas = todas.filter((t) => t.estado !== 'Anulado')
  const pend = todas.filter((t) => t.estado === 'Abierto' || t.estado === 'En seguimiento')
  const porEstado = { Abierto: 0, 'En seguimiento': 0, Cerrado: 0, Anulado: 0 }
  const porSitio = {}, porPrioridad = {}
  c.prioridades.forEach((p) => { porPrioridad[p] = 0 }) // respeta el orden del catálogo
  activas.forEach((t) => { porSitio[t.sitio] = (porSitio[t.sitio] || 0) + 1 })
  todas.forEach((t) => { porEstado[t.estado] = (porEstado[t.estado] || 0) + 1 })
  pend.forEach((t) => { porPrioridad[t.prioridad] = (porPrioridad[t.prioridad] || 0) + 1 })
  const ahora = Date.now()
  const vencidos = pend.filter((t) => t.vence && new Date(t.vence).getTime() < ahora).length
  const compromisoVencido = pend.filter((t) => t.fecha && t.fecha < hoy).length
  const sinMov48 = pend.filter((t) => ahora - new Date(t.ult_act).getTime() > 48 * 3600000).length
  const sinLeer = pend.filter((t) => c.tiposAviso.includes(t.tipo) && t.leido.length < nOper).length
  const creados7 = activas.filter((t) => t.creacion >= semana).length
  const cerr = todas.filter((t) => t.estado === 'Cerrado' && t.cerrado_en && t.cerrado_en >= semana)
  const horas = cerr.map((t) => (new Date(t.cerrado_en).getTime() - new Date(t.creacion).getTime()) / 3600000)
  const promedioHoras = horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : 0
  // --- Dashboard gerencial: datos reales ---
  const total = activas.length
  const pctResolucion = total ? Math.round((porEstado.Cerrado / total) * 100) : 0
  const sinResponsable = pend.filter((t) => !String(t.responsable || '').trim()).length
  const porCategoria = {}
  activas.forEach((t) => { porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) + 1 })
  const evolucionMensual = evolucion(activas)
  return {
    usuario: s, ahora: new Date().toISOString(),
    totales: { pendientes: pend.length, ...porEstado },
    porSitio, porPrioridad, porCategoria, evolucionMensual,
    marcadores: { total, vencidos, compromisoVencido, sinMov48, sinResponsable, sinLeer, creados7, cerrados7: cerr.length, promedioHoras, pctResolucion },
  }
}

/** Evolución mensual (últimos 6 meses): creados por mes de creación y cerrados por mes de cierre. */
function evolucion(activas) {
  const meses = []
  const base = new Date(); base.setDate(1)
  for (let i = 5; i >= 0; i--) { const d = new Date(base.getFullYear(), base.getMonth() - i, 1); meses.push(d.toISOString().slice(0, 7)) }
  const ev = {}; meses.forEach((m) => { ev[m] = { mes: m, creados: 0, cerrados: 0 } })
  activas.forEach((t) => {
    const mc = new Date(t.creacion).toISOString().slice(0, 7); if (ev[mc]) ev[mc].creados++
    if (t.estado === 'Cerrado' && t.cerrado_en) { const mx = new Date(t.cerrado_en).toISOString().slice(0, 7); if (ev[mx]) ev[mx].cerrados++ }
  })
  return meses.map((m) => ev[m])
}

/* ---------- usuarios (solo administrador) ---------- */
export async function listarUsuarios(s) {
  soloCoord(s)
  const { rows } = await pool.query(
    `SELECT nombre, rol, activo, huella <> '' AS tiene_pin, (intentos >= $1 AND bloqueado_hasta > now()) AS bloqueado
     FROM operadores ORDER BY id`, [CFG.MAX_INTENTOS])
  return rows.map((r) => ({ nombre: r.nombre, rol: r.rol, activo: r.activo, tienePin: r.tiene_pin, bloqueado: r.bloqueado }))
}

export async function crearUsuario(s, d) {
  soloCoord(s)
  const nombre = String(d.nombre || '').trim().slice(0, 80)
  const rol = String(d.rol || 'Operador')
  if (!nombre) throw new ErrorApp('Escribe el nombre.')
  if (![CFG.ROL_COORD, 'Operador'].includes(rol)) throw new ErrorApp('Rol no válido.')
  try {
    await pool.query('INSERT INTO operadores(nombre, rol) VALUES ($1,$2)', [nombre, rol])
  } catch (e) {
    if (e.code === '23505') throw new ErrorApp('Ya existe un operador con ese nombre.')
    throw e
  }
  await log({ operador: s.nombre, accion: 'USUARIO', detalle: `Creó a «${nombre}» (${rol})` })
  return listarUsuarios(s)
}

export async function actualizarUsuario(s, nombre, d) {
  soloCoord(s)
  nombre = String(nombre || '')
  const { rows: [op] } = await pool.query('SELECT * FROM operadores WHERE nombre=$1', [nombre])
  if (!op) throw new ErrorApp('Operador no encontrado.', 404)
  const rol = d.rol === undefined ? op.rol : String(d.rol)
  const activo = d.activo === undefined ? op.activo : !!d.activo
  if (![CFG.ROL_COORD, 'Operador'].includes(rol)) throw new ErrorApp('Rol no válido.')
  // No dejar la operación sin ningún coordinador activo.
  if (op.rol === CFG.ROL_COORD && (rol !== CFG.ROL_COORD || !activo)) {
    const { rows: [{ n }] } = await pool.query("SELECT COUNT(*)::int n FROM operadores WHERE rol='Coordinador' AND activo AND nombre<>$1", [nombre])
    if (n === 0) throw new ErrorApp('Debe quedar al menos un coordinador activo.')
  }
  await pool.query('UPDATE operadores SET rol=$1, activo=$2 WHERE id=$3', [rol, activo, op.id])
  if (!activo) await pool.query('DELETE FROM sesiones WHERE nombre=$1', [nombre]) // baja: cierra sus sesiones
  const cambios = []
  if (rol !== op.rol) cambios.push(`rol → ${rol}`)
  if (activo !== op.activo) cambios.push(activo ? 'alta' : 'baja')
  await log({ operador: s.nombre, accion: 'USUARIO', detalle: `${nombre}: ${cambios.join(', ') || 'sin cambios'}` })
  return listarUsuarios(s)
}

export async function asignarPinUsuario(s, nombre, pin) {
  soloCoord(s)
  nombre = String(nombre || ''); pin = String(pin || '').trim()
  const { rows: [op] } = await pool.query('SELECT * FROM operadores WHERE nombre=$1', [nombre])
  if (!op) throw new ErrorApp('Operador no encontrado.', 404)
  if (!pinValido(pin)) throw new ErrorApp('PIN rechazado: 4 a 6 números, sin repetir un solo dígito ni secuencias como 1234.')
  const sal = crypto.randomBytes(16).toString('hex')
  await pool.query('UPDATE operadores SET sal=$1, huella=$2, intentos=0, bloqueado_hasta=NULL WHERE id=$3', [sal, huella(sal, op.nombre, pin), op.id])
  await pool.query('DELETE FROM sesiones WHERE nombre=$1', [nombre])
  await log({ operador: s.nombre, accion: 'USUARIO', detalle: `PIN asignado o cambiado para: ${nombre}` }) // el PIN nunca se registra
  return listarUsuarios(s)
}

export async function desbloquearUsuario(s, nombre) {
  soloCoord(s)
  nombre = String(nombre || '')
  const r = await pool.query('UPDATE operadores SET intentos=0, bloqueado_hasta=NULL WHERE nombre=$1', [nombre])
  if (!r.rowCount) throw new ErrorApp('Operador no encontrado.', 404)
  await log({ operador: s.nombre, accion: 'USUARIO', detalle: `Desbloqueó a: ${nombre}` })
  return listarUsuarios(s)
}

/* ---------- catálogo (solo administrador) ---------- */
export async function listarCatalogo(s) {
  soloCoord(s)
  const { rows } = await pool.query('SELECT id, grupo, valor, orden, activo, aviso, solo_coord FROM catalogo ORDER BY grupo, orden, id')
  const items = rows.map((r) => ({ id: r.id, grupo: r.grupo, valor: r.valor, orden: r.orden, activo: r.activo, aviso: r.aviso, soloCoord: r.solo_coord }))
  return { grupos: GRUPOS, items }
}

export async function crearCatalogo(s, d) {
  soloCoord(s)
  const grupo = String(d.grupo || '')
  const valor = String(d.valor || '').trim().slice(0, 80)
  if (!GRUPOS.includes(grupo)) throw new ErrorApp('Grupo no válido.')
  if (!valor) throw new ErrorApp('Escribe el valor.')
  const aviso = grupo === 'tipo' && !!d.aviso
  const solo = grupo === 'tipo' && !!d.soloCoord
  const { rows: [{ max }] } = await pool.query('SELECT COALESCE(MAX(orden),0) max FROM catalogo WHERE grupo=$1', [grupo])
  try {
    await pool.query('INSERT INTO catalogo(grupo, valor, orden, aviso, solo_coord) VALUES ($1,$2,$3,$4,$5)', [grupo, valor, max + 1, aviso, solo])
  } catch (e) {
    if (e.code === '23505') throw new ErrorApp('Ya existe ese valor en esta lista.')
    throw e
  }
  invalidarCat()
  await log({ operador: s.nombre, accion: 'CATÁLOGO', detalle: `Agregó ${grupo}: «${valor}»`, nuevo: valor })
  return listarCatalogo(s)
}

export async function actualizarCatalogo(s, id, d) {
  soloCoord(s)
  id = Number(id)
  const { rows: [it] } = await pool.query('SELECT * FROM catalogo WHERE id=$1', [id])
  if (!it) throw new ErrorApp('Elemento del catálogo no encontrado.', 404)
  const valor = d.valor === undefined ? it.valor : String(d.valor).trim().slice(0, 80)
  const activo = d.activo === undefined ? it.activo : !!d.activo
  const aviso = it.grupo === 'tipo' ? (d.aviso === undefined ? it.aviso : !!d.aviso) : false
  const solo = it.grupo === 'tipo' ? (d.soloCoord === undefined ? it.solo_coord : !!d.soloCoord) : false
  if (!valor) throw new ErrorApp('El valor no puede quedar vacío.')
  // No dejar una lista sin ningún valor activo: rompería el formulario de registro.
  if (it.activo && !activo) {
    const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int n FROM catalogo WHERE grupo=$1 AND activo AND id<>$2', [it.grupo, id])
    if (n === 0) throw new ErrorApp(`Debe quedar al menos un valor activo en «${it.grupo}».`)
  }
  try {
    await pool.query('UPDATE catalogo SET valor=$1, activo=$2, aviso=$3, solo_coord=$4 WHERE id=$5', [valor, activo, aviso, solo, id])
  } catch (e) {
    if (e.code === '23505') throw new ErrorApp('Ya existe ese valor en esta lista.')
    throw e
  }
  invalidarCat()
  const cambios = []
  if (valor !== it.valor) cambios.push(`«${it.valor}» → «${valor}»`)
  if (activo !== it.activo) cambios.push(activo ? 'activado' : 'desactivado')
  if (it.grupo === 'tipo') {
    if (aviso !== it.aviso) cambios.push(aviso ? 'requiere lectura' : 'sin lectura obligatoria')
    if (solo !== it.solo_coord) cambios.push(solo ? 'solo coordinador' : 'disponible para todos')
  }
  await log({ operador: s.nombre, accion: 'CATÁLOGO', detalle: `${it.grupo} «${it.valor}»: ${cambios.join(', ') || 'sin cambios'}`, anterior: it.valor, nuevo: valor })
  return listarCatalogo(s)
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
    res = archivo(base + '.csv', 'text/csv', Buffer.from('﻿' + lineas.join('\r\n'), 'utf8'))
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
  const cAviso = (await cat()).tiposAviso
  const sinLeer = pend.filter((t) => cAviso.includes(t.tipo) && t.leido.length < nOper)
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

/* ---------- reportes gerenciales (Excel / CSV) ---------- */
export async function exportarReporte(s, tipo, formato, desde, hasta) {
  soloCoord(s)
  tipo = String(tipo || '')
  formato = String(formato || 'xlsx').toLowerCase()
  if (!['xlsx', 'csv'].includes(formato)) throw new ErrorApp('Formato no válido.')
  const r = rango(desde, hasta) // valida el rango de fechas
  const { rows } = await pool.query(`SELECT ${COLS} FROM tarjetas`)
  const tarjetas = rows.map(aTarjeta)
  let hist = []
  if (tipo === 'movimientos') {
    const { rows: h } = await pool.query(
      'SELECT fecha, operador, accion, tarjeta_id, detalle, anterior, nuevo FROM historial WHERE fecha >= $1 AND fecha < $2 ORDER BY id DESC', [r.d0, r.d1])
    hist = h.map((f) => ({ fecha: f.fecha.toISOString(), operador: f.operador, accion: f.accion, tarjetaId: f.tarjeta_id, detalle: f.detalle, anterior: f.anterior, nuevo: f.nuevo }))
  }
  const { nombreArchivo, hojas } = construirReporte(tipo, { tarjetas, hist, desde, hasta, ahora: Date.now() })
  const res = formato === 'csv' ? csvArchivo(nombreArchivo, hojas[0].filas) : libro(nombreArchivo, hojas)
  await log({ operador: s.nombre, accion: 'EXPORTAR', detalle: `Reporte ${tipo} ${formato.toUpperCase()} · ${desde} a ${hasta}` })
  return res
}
