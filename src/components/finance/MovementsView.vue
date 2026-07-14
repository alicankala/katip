<script setup>
import { ref, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'

const props = defineProps({
  movements: {
    type: Array,
    default: () => []
  }
})

const aramaMetni = ref('')
const seciliTurFiltresi = ref('Tümü')

const hareketTurleri = [
  'Tümü',
  'Müşteri Tahsilatı',
  'Ödeme/Tahsilat',
  'Gider',
  'İşlem'
]

const filtrelenmisHareketler = computed(() => {
  let list = props.movements

  // Arama metni
  if (aramaMetni.value.trim()) {
    const q = aramaMetni.value.toLowerCase().trim()
    list = list.filter(h =>
      (h.cari_adi || '').toLowerCase().includes(q) ||
      (h.islem_detayi || '').toLowerCase().includes(q) ||
      (h.aciklama || '').toLowerCase().includes(q) ||
      (h.hareket_turu || '').toLowerCase().includes(q)
    )
  }

  // Tür Filtresi
  if (seciliTurFiltresi.value && seciliTurFiltresi.value !== 'Tümü') {
    list = list.filter(h => h.hareket_turu === seciliTurFiltresi.value)
  }

  return list
})

const tlFormatla = (deger) => {
  return Number(deger || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' ₺'
}

const tarihFormatla = (tarih) => {
  if (!tarih) return '-'
  try {
    const parts = tarih.split('-')
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`
    }
    return new Date(tarih).toLocaleDateString('tr-TR')
  } catch (e) {
    return tarih
  }
}

const getYonColor = (yon) => {
  if (yon === 'Tahsilat' || yon === 'Alacak') return '#34d399'
  if (yon === 'Ödeme' || yon === 'Gider' || yon === 'Borç') return '#f87171'
  return '#cbd5e1'
}
</script>

<template>
  <div class="movements-view panel" style="display: flex; flex-direction: column; gap: 16px; background: var(--bg-panel, #1e293b); border: 1px solid var(--border-color, #334155); border-radius: 12px; padding: 20px;">
    <!-- Üst Kontrol & Filtre Barları -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <span class="p-input-icon-left" style="min-width: 260px;">
          <i class="pi pi-search" />
          <InputText v-model="aramaMetni" placeholder="Finans Geçmişinde Ara..." />
        </span>

        <Dropdown
          v-model="seciliTurFiltresi"
          :options="hareketTurleri"
          placeholder="Hareket Türü Filtrele"
          style="width: 180px;"
        />
      </div>

      <span style="font-size: 0.85rem; color: var(--text-muted, #94a3b8);">
        Tüm finans hareketleri bilgi amaçlı kronolojik listelenir.
      </span>
    </div>

    <!-- Veri Tablosu -->
    <DataTable
      :value="filtrelenmisHareketler"
      responsiveLayout="scroll"
      emptyMessage="Finansal hareket kaydı bulunamadı."
      paginator
      :rows="20"
      class="p-datatable-sm"
    >
      <Column header="Tarih" style="width: 110px;">
        <template #body="slotProps">
          {{ tarihFormatla(slotProps.data.tarih) }}
        </template>
      </Column>

      <Column field="cari_adi" header="Taraf / Cari"></Column>

      <Column field="hareket_turu" header="Hareket Türü" style="width: 150px;">
        <template #body="slotProps">
          <span
            style="font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 600;"
            :style="slotProps.data.hareket_turu === 'Müşteri Tahsilatı' ? 'background: rgba(16, 185, 129, 0.15); color: #34d399;' : 'background: rgba(148, 163, 184, 0.15); color: #cbd5e1;'"
          >
            {{ slotProps.data.hareket_turu }}
          </span>
        </template>
      </Column>

      <Column field="islem_detayi" header="İşlem Detayı" style="width: 180px;"></Column>
      <Column field="aciklama" header="Açıklama / Not"></Column>

      <Column header="Tutar" style="text-align: right; width: 130px;">
        <template #body="slotProps">
          <strong :style="{ color: getYonColor(slotProps.data.yon) }">
            {{ tlFormatla(slotProps.data.tutar) }}
          </strong>
        </template>
      </Column>

      <Column field="yon" header="Yön" style="text-align: center; width: 100px;">
        <template #body="slotProps">
          <span
            class="direction-badge"
            :class="slotProps.data.yon === 'Tahsilat' || slotProps.data.yon === 'Alacak' ? 'alacak' : 'borc'"
          >
            {{ slotProps.data.yon }}
          </span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
