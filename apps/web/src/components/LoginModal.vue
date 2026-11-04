<script setup>
import { ref, watch, onMounted } from 'vue'
import { S, entrar } from '../store.js'
import { msgErr } from '../utils.js'

const nombre = ref('')
const pin = ref('')
const err = ref('')
const inputPin = ref(null)
const enviando = ref(false)

watch(() => S.operadoresLogin, (l) => { if (!l.includes(nombre.value)) nombre.value = l[0] || '' }, { immediate: true })
onMounted(() => inputPin.value?.focus())

async function enviar() {
  if (enviando.value) return
  err.value = ''; enviando.value = true
  try { await entrar(nombre.value, pin.value) }
  catch (e) { err.value = msgErr(e); pin.value = ''; inputPin.value?.focus() }
  finally { enviando.value = false }
}
</script>

<template>
  <div class="velo login-velo">
    <form class="modal login" @submit.prevent="enviar">
      <h3>¿Quién está en turno?</h3>
      <div class="sub">Cada acción que hagas quedará registrada con tu nombre, fecha y hora.</div>
      <label for="lNombre">Operador</label>
      <select id="lNombre" v-model="nombre">
        <option v-for="o in S.operadoresLogin" :key="o" :value="o">{{ o }}</option>
      </select>
      <label for="lPin">PIN personal</label>
      <input id="lPin" ref="inputPin" v-model="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6">
      <div class="err">{{ err || S.loginMsg }}</div>
      <div class="acciones"><button class="btn btn-p" type="submit" :disabled="enviando">Entrar</button></div>
    </form>
  </div>
</template>
