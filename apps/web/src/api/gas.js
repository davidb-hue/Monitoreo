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
export const obtenerDashboard = (token) => call('obtenerDashboard', token)
export const fijarVencimiento = (token, id, d) => call('fijarVencimiento', token, id, d)
export const historialGlobal = (token, f) => call('historialGlobal', token, f)
export const listarUsuarios = (token) => call('listarUsuarios', token)
export const crearUsuario = (token, d) => call('crearUsuario', token, d)
export const actualizarUsuario = (token, nombre, d) => call('actualizarUsuario', token, nombre, d)
export const asignarPinUsuario = (token, nombre, pin) => call('asignarPinUsuario', token, nombre, pin)
export const desbloquearUsuario = (token, nombre) => call('desbloquearUsuario', token, nombre)
export const listarCatalogo = (token) => call('listarCatalogo', token)
export const crearCatalogo = (token, d) => call('crearCatalogo', token, d)
export const actualizarCatalogo = (token, id, d) => call('actualizarCatalogo', token, id, d)
