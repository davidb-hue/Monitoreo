// Estado compartido (Composition API: reactive + funciones). Todos los componentes importan este módulo.
import { reactive, computed } from 'vue'
import { api } from './api/index.js'
import { msgErr } from './utils.js'

const KEY = 'pizarraToken' // sessionStorage: solo esta pestaña, solo el token (no datos)
const leerToken = () => { try { return sessionStorage.getItem(KEY) } catch { return null } }
const guardarToken = (t) => { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY) } catch { /* sin almacenamiento */ } }

export const S = reactive({
  token: leerToken(),
  usuario: null,
  datos: null,
  ocupado: false,
  cargando: false,
  operadoresLogin: [],
  loginMsg: '',
  vista: 'tablero', // tablero | dashboard | historial | usuarios | catalogo
  modal: null, // null | 'nuevo' | 'detalle' | 'mover' | 'export' | 'vencimiento'
  sel: null,
  mover: null,
  filtros: { q: '', tipo: '', sitio: '', resp: '' },
  ahora: Date.now(),
  dash: null,
  hist: null,
  usuarios: null,
  catalogo: null,
})

export const esCoord = computed(() => S.usuario?.rol === 'Coordinador')
export const catalogos = computed(() => S.datos?.catalogos)
export const buscar = (id) => S.datos?.tarjetas.find((t) => t.id === id)
export const bloqueada = (t) => !!catalogos.value?.tiposSoloCoord.includes(t.tipo) && !esCoord.value

export const tocar = () => { S.ahora = Date.now() } // refresca los contadores de tiempo

export async function cargarOperadores() {
  try { S.operadoresLogin = await api.listarOperadores() } catch (e) { S.loginMsg = msgErr(e) }
}

export function reiniciar(msg = '') {
  S.token = null; guardarToken(null)
  S.datos = null; S.usuario = null; S.modal = null; S.sel = null; S.mover = null
  S.ocupado = false; S.cargando = false; S.vista = 'tablero'
  S.dash = null; S.hist = null; S.usuarios = null; S.catalogo = null
  Object.assign(S.filtros, { q: '', tipo: '', sitio: '', resp: '' })
  S.loginMsg = msg
  cargarOperadores()
}

export function sesionVencida(e) {
  if (msgErr(e).includes('SESION_VENCIDA')) { reiniciar('Tu sesión venció. Vuelve a entrar.'); return true }
  return false
}

function aplicar(d) {
  S.datos = d
  S.usuario = d.usuario
  if (S.modal === 'detalle' && S.sel && !buscar(S.sel)) {
    S.modal = null
    alert(`La tarjeta ${S.sel} ya no está en la pizarra (fue anulada o salió de los últimos 7 días).`)
  }
}

export async function entrar(nombre, pin) {
  const r = await api.iniciarSesion(nombre, pin)
  S.token = r.token; guardarToken(r.token); S.loginMsg = ''
  await cargar()
}

export async function salir() {
  const t = S.token
  reiniciar('Sesión cerrada. Entrega el turno con el relevo firmado.')
  try { await api.cerrarSesion(t) } catch { /* ya cerrada */ }
}

export async function cargar(silencioso = false) {
  if (!S.token) return
  if (!silencioso) S.cargando = true
  try {
    aplicar(await api.obtenerTablero(S.token))
    if (S.vista === 'dashboard') await cargarDashboard(true)
  } catch (e) { if (!sesionVencida(e) && !silencioso) alert(msgErr(e)) }
  finally { S.cargando = false }
}

/* ---------- navegación ---------- */
export async function irA(vista) {
  if (['historial', 'usuarios', 'catalogo'].includes(vista) && !esCoord.value) return
  S.vista = vista
  if (vista === 'dashboard') return cargarDashboard()
  if (vista === 'historial') return cargarHistorial()
  if (vista === 'usuarios') return cargarUsuarios()
  if (vista === 'catalogo') return cargarCatalogo()
}

export async function cargarDashboard(silencioso = false) {
  if (!silencioso) S.cargando = true
  try { S.dash = await api.obtenerDashboard(S.token) }
  catch (e) { if (!sesionVencida(e) && !silencioso) alert(msgErr(e)) }
  finally { S.cargando = false }
}

export async function cargarHistorial(filtros = {}) {
  S.cargando = true
  try { S.hist = await api.historialGlobal(S.token, filtros) }
  catch (e) { if (!sesionVencida(e)) { S.hist = { filas: [], error: msgErr(e) } } }
  finally { S.cargando = false }
}

export async function cargarUsuarios() {
  S.cargando = true
  try { S.usuarios = await api.listarUsuarios(S.token) }
  catch (e) { if (!sesionVencida(e)) alert(msgErr(e)) }
  finally { S.cargando = false }
}

export async function cargarCatalogo() {
  S.cargando = true
  try { S.catalogo = await api.listarCatalogo(S.token) }
  catch (e) { if (!sesionVencida(e)) alert(msgErr(e)) }
  finally { S.cargando = false }
}

/* ---------- acciones sobre tarjetas ---------- */
export async function accion(id, acc, comentario = '') {
  if (S.ocupado) return { ok: false }
  S.ocupado = true
  try {
    aplicar(await api.actualizarTarjeta(S.token, id, acc, comentario, buscar(id)?.estado || ''))
    return { ok: true }
  } catch (e) {
    if (sesionVencida(e)) return { ok: false }
    cargar(true)
    return { ok: false, error: msgErr(e) }
  } finally { S.ocupado = false }
}

export async function crear(datos) {
  if (S.ocupado) return { ok: false }
  S.ocupado = true
  try { aplicar(await api.crearTarjeta(S.token, datos)); return { ok: true } }
  catch (e) { return sesionVencida(e) ? { ok: false } : { ok: false, error: msgErr(e) } }
  finally { S.ocupado = false }
}

export async function fijarVencimiento(id, d) {
  if (S.ocupado) return { ok: false }
  S.ocupado = true
  try { aplicar(await api.fijarVencimiento(S.token, id, d)); return { ok: true } }
  catch (e) { return sesionVencida(e) ? { ok: false } : { ok: false, error: msgErr(e) } }
  finally { S.ocupado = false }
}

/* ---------- usuarios (admin) ---------- */
async function opUsuario(fn) {
  if (S.ocupado) return { ok: false }
  S.ocupado = true
  try { S.usuarios = await fn(); return { ok: true } }
  catch (e) { return sesionVencida(e) ? { ok: false } : { ok: false, error: msgErr(e) } }
  finally { S.ocupado = false }
}
export const crearUsuario = (d) => opUsuario(() => api.crearUsuario(S.token, d))
export const actualizarUsuario = (nombre, d) => opUsuario(() => api.actualizarUsuario(S.token, nombre, d))
export const asignarPin = (nombre, pin) => opUsuario(() => api.asignarPinUsuario(S.token, nombre, pin))
export const desbloquear = (nombre) => opUsuario(() => api.desbloquearUsuario(S.token, nombre))

/* ---------- catálogo (admin) ---------- */
async function opCatalogo(fn) {
  if (S.ocupado) return { ok: false }
  S.ocupado = true
  try {
    S.catalogo = await fn()
    cargar(true) // refresca las listas del tablero (tipos, responsables, etc.)
    return { ok: true }
  } catch (e) { return sesionVencida(e) ? { ok: false } : { ok: false, error: msgErr(e) } }
  finally { S.ocupado = false }
}
export const crearItemCatalogo = (d) => opCatalogo(() => api.crearCatalogo(S.token, d))
export const actualizarItemCatalogo = (id, d) => opCatalogo(() => api.actualizarCatalogo(S.token, id, d))
