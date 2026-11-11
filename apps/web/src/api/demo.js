// Modo demostración: datos en memoria (se pierden al recargar). PIN de prueba: 1234.
const GRUPOS = ['tipo', 'prioridad', 'categoria', 'sitio', 'turno', 'responsable']
let catSeq = 0
const _it = (grupo, valor, orden, aviso = false, soloCoord = false) => ({ id: ++catSeq, grupo, valor, orden, activo: true, aviso, soloCoord })
let catItems = [
  _it('tipo', 'Seguimiento', 1), _it('tipo', 'Aviso importante', 2, true), _it('tipo', 'Instrucción nueva', 3, true, true),
  _it('tipo', 'Cambio de actividad', 4, true), _it('tipo', 'Otro', 5),
  _it('prioridad', 'Alta', 1), _it('prioridad', 'Media', 2), _it('prioridad', 'Baja', 3),
  _it('categoria', 'Revisión de video', 1), _it('categoria', 'Seguimiento GPS', 2), _it('categoria', 'Cámara / equipo', 3),
  _it('categoria', 'Incidente', 4), _it('categoria', 'Relevo / turno', 5), _it('categoria', 'Otro', 6),
  _it('sitio', 'El Salvador', 1), _it('sitio', 'Guatemala', 2), _it('sitio', 'Honduras', 3),
  _it('sitio', 'Nicaragua', 4), _it('sitio', 'Costa Rica', 5), _it('sitio', 'Regional', 6),
  _it('turno', 'Mañana (06:00–14:00)', 1), _it('turno', 'Tarde (14:00–22:00)', 2), _it('turno', 'Noche (22:00–06:00)', 3), _it('turno', 'Administrativo', 4),
  _it('responsable', 'Operador Rotativo', 1), _it('responsable', 'Operador Administrativo', 2),
]
function catView() {
  const act = catItems.filter((i) => i.activo).sort((a, b) => a.orden - b.orden)
  const g = (name) => act.filter((i) => i.grupo === name).map((i) => i.valor)
  return {
    tipos: g('tipo'), prioridades: g('prioridad'), categorias: g('categoria'), sitios: g('sitio'), turnos: g('turno'), responsables: g('responsable'),
    tiposAviso: act.filter((i) => i.grupo === 'tipo' && i.aviso).map((i) => i.valor),
    tiposSoloCoord: act.filter((i) => i.grupo === 'tipo' && i.soloCoord).map((i) => i.valor),
  }
}

let usuarios = [
  { nombre: 'Oscar', rol: 'Coordinador', activo: true, tienePin: true, bloqueado: false },
  { nombre: 'Operador 1', rol: 'Operador', activo: true, tienePin: true, bloqueado: false },
  { nombre: 'Operador 2', rol: 'Operador', activo: true, tienePin: true, bloqueado: false },
  { nombre: 'Operador 3', rol: 'Operador', activo: true, tienePin: true, bloqueado: false },
  { nombre: 'Operador 4', rol: 'Operador', activo: true, tienePin: true, bloqueado: false },
  { nombre: 'Operador 5', rol: 'Operador', activo: true, tienePin: true, bloqueado: false },
]
const nombresActivos = () => usuarios.filter((u) => u.activo).map((u) => u.nombre)
const rolDe = (n) => (usuarios.find((u) => u.nombre === n) || {}).rol || 'Operador'

let n = 6
let ses = null
const hist = []
const hora = (h) => new Date(Date.now() - h * 3600000).toISOString()
const dia = (h) => hora(h).slice(0, 10)

