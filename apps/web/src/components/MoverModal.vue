<script setup>
import { ref, onMounted } from 'vue'
import { S, accion } from '../store.js'

const com = ref('')
const err = ref('')
const area = ref(null)
onMounted(() => area.value?.focus())

async function confirmar() {
  const c = com.value.trim()
  if (!c) { err.value = 'Escribe un comentario.'; return }
  const r = await accion(S.mover.id, S.mover.acc, c)
  if (r.ok) S.modal = null
  else if (r.error) err.value = r.error
}
</script>

<template>
  <div class="velo" @mousedown.self="S.modal = null">
    <div class="modal" style="max-width:460px">
      <h3>{{ S.mover.titulo }}</h3>
      <div class="sub">El cambio queda en el historial con tu nombre.</div>
      <label for="mCom">Comentario</label>
      <textarea id="mCom" ref="area" v-model="com"></textarea>
      <div class="err">{{ err }}</div>
      <div class="acciones">
        <button class="btn" @click="S.modal = null">Cancelar</button>
        <button class="btn btn-p" :disabled="S.ocupado" @click="confirmar">Confirmar</button>
      </div>
    </div>
  </div>
</template>
