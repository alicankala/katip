<script setup>
// Destek (Admin) oturumunda ekranın üstünde görünen bilgi şeridi.
// Destek modu bir usta oturumu olmadığı için o ekrandaki işlem düğmeleri pasiftir;
// bu şerit nedenini yazar, aksi halde düğmeler sebepsiz kapalı görünüyordu.
import { useYetki } from '../composables/useYetki.js'

defineProps({
  // Ekrana özel kısa açıklama: "İş emri açma ve tahsilat destek modunda kapalıdır." gibi
  aciklama: { type: String, default: '' }
})

const { destekModu } = useYetki()
</script>

<template>
  <div v-if="destekModu" class="destek-modu-uyarisi">
    <i class="pi pi-shield"></i>
    <div class="destek-modu-metin">
      <strong>Destek Modu — usta işlemleri kapalı</strong>
      <span>
        {{ aciklama || 'Bu ekranda kayıt oluşturma, değiştirme ve silme işlemleri yapılamaz.' }}
        Bu işlemler için çıkış yapıp usta girişi yapın.
      </span>
    </div>
  </div>
</template>

<style scoped>
.destek-modu-uyarisi {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--status-pending);
  border-left-width: 4px;
  border-radius: 8px;
  background: var(--status-pending-bg);
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.destek-modu-uyarisi i {
  color: var(--status-pending);
  font-size: var(--fs-lg);
  line-height: 1.2;
}

.destek-modu-metin {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.destek-modu-metin strong {
  color: var(--status-pending);
  font-weight: 600;
}

.destek-modu-metin span {
  color: var(--text-secondary);
}
</style>