const t = [
  { id: 'SM-0001', creacion: hora(30), creadoPor: 'Oscar', tipo: 'Instrucción nueva', categoria: 'Relevo / turno', sitio: 'Regional', turno: 'Administrativo', titulo: 'Relevo sin firma = no hay relevo', detalle: 'A partir de hoy ningún operador deja el puesto si el relevo no llegó físicamente y ambos firmaron el checklist.', prioridad: 'Alta', responsable: '', fecha: '', estado: 'Abierto', ultAct: hora(30), actPor: 'Oscar', ultCom: '', nAct: 2, leido: ['Operador 1', 'Operador 3'], vence: '', cerradoEn: '' },
  { id: 'SM-0002', creacion: hora(20), creadoPor: 'Operador 2', tipo: 'Aviso importante', categoria: 'Cámara / equipo', sitio: 'Guatemala', turno: 'Tarde (14:00–22:00)', titulo: 'NVR de bodega GT sin grabación desde las 16:40', detalle: 'Ticket abierto con el proveedor. Mientras tanto, rondas presenciales cada hora por el vigilante.', prioridad: 'Alta', responsable: 'Operador 2', fecha: dia(-24), estado: 'En seguimiento', ultAct: hora(3), actPor: 'Operador 4', ultCom: 'Proveedor confirma visita mañana 9:00', nAct: 3, leido: ['Operador 4'], vence: hora(2), cerradoEn: '' },
  { id: 'SM-0003', creacion: hora(10), creadoPor: 'Operador 1', tipo: 'Seguimiento', categoria: 'Revisión de video', sitio: 'El Salvador', turno: 'Noche (22:00–06:00)', titulo: 'Revisar ingreso de vehículo sin registro en portón 2', detalle: 'Placa parcial P-58…, 02:14 a.m. Solicitar bitácora de garita.', prioridad: 'Media', responsable: 'Operador 1', fecha: dia(-48), estado: 'Abierto', ultAct: hora(10), actPor: 'Operador 1', ultCom: '', nAct: 0, leido: [], vence: hora(-6), cerradoEn: '' },
  { id: 'SM-0004', creacion: hora(50), creadoPor: 'Operador 3', tipo: 'Seguimiento', categoria: 'Seguimiento GPS', sitio: 'Honduras', turno: 'Mañana (06:00–14:00)', titulo: 'Unidad 214 con parada no autorizada de 40 min', detalle: 'Ruta San Pedro Sula. Confirmar con jefe de transporte.', prioridad: 'Media', responsable: 'Operador 3', fecha: dia(30), estado: 'En seguimiento', ultAct: hora(6), actPor: 'Operador 3', ultCom: 'Jefe de transporte confirma falla mecánica; pide reporte', nAct: 2, leido: [], vence: '', cerradoEn: '' },
  { id: 'SM-0005', creacion: hora(70), creadoPor: 'Operador 5', tipo: 'Seguimiento', categoria: 'Cámara / equipo', sitio: 'Costa Rica', turno: 'Tarde (14:00–22:00)', titulo: 'Cámara 12 CEDI CR desenfocada', detalle: 'Se solicitó ajuste al técnico local.', prioridad: 'Baja', responsable: 'Operador 5', fecha: '', estado: 'Cerrado', ultAct: hora(5), actPor: 'Operador 5', ultCom: 'Técnico ajustó lente; imagen OK', nAct: 2, leido: [], vence: '', cerradoEn: hora(5) },
  { id: 'SM-0006', creacion: hora(4), creadoPor: 'Oscar', tipo: 'Cambio de actividad', categoria: 'Otro', sitio: 'Regional', turno: 'Administrativo', titulo: 'Reporte del viernes: entrega a las 14:00', detalle: 'El administrativo entrega el consolidado de una página (indicadores, incidencias, pendientes).', prioridad: 'Media', responsable: '', fecha: '', estado: 'Abierto', ultAct: hora(4), actPor: 'Oscar', ultCom: '', nAct: 0, leido: [], vence: '', cerradoEn: '' },
]
t.forEach((x) => {
  hist.push({ fecha: x.creacion, operador: x.creadoPor, accion: 'CREAR', id: x.id, tarjetaId: x.id, detalle: x.titulo, anterior: '', nuevo: 'Abierto' })
  if (x.ultCom) hist.push({ fecha: x.ultAct, operador: x.actPor, accion: x.estado === 'Cerrado' ? 'CERRAR' : 'AVANCE', id: x.id, tarjetaId: x.id, detalle: x.ultCom, anterior: 'Abierto', nuevo: x.estado })
})

