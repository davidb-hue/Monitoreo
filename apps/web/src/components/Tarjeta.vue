<script setup>
import { computed } from 'vue'
import { S, bloqueada } from '../store.js'
import { slug, fFecha, hace, duracion, abiertaMs, slaInfo, programada } from '../utils.js'

const props = defineProps({ t: { type: Object, required: true } })
const emit = defineEmits(['abrir'])

const fija = computed(() => bloqueada(props.t))
const ultCom = computed(() => (props.t.ultCom && props.t.ultCom.length > 80 ? props.t.ultCom.slice(0, 80) + '…' : props.t.ultCom))
const prog = computed(() => programada(props.t, S.ahora))
const abierta = computed(() => {
  const ms = abiertaMs(props.t, S.ahora)
  if (ms == null) return ''
  return props.t.estado === 'Cerrado' ? 'Estuvo abierta ' + duracion(ms) : 'Abierta hace ' + duracion(ms)
})
const sla = computed(() => slaInfo(props.t, S.ahora))
const iniciales = computed(() => {
  const n = (props.t.responsable || '').trim()
  if (!n) return '—'
  const p = n.split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || n[0].toUpperCase()
})

function arrastrar(ev) { ev.dataTransfer.setData('text/plain', props.t.id) }
</script>

<template>
  <article
    class="tarjeta" :class="['t-' + slug(t.tipo), { vencida: sla && sla.rojo }]" :style="fija ? { cursor: 'pointer' } : null"
    :draggable="!fija" @dragstart="arrastrar" @click="emit('abrir', t.id)"
  >
    <div class="fila1">
      <span class="t-id">{{ t.id }}</span>
      <span class="badge tipo">{{ t.tipo }}</span>
      <span class="flex-sp"></span>
      <span class="badge" :class="'p-' + slug(t.prioridad)">{{ t.prioridad }}</span>
    </div>
    <div class="tit">{{ t.titulo }}</div>
    <div class="meta">
      <span class="chip-meta">{{ t.sitio }}</span>
      <span class="chip-meta">{{ t.categoria }}</span>
      <span v-if="t.responsable" class="chip-resp" :title="'Responsable: ' + t.responsable">
        <span class="avatar-sm">{{ iniciales }}</span>{{ t.responsable }}
      </span>
      <span v-else class="chip-sinresp" title="Esta novedad no tiene responsable asignado">⚠ Sin responsable</span>
    </div>
    <div class="tiempo">
      <template v-if="prog"><span class="sla neutro">⏳ {{ prog }}</span></template>
      <template v-else>{{ abierta }}</template>
      <span v-if="sla" class="sla" :class="{ rojo: sla.rojo, neutro: sla.cerrada }">{{ sla.texto }}</span>
    </div>
    <div class="ult">{{ t.actPor }} · {{ hace(t.ultAct) }}<template v-if="ultCom">: {{ ultCom }}</template></div>
  </article>
</template>
