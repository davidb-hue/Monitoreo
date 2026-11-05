<script setup>
import { ref, computed, onMounted } from 'vue'
import { S, esCoord, catalogos, buscar, bloqueada, accion, sesionVencida } from '../store.js'
import { api } from '../api/index.js'
import { slug, fFecha, duracion, abiertaMs, slaInfo, msgErr } from '../utils.js'

const t = computed(() => buscar(S.sel))
const com = ref('')
const err = ref('')
const hist = ref(null)
const histErr = ref('')

const esAviso = computed(() => t.value && catalogos.value.tiposAviso.includes(t.value.tipo))
const abierta = computed(() => {
  const ms = abiertaMs(t.value, S.ahora)
  if (ms == null) return ''
  return t.value.estado === 'Cerrado' ? 'Estuvo abierta ' + duracion(ms) : 'Lleva abierta ' + duracion(ms)
})
const sla = computed(() => slaInfo(t.value, S.ahora))
const puedeVencimiento = computed(() => t.value && !bloqueada(t.value) && t.value.estado !== 'Cerrado' && t.value.estado !== 'Anulado')

const botones = computed(() => {
  const x = t.value
  if (!x) return []
  const b = []
  if (x.estado !== 'Cerrado') b.push(['Avance', 'btn'])
  if (!bloqueada(x)) {
    if (x.estado === 'En seguimiento') b.push(['Mover a Abierto', 'btn'])
    if (x.estado === 'Abierto') b.push(['Mover a En seguimiento', 'btn'])
    b.push(x.estado !== 'Cerrado' ? ['Cerrar', 'btn btn-p'] : ['Reabrir', 'btn'])
  }
  if (esAviso.value && !x.leido.includes(S.usuario.nombre)) b.unshift(['Confirmar lectura', 'btn btn-p'])
  if (esCoord.value) b.push(['Anular', 'btn btn-r'])
  b.push(['Cerrar ventana', 'btn'])
  return b
})

async function cargarHist() {
  hist.value = null; histErr.value = '' // el historial del seguimiento lo ve cualquier usuario
  try { hist.value = await api.obtenerHistorial(S.token, S.sel) }
  catch (e) { if (!sesionVencida(e)) histErr.value = msgErr(e) }
}

async function ejecutar(a) {
  if (a === 'Cerrar ventana') { S.modal = null; return }
  const c = com.value.trim()
  if (a !== 'Confirmar lectura' && !c) { err.value = `Escribe un comentario antes de ${a.toLowerCase()}.`; return }
  if (a === 'Anular' && !confirm(`¿Anular ${t.value.id}? Queda registrado y deja de verse en la pizarra.`)) return
  err.value = ''
  const r = await accion(t.value.id, a, c)
  if (r.ok) { com.value = ''; if (a === 'Anular') S.modal = null; else cargarHist() }
  else if (r.error) err.value = r.error
}

onMounted(cargarHist)
</script>

<template>
  <div v-if="t" class="velo" @mousedown.self="S.modal = null">
    <div class="modal">
      <div class="fila1">
        <span>{{ t.id }} · {{ t.estado }}</span>
        <span>
          <span class="badge tipo">{{ t.tipo }}</span>
          <span class="badge" :class="'p-' + slug(t.prioridad)">{{ t.prioridad }}</span>
        </span>
      </div>
      <h3 style="margin-top:6px">{{ t.titulo }}</h3>
      <div class="sub">
        {{ t.sitio }} · {{ t.categoria }} · {{ t.turno }} · Creado por {{ t.creadoPor }} el {{ fFecha(t.creacion, true) }}
        <template v-if="t.responsable"> · Responsable: {{ t.responsable }}</template>
        <template v-if="t.inicia"> · A partir de: {{ fFecha(t.inicia, true) }}</template>
        <template v-if="t.fecha"> · Compromiso: {{ fFecha(t.fecha) }}</template>
      </div>
      <div class="tiempo" style="margin:6px 0">
        {{ abierta }}
        <span v-if="sla" class="sla" :class="{ rojo: sla.rojo, neutro: sla.cerrada }">{{ sla.texto }}</span>
        <button v-if="puedeVencimiento" class="btn" style="padding:2px 8px;font-size:12px;margin-left:8px" @click="S.modal = 'vencimiento'">
          {{ t.vence ? 'Cambiar tiempo de cierre' : 'Fijar tiempo de cierre' }}
        </button>
      </div>
      <div class="detalle-txt">{{ t.detalle }}</div>
      <div v-if="esAviso" class="meta">Leído por: {{ t.leido.length ? t.leido.join(', ') : 'nadie aún' }}</div>

      <label for="dCom">Comentario (obligatorio para cualquier cambio)</label>
      <textarea id="dCom" v-model="com" placeholder="Qué se hizo, qué se revisó, qué falta…"></textarea>
      <div class="err">{{ err }}</div>
      <div class="acciones">
        <button v-for="[nombre, clase] in botones" :key="nombre" :class="clase" :disabled="S.ocupado" @click="ejecutar(nombre)">
          {{ nombre }}
        </button>
      </div>

      <template>
        <h2 class="sec">Historial del seguimiento</h2>
        <div class="linea">
          <div v-if="histErr" class="vacio">{{ histErr }}</div>
          <div v-else-if="hist === null" class="vacio">Cargando…</div>
          <div v-else-if="!hist.length" class="vacio">Sin historial.</div>
          <template v-else>
            <div v-for="(e, i) in hist" :key="i" class="ev">
              <div class="q">{{ fFecha(e.fecha, true) }} · {{ e.operador }}</div>
              <div class="a">
                {{ e.accion }}
                <span v-if="e.anterior || e.nuevo" class="q">({{ e.anterior || '—' }} → {{ e.nuevo || '—' }})</span>
              </div>
              <div v-if="e.detalle">{{ e.detalle }}</div>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