const clonar = (v) => JSON.parse(JSON.stringify(v))
const ok = (v) => new Promise((r) => setTimeout(() => r(clonar(v)), 160))
const no = (m) => new Promise((_, r) => setTimeout(() => r(new Error(m)), 160))
const coord = () => ses && ses.rol === 'Coordinador'
const registrar = (o) => hist.push({ fecha: new Date().toISOString(), operador: ses.nombre, accion: o.accion, id: o.id || '', tarjetaId: o.id || '', detalle: o.detalle || '', anterior: o.anterior || '', nuevo: o.nuevo || '' })

function calcMomento(baseMs, horas, fechaISO) {
  if (horas !== undefined && horas !== '' && horas !== null) {
    const h = Number(horas); if (!(h > 0)) return null
    return new Date(baseMs + h * 3600000).toISOString()
  }
  if (fechaISO) { const v = new Date(fechaISO); return isNaN(v) ? null : v.toISOString() }
  return null
}
const calcVence = (d) => calcMomento(Date.now(), d.venceHoras, d.vence)

function tablero() {
  const c = catView()
  return ok({
    usuario: { nombre: ses.nombre, rol: ses.rol },
    tarjetas: t.filter((x) => x.estado !== 'Anulado'),
    operadores: nombresActivos(),
    catalogos: { ...c, tipos: coord() ? c.tipos : c.tipos.filter((x) => !c.tiposSoloCoord.includes(x)) },
    ahora: new Date().toISOString(),
  })
}

export const listarOperadores = () => ok(nombresActivos())

export const iniciarSesion = (nombre, pin) => {
  if (String(pin) !== '1234') return no('PIN incorrecto. (En la demostración el PIN es 1234)')
  const u = usuarios.find((x) => x.nombre === nombre && x.activo)
  if (!u) return no('Operador no válido.')
  ses = { nombre, rol: u.rol }
  return ok({ token: 'demo-token-0000', nombre, rol: ses.rol })
}

export const cerrarSesion = () => { ses = null; return ok(true) }
export const obtenerTablero = () => (ses ? tablero() : no('SESION_VENCIDA'))

export const crearTarjeta = (_tk, d) => {
  if (!ses) return no('SESION_VENCIDA')
  if (catView().tiposSoloCoord.includes(d.tipo) && !coord()) return no('Solo el coordinador puede publicar instrucciones nuevas.')
  const ahora = new Date().toISOString()
  n++
  const id = 'SM-' + ('000' + n).slice(-4)
  const inicia = calcMomento(Date.now(), d.iniciaHoras, d.inicia)
  const vence = calcMomento(inicia ? new Date(inicia).getTime() : Date.now(), d.venceHoras, d.vence)
  t.push({ id, creacion: ahora, creadoPor: ses.nombre, tipo: d.tipo, categoria: d.categoria, sitio: d.sitio, turno: d.turno, titulo: d.titulo, detalle: d.detalle, prioridad: d.prioridad, responsable: d.responsable, fecha: d.fecha || '', estado: 'Abierto', ultAct: ahora, actPor: ses.nombre, ultCom: '', nAct: 0, leido: [], vence: vence || '', inicia: inicia || '', cerradoEn: '' })
  registrar({ accion: 'CREAR', id, detalle: d.titulo, nuevo: 'Abierto' })
  return tablero()
}

