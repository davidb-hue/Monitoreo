<script setup>
import { reactive, computed } from 'vue'
import { S, cargarHistorial } from '../store.js'
import { fFecha } from '../utils.js'

const ACCIONES = ['CREAR', 'AVANCE', 'MOVER', 'REABRIR', 'CERRAR', 'ANULAR', 'LECTURA', 'VENCIMIENTO', 'EXPORTAR', 'USUARIO', 'INICIO DE SESIÓN', 'CIERRE DE SESIÓN', 'PIN INCORRECTO', 'CONFIGURACIÓN']
const f = reactive({ q: '', operador: '', accion: '', id: '', desde: '', hasta: '' })
const filas = computed(() => S.hist?.filas || [])
const operadores = computed(() => S.datos?.operadores || [])

function aplicar() { cargarHistorial({ ...f }) }
function limpiar() { Object.assign(f, { q: '', operador: '', accion: '', id: '', desde: '', hasta: '' }); cargarHistorial() }
</script>

<template>
  <h2 class="sec">Historial de actividad</h2>
  <div class="barra">
    <input v-model="f.q" placeholder="Buscar en detalle, ID u operador" @keyup.enter="aplicar">
    <input v-model="f.id" placeholder="ID (ej. SM-0003)" style="min-width:140px" @keyup.enter="aplicar">
    <select v-model="f.operador"><option value="">Todos los operadores</option><option v-for="o in operadores" :key="o">{{ o }}</option></select>
    <select v-model="f.accion"><option value="">Todas las acciones</option><option v-for="a in ACCIONES" :key="a">{{ a }}</option></select>
    <input v-model="f.desde" type="date" title="Desde">
    <input v-model="f.hasta" type="date" title="Hasta">
    <button class="btn btn-p" @click="aplicar">Filtrar</button>
    <button class="btn" @click="limpiar">Limpiar</button>
  </div>

  <div class="panel" style="margin-top:12px;overflow-x:auto">
    <div v-if="S.hist?.error" class="vacio">{{ S.hist.error }}</div>
    <div v-else-if="!filas.length" class="vacio">Sin registros para estos filtros.</div>
    <table v-else class="tabla">
      <thead>
        <tr><th>Fecha y hora</th><th>Operador</th><th>Acción</th><th>ID</th><th>Detalle</th><th>Cambio</th></tr>
      </thead>
      <tbody>
        <tr v-for="(e, i) in filas" :key="i">
          <td style="white-space:nowrap">{{ fFecha(e.fecha, true) }}</td>
          <td>{{ e.operador }}</td>
          <td><span class="pill">{{ e.accion }}</span></td>
          <td>{{ e.tarjetaId }}</td>
          <td>{{ e.detalle }}</td>
          <td style="white-space:nowrap">{{ e.anterior || e.nuevo ? (e.anterior || '—') + ' → ' + (e.nuevo || '—') : '' }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="filas.length" class="meta" style="margin-top:8px">Mostrando {{ filas.length }} de los más recientes (máx. {{ S.hist.limite }}). Afina los filtros o usa Exportar para el historial completo.</div>
  </div>
</template>
