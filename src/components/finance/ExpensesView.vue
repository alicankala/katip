<script setup>
import { ref, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'

const props = defineProps({
  expenses: {
    type: Array,
    default: () => []
  },
  expenseTypes: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'add-expense',
  'quick-pay',
  'edit-expense',
  'delete-expense'
])

const aramaMetni = ref('')
const seciliTurFiltresi = ref('Tümü')

const filtrelenmisGiderler = computed(() => {
  let list = props.expenses

  // Arama metni
  if (aramaMetni.value.trim()) {
    const q = aramaMetni.value.toLowerCase().trim()
    list = list.filter(g =>
      (g.company_name || '').toLowerCase().includes(q) ||
      (g.expense_type || '').toLowerCase().includes(q) ||
      (g.note || '').toLowerCase().includes(q) ||
      (g.period || '').toLowerCase().includes(q)
    )
  }

  // Tür Filtresi
  if (seciliTurFiltresi.value && seciliTurFiltresi.value !== 'Tümü') {
    list = list.filter(g => g.expense_type === seciliTurFiltresi.value)
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
</script>

<template>
  <div class="expenses-view panel" style="display: flex; flex-direction: column; gap: 16px; background: var(--bg-panel, #1e293b); border: 1px solid var(--border-color, #334155); border-radius: 12px; padding: 20px;">
    <!-- Üst Kontrol & Filtre Barları -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <span class="p-input-icon-left" style="min-width: 240px;">
          <i class="pi pi-search" />
          <InputText v-model="aramaMetni" placeholder="Gider Ara (Kurum, fatura, not...)" />
        </span>

        <Dropdown
          v-model="seciliTurFiltresi"
          :options="['Tümü', ...expenseTypes]"
          placeholder="Gider Türü Filtrele"
          style="width: 180px;"
        />
      </div>

      <Button
        label="Yeni Gider Kaydı Ekle"
        icon="pi pi-plus"
        severity="warning"
        size="small"
        @click="emit('add-expense')"
      />
    </div>

    <!-- Veri Tablosu -->
    <DataTable
      :value="filtrelenmisGiderler"
      responsiveLayout="scroll"
      emptyMessage="Kayıtlı işletme gideri bulunamadı."
      paginator
      :rows="15"
      class="p-datatable-sm"
    >
      <Column field="company_name" header="Kurum / Firma">
        <template #body="slotProps">
          <strong>{{ slotProps.data.company_name || '-' }}</strong>
        </template>
      </Column>

      <Column field="expense_type" header="Gider Türü" style="width: 140px;"></Column>
      <Column field="period" header="Dönem" style="width: 110px;"></Column>

      <Column header="Gider Tarihi" style="width: 110px;">
        <template #body="slotProps">
          {{ tarihFormatla(slotProps.data.expense_date) }}
        </template>
      </Column>

      <Column header="Tutar" style="text-align: right; width: 130px;">
        <template #body="slotProps">
          <strong style="color: #f59e0b;">{{ tlFormatla(slotProps.data.amount) }}</strong>
        </template>
      </Column>

      <Column header="Durum" style="text-align: center; width: 110px;">
        <template #body="slotProps">
          <span
            class="status-badge"
            :class="slotProps.data.status === 'Ödendi' ? 'closed' : 'open'"
          >
            {{ slotProps.data.status || 'Ödenmedi' }}
          </span>
        </template>
      </Column>

      <Column field="note" header="Açıklama / Not"></Column>

      <Column header="İşlem" style="text-align: center; width: 140px;">
        <template #body="slotProps">
          <div style="display: flex; gap: 4px; justify-content: center;">
            <Button
              v-if="slotProps.data.status !== 'Ödendi'"
              icon="pi pi-check"
              severity="success"
              text
              rounded
              title="Hızlı Öde"
              @click="emit('quick-pay', slotProps.data)"
            />
            <Button
              icon="pi pi-pencil"
              severity="info"
              text
              rounded
              title="Düzenle"
              @click="emit('edit-expense', slotProps.data)"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              title="Sil"
              @click="emit('delete-expense', slotProps.data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
