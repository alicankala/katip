<script setup>
import { ref, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useFormatters } from '../../composables/useFormatters'
import EmptyState from '../EmptyState.vue'

const props = defineProps({
  workOrderReceivables: {
    type: Array,
    default: () => []
  },
  manualReceivables: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['open-payment'])

const altFiltre = ref('tumu') // 'tumu' | 'is-emri' | 'manuel'
const aramaMetni = ref('')

const tumAlacaklarListesi = computed(() => {
  const list = []

  // 1. İş Emri Alacakları
  props.workOrderReceivables.forEach(item => {
    list.push({
      id: `wo-${item.work_order_id}`,
      kaynak: 'İş Emri',
      work_order_id: item.work_order_id,
      customer_name: item.customer_name || 'Müşteri',
      customer_phone: item.customer_phone || '-',
      plate: item.plate || '-',
      detay: `#${item.work_order_id} Servis Fişi`,
      total_price: Number(item.total_price || 0),
      toplam_tahsilat: Number(item.toplam_tahsilat || 0),
      kalan_borc: Number(item.kalan_borc || 0),
      odeme_durumu: item.odeme_durumu || 'Ödenmedi',
      created_at: item.created_at,
      rawItem: item
    })
  })

  // 2. Manuel Cari Alacakları (direction === 'Alacak')
  props.manualReceivables.forEach(item => {
    const rem = Number(item.remaining_debt || 0)
    const tot = Number(item.total_debt || 0)
    const paid = Number(item.total_paid || 0)

    let durum = 'Ödenmedi'
    if (paid <= 0) durum = 'Ödenmedi'
    else if (rem > 0.01) durum = 'Kısmi Ödendi'
    else durum = 'Ödendi'

    list.push({
      id: `cari-${item.id}`,
      kaynak: 'Manuel Cari',
      work_order_id: null,
      customer_name: item.name || 'Müşteri',
      customer_phone: item.phone || '-',
      plate: '-',
      detay: item.note || 'Manuel Alacak Kaydı',
      total_price: tot,
      toplam_tahsilat: paid,
      kalan_borc: rem,
      odeme_durumu: durum,
      created_at: null,
      rawItem: item
    })
  })

  return list
})

const filtrelenmisAlacaklar = computed(() => {
  let list = tumAlacaklarListesi.value

  // Sekme Filtresi
  if (altFiltre.value === 'is-emri') {
    list = list.filter(x => x.kaynak === 'İş Emri')
  } else if (altFiltre.value === 'manuel') {
    list = list.filter(x => x.kaynak === 'Manuel Cari')
  }

  // Arama metni
  if (aramaMetni.value.trim()) {
    const q = aramaMetni.value.toLowerCase().trim()
    list = list.filter(x =>
      (x.customer_name || '').toLowerCase().includes(q) ||
      (x.customer_phone || '').toLowerCase().includes(q) ||
      (x.plate || '').toLowerCase().includes(q) ||
      (x.detay || '').toLowerCase().includes(q)
    )
  }

  return list
})

const { tlFormatla } = useFormatters()

const getStatusClass = (durum) => {
  switch (durum) {
    case 'Ödendi': return 'alacak'
    case 'Kısmi Ödendi': return 'egzozcu'
    default: return 'borc'
  }
}
</script>

<template>
  <div class="receivables-view panel" style="display: flex; flex-direction: column; gap: 16px; background: var(--bg-panel, #1e293b); border: 1px solid var(--border-color, #334155); border-radius: 12px; padding: 20px;">
    <!-- Üst Kontrol & Filtre Barları -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div style="display: flex; gap: 6px; background: var(--bg-active-box); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color);">
        <Button 
          label="Tümü" 
          size="small" 
          :severity="altFiltre === 'tumu' ? 'success' : 'secondary'"
          :text="altFiltre !== 'tumu'"
          @click="altFiltre = 'tumu'"
        />
        <Button 
          label="İş Emri Alacakları" 
          size="small" 
          :severity="altFiltre === 'is-emri' ? 'success' : 'secondary'"
          :text="altFiltre !== 'is-emri'"
          @click="altFiltre = 'is-emri'"
        />
        <Button 
          label="Manuel Alacaklar" 
          size="small" 
          :severity="altFiltre === 'manuel' ? 'success' : 'secondary'"
          :text="altFiltre !== 'manuel'"
          @click="altFiltre = 'manuel'"
        />
      </div>

      <span class="p-input-icon-left" style="min-width: 260px;">
        <i class="pi pi-search" />
        <InputText v-model="aramaMetni" placeholder="Alacak Ara (Müşteri, plaka, tel...)" style="width: 100%;" />
      </span>
    </div>

    <!-- Veri Tablosu -->
    <DataTable
      :value="filtrelenmisAlacaklar"
      responsiveLayout="scroll"
      paginator
      :rows="15"
      class="p-datatable-sm"
    >
      <template #empty>
        <EmptyState
          v-if="aramaMetni || altFiltre !== 'tumu'"
          icon="pi pi-search-minus"
          title="Bu süzgeçte alacak yok"
          description="Arama kutusunu temizleyin veya üstteki sekmelerden 'Tümü' seçeneğine dönün."
          compact
        />
        <EmptyState
          v-else
          icon="pi pi-check-circle"
          title="Tahsil edilmemiş alacağınız yok"
          description="İş emri tahsil edilmeden kapatıldığında kalan tutar buraya alacak olarak düşer. Elle alacak kaydı da açabilirsiniz."
          compact
        />
      </template>

      <Column field="kaynak" header="Kaynak" style="width: 110px;">
        <template #body="slotProps">
          <span 
            style="font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 600;"
            :style="slotProps.data.kaynak === 'İş Emri' ? 'background: rgba(16, 185, 129, 0.15); color: #34d399;' : 'background: rgba(56, 189, 248, 0.15); color: #38bdf8;'"
          >
            {{ slotProps.data.kaynak }}
          </span>
        </template>
      </Column>

      <Column field="customer_name" header="Müşteri"></Column>
      <Column field="customer_phone" header="Telefon" style="width: 130px;"></Column>
      <Column field="plate" header="Plaka" style="width: 110px;">
        <template #body="slotProps">
          <strong>{{ slotProps.data.plate }}</strong>
        </template>
      </Column>

      <Column field="detay" header="Açıklama / No"></Column>

      <Column header="İşlem Toplamı" style="text-align: right; width: 130px;">
        <template #body="slotProps">
          {{ tlFormatla(slotProps.data.total_price) }}
        </template>
      </Column>

      <Column header="Tahsil Edilen" style="text-align: right; width: 130px;">
        <template #body="slotProps">
          <span style="color: #34d399; font-weight: 600;">{{ tlFormatla(slotProps.data.toplam_tahsilat) }}</span>
        </template>
      </Column>

      <Column header="Kalan Borç" style="text-align: right; width: 130px;">
        <template #body="slotProps">
          <strong style="color: #f87171;">{{ tlFormatla(slotProps.data.kalan_borc) }}</strong>
        </template>
      </Column>

      <Column header="Durum" style="text-align: center; width: 110px;">
        <template #body="slotProps">
          <span 
            class="direction-badge"
            :class="getStatusClass(slotProps.data.odeme_durumu)"
          >
            {{ slotProps.data.odeme_durumu }}
          </span>
        </template>
      </Column>

      <Column header="İşlem" style="text-align: center; width: 110px;">
        <template #body="slotProps">
          <Button
            v-if="slotProps.data.kalan_borc > 0.01"
            label="Ödeme Al"
            icon="pi pi-credit-card"
            size="small"
            severity="success"
            @click="emit('open-payment', slotProps.data)"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>
