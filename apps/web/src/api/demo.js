// Modo demostración: datos en memoria (se pierden al recargar). PIN de prueba: 1234.
const ops = ['Oscar', 'Operador 1', 'Operador 2', 'Operador 3', 'Operador 4', 'Operador 5']
const rolDe = (n) => (n === 'Oscar' ? 'Coordinador' : 'Operador')
const CATALOGOS = {
  tiposAviso: ['Aviso importante', 'Instrucción nueva', 'Cambio de actividad'],
  tiposSoloCoord: ['Instrucción nueva'],
  categorias: ['Revisión de video', 'Seguimiento GPS', 'Cámara / equipo', 'Incidente', 'Relevo / turno', 'Otro'],
  sitios: ['El Salvador', 'Guatemala', 'Honduras', 'Nicaragua', 'Costa Rica', 'Regional'],
  turnos: ['Mañana (06:00–14:00)', 'Tarde (14:00–22:00)', 'Noche (22:00–06:00)', 'Administrativo'],
  prioridades: ['Alta', 'Media', 'Baja'],
}
const TIPOS = ['Seguimiento', 'Aviso importante', 'Instrucción nueva', 'Cambio de actividad', 'Otro']

let n = 6
let ses = null
const hist = []
const hora = (h) => new Date(Date.now() - h * 3600000).toISOString()
const dia = (h) => hora(h).slice(0, 10)

const t = [
  { id: 'SM-0001', creacion: hora(30), creadoPor: 'Oscar', tipo: 'Instrucción nueva', categoria: 'Relevo / turno', sitio: 'Regional', turno: 'Administrativo', titulo: 'Relevo sin firma = no hay relevo', detalle: 'A partir de hoy ningún operador deja el puesto si el relevo no llegó físicamente y ambos firmaron el checklist.', prioridad: 'Alta', responsable: '', fecha: '', estado: 'Abierto', ultAct: hora(30), actPor: 'Oscar', ultCom: '', nAct: 2, leido: ['Operador 1', 'Operador 3'] },
  { id: 'SM-0002', creacion: hora(20), creadoPor: 'Operador 2', tipo: 'Aviso importante', categoria: 'Cámara / equipo', sitio: 'Guatemala', turno: 'Tarde (14:00–22:00)', titulo: 'NVR de bodega GT sin grabación desde las 16:40', detalle: 'Ticket abierto con el proveedor. Mientras tanto, rondas presenciales cada hora por el vigilante.', prioridad: 'Alta', responsable: 'Operador 2', fecha: dia(-24), estado: 'En seguimiento', ultAct: hora(3), actPor: 'Operador 4', ultCom: 'Proveedor confirma visita mañana 9:00', nAct: 3, leido: ['Operador 4'] },
  { id: 'SM-0003', creacion: hora(10), creadoPor: 'Operador 1', tipo: 'Seguimiento', categoria: 'Revisión de video', sitio: 'El Salvador', turno: 'Noche (22:00–06:00)', titulo: 'Revisar ingreso de vehículo sin registro en portón 2', detalle: 'Placa parcial P-58…, 02:14 a.m. Solicitar bitácora de garita.', prioridad: 'Media', responsable: 'Operador 1', fecha: dia(-48), estado: 'Abierto', ultAct: hora(10), actPor: 'Operador 1', ultCom: '', nAct: 0, leido: [] },
  { id: 'SM-0004', creacion: hora(50), creadoPor: 'Operador 3', tipo: 'Seguimiento', categoria: 'Seguimiento GPS', sitio: 'Honduras', turno: 'Mañana (06:00–14:00)', titulo: 'Unidad 214 con parada no autorizada de 40 min', detalle: 'Ruta San Pedro Sula. Confirmar con jefe de transporte.', prioridad: 'Media', responsable: 'Operador 3', fecha: dia(30), estado: 'En seguimiento', ultAct: hora(6), actPor: 'Operador 3', ultCom: 'Jefe de transporte confirma falla mecánica; pide reporte', nAct: 2, leido: [] },
  { id: 'SM-0005', creacion: hora(70), creadoPor: 'Operador 5', tipo: 'Seguimiento', categoria: 'Cámara / equipo', sitio: 'Costa Rica', turno: 'Tarde (14:00–22:00)', titulo: 'Cámara 12 CEDI CR desenfocada', detalle: 'Se solicitó ajuste al técnico local.', prioridad: 'Baja', responsable: 'Operador 5', fecha: '', estado: 'Cerrado', ultAct: hora(5), actPor: 'Operador 5', ultCom: 'Técnico ajustó lente; imagen OK', nAct: 2, leido: [] },
  { id: 'SM-0006', creacion: hora(4), creadoPor: 'Oscar', tipo: 'Cambio de actividad', categoria: 'Otro', sitio: 'Regional', turno: 'Administrativo', titulo: 'Reporte del viernes: entrega a las 14:00', detalle: 'El administrativo entrega el consolidado de una página (indicadores, incidencias, pendientes).', prioridad: 'Media', responsable: '', fecha: '', estado: 'Abierto', ultAct: hora(4), actPor: 'Oscar', ultCom: '', nAct: 0, leido: [] },
]
t.forEach((x) => {
  hist.push({ fecha: x.creacion, operador: x.creadoPor, accion: 'CREAR', id: x.id, detalle: x.titulo, anterior: '', nuevo: 'Abierto' })
  if (x.ultCom) hist.push({ fecha: x.ultAct, operador: x.actPor, accion: x.estado === 'Cerrado' ? 'CERRAR' : 'AVANCE', id: x.id, detalle: x.ultCom, anterior: 'Abierto', nuevo: x.estado })
})

