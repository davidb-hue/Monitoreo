// Puente a las funciones de Codigo.gs mediante google.script.run (devuelve promesas).
const call = (fn, ...args) =>
  new Promise((resolve, reject) => {
    window.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](...args)
  })

export const listarOperadores = () => call('listarOperadores')
export const iniciarSesion = (nombre, pin) => call('iniciarSesion', nombre, pin)
export const cerrarSesion = (token) => call('cerrarSesion', token)
export const obtenerTablero = (token) => call('obtenerTablero', token)
export const crearTarjeta = (token, d) => call('crearTarjeta', token, d)
export const actualizarTarjeta = (token, id, accion, comentario, estadoVisto) =>
  call('actualizarTarjeta', token, id, accion, comentario, estadoVisto)
export const obtenerHistorial = (token, id) => call('obtenerHistorial', token, id)
export const exportarHistorial = (token, formato, desde, hasta) => call('exportarHistorial', token, formato, desde, hasta)
export const exportarResumen = (token, desde, hasta) => call('exportarResumen', token, desde, hasta)
