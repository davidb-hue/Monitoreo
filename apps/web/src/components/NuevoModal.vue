<script setup>
import { ref, reactive, onMounted } from 'vue'
import { S, catalogos, crear } from '../store.js'
import { uuid } from '../utils.js'

const c = catalogos.value
const f = reactive({
  tipo: c.tipos[0], prioridad: 'Media', categoria: c.categorias[0], sitio: c.sitios[0], turno: c.turnos[0],
  responsable: '', titulo: '', detalle: '', fecha: '',
  venceModo: 'ninguno', venceHoras: '', venceFecha: '',
})
const err = ref('')
const inputTitulo = ref(null)
let reqId = null

onMounted(() => inputTitulo.value?.focus())

async function guardar() {
  if (!f.titulo.trim() || !f.detalle.trim()) { err.value = 'Completa el título y el detalle.'; return }
  const d = { tipo: f.tipo, prioridad: f.prioridad, categoria: f.categoria, sitio: f.sitio, turno: f.turno, responsable: f.responsable, titulo: f.titulo.trim(), detalle: f.detalle.trim(), fecha: f.fecha }
  if (f.venceModo === 'horas') {
    if (!(Number(f.venceHoras) > 0)) { err.value = 'Escribe cuántas horas para el tiempo de cierre.'; return }
    d.venceHoras = Number(f.venceHoras)
  } else if (f.venceModo === 'fecha') {
    if (!f.venceFecha) { err.value = 'Elige la fecha y hora de cierre.'; return }
    d.vence = new Date(f.venceFecha).toISOString()
  }
  err.value = ''
  reqId = reqId || uuid()
  d.reqId = reqId
  const r = await crear(d)
  if (r.ok) S.modal = null
  else if (r.error) err.value = r.error
}
</script>

<template>
  <div class="velo" @mousedown.self="S.modal = null">
    <div class="modal">
      <h3>Nuevo registro</h3>
      <div class="sub">Se creará con tu nombre y la hora actual.</div>
      <div class="grid2">
        <div><label>Tipo</label><select v-model="f.tipo"><option v-for="x in c.tipos" :key="x">{{ x }}</option></select></div>
        <div><label>Prioridad</label><select v-model="f.prioridad"><option v-for="x in c.prioridades" :key="x">{{ x }}</option></select></div>
        <div><label>Categoría</label><select v-model="f.categoria"><option v-for="x in c.categorias" :key="x">{{ x }}</option></select></div>
        <div><label>País / sitio</label><select v-model="f.sitio"><option v-for="x in c.sitios" :key="x">{{ x }}</option></select></div>
        <div><label>Turno</label><select v-model="f.turno"><option v-for="x in c.turnos" :key="x">{{ x }}</option></select></div>
        <div>
          <label>Responsable</label>
          <select v-model="f.responsable">
            <option value="">(sin asignar)</option>
            <option v-for="x in S.datos.operadores" :key="x">{{ x }}</option>
          </select>
        </div>
      </div>
      <label>Título breve</label>
      <input ref="inputTitulo" v-model="f.titulo" maxlength="150">
      <label>Detalle</label>
      <textarea v-model="f.detalle" placeholder="Qué pasó o qué se instruye, dónde, cámara/unidad, hora del evento y qué se hizo."></textarea>
      <div class="grid2">
        <div><label>Fecha compromiso (opcional)</label><input v-model="f.fecha" type="date"></div>
        <div>
          <label>Tiempo máximo de gestión</label>
          <select v-model="f.venceModo">
            <option value="ninguno">Sin límite</option>
            <option value="horas">En horas</option>
            <option value="fecha">Fecha y hora exactas</option>
          </select>
        </div>
      </div>
      <div v-if="f.venceModo === 'horas'">
        <label>Horas para gestionarlo (se pone en rojo al pasarse)</label>
        <input v-model="f.venceHoras" type="number" min="1" max="2160" placeholder="Ej. 24">
      </div>
      <div v-else-if="f.venceModo === 'fecha'">
        <label>Fecha y hora límite</label>
        <input v-model="f.venceFecha" type="datetime-local">
      </div>
      <div class="err">{{ err }}</div>
      <div class="acciones">
        <button class="btn" @click="S.modal = null">Cancelar</button>
        <button class="btn btn-p" :disabled="S.ocupado" @click="guardar">Guardar</button>
      </div>
    </div>
  </div>
</template>
