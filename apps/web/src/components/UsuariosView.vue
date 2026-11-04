<script setup>
import { ref, reactive, computed } from 'vue'
import { S, crearUsuario, actualizarUsuario, asignarPin, desbloquear } from '../store.js'

const lista = computed(() => S.usuarios || [])
const nuevo = reactive({ nombre: '', rol: 'Operador' })
const err = ref('')
const pinPara = ref('')
const pinVal = ref('')

async function agregar() {
  if (!nuevo.nombre.trim()) { err.value = 'Escribe el nombre.'; return }
  err.value = ''
  const r = await crearUsuario({ nombre: nuevo.nombre.trim(), rol: nuevo.rol })
  if (r.ok) { nuevo.nombre = ''; nuevo.rol = 'Operador' } else err.value = r.error || ''
}
async function cambiarRol(u, rol) {
  if (rol === u.rol) return
  err.value = ''
  const r = await actualizarUsuario(u.nombre, { rol })
  if (!r.ok) err.value = r.error || ''
}
async function alternarActivo(u) {
  err.value = ''
  const r = await actualizarUsuario(u.nombre, { activo: !u.activo })
  if (!r.ok) err.value = r.error || ''
}
function abrirPin(nombre) { pinPara.value = nombre; pinVal.value = ''; err.value = '' }
async function guardarPin() {
  if (!/^\d{4,6}$/.test(pinVal.value)) { err.value = 'El PIN debe tener de 4 a 6 números.'; return }
  const r = await asignarPin(pinPara.value, pinVal.value)
  if (r.ok) { pinPara.value = ''; pinVal.value = '' } else err.value = r.error || ''
}
async function quitarBloqueo(u) {
  const r = await desbloquear(u.nombre)
  if (!r.ok) err.value = r.error || ''
}
</script>

<template>
  <h2 class="sec">Usuarios</h2>
  <div class="panel">
    <h3>Agregar operador</h3>
    <div class="barra" style="padding:0">
      <input v-model="nuevo.nombre" placeholder="Nombre" maxlength="80" @keyup.enter="agregar">
      <select v-model="nuevo.rol"><option>Operador</option><option>Coordinador</option></select>
      <button class="btn btn-p" :disabled="S.ocupado" @click="agregar">Agregar</button>
    </div>
    <div class="sub" style="margin-top:8px">El nuevo operador empieza sin PIN; asígnaselo con «Asignar PIN». Cambiar el nombre no es posible (el PIN depende del nombre): si hace falta, crea otro y da de baja el anterior.</div>
  </div>

  <div class="err" style="padding:0 2px">{{ err }}</div>

  <div class="panel" style="overflow-x:auto">
    <table class="tabla">
      <thead><tr><th>Operador</th><th>Rol</th><th>Estado</th><th>PIN</th><th>Acciones</th></tr></thead>
      <tbody>
        <template v-for="u in lista" :key="u.nombre">
          <tr>
            <td>{{ u.nombre }}</td>
            <td>
              <select :value="u.rol" :disabled="S.ocupado" @change="cambiarRol(u, $event.target.value)">
                <option>Operador</option><option>Coordinador</option>
              </select>
            </td>
            <td>
              <span class="pill" :class="u.activo ? 'on' : 'off'">{{ u.activo ? 'Activo' : 'Inactivo' }}</span>
              <span v-if="u.bloqueado" class="pill off" style="margin-left:4px">Bloqueado</span>
            </td>
            <td><span class="pill">{{ u.tienePin ? 'Asignado' : 'Sin PIN' }}</span></td>
            <td style="white-space:nowrap">
              <button class="btn" :disabled="S.ocupado" @click="abrirPin(u.nombre)">{{ u.tienePin ? 'Reiniciar PIN' : 'Asignar PIN' }}</button>
              <button class="btn" :disabled="S.ocupado" @click="alternarActivo(u)">{{ u.activo ? 'Dar de baja' : 'Reactivar' }}</button>
              <button v-if="u.bloqueado" class="btn" :disabled="S.ocupado" @click="quitarBloqueo(u)">Desbloquear</button>
            </td>
          </tr>
          <tr v-if="pinPara === u.nombre">
            <td colspan="5">
              <div class="barra" style="padding:0">
                <input v-model="pinVal" type="password" inputmode="numeric" maxlength="6" placeholder="PIN de 4 a 6 números" @keyup.enter="guardarPin">
                <button class="btn btn-p" :disabled="S.ocupado" @click="guardarPin">Guardar PIN</button>
                <button class="btn" @click="pinPara = ''">Cancelar</button>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
