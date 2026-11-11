<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { S, esCoord, catalogos, buscar, bloqueada, cargar, cargarOperadores, salir, accion, irA, tocar, alternarTema } from './store.js'
import { esDemo } from './api/index.js'
import { TZ, slug } from './utils.js'
import LoginModal from './components/LoginModal.vue'
import Aviso from './components/Aviso.vue'
import Tarjeta from './components/Tarjeta.vue'
import DetalleModal from './components/DetalleModal.vue'
import NuevoModal from './components/NuevoModal.vue'
import MoverModal from './components/MoverModal.vue'
import ExportModal from './components/ExportModal.vue'
import VencimientoModal from './components/VencimientoModal.vue'
import DashboardView from './components/DashboardView.vue'
import HistorialView from './components/HistorialView.vue'
import UsuariosView from './components/UsuariosView.vue'
import CatalogoView from './components/CatalogoView.vue'

const COLS = ['Abierto', 'En seguimiento', 'Cerrado']
// El orden de prioridad sale del catálogo (primero = más urgente).
const PRIO = computed(() => {
  const m = {}; (catalogos.value?.prioridades || ['Alta', 'Media', 'Baja']).forEach((p, i) => { m[p] = i }); return m
})
const prio = (t) => PRIO.value[t.prioridad] ?? 99

