<script setup>
import { computed } from 'vue'
import { S, bloqueada } from '../store.js'
import { slug, fFecha, hace, duracion, abiertaMs, slaInfo } from '../utils.js'

const props = defineProps({ t: { type: Object, required: true } })
const emit = defineEmits(['abrir'])

const fija = computed(() => bloqueada(props.t))
const ultCom = computed(() => (props.t.ultCom && props.t.ultCom.length > 80 ? props.t.ultCom.slice(0, 80) + '…' : props.t.ultCom))
const abierta = computed(() => {
  const ms = abiertaMs(props.t, S.ahora)
  if (ms == null) return ''
  return props.t.estado === 'Cerrado' ? 'Estuvo abierta ' + duracion(ms) : 'Abierta hace ' + duracion(ms)
})
const sla = computed(() => slaInfo(props.t, S.ahora))

function arrastrar(ev) { ev.dataTransfer.setData('text/plain', props.t.id) }
</script>

<template>
  <article
    class="tarjeta" :class="'t-' + slug(t.tipo)" :style="fija ? { cursor: 'pointer' } : null"
    :draggable="!fija" @dragstart="arrastrar" @click="emit('abrir', t.id)"
  >
    <div class="fila1">
      <span>{{ t.id }} · <span class="badge tipo">{{ t.tipo }}</span></span>
      <span class="badge" :class="'p-' + slug(t.prioridad)">{{ t.prioridad }}</span>
    </div>
    <div class="tit">{{ t.titulo }}</div>
    <div class="meta">
      {{ t.sitio }} · {{ t.categoria }}
      <template v-if="t.responsable"><br>Responsable: {{ t.responsable }}</template>
    </div>
    <div class="tiempo">
      {{ abierta }}
      <span v-if="sla" class="sla" :class="{ rojo: sla.rojo, neutro: sla.cerrada }">{{ sla.texto }}</span>
    </div>
    <div class="ult">{{ t.actPor }} · {{ hace(t.ultAct) }}<template v-if="ultCom">: {{ ultCom }}</template></div>
  </article>
</template>
