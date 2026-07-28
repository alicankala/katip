<script setup>
import { ref, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import { useFormatters } from '../../composables/useFormatters'
import EmptyState from '../EmptyState.vue'

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
const seciliDurumFiltresi = ref('Tümü')
const seciliZamanFiltresi = ref('Tümü')

const bugununTarihi = () => new Date().toISOString().slice(0, 10)

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

  // Durum Filtresi
  if (seciliDurumFiltresi.value !== 'Tümü') {
    list = list.filter(g => (g.status || 'Ödenmedi') === seciliDurumFiltresi.value)
  }

  // Zaman Filtresi (Bu Ay / Gecikenler)
  if (seciliZamanFiltresi.value === 'Bu Ay') {
    const buAyPrefix = bugununTarihi().slice(0, 7)
    list = list.filter(g => g.expense_date && g.expense_date.startsWith(buAyPrefix))
  } else if (seciliZamanFiltresi.value === 'Gecikenler') {
    const bugunStr = bugununTarihi()
    list = list.filter(g => (g.status || 'Ödenmedi') === 'Ödenmedi' && g.due_date && g.due_date < bugunStr)
  }

  return list
})

// Özet İstatistikler (Bu Ay Toplam, Bu Ay Ödenen, Toplam Ödenmemiş, Yaklaşan)
const istatistikler = computed(() => {
  const buAyPrefix = bugununTarihi().slice(0, 7)
  const bugunStr = bugununTarihi()

  let buAyToplam = 0
  let buAyOdenen = 0
  let toplamOdenmemis = 0
  let yaklasanTutar = 0
  let yaklasanAdet = 0

  props.expenses.forEach(g => {
    const tutar = Number(g.amount) || 0

    if (g.expense_date && g.expense_date.startsWith(buAyPrefix)) {
      buAyToplam += tutar
      if (g.status === 'Ödendi') buAyOdenen += tutar
    }

    if ((g.status || 'Ödenmedi') === 'Ödenmedi') {
      toplamOdenmemis += tutar
      if (!g.due_date || g.due_date >= bugunStr) {
        yaklasanTutar += tutar
        yaklasanAdet++
      }
    }
  })

  return {
    buAyToplam,
    buAyOdenen,
    toplamOdenmemis,
    yaklasanTutar,
    yaklasanAdet
  }
})

const { tlFormatla, tarihFormatla } = useFormatters()
</script>

<template>
  <div class="expenses-view panel" style="display: flex; flex-direction: column; gap: 16px; background: var(--bg-panel, #1e293b); border: 1px solid var(--border-color, #334155); border-radius: 12px; padding: 20px;">
    <!-- Özet İstatistik Kartları -->
    <div class="expenses-stats-row">
      <div class="expense-stat-card border-blue">
        <div class="expense-stat-label">Bu Ay Toplam Gider</div>
        <div class="expense-stat-value">{{ tlFormatla(istatistikler.buAyToplam) }}</div>
      </div>
      <div class="expense-stat-card border-green">
        <div class="expense-stat-label">Bu Ay Ödenen</div>
        <div class="expense-stat-value text-green">{{ tlFormatla(istatistikler.buAyOdenen) }}</div>
      </div>
      <div class="expense-stat-card border-red">
        <div class="expense-stat-label">Toplam Ödenmemiş</div>
        <div class="expense-stat-value text-red">{{ tlFormatla(istatistikler.toplamOdenmemis) }}</div>
      </div>
      <div class="expense-stat-card border-orange">
        <div class="expense-stat-label">Yaklaşan Ödemeler</div>
        <div class="expense-stat-value text-orange">{{ tlFormatla(istatistikler.yaklasanTutar) }}</div>
        <div class="expense-stat-sub">{{ istatistikler.yaklasanAdet }} fatura / ödeme yaklaşıyor</div>
      </div>
    </div>

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

        <Dropdown
          v-model="seciliDurumFiltresi"
          :options="['Tümü', 'Ödendi', 'Ödenmedi']"
          placeholder="Ödeme Durumu"
          style="width: 150px;"
        />

        <Dropdown
          v-model="seciliZamanFiltresi"
          :options="['Tümü', 'Bu Ay', 'Gecikenler']"
          placeholder="Zaman Dilimi"
          style="width: 150px;"
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
      paginator
      :rows="15"
      class="p-datatable-sm"
    >
      <template #empty>
        <EmptyState
          v-if="aramaMetni || seciliTurFiltresi !== 'Tümü' || seciliDurumFiltresi !== 'Tümü' || seciliZamanFiltresi !== 'Tümü'"
          icon="pi pi-search-minus"
          title="Bu süzgeçte gider yok"
          description="Tür, durum ve zaman seçimlerini 'Tümü' yapıp yeniden bakın."
          compact
        />
        <EmptyState
          v-else
          icon="pi pi-receipt"
          title="Henüz gider kaydı yok"
          description="Kira, elektrik, yakıt gibi dükkan giderlerini buraya girin. Ödediğiniz giderler, ödeme tarihiyle birlikte o günün gün sonu çıkışlarında görünür."
          action-label="Yeni Gider Ekle"
          action-icon="pi pi-plus"
          compact
          @action="emit('add-expense')"
        />
      </template>

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

      <Column header="Son Ödeme" style="width: 110px;">
        <template #body="slotProps">
          <span :class="{ 'text-red': slotProps.data.status !== 'Ödendi' && slotProps.data.due_date && slotProps.data.due_date < bugununTarihi() }">
            {{ tarihFormatla(slotProps.data.due_date) }}
          </span>
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

<style scoped>
.expenses-stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
}

.expense-stat-card {
  background: var(--bg-active-box, #0f172a);
  border: 1px solid var(--border-color, #334155);
  border-radius: 8px;
  padding: 12px 16px;
  border-left-width: 4px;
  border-left-style: solid;
}

.expense-stat-card.border-blue   { border-left-color: #2d7dd2; }
.expense-stat-card.border-green  { border-left-color: #10b981; }
.expense-stat-card.border-red    { border-left-color: #ef4444; }
.expense-stat-card.border-orange { border-left-color: #f59e0b; }

.expense-stat-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.expense-stat-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary, #f1f5f9);
  line-height: 1.1;
}

.expense-stat-sub {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--text-secondary, #94a3b8);
}

.text-green  { color: #10b981 !important; }
.text-red    { color: #ef4444 !important; }
.text-orange { color: #f59e0b !important; }

@media (max-width: 900px) {
  .expenses-stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
