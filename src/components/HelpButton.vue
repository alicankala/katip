<script setup>
import { useRouter } from 'vue-router'

// Sayfa başlığının yanındaki küçük "?" düğmesi. Yalnızca bir konu kimliği taşır;
// yardım metni helpContent.js'te durduğu için metin değişince bu düğmelere
// dokunmak gerekmez.
defineProps({
  konu: { type: String, required: true },
  baslik: { type: String, default: 'Bu ekran nasıl kullanılır?' }
})

const router = useRouter()
</script>

<template>
  <button
    type="button"
    class="help-hint-btn"
    :title="baslik"
    @click="router.push({ path: '/help', query: { konu } })"
  >
    <i class="pi pi-question-circle"></i>
  </button>
</template>

<style scoped>
.help-hint-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  vertical-align: middle;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.help-hint-btn:hover {
  color: var(--accent-color);
  background: rgba(45, 125, 210, 0.1);
  border-color: var(--border-color);
}

.help-hint-btn i {
  font-size: 15px;
}
</style>