const clonar = (v) => JSON.parse(JSON.stringify(v))
const ok = (v) => new Promise((r) => setTimeout(() => r(clonar(v)), 200))
const no = (m) => new Promise((_, r) => setTimeout(() => r(new Error(m)), 200))

function tablero() {
  const coord = ses.rol === 'Coordinador'
  return ok({
    usuario: { nombre: ses.nombre, rol: ses.rol },
    tarjetas: t.filter((x) => x.estado !== 'Anulado'),
    operadores: ops,
    catalogos: { ...CATALOGOS, tipos: coord ? TIPOS : TIPOS.filter((x) => !CATALOGOS.tiposSoloCoord.includes(x)) },
    ahora: new Date().toISOString(),
  })
}

export const listarOperadores = () => ok(ops)

export const iniciarSesion = (nombre, pin) => {
  if (String(pin) !== '1234') return no('PIN incorrecto. (En la demostración el PIN es 1234)')
  ses = { nombre, rol: rolDe(nombre) }
  return ok({ token: 'demo-token-0000', nombre, rol: ses.rol })
}

export const cerrarSesion = () => { ses = null; return ok(true) }
export const obtenerTablero = () => (ses ? tablero() : no('SESION_VENCIDA'))

export const crearTarjeta = (_tk, d) => {
  if (!ses) return no('SESION_VENCIDA')
  if (CATALOGOS.tiposSoloCoord.includes(d.tipo) && ses.rol !== 'Coordinador') return no('Solo el coordinador puede publicar instrucciones nuevas.')
  const ahora = new Date().toISOString()
  n++
  const id = 'SM-' + ('000' + n).slice(-4)
  t.push({ id, creacion: ahora, creadoPor: ses.nombre, tipo: d.tipo, categoria: d.categoria, sitio: d.sitio, turno: d.turno, titulo: d.titulo, detalle: d.detalle, prioridad: d.prioridad, responsable: d.responsable, fecha: d.fecha || '', estado: 'Abierto', ultAct: ahora, actPor: ses.nombre, ultCom: '', nAct: 0, leido: [] })
  hist.push({ fecha: ahora, operador: ses.nombre, accion: 'CREAR', id, detalle: d.titulo, anterior: '', nuevo: 'Abierto' })
  return tablero()
}

export const actualizarTarjeta = (_tk, id, acc, com, visto) => {
  if (!ses) return no('SESION_VENCIDA')
  const x = t.find((y) => y.id === id)
  if (!x) return no('No se encontró la tarjeta ' + id + '.')
  if (acc !== 'Confirmar lectura' && !String(com || '').trim()) return no('Escribe un comentario: queda en el historial.')
  if (acc === 'Anular' && ses.rol !== 'Coordinador') return no('Solo el coordinador puede anular.')
  const ant = x.estado
  const ahora = new Date().toISOString()
  if (acc === 'Confirmar lectura') {
    if (!x.leido.includes(ses.nombre)) {
      x.leido.push(ses.nombre)
      hist.push({ fecha: ahora, operador: ses.nombre, accion: 'LECTURA', id, detalle: 'Confirmó lectura', anterior: '', nuevo: '' })
    }
    return tablero()
  }
  if (visto && visto !== ant) return no('Otro operador cambió esta tarjeta mientras la veías (ahora está en «' + ant + '»).')
  if (CATALOGOS.tiposSoloCoord.includes(x.tipo) && ses.rol !== 'Coordinador' && acc !== 'Avance') return no('Las instrucciones solo las mueve, cierra o anula el coordinador.')
  let nuevo = ant, cod
  if (acc === 'Avance') { cod = 'AVANCE'; if (ant === 'Abierto') nuevo = 'En seguimiento' }
  else if (acc === 'Cerrar') { cod = 'CERRAR'; nuevo = 'Cerrado' }
  else if (acc === 'Reabrir' || acc === 'Mover a Abierto') { cod = ant === 'Cerrado' ? 'REABRIR' : 'MOVER'; nuevo = 'Abierto' }
  else if (acc === 'Mover a En seguimiento') { cod = ant === 'Cerrado' ? 'REABRIR' : 'MOVER'; nuevo = 'En seguimiento' }
  else if (acc === 'Anular') { cod = 'ANULAR'; nuevo = 'Anulado' }
  else return no('Acción no válida.')
  x.estado = nuevo; x.ultAct = ahora; x.actPor = ses.nombre; x.ultCom = com; x.nAct++
  hist.push({ fecha: ahora, operador: ses.nombre, accion: cod, id, detalle: com, anterior: ant, nuevo })
  return tablero()
}

export const obtenerHistorial = (_tk, id) => ok(hist.filter((h) => h.id === id).reverse())

// CSV real (con los datos de la demo); PDF y resumen solo existen en Google.
export const exportarHistorial = (_tk, formato, desde, hasta) => {
  if (!ses || ses.rol !== 'Coordinador') return no('Solo el coordinador puede exportar.')
  if (formato !== 'csv') return no('El PDF solo funciona dentro de Google. En la demostración usa CSV.')
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const filas = hist.filter((h) => h.fecha.slice(0, 10) >= desde && h.fecha.slice(0, 10) <= hasta)
  const csv = '﻿' + ['Fecha y hora,Operador,Acción,ID,Detalle,Valor anterior,Valor nuevo']
    .concat(filas.map((h) => [h.fecha, h.operador, h.accion, h.id, h.detalle, h.anterior, h.nuevo].map(q).join(','))).join('\r\n')
  const base64 = btoa(unescape(encodeURIComponent(csv)))
  return ok({ nombre: `Historial_${desde}_a_${hasta}.csv`, mime: 'text/csv', base64 })
}
export const exportarResumen = () => no('El resumen PDF solo funciona dentro de Google.')