export const actualizarTarjeta = (_tk, id, acc, com, visto) => {
  if (!ses) return no('SESION_VENCIDA')
  const x = t.find((y) => y.id === id)
  if (!x) return no('No se encontró la tarjeta ' + id + '.')
  if (acc !== 'Confirmar lectura' && !String(com || '').trim()) return no('Escribe un comentario: queda en el historial.')
  if (acc === 'Anular' && !coord()) return no('Solo el coordinador puede anular.')
  const ant = x.estado
  const ahora = new Date().toISOString()
  if (acc === 'Confirmar lectura') {
    if (!x.leido.includes(ses.nombre)) { x.leido.push(ses.nombre); registrar({ accion: 'LECTURA', id, detalle: 'Confirmó lectura' }) }
    return tablero()
  }
  if (visto && visto !== ant) return no('Otro operador cambió esta tarjeta mientras la veías (ahora está en «' + ant + '»).')
  if (catView().tiposSoloCoord.includes(x.tipo) && !coord() && acc !== 'Avance') return no('Las instrucciones solo las mueve, cierra o anula el coordinador.')
  let nuevo = ant, cod
  if (acc === 'Avance') { cod = 'AVANCE'; if (ant === 'Abierto') nuevo = 'En seguimiento' }
  else if (acc === 'Cerrar') { cod = 'CERRAR'; nuevo = 'Cerrado' }
  else if (acc === 'Reabrir' || acc === 'Mover a Abierto') { cod = ant === 'Cerrado' ? 'REABRIR' : 'MOVER'; nuevo = 'Abierto' }
  else if (acc === 'Mover a En seguimiento') { cod = ant === 'Cerrado' ? 'REABRIR' : 'MOVER'; nuevo = 'En seguimiento' }
  else if (acc === 'Anular') { cod = 'ANULAR'; nuevo = 'Anulado' }
  else return no('Acción no válida.')
  x.estado = nuevo; x.ultAct = ahora; x.actPor = ses.nombre; x.ultCom = com; x.nAct++
  if (nuevo === 'Cerrado') x.cerradoEn = ahora
  else if (ant === 'Cerrado') x.cerradoEn = ''
  registrar({ accion: cod, id, detalle: com, anterior: ant, nuevo })
  return tablero()
}

export const fijarVencimiento = (_tk, id, d) => {
  if (!ses) return no('SESION_VENCIDA')
  const x = t.find((y) => y.id === id)
  if (!x) return no('No se encontró la tarjeta ' + id + '.')
  if (!String(d.comentario || '').trim()) return no('Escribe un comentario: queda en el historial.')
  const quitar = d.quitar === true
  const v = quitar ? '' : calcVence(d)
  if (!quitar && !v) return no('Indica las horas o la fecha y hora de cierre.')
  const antes = x.vence
  x.vence = v || ''; x.ultAct = new Date().toISOString(); x.actPor = ses.nombre; x.nAct++
  registrar({ accion: 'VENCIMIENTO', id, detalle: d.comentario, anterior: antes || '—', nuevo: v || 'sin límite' })
  return tablero()
}

export const obtenerHistorial = (_tk, id) => ses ? ok(hist.filter((h) => h.id === id).slice().reverse()) : no('SESION_VENCIDA')

export const historialGlobal = (_tk, f = {}) => {
  if (!coord()) return no('Solo el administrador puede ver el historial.')
  let filas = hist.slice().reverse()
  if (f.operador) filas = filas.filter((h) => h.operador === f.operador)
  if (f.accion) filas = filas.filter((h) => h.accion === f.accion)
  if (f.id) filas = filas.filter((h) => h.tarjetaId === f.id)
  if (f.q) { const q = String(f.q).toLowerCase(); filas = filas.filter((h) => (h.detalle + ' ' + h.tarjetaId + ' ' + h.operador).toLowerCase().includes(q)) }
  const limite = Math.min(Number(f.limite) || 300, 1000)
  filas = filas.slice(0, limite)
  return ok({ total: filas.length, limite, filas })
}

