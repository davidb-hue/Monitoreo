// Cliente del backend Express (apps/server). El token viaja en la cabecera Authorization.
const base = import.meta.env.VITE_API_URL || '' // vacío = mismo origen (Express sirve el frontend)

async function req(metodo, ruta, token, cuerpo) {
  const r = await fetch(base + '/api' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status)
  return j
}

const qs = (o) => new URLSearchParams(o).toString()

export const listarOperadores = () => req('GET', '/operadores')
export const iniciarSesion = (nombre, pin) => req('POST', '/sesion', null, { nombre, pin })
export const cerrarSesion = (token) => req('DELETE', '/sesion', token)
export const obtenerTablero = (token) => req('GET', '/tablero', token)
export const crearTarjeta = (token, d) => req('POST', '/tarjetas', token, d)
export const actualizarTarjeta = (token, id, accion, comentario, estadoVisto) =>
  req('POST', `/tarjetas/${encodeURIComponent(id)}/acciones`, token, { accion, comentario, estadoVisto })
export const obtenerHistorial = (token, id) => req('GET', `/tarjetas/${encodeURIComponent(id)}/historial`, token)
export const exportarHistorial = (token, formato, desde, hasta) => req('GET', '/exportar/historial?' + qs({ formato, desde, hasta }), token)
export const exportarResumen = (token, desde, hasta) => req('GET', '/exportar/resumen?' + qs({ desde, hasta }), token)
