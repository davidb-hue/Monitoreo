<script setup>
import { computed } from 'vue'
import { S, cargarDashboard } from '../store.js'

const d = computed(() => S.dash)
const m = computed(() => S.dash?.marcadores || {})

const kpis = computed(() => {
  if (!d.value) return []
  const m = d.value.marcadores, tt = d.value.totales
  return [
    { l: 'Total de registros', n: m.total, tono: 'azul', alerta: false },
    { l: 'Pendientes', n: tt.pendientes, tono: 'azul', alerta: false },
    { l: 'Abiertos', n: tt.Abierto, tono: 'celeste', alerta: false },
    { l: 'En seguimiento', n: tt['En seguimiento'], tono: 'naranja', alerta: false },
    { l: 'Cerrados (total)', n: tt.Cerrado, tono: 'verde', alerta: false },
    { l: '% de resolución', n: m.pctResolucion + '%', tono: 'verde', alerta: false },
    { l: 'Vencidos (tiempo de cierre)', n: m.vencidos, tono: 'rojo', alerta: m.vencidos > 0 },
    { l: 'Sin responsable', n: m.sinResponsable, tono: 'rojo', alerta: m.sinResponsable > 0 },
    { l: 'Sin movimiento +48 h', n: m.sinMov48, tono: 'rojo', alerta: m.sinMov48 > 0 },
    { l: 'Avisos sin leer por todos', n: m.sinLeer, tono: 'rojo', alerta: m.sinLeer > 0 },
    { l: 'Creados (7 días)', n: m.creados7, tono: 'verde', alerta: false },
    { l: 'Cerrados (7 días)', n: m.cerrados7, tono: 'verde', alerta: false },
  ]
})

const COLOR_PRIO = { Alta: 'var(--rojo)', Media: 'var(--ambar)', Baja: 'var(--verde)' }
const barrasSitio = computed(() => barras(d.value?.porSitio))
const barrasPrio = computed(() => barras(d.value?.porPrioridad, (k) => COLOR_PRIO[k]))
const barrasCat = computed(() => barras(d.value?.porCategoria))
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const evol = computed(() => {
  const arr = d.value?.evolucionMensual || []
  const max = Math.max(1, ...arr.map((e) => Math.max(e.creados, e.cerrados)))
  return arr.map((e) => {
    const p = e.mes.split('-')
    return { ...e, mesTxt: MESES[Number(p[1]) - 1] + ' ' + p[0].slice(2), pctC: Math.round((e.creados / max) * 100), pctX: Math.round((e.cerrados / max) * 100) }
  })
})
function barras(obj, color) {
  if (!obj) return []
  const ent = Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...ent.map(([, v]) => v))
  return ent.map(([k, v]) => ({ k, v, pct: Math.round((v / max) * 100), color: color ? color(k) : '' }))
}
</script>

<template>
  <div v-if="!d" class="vacio">Cargando marcadores…</div>
  <div v-else class="dash">
    <div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 12px">
      <h2 class="sec" style="margin:0">Marcadores</h2>
      <button class="btn" @click="cargarDashboard()">Actualizar</button>
    </div>
    <div class="kpis">
      <div v-for="k in kpis" :key="k.l" class="kpi" :class="k.alerta ? 'alerta' : 't-' + k.tono">
        <div class="n">{{ k.n }}</div>
        <div class="l">{{ k.l }}</div>
      </div>
      <div class="kpi t-celeste"><div class="n">{{ m.promedioHoras }} h</div><div class="l">Promedio abierto (cerrados 7 d)</div></div>
      <div class="kpi" :class="m.compromisoVencido > 0 ? 'alerta' : 't-naranja'"><div class="n">{{ m.compromisoVencido }}</div><div class="l">Compromiso vencido</div></div>
    </div>

    <div class="dash-panels">
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
            <span class="track"><span class="fill" :style="{ width: b.pct + '%', background: b.color }"></span></span>
            <span style="text-align:right">{{ b.v }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="dash-panels">
      <div class="panel">
        <h3>Distribución por categoría</h3>
        <div class="barras">
          <div v-if="!barrasCat.length" class="vacio">Sin datos.</div>
          <div v-for="b in barrasCat" :key="b.k" class="barra-row">
            <span>{{ b.k }}</span>
            <span class="track"><span class="fill" :style="{ width: b.pct + '%' }"></span></span>
            <span style="text-align:right">{{ b.v }}</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>Evolución mensual (6 meses)</h3>
        <div class="barras">
          <div v-for="e in evol" :key="e.mes" style="display:grid;grid-template-columns:62px 1fr auto;gap:8px;align-items:center;font-size:13px">
            <span>{{ e.mesTxt }}</span>
            <span style="display:flex;flex-direction:column;gap:3px">
              <span class="track" style="height:9px"><span class="fill" :style="{ width: e.pctC + '%' }"></span></span>
              <span class="track" style="height:9px"><span class="fill" :style="{ width: e.pctX + '%', background: 'var(--verde)' }"></span></span>
            </span>
            <span style="text-align:right;color:var(--muted)">{{ e.creados }}/{{ e.cerrados }}</span>
          </div>
        </div>
        <div style="display:flex;gap:14px;margin-top:8px;font-size:12px;color:var(--muted)">
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--m-naranja);margin-right:5px"></span>Creados</span>
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--verde);margin-right:5px"></span>Cerrados</span>
        </div>
      </div>
    </div>
  </div>
</template>