export const obtenerDashboard = (_tk) => {
  if (!ses) return no('SESION_VENCIDA')
  const ahora = Date.now(), semana = Date.now() - 7 * 86400000
  const activas = t.filter((x) => x.estado !== 'Anulado')
  const pend = t.filter((x) => x.estado === 'Abierto' || x.estado === 'En seguimiento')
  const porEstado = { Abierto: 0, 'En seguimiento': 0, Cerrado: 0, Anulado: 0 }
  t.forEach((x) => { porEstado[x.estado] = (porEstado[x.estado] || 0) + 1 })
  const cv = catView()
  const porSitio = {}, porPrioridad = {}
  cv.prioridades.forEach((p) => { porPrioridad[p] = 0 })
  activas.forEach((x) => { porSitio[x.sitio] = (porSitio[x.sitio] || 0) + 1 })
  pend.forEach((x) => { porPrioridad[x.prioridad] = (porPrioridad[x.prioridad] || 0) + 1 })
  const hoy = new Date().toLocaleDateString('en-CA')
  const cerr = t.filter((x) => x.estado === 'Cerrado' && x.cerradoEn && new Date(x.cerradoEn).getTime() >= semana)
  const horas = cerr.map((x) => (new Date(x.cerradoEn).getTime() - new Date(x.creacion).getTime()) / 3600000)
  const total = activas.length
  const pctResolucion = total ? Math.round(((porEstado.Cerrado || 0) / total) * 100) : 0
  const porCategoria = {}
  activas.forEach((x) => { porCategoria[x.categoria] = (porCategoria[x.categoria] || 0) + 1 })
  const meses = []
  const base = new Date(); base.setDate(1)
  for (let i = 5; i >= 0; i--) { const d = new Date(base.getFullYear(), base.getMonth() - i, 1); meses.push(d.toISOString().slice(0, 7)) }
  const ev = {}; meses.forEach((m) => { ev[m] = { mes: m, creados: 0, cerrados: 0 } })
  activas.forEach((x) => {
    const mc = new Date(x.creacion).toISOString().slice(0, 7); if (ev[mc]) ev[mc].creados++
    if (x.estado === 'Cerrado' && x.cerradoEn) { const mx = new Date(x.cerradoEn).toISOString().slice(0, 7); if (ev[mx]) ev[mx].cerrados++ }
  })
  const evolucionMensual = meses.map((m) => ev[m])
  return ok({
    usuario: { nombre: ses.nombre, rol: ses.rol }, ahora: new Date().toISOString(),
    totales: { pendientes: pend.length, ...porEstado },
    porSitio, porPrioridad, porCategoria, evolucionMensual,
    marcadores: {
      total,
      vencidos: pend.filter((x) => x.vence && new Date(x.vence).getTime() < ahora).length,
      compromisoVencido: pend.filter((x) => x.fecha && x.fecha < hoy).length,
      sinMov48: pend.filter((x) => ahora - new Date(x.ultAct).getTime() > 48 * 3600000).length,
      sinResponsable: pend.filter((x) => !String(x.responsable || '').trim()).length,
      sinLeer: pend.filter((x) => cv.tiposAviso.includes(x.tipo) && x.leido.length < nombresActivos().length).length,
      creados7: activas.filter((x) => new Date(x.creacion).getTime() >= semana).length,
      cerrados7: cerr.length,
      promedioHoras: horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : 0,
      pctResolucion,
    },
  })
}

export const listarUsuarios = (_tk) => coord() ? ok(usuarios) : no('Solo el administrador.')
export const crearUsuario = (_tk, d) => {
  if (!coord()) return no('Solo el administrador.')
  const nombre = String(d.nombre || '').trim()
  if (!nombre) return no('Escribe el nombre.')
  if (usuarios.some((u) => u.nombre === nombre)) return no('Ya existe un operador con ese nombre.')
  usuarios.push({ nombre, rol: d.rol === 'Coordinador' ? 'Coordinador' : 'Operador', activo: true, tienePin: false, bloqueado: false })
  registrar({ accion: 'USUARIO', detalle: 'Creó a «' + nombre + '»' })
  return ok(usuarios)
}
export const actualizarUsuario = (_tk, nombre, d) => {
  if (!coord()) return no('Solo el administrador.')
  const u = usuarios.find((x) => x.nombre === nombre)
  if (!u) return no('Operador no encontrado.')
  const rol = d.rol === undefined ? u.rol : d.rol
  const activo = d.activo === undefined ? u.activo : !!d.activo
  if (u.rol === 'Coordinador' && (rol !== 'Coordinador' || !activo) && !usuarios.some((x) => x.nombre !== nombre && x.rol === 'Coordinador' && x.activo)) return no('Debe quedar al menos un coordinador activo.')
  u.rol = rol; u.activo = activo
  registrar({ accion: 'USUARIO', detalle: nombre + ': actualizado' })
  return ok(usuarios)
}
export const asignarPinUsuario = (_tk, nombre) => {
  if (!coord()) return no('Solo el administrador.')
  const u = usuarios.find((x) => x.nombre === nombre)
  if (!u) return no('Operador no encontrado.')
  u.tienePin = true; u.bloqueado = false
  registrar({ accion: 'USUARIO', detalle: 'PIN asignado para: ' + nombre + ' (en la demo el PIN siempre es 1234)' })
  return ok(usuarios)
}
export const desbloquearUsuario = (_tk, nombre) => {
  if (!coord()) return no('Solo el administrador.')
  const u = usuarios.find((x) => x.nombre === nombre)
  if (!u) return no('Operador no encontrado.')
  u.bloqueado = false
  return ok(usuarios)
}

