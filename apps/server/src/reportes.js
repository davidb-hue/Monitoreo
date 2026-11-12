// Construcción de reportes a partir de datos REALES (tarjetas e historial ya normalizados).
// Módulo puro: sin acceso a red ni DB. Lo usan el servidor (apps/server) y la demostración.
// Las tarjetas vienen en forma camelCase: { id, creacion, inicia, tipo, categoria, sitio, turno,
//   titulo, responsable, prioridad, estado, ultAct, vence, fecha, cerradoEn }.
// El historial: { fecha, operador, accion, tarjetaId, detalle, anterior, nuevo }.
const TZ = 'America/El_Salvador'

function fHora(iso) {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d)) return ''
  return d.toLocaleString('es-SV', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fDia(iso) {
  if (!iso) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const p = iso.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
  const d = new Date(iso); if (isNaN(d)) return ''
  return d.toLocaleDateString('es-SV', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
}
const dstr = (iso) => String(iso || '').slice(0, 10)
const enRango = (iso, desde, hasta) => { const d = dstr(iso); return !!d && d >= desde && d <= hasta }
const horasEntre = (iniIso, finIso) => {
  const ini = iniIso ? new Date(iniIso).getTime() : NaN, fin = finIso ? new Date(finIso).getTime() : NaN
  if (!isFinite(ini) || !isFinite(fin) || fin < ini) return 0
  return Math.round((fin - ini) / 360000) / 10
}

export const REPORTES = [
  { tipo: 'movimientos', nombre: 'Movimientos históricos', desc: 'Bitácora de acciones del período: creación, avances, cierres, anulaciones y cambios de plazo.' },
  { tipo: 'cerradas', nombre: 'Novedades cerradas', desc: 'Novedades cerradas en el período, con tiempo de resolución y cumplimiento del plazo.' },
  { tipo: 'vencimientos', nombre: 'Vencimientos', desc: 'Novedades pendientes con plazo (SLA) o compromiso: vencidas y por vencer.' },
  { tipo: 'pais', nombre: 'Resumen por país', desc: 'Carga por país/sitio: pendientes, cerradas del período, vencidas y sin responsable.' },
  { tipo: 'responsable', nombre: 'Resumen por responsable', desc: 'Carga por responsable: pendientes, cerradas del período, vencidas y sin movimiento.' },
]

const pendiente = (t) => t.estado === 'Abierto' || t.estado === 'En seguimiento'

/** Construye el reporte. ctx: { tarjetas, hist, desde, hasta, ahora }.
 *  Devuelve { nombreArchivo, titulo, hojas: [{ nombre, filas }] }. La fila 0 de cada hoja es el encabezado. */
export function construirReporte(tipo, ctx) {
  const meta = REPORTES.find((r) => r.tipo === tipo)
  if (!meta) throw new Error('Tipo de reporte no válido.')
  const tarjetas = (ctx.tarjetas || []).filter((t) => t.estado !== 'Anulado')
  const hist = ctx.hist || []
  const desde = ctx.desde, hasta = ctx.hasta
  const ahora = ctx.ahora || Date.now()
  const hoy = new Date(ahora).toLocaleDateString('en-CA', { timeZone: TZ })
  const pend = tarjetas.filter(pendiente)
  const cerradasPeriodo = tarjetas.filter((t) => t.estado === 'Cerrado' && enRango(t.cerradoEn, desde, hasta))
  const esVencida = (t) => (!!t.vence && new Date(t.vence).getTime() < ahora) || (!!t.fecha && dstr(t.fecha) < hoy)

  let hojas
  if (tipo === 'movimientos') {
    const filas = [['Fecha y hora', 'Operador', 'Acción', 'ID', 'Detalle', 'Valor anterior', 'Valor nuevo']]
    hist.forEach((h) => filas.push([fHora(h.fecha), h.operador, h.accion, h.tarjetaId || h.id || '', h.detalle, h.anterior, h.nuevo]))
    hojas = [{ nombre: 'Movimientos', filas }]
  } else if (tipo === 'cerradas') {
    const cerr = cerradasPeriodo.slice().sort((a, b) => String(b.cerradoEn).localeCompare(String(a.cerradoEn)))
    const det = [['ID', 'País', 'Tipo', 'Categoría', 'Título', 'Responsable', 'Prioridad', 'Creada', 'Cerrada', 'Horas de resolución', 'Cumplió el plazo']]
    let aTiempo = 0, fuera = 0, sumaH = 0
    cerr.forEach((t) => {
      const h = horasEntre(t.inicia || t.creacion, t.cerradoEn); sumaH += h
      let plazo = '—'
      if (t.vence) { const ok = new Date(t.cerradoEn).getTime() <= new Date(t.vence).getTime(); plazo = ok ? 'Sí' : 'No'; ok ? aTiempo++ : fuera++ }
      det.push([t.id, t.sitio, t.tipo, t.categoria, t.titulo, t.responsable || '—', t.prioridad, fHora(t.creacion), fHora(t.cerradoEn), h, plazo])
    })
    const prom = cerr.length ? Math.round((sumaH / cerr.length) * 10) / 10 : 0
    const resumen = [['Indicador', 'Valor'],
      ['Novedades cerradas en el período', cerr.length],
      ['Horas promedio de resolución', prom],
      ['Con plazo definido', aTiempo + fuera],
      ['Cerradas dentro del plazo', aTiempo],
      ['Cerradas fuera del plazo', fuera]]
    hojas = [{ nombre: 'Cerradas', filas: det }, { nombre: 'Resumen', filas: resumen }]
  } else if (tipo === 'vencimientos') {
    const sit = (t) => {
      if (t.vence) { const lim = new Date(t.vence).getTime(); return lim < ahora ? { txt: 'Plazo vencido', ord: 0, key: lim } : { txt: 'Por vencer', ord: 2, key: lim } }
      if (t.fecha) { const k = new Date(dstr(t.fecha) + 'T12:00:00').getTime(); return dstr(t.fecha) < hoy ? { txt: 'Compromiso vencido', ord: 1, key: k } : { txt: 'En fecha', ord: 3, key: k } }
      return { txt: '—', ord: 4, key: Infinity }
    }
    const conPlazo = pend.filter((t) => t.vence || t.fecha).map((t) => ({ t, s: sit(t) }))
      .sort((a, b) => a.s.ord - b.s.ord || a.s.key - b.s.key)
    const filas = [['ID', 'País', 'Título', 'Responsable', 'Prioridad', 'Estado', 'Límite (SLA)', 'Compromiso', 'Situación']]
    conPlazo.forEach(({ t, s }) => filas.push([t.id, t.sitio, t.titulo, t.responsable || '—', t.prioridad, t.estado, fHora(t.vence), fDia(t.fecha), s.txt]))
    hojas = [{ nombre: 'Vencimientos', filas }]
  } else if (tipo === 'pais') {
    const sitios = [...new Set(tarjetas.map((t) => t.sitio).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    const filas = [['País', 'Pendientes', 'Abiertas', 'En seguimiento', 'Cerradas (período)', 'Vencidas', 'Sin responsable']]
    const tot = [0, 0, 0, 0, 0, 0]
    sitios.forEach((si) => {
      const p = pend.filter((t) => t.sitio === si)
      const r = [
        p.length,
        p.filter((t) => t.estado === 'Abierto').length,
        p.filter((t) => t.estado === 'En seguimiento').length,
        cerradasPeriodo.filter((t) => t.sitio === si).length,
        p.filter(esVencida).length,
        p.filter((t) => !String(t.responsable || '').trim()).length,
      ]
      r.forEach((v, i) => { tot[i] += v })
      filas.push([si, ...r])
    })
    filas.push(['TOTAL', ...tot])
    hojas = [{ nombre: 'Por país', filas }]
  } else { // responsable
    const nombres = [...new Set(pend.concat(cerradasPeriodo).map((t) => String(t.responsable || '').trim()))]
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    const filas = [['Responsable', 'Pendientes', 'Cerradas (período)', 'Vencidas', 'Sin movimiento +48 h']]
    const tot = [0, 0, 0, 0]
    nombres.forEach((nm) => {
      const p = pend.filter((t) => String(t.responsable || '').trim() === nm)
      const r = [
        p.length,
        cerradasPeriodo.filter((t) => String(t.responsable || '').trim() === nm).length,
        p.filter(esVencida).length,
        p.filter((t) => ahora - new Date(t.ultAct).getTime() > 48 * 3600000).length,
      ]
      r.forEach((v, i) => { tot[i] += v })
      filas.push([nm || '— Sin asignar', ...r])
    })
    filas.push(['TOTAL', ...tot])
    hojas = [{ nombre: 'Por responsable', filas }]
  }

  return { nombreArchivo: `${meta.nombre.replace(/\s+/g, '_')}_${desde}_a_${hasta}`, titulo: meta.nombre, hojas }
}
