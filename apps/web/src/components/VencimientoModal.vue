<script setup>
import { ref, reactive } from 'vue'
import { S, buscar, fijarVencimiento } from '../store.js'

const t = buscar(S.sel)
const f = reactive({ modo: t && t.vence ? 'fecha' : 'horas', horas: '', fecha: '', comentario: '' })
const err = ref('')

function volver() { S.modal = 'detalle' }

async function guardar(quitar) {
  if (!f.comentario.trim()) { err.value = 'Escribe un comentario: queda en el historial.'; return }
  const d = { comentario: f.comentario.trim() }
  if (quitar) d.quitar = true
  else if (f.modo === 'horas') {
    if (!(Number(f.horas) > 0)) { err.value = 'Escribe cuántas horas.'; return }
    d.venceHoras = Number(f.horas)
  } else {
    if (!f.fecha) { err.value = 'Elige la fecha y hora.'; return }
    d.vence = new Date(f.fecha).toISOString()
  }
  err.value = ''
  const r = await fijarVencimiento(S.sel, d)
  if (r.ok) S.modal = 'detalle'
  else if (r.error) err.value = r.error
}
</script>

<template>
  <div class="velo" @mousedown.self="volver">
    <div class="modal" style="max-width:460px">
      <h3>Tiempo máximo de gestión</h3>
      <div class="sub">{{ S.sel }}. Si se pasa y el registro sigue abierto, el marcador se pone en rojo. El cambio queda en el historial.</div>
      <label>Definir por</label>
      <select v-model="f.modo">
        <option value="horas">Horas desde ahora</option>
        <option value="fecha">Fecha y hora exactas</option>
      </select>
      <div v-if="f.modo === 'horas'">
        <label>Horas</label>
        <input v-model="f.horas" type="number" min="1" max="2160" placeholder="Ej. 24">
      </div>
      <div v-else>
        <label>Fecha y hora límite</label>
        <input v-model="f.fecha" type="datetime-local">
      </div>
      <label for="vCom">Comentario</label>
      <textarea id="vCom" v-model="f.comentario"></textarea>
      <div class="err">{{ err }}</div>
      <div class="acciones">
        <button class="btn" @click="volver">Cancelar</button>
        <button v-if="t && t.vence" class="btn btn-r" :disabled="S.ocupado" @click="guardar(true)">Quitar límite</button>
        <button class="btn btn-p" :disabled="S.ocupado" @click="guardar(false)">Guardar</button>
      </div>
    </div>
  </div>
</template>