export const exportarHistorial = (_tk, formato, desde, hasta) => {
  if (!coord()) return no('Solo el coordinador puede exportar.')
  if (formato !== 'csv') return no('El PDF solo funciona dentro de Google o del servidor. En la demostración usa CSV.')
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const filas = hist.filter((h) => h.fecha.slice(0, 10) >= desde && h.fecha.slice(0, 10) <= hasta)
  const csv = '﻿' + ['Fecha y hora,Operador,Acción,ID,Detalle,Valor anterior,Valor nuevo']
    .concat(filas.map((h) => [h.fecha, h.operador, h.accion, h.tarjetaId, h.detalle, h.anterior, h.nuevo].map(q).join(','))).join('\r\n')
  return ok({ nombre: `Historial_${desde}_a_${hasta}.csv`, mime: 'text/csv', base64: btoa(unescape(encodeURIComponent(csv))) })
}
export const exportarResumen = () => no('El resumen PDF solo funciona con el servidor. En la demostración no está disponible.')

const listaCatalogo = () => ({ grupos: GRUPOS, items: catItems.slice().sort((a, b) => a.grupo.localeCompare(b.grupo) || a.orden - b.orden) })
export const listarCatalogo = () => coord() ? ok(listaCatalogo()) : no('Solo el administrador.')
export const crearCatalogo = (_tk, d) => {
  if (!coord()) return no('Solo el administrador.')
  const grupo = String(d.grupo || ''); const valor = String(d.valor || '').trim()
  if (!GRUPOS.includes(grupo)) return no('Grupo no válido.')
  if (!valor) return no('Escribe el valor.')
  if (catItems.some((i) => i.grupo === grupo && i.valor.toLowerCase() === valor.toLowerCase())) return no('Ya existe ese valor en esta lista.')
  const orden = Math.max(0, ...catItems.filter((i) => i.grupo === grupo).map((i) => i.orden)) + 1
  catItems.push(_it(grupo, valor, orden, grupo === 'tipo' && !!d.aviso, grupo === 'tipo' && !!d.soloCoord))
  registrar({ accion: 'CATÁLOGO', detalle: `Agregó ${grupo}: «${valor}»` })
  return ok(listaCatalogo())
}
export const actualizarCatalogo = (_tk, id, d) => {
  if (!coord()) return no('Solo el administrador.')
  const it = catItems.find((i) => i.id === Number(id))
  if (!it) return no('Elemento del catálogo no encontrado.')
  const valor = d.valor === undefined ? it.valor : String(d.valor).trim()
  const activo = d.activo === undefined ? it.activo : !!d.activo
  if (!valor) return no('El valor no puede quedar vacío.')
  if (catItems.some((i) => i !== it && i.grupo === it.grupo && i.valor.toLowerCase() === valor.toLowerCase())) return no('Ya existe ese valor en esta lista.')
  if (it.activo && !activo && !catItems.some((i) => i !== it && i.grupo === it.grupo && i.activo)) return no(`Debe quedar al menos un valor activo en «${it.grupo}».`)
  it.valor = valor; it.activo = activo
  if (it.grupo === 'tipo') { if (d.aviso !== undefined) it.aviso = !!d.aviso; if (d.soloCoord !== undefined) it.soloCoord = !!d.soloCoord }
  registrar({ accion: 'CATÁLOGO', detalle: `${it.grupo} «${it.valor}»: actualizado` })
  return ok(listaCatalogo())
}
