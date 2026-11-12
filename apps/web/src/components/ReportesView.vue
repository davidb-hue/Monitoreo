<script setup>
import { ref } from 'vue'
import { S, sesionVencida } from '../store.js'
import { api, esDemo } from '../api/index.js'
import { hoyES, lunesES, msgErr, descargar } from '../utils.js'
import { REPORTES } from '../reportes.js'

const desde = ref(lunesES())
const hasta = ref(hoyES())
const err = ref('')
const generando = ref('')

async function generar(tipo, formato) {
  if (!desde.value || !hasta.value) { err.value = 'Elige las dos fechas.'; return }
  if (S.ocupado) return
  err.value = ''; generando.value = tipo + ':' + formato; S.ocupado = true
  try {
    const r = await api.exportarReporte(S.token, tipo, formato, desde.value, hasta.value)
    descargar(r)
  } catch (e) { if (!sesionVencida(e)) err.value = msgErr(e) }
  finally { S.ocupado = false; generando.value = '' }
}
</script>

<template>
  <div class="reportes">
    <div class="rep-top">
      <h2 class="sec">Reportes</h2>
      <div class="rep-fechas">
        <div><label for="rDesde">Desde</label><input id="rDesde" v-model="desde" type="date"></div>
        <div><label for="rHasta">Hasta (incluido)</label><input id="rHasta" v-model="hasta" type="date"></div>
      </div>
    </div>
    <div class="rep-sub">
      Solo el coordinador. Cada descarga queda registrada en el historial. El Excel (.xlsx) abre en Excel, LibreOffice o Google Sheets.
      <template v-if="esDemo"> En esta demostración los datos son de ejemplo.</template>
    </div>
    <div v-if="err" class="err">{{ err }}</div>
    <div class="rep-grid">
      <div v-for="r in REPORTES" :key="r.tipo" class="rep-card">
        <div class="rep-nom">{{ r.nombre }}</div>
        <div class="rep-desc">{{ r.desc }}</div>
        <div class="rep-acc">
          <button class="btn btn-p" :disabled="S.ocupado" @click="generar(r.tipo, 'xlsx')">
            {{ generando === r.tipo + ':xlsx' ? 'Generando…' : 'Excel' }}
          </button>
          <button class="btn" :disabled="S.ocupado" @click="generar(r.tipo, 'csv')">
            {{ generando === r.tipo + ':csv' ? 'Generando…' : 'CSV' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
