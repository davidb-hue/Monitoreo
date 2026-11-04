<script setup>
import { computed } from 'vue'
import { S } from '../store.js'
import { slug, fFecha } from '../utils.js'

const props = defineProps({ t: { type: Object, required: true } })
const emit = defineEmits(['abrir', 'leer'])
const leyo = computed(() => props.t.leido.includes(S.usuario.nombre))
</script>

<template>
  <div class="aviso" :class="'t-' + slug(t.tipo)" @click="emit('abrir', t.id)">
    <div class="fila1">
      <span>{{ t.id }} · {{ t.tipo }}</span>
      <span class="badge" :class="'p-' + slug(t.prioridad)">{{ t.prioridad }}</span>
    </div>
    <div class="tit">{{ t.titulo }}</div>
    <div class="det">{{ t.detalle }}</div>
    <div class="pie">
      <span class="leidos">
        {{ t.creadoPor }} · {{ fFecha(t.creacion, true) }}<br>
        Leído por: {{ t.leido.length ? t.leido.join(', ') : 'nadie aún' }}
      </span>
      <span v-if="leyo" class="badge p-baja">Leído</span>
      <button v-else class="btn btn-p" :disabled="S.ocupado" @click.stop="emit('leer', t.id)">Confirmar lectura</button>
    </div>
  </div>
</template>
