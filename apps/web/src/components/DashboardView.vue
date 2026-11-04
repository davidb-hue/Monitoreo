<script setup>
import { computed } from 'vue'
import { S, cargarDashboard } from '../store.js'

const d = computed(() => S.dash)
const m = computed(() => S.dash?.marcadores || {})

const kpis = computed(() => {
  if (!d.value) return []
  const m = d.value.marcadores, tt = d.value.totales
  return [
    { l: 'Pendientes', n: tt.pendientes, alerta: false },
    { l: 'Abiertos', n: tt.Abierto, alerta: false },
    { l: 'En seguimiento', n: tt['En seguimiento'], alerta: false },
    { l: 'Vencidos (tiempo de cierre)', n: m.vencidos, alerta: m.vencidos > 0 },
    { l: 'Sin movimiento +48 h', n: m.sinMov48, alerta: m.sinMov48 > 0 },
    { l: 'Avisos sin leer por todos', n: m.sinLeer, alerta: m.sinLeer > 0 },
    { l: 'Creados (7 días)', n: m.creados7, alerta: false },
    { l: 'Cerrados (7 días)', n: m.cerrados7, alerta: false },
  ]
})

const barrasSitio = computed(() => barras(d.value?.porSitio))
const barrasPrio = computed(() => barras(d.value?.porPrioridad))
function barras(obj) {
  if (!obj) return []
  const ent = Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...ent.map(([, v]) => v))
  return ent.map(([k, v]) => ({ k, v, pct: Math.round((v / max) * 100) }))
}
</script>

<template>
  <div v-if="!d" class="vacio">Cargando marcadores…</div>
  <template v-else>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 12px">
      <h2 class="sec" style="margin:0">Marcadores</h2>
      <button class="btn" @click="cargarDashboard()">Actualizar</button>
    </div>
    <div class="kpis">
      <div v-for="k in kpis" :key="k.l" class="kpi" :class="{ alerta: k.alerta }">
        <div class="n">{{ k.n }}</div>
        <div class="l">{{ k.l }}</div>
      </div>
    </div>
    <div class="kpis" style="margin-top:12px;grid-template-columns:repeat(2,1fr)">
      <div class="kpi"><div class="n">{{ m.promedioHoras }} h</div><div class="l">Tiempo promedio abierto (cerrados 7 días)</div></div>
      <div class="kpi" :class="{ alerta: m.compromisoVencido > 0 }"><div class="n">{{ m.compromisoVencido }}</div><div class="l">Con fecha compromiso vencida</div></div>
    </div>

    <div class="panel">
      <h3>Pendientes por sitio</h3>
      <div class="barras">
        <div v-if="!barrasSitio.length" class="vacio">Sin pendientes.</div>
        <div v-for="b in barrasSitio" :key="b.k" class="barra-row">
          <span>{{ b.k }}</span>
          <span class="track"><span class="fill" :style="{ width: b.pct + '%' }"></span></span>
          <span style="text-align:right">{{ b.v }}</span>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>Pendientes por prioridad</h3>
      <div class="barras">
        <div v-if="!barrasPrio.length" class="vacio">Sin pendientes.</div>
        <div v-for="b in barrasPrio" :key="b.k" class="barra-row">
          <span>{{ b.k }}</span>
          <span class="track"><span class="fill" :style="{ width: b.pct + '%' }"></span></span>
          <span style="text-align:right">{{ b.v }}</span>
        </div>
      </div>
    </div>
  </template>
</template>
