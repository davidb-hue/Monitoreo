<script setup>
import { ref, reactive, computed } from 'vue'
import { S, crearItemCatalogo, actualizarItemCatalogo } from '../store.js'

// Listas administrables. El grupo «tipo» tiene dos opciones extra:
//  · aviso = pide confirmar lectura a todos los operadores.
//  · soloCoord = solo el coordinador puede publicarlo y moverlo.
const GRUPOS = [
  { k: 'tipo', t: 'Tipo' },
  { k: 'prioridad', t: 'Prioridad' },
  { k: 'categoria', t: 'Categoría' },
  { k: 'sitio', t: 'País / Sitio' },
  { k: 'turno', t: 'Turno' },
  { k: 'responsable', t: 'Responsable' },
]

const err = ref('')
const editId = ref(null)
const editVal = ref('')
// Formulario de alta por grupo
const nuevo = reactive({})
GRUPOS.forEach((g) => { nuevo[g.k] = { valor: '', aviso: false, soloCoord: false } })

const items = (k) => (S.catalogo?.items || []).filter((i) => i.grupo === k)

async function agregar(k) {
  const d = nuevo[k]
  if (!d.valor.trim()) { err.value = 'Escribe el valor que quieres agregar.'; return }
  err.value = ''
  const r = await crearItemCatalogo({ grupo: k, valor: d.valor.trim(), aviso: d.aviso, soloCoord: d.soloCoord })
  if (r.ok) { d.valor = ''; d.aviso = false; d.soloCoord = false } else err.value = r.error || ''
}
function abrirEdicion(it) { editId.value = it.id; editVal.value = it.valor; err.value = '' }
async function guardarNombre(it) {
  if (!editVal.value.trim()) { err.value = 'El valor no puede quedar vacío.'; return }
  const r = await actualizarItemCatalogo(it.id, { valor: editVal.value.trim() })
  if (r.ok) editId.value = null; else err.value = r.error || ''
}
async function alternarActivo(it) {
  const r = await actualizarItemCatalogo(it.id, { activo: !it.activo })
  if (!r.ok) err.value = r.error || ''
}
async function alternarAviso(it) {
  const r = await actualizarItemCatalogo(it.id, { aviso: !it.aviso })
  if (!r.ok) err.value = r.error || ''
}
async function alternarSoloCoord(it) {
  const r = await actualizarItemCatalogo(it.id, { soloCoord: !it.soloCoord })
  if (!r.ok) err.value = r.error || ''
}

const cargando = computed(() => !S.catalogo)
</script>

<template>
  <h2 class="sec">Catálogo</h2>
  <div class="sub" style="margin:-4px 2px 10px">
    Listas que alimentan el formulario de registro. Solo el coordinador las administra. Nada se borra:
    un valor que ya no se use se <b>desactiva</b> (deja de aparecer en «Nuevo registro», pero los registros antiguos lo conservan).
  </div>
  <div class="err" style="padding:0 2px">{{ err }}</div>
  <div v-if="cargando" class="vacio">Cargando catálogo…</div>

  <div v-else class="cat-grid">
    <div v-for="g in GRUPOS" :key="g.k" class="panel">
      <h3>{{ g.t }}</h3>
      <p v-if="g.k === 'tipo'" class="sub" style="margin:-4px 0 8px">
        <b>Lectura</b>: exige que todos confirmen haberlo leído. <b>Solo coord.</b>: solo el coordinador lo publica y lo mueve.
      </p>

      <div class="cat-list">
        <div v-for="it in items(g.k)" :key="it.id" class="cat-row" :class="{ inactivo: !it.activo }">
          <template v-if="editId === it.id">
            <input v-model="editVal" maxlength="80" @keyup.enter="guardarNombre(it)">
            <span class="cat-acc">
              <button class="btn btn-p" :disabled="S.ocupado" @click="guardarNombre(it)">Guardar</button>
              <button class="btn" @click="editId = null">Cancelar</button>
            </span>
          </template>
          <template v-else>
            <span class="cat-val">
              {{ it.valor }}
              <span v-if="!it.activo" class="pill off">Inactivo</span>
              <span v-if="g.k === 'tipo' && it.aviso" class="pill" title="Requiere confirmar lectura">Lectura</span>
              <span v-if="g.k === 'tipo' && it.soloCoord" class="pill" title="Solo el coordinador">Solo coord.</span>
            </span>
            <span class="cat-acc">
              <button class="btn" :disabled="S.ocupado" @click="abrirEdicion(it)">Renombrar</button>
              <template v-if="g.k === 'tipo'">
                <button class="btn" :disabled="S.ocupado" @click="alternarAviso(it)">{{ it.aviso ? 'Quitar lectura' : 'Pedir lectura' }}</button>
                <button class="btn" :disabled="S.ocupado" @click="alternarSoloCoord(it)">{{ it.soloCoord ? 'Para todos' : 'Solo coord.' }}</button>
              </template>
              <button class="btn" :disabled="S.ocupado" @click="alternarActivo(it)">{{ it.activo ? 'Desactivar' : 'Activar' }}</button>
            </span>
          </template>
        </div>
        <div v-if="!items(g.k).length" class="vacio">Sin valores.</div>
      </div>

      <div class="cat-nuevo">
        <input v-model="nuevo[g.k].valor" :placeholder="'Agregar a ' + g.t.toLowerCase()" maxlength="80" @keyup.enter="agregar(g.k)">
        <label v-if="g.k === 'tipo'" class="chk"><input type="checkbox" v-model="nuevo[g.k].aviso"> Lectura</label>
        <label v-if="g.k === 'tipo'" class="chk"><input type="checkbox" v-model="nuevo[g.k].soloCoord"> Solo coord.</label>
        <button class="btn btn-p" :disabled="S.ocupado" @click="agregar(g.k)">Agregar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.cat-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.cat-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
  padding: 6px 8px; border: 1px solid var(--linea, #e3e8f0); border-radius: 8px; background: #fff; }
.cat-row.inactivo { opacity: .6; }
.cat-val { font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cat-acc { display: flex; gap: 4px; flex-wrap: wrap; }
.cat-acc .btn { padding: 4px 8px; font-size: 12px; }
.cat-row input { flex: 1; min-width: 140px; }
.cat-nuevo { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; border-top: 1px dashed var(--linea, #e3e8f0); padding-top: 10px; }
.cat-nuevo input { flex: 1; min-width: 150px; }
.chk { display: flex; align-items: center; gap: 4px; font-size: 13px; white-space: nowrap; }
</style>
