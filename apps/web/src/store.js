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
  modal: null, // null | 'nuevo' | 'detalle' | 'mover' | 'export'
  sel: null,
  mover: null, // { id, acc, titulo }
  filtros: { q: '', tipo: '', sitio: '', resp: '' },
})

export const esCoord = computed(() => S.usuario?.rol === 'Coordinador')
export const catalogos = computed(() => S.datos?.catalogos)
export const buscar = (id) => S.datos?.tarjetas.find((t) => t.id === id)
/** Instrucciones: solo el coordinador las mueve/cierra/anula. */
export const bloqueada = (t) => !!catalogos.value?.tiposSoloCoord.includes(t.tipo) && !esCoord.value

export async function cargarOperadores() {
  try { S.operadoresLogin = await api.listarOperadores() } catch (e) { S.loginMsg = msgErr(e) }
}

/** Limpia todo lo que vio el operador anterior (relevo de turno o sesión vencida). */
export function reiniciar(msg = '') {
  S.token = null; guardarToken(null)
  S.datos = null; S.usuario = null; S.modal = null; S.sel = null; S.mover = null
  S.ocupado = false; S.cargando = false
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
  const r = await api.iniciarSesion(nombre, pin) // si falla, el error llega al formulario de login
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
  try { aplicar(await api.obtenerTablero(S.token)) }
  catch (e) { if (!sesionVencida(e) && !silencioso) alert(msgErr(e)) }
  finally { S.cargando = false }
}

/** Devuelve {ok, error}. El estado visto viaja al servidor para detectar cambios de otro operador. */
export async function accion(id, acc, comentario = '') {
  if (S.ocupado) return { ok: false }
  S.ocupado = true
  try {
    aplicar(await api.actualizarTarjeta(S.token, id, acc, comentario, buscar(id)?.estado || ''))
    return { ok: true }
  } catch (e) {
    if (sesionVencida(e)) return { ok: false }
    cargar(true) // puede que otro operador ya cambió la tarjeta
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