const reloj = ref('')
function tic() {
  reloj.value = new Date().toLocaleString('es-SV', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  tocar()
}

const pend = (t) => t.estado === 'Abierto' || t.estado === 'En seguimiento'
function pasaAlerta(t) {
  const a = S.filtros.alerta
  if (!a) return true
  if (!pend(t)) return false
  if (a === 'venc') return !!t.vence && new Date(t.vence).getTime() < S.ahora
  if (a === 'sinResp') return !String(t.responsable || '').trim()
  if (a === 'sinMov') return S.ahora - new Date(t.ultAct).getTime() > 48 * 3600000
  return true
}
const filtradas = computed(() => {
  const { q, tipo, sitio, resp } = S.filtros
  const txt = q.trim().toLowerCase()
  return (S.datos?.tarjetas || []).filter((t) =>
    (!tipo || t.tipo === tipo) && (!sitio || t.sitio === sitio) && (!resp || t.responsable === resp) && pasaAlerta(t) &&
    (!txt || `${t.id} ${t.titulo} ${t.detalle}`.toLowerCase().includes(txt)))
})
const alertas = computed(() => {
  const ts = (S.datos?.tarjetas || []).filter(pend)
  const venc = ts.filter((t) => t.vence && new Date(t.vence).getTime() < S.ahora).length
  const sinResp = ts.filter((t) => !String(t.responsable || '').trim()).length
  const sinMov = ts.filter((t) => S.ahora - new Date(t.ultAct).getTime() > 48 * 3600000).length
  return { venc, sinResp, sinMov, total: venc + sinResp + sinMov }
})
const alternarAlerta = (a) => { S.filtros.alerta = S.filtros.alerta === a ? '' : a }
function ordenar(a, b) {
  const o = S.filtros.orden
  if (o === 'vencimiento') {
    const va = a.vence ? new Date(a.vence).getTime() : Infinity
    const vb = b.vence ? new Date(b.vence).getTime() : Infinity
    return va - vb || (prio(a) - prio(b))
  }
  if (o === 'reciente') return b.ultAct.localeCompare(a.ultAct)
  return (prio(a) - prio(b)) || b.ultAct.localeCompare(a.ultAct)
}
const tiposFiltro = computed(() => [...new Set([...catalogos.value.tipos, ...catalogos.value.tiposAviso])])
const avisos = computed(() =>
  filtradas.value.filter((t) => catalogos.value.tiposAviso.includes(t.tipo) && t.estado !== 'Cerrado')
    .sort((a, b) => b.creacion.localeCompare(a.creacion)))
const columnas = computed(() => COLS.map((nombre) => {
  const esAviso = (t) => catalogos.value.tiposAviso.includes(t.tipo)
  let ts = filtradas.value.filter((t) => t.estado === nombre && !esAviso(t))
  if (nombre === 'Cerrado') ts = ts.concat(filtradas.value.filter((t) => t.estado === 'Cerrado' && esAviso(t)))
  ts.sort((a, b) => nombre === 'Cerrado' ? b.ultAct.localeCompare(a.ultAct) : ordenar(a, b))
  return { nombre, titulo: nombre === 'Cerrado' ? 'Cerrado (últimos 7 días)' : nombre, ts }
}))

function abrir(id) { S.sel = id; S.modal = 'detalle' }
const sobre = ref('')
function soltar(ev, destino) {
  sobre.value = ''
  const t = buscar(ev.dataTransfer.getData('text/plain'))
  if (!t || t.estado === destino || bloqueada(t)) return
  const acc = destino === 'Cerrado' ? 'Cerrar' : destino === 'Abierto' ? 'Mover a Abierto' : 'Mover a En seguimiento'
  S.mover = { id: t.id, acc, titulo: `${t.id}: ${t.estado} → ${destino}` }
  S.modal = 'mover'
}

let t1, t2
onMounted(() => {
  tic(); t1 = setInterval(tic, 30000)
  t2 = setInterval(() => { if (S.token && !S.modal) cargar(true) }, 60000)
  if (S.token) cargar(); else cargarOperadores()
})
onBeforeUnmount(() => { clearInterval(t1); clearInterval(t2) })
</script>

<template>
  <header>
    <span class="marca">
      <img src="/img/lactolac.png" alt="Lactolac">
      <img src="/img/yes.png" alt="Yogurt YES">
    </span>
    <h1>Pizarra de Monitoreo</h1>
    <span class="reloj">{{ reloj }}</span>
    <nav v-if="S.usuario" class="nav">
      <button :class="{ activo: S.vista === 'tablero' }" @click="irA('tablero')">Tablero</button>
      <button :class="{ activo: S.vista === 'dashboard' }" @click="irA('dashboard')">Dashboard</button>
      <button v-if="esCoord" :class="{ activo: S.vista === 'historial' }" @click="irA('historial')">Historial</button>
      <button v-if="esCoord" :class="{ activo: S.vista === 'usuarios' }" @click="irA('usuarios')">Usuarios</button>
      <button v-if="esCoord" :class="{ activo: S.vista === 'catalogo' }" @click="irA('catalogo')">Catálogo</button>
    </nav>
    <span class="esp"></span>
    <button class="btn-tema" :title="S.tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      :aria-label="S.tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'" @click="alternarTema">
      {{ S.tema === 'oscuro' ? '☀️' : '🌙' }}
    </button>
    <template v-if="S.usuario">
      <span class="chip-user">{{ S.usuario.nombre }}<small>{{ S.usuario.rol }}</small></span>
      <button v-if="esCoord" class="btn btn-h" @click="S.modal = 'export'">Exportar</button>
      <button v-if="S.vista === 'tablero'" class="btn btn-p" @click="S.modal = 'nuevo'">+ Nuevo registro</button>
      <button class="btn btn-h" @click="salir">Cambiar de operador</button>
    </template>
  </header>
  <div v-if="esDemo" class="demo">Vista previa con datos de ejemplo. Nada se guarda; PIN de prueba: 1234</div>

  <template v-if="S.usuario && S.datos">
    <main v-show="S.vista === 'tablero'">
      <div class="barra">
        <input v-model="S.filtros.q" placeholder="Buscar por ID, título o detalle">
        <select v-model="S.filtros.tipo"><option value="">Todos los tipos</option><option v-for="x in tiposFiltro" :key="x">{{ x }}</option></select>
        <select v-model="S.filtros.sitio"><option value="">Todos los sitios</option><option v-for="x in catalogos.sitios" :key="x">{{ x }}</option></select>
        <select v-model="S.filtros.resp"><option value="">Todos los responsables</option><option v-for="x in catalogos.responsables" :key="x">{{ x }}</option></select>
        <select v-model="S.filtros.orden" title="Ordenar seguimientos">
          <option value="prioridad">Orden: Prioridad</option>
          <option value="vencimiento">Orden: Vencimiento</option>
          <option value="reciente">Orden: Más reciente</option>
        </select>
      </div>
      <div v-if="alertas.total" class="alert-bar">
        <span class="al-ico">⚠</span>
        <span class="al-txt">Atención</span>
        <button v-if="alertas.venc" class="al-chip rojo" :class="{ on: S.filtros.alerta === 'venc' }" @click="alternarAlerta('venc')">{{ alertas.venc }} vencidas</button>
        <button v-if="alertas.sinResp" class="al-chip ambar" :class="{ on: S.filtros.alerta === 'sinResp' }" @click="alternarAlerta('sinResp')">{{ alertas.sinResp }} sin responsable</button>
        <button v-if="alertas.sinMov" class="al-chip" :class="{ on: S.filtros.alerta === 'sinMov' }" @click="alternarAlerta('sinMov')">{{ alertas.sinMov }} sin movimiento +48 h</button>
        <button v-if="S.filtros.alerta" class="al-clear" @click="S.filtros.alerta = ''">Quitar filtro ✕</button>
      </div>
      <h2 class="sec">Avisos e instrucciones vigentes</h2>
      <div class="avisos">
        <div v-if="!avisos.length" class="vacio">No hay avisos vigentes.</div>
        <Aviso v-for="t in avisos" :key="t.id" :t="t" @abrir="abrir" @leer="(id) => accion(id, 'Confirmar lectura')" />
      </div>
      <h2 class="sec">Seguimientos</h2>
      <div class="tablero">
        <section
          v-for="c in columnas" :key="c.nombre" :class="['col', 'col-' + slug(c.nombre), { sobre: sobre === c.nombre }]"
          @dragover.prevent="sobre = c.nombre" @dragleave="sobre = ''" @drop.prevent="soltar($event, c.nombre)"
        >
          <div class="col-h"><span>{{ c.titulo }}</span><span class="n">{{ c.ts.length }}</span></div>
          <Tarjeta v-for="t in c.ts" :key="t.id" :t="t" @abrir="abrir" />
          <div v-if="!c.ts.length" class="vacio">Sin tarjetas</div>
        </section>
      </div>
    </main>

    <main v-if="S.vista === 'dashboard'" class="main-dash"><DashboardView /></main>
    <main v-if="S.vista === 'historial' && esCoord"><HistorialView /></main>
    <main v-if="S.vista === 'usuarios' && esCoord"><UsuariosView /></main>
    <main v-if="S.vista === 'catalogo' && esCoord"><CatalogoView /></main>

    <DetalleModal v-if="S.modal === 'detalle'" />
    <NuevoModal v-if="S.modal === 'nuevo'" />
    <MoverModal v-if="S.modal === 'mover'" />
    <ExportModal v-if="S.modal === 'export'" />
    <VencimientoModal v-if="S.modal === 'vencimiento'" />
  </template>

  <LoginModal v-if="!S.token" />
  <div v-if="S.cargando || S.ocupado" class="cargando">{{ S.ocupado ? 'Guardando…' : 'Cargando…' }}</div>
</template>
