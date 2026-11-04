<script setup>
import { ref } from 'vue'
import { S, sesionVencida } from '../store.js'
import { api } from '../api/index.js'
import { hoyES, lunesES, msgErr, descargar } from '../utils.js'

const desde = ref(lunesES())
const hasta = ref(hoyES())
const err = ref('')

async function exportar(formato) {
  if (!desde.value || !hasta.value) { err.value = 'Elige las dos fechas.'; return }
  if (S.ocupado) return
  err.value = ''; S.ocupado = true
  try {
    const r = formato === 'resumen'
      ? await api.exportarResumen(S.token, desde.value, hasta.value)
      : await api.exportarHistorial(S.token, formato, desde.value, hasta.value)
    descargar(r)
  } catch (e) { if (!sesionVencida(e)) err.value = msgErr(e) }
  finally { S.ocupado = false }
}
</script>

<template>
  <div class="velo" @mousedown.self="S.modal = null">
    <div class="modal" style="max-width:480px">
      <h3>Exportar historial y resumen</h3>
      <div class="sub">Solo el coordinador. Cada exportación queda registrada en el historial.</div>
      <div class="grid2">
        <div><label for="eDesde">Desde</label><input id="eDesde" v-model="desde" type="date"></div>
        <div><label for="eHasta">Hasta (incluido)</label><input id="eHasta" v-model="hasta" type="date"></div>
      </div>
      <div class="err">{{ err }}</div>
      <div class="acciones">
        <button class="btn" @click="S.modal = null">Cerrar</button>
        <button class="btn" :disabled="S.ocupado" @click="exportar('csv')">Historial CSV</button>
        <button class="btn" :disabled="S.ocupado" @click="exportar('pdf')">Historial PDF</button>
        <button class="btn btn-p" :disabled="S.ocupado" @click="exportar('resumen')">Resumen PDF</button>
      </div>
    </div>
  </div>
</template>
