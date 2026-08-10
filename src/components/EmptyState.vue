<script setup>
import Button from 'primevue/button'

// Listeler boşken kullanıcıyı bir sonraki adıma yönlendiren ortak kutu.
// Arama sonucu boşsa (aramaModu) yönlendirme değil, aramayı düzeltme mesajı gösterilir.
defineProps({
  icon: { type: String, default: 'pi pi-inbox' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  actionIcon: { type: String, default: 'pi pi-plus' },
  hintLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  // Destek modunda yönlendirme düğmesi pasif kalır; ipucu düğmesi açık kalmalı.
  actionDisabled: { type: Boolean, default: false }
})

const emit = defineEmits(['action', 'hint'])
</script>

<template>
  <div class="empty-guide" :class="{ 'empty-guide-compact': compact }">
    <div class="empty-guide-icon">
      <i :class="icon"></i>
    </div>

    <h3 class="empty-guide-title">{{ title }}</h3>
    <p v-if="description" class="empty-guide-desc">{{ description }}</p>

    <div v-if="actionLabel || hintLabel" class="empty-guide-actions">
      <Button
        v-if="actionLabel"
        :label="actionLabel"
        :icon="actionIcon"
        size="small"
        :disabled="actionDisabled"
        @click="emit('action')"
      />
      <Button
        v-if="hintLabel"
        :label="hintLabel"
        icon="pi pi-question-circle"
        size="small"
        severity="secondary"
        text
        @click="emit('hint')"
      />
    </div>
  </div>
</template>

<style scoped>
.empty-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
  padding: 42px 24px;
  animation: empty-guide-fade 0.25s ease;
}

.empty-guide-compact {
  padding: 24px 16px;
}

.empty-guide-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(45, 125, 210, 0.12);
  color: var(--accent-color);
  margin-bottom: 6px;
}

.empty-guide-compact .empty-guide-icon {
  width: 44px;
  height: 44px;
}

.empty-guide-icon i {
  font-size: 22px;
}

.empty-guide-title {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-title);
}

.empty-guide-desc {
  margin: 0;
  max-width: 420px;
  font-size: var(--fs-sm);
  line-height: 1.55;
  color: var(--text-muted);
}

.empty-guide-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

@keyframes empty-guide-fade {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
