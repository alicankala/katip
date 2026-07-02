<script setup>
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'

const rapor = ref([])
const yukleniyor = ref(false)
const aramaKelimesi = ref('')
const durumFiltresi = ref('Tümü')

const durumSecenekleri = ref(['Tümü', 'Açık', 'Beklemede', 'Tamamlandı'])

const raporuGetir = async () => {
  yukleniyor.value = true

  try {
    const res = await window.api.karlilikRaporuGetir()

    if (res?.success) {
      rapor.value = Array.isArray(res.rapor) ? res.rapor : []
    } else {
      rapor.value = []
      console.error(res?.error || 'Kârlılık raporu getirilemedi.')
    }
  } catch (error) {
    console.error('Kârlılık raporu hatası:', error)
    rapor.value = []
  } finally {
    yukleniyor.value = false
  }
}

const filtrelenmisRapor = computed(() => {
  let liste = rapor.value

  if (durumFiltresi.value !== 'Tümü') {
    liste = liste.filter((satir) => satir.status === durumFiltresi.value)
  }

  if (!aramaKelimesi.value) return liste

  const aranan = aramaKelimesi.value.toLowerCase()

  return liste.filter((satir) =>
    String(satir.id || '').includes(aranan) ||
    String(satir.plate || '').toLowerCase().includes(aranan) ||
    String(satir.customer_name || '').toLowerCase().includes(aranan) ||
    String(satir.brand || '').toLowerCase().includes(aranan) ||
    String(satir.model || '').toLowerCase().includes(aranan)
  )
})

const ozet = computed(() => {
  let toplamGelir = 0
  let toplamMaliyet = 0
  let netKar = 0
  let tamamlanan = 0

  for (const satir of filtrelenmisRapor.value) {
    toplamGelir += Number(satir.toplam_gelir || 0)
    toplamMaliyet += Number(satir.toplam_maliyet || 0)
    netKar += Number(satir.net_kar || 0)

    if (satir.status === 'Tamamlandı') {
      tamamlanan += 1
    }
  }

  const karOrani = toplamGelir > 0 ? (netKar / toplamGelir) * 100 : 0

  return {
    isEmriSayisi: filtrelenmisRapor.value.length,
    tamamlanan,
    toplamGelir,
    toplamMaliyet,
    netKar,
    karOrani
  }
})

const tlFormatla = (deger) => {
  return Number(deger || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' ₺'
}

const yuzdeFormatla = (deger) => {
  return '%' + Number(deger || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })
}

const tarihFormatla = (tarih) => {
  if (!tarih) return '-'

  const utcTarih = String(tarih).includes('T')
    ? String(tarih)
    : String(tarih).replace(' ', 'T') + 'Z'

  return new Date(utcTarih).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getSeverity = (status) => {
  switch (status) {
    case 'Tamamlandı': return 'success'
    case 'Beklemede': return 'warn'
    case 'Açık': return 'danger'
    default: return 'info'
  }
}

const karSeverity = (netKar) => {
  if (Number(netKar || 0) > 0) return 'success'
  if (Number(netKar || 0) < 0) return 'danger'
  return 'secondary'
}

onMounted(() => {
  raporuGetir()
})
</script>

<template>
  <div class="profit-report-page">
    <div class="page-header">
      <div>
        <h2>İç Kâr Raporu</h2>
        <p>Bu ekran sadece servis içi takip içindir. Müşteriye gösterilmez.</p>
      </div>

      <Button
        label="Yenile"
        icon="pi pi-refresh"
        severity="secondary"
        :loading="yukleniyor"
        @click="raporuGetir"
      />
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span>İş Emri Sayısı</span>
        <strong>{{ ozet.isEmriSayisi }}</strong>
      </div>

      <div class="summary-card">
        <span>Tamamlanan</span>
        <strong>{{ ozet.tamamlanan }}</strong>
      </div>

      <div class="summary-card">
        <span>Toplam Gelir</span>
        <strong>{{ tlFormatla(ozet.toplamGelir) }}</strong>
      </div>

      <div class="summary-card">
        <span>Toplam Maliyet</span>
        <strong>{{ tlFormatla(ozet.toplamMaliyet) }}</strong>
      </div>

      <div class="summary-card main">
        <span>Net Kâr</span>
        <strong>{{ tlFormatla(ozet.netKar) }}</strong>
        <small>Kâr oranı: {{ yuzdeFormatla(ozet.karOrani) }}</small>
      </div>
    </div>

    <div class="table-panel">
      <div class="filter-row">
        <span class="p-input-icon-left">
          <i class="pi pi-search" style="margin-left: 10px;" />
          <InputText
            v-model="aramaKelimesi"
            placeholder="İş emri, plaka, müşteri ara..."
            style="width: 320px; padding-left: 35px;"
          />
        </span>

        <Dropdown
          v-model="durumFiltresi"
          :options="durumSecenekleri"
          placeholder="Durum"
          style="width: 180px;"
        />
      </div>

      <DataTable
        :value="filtrelenmisRapor"
        :loading="yukleniyor"
        responsiveLayout="scroll"
        emptyMessage="Kârlılık raporu bulunamadı."
      >
        <Column field="id" header="İş Emri"></Column>

        <Column field="plate" header="Plaka"></Column>

        <Column field="customer_name" header="Müşteri"></Column>

        <Column header="Durum">
          <template #body="slotProps">
            <Tag
              :value="slotProps.data.status"
              :severity="getSeverity(slotProps.data.status)"
            />
          </template>
        </Column>

        <Column header="Açılış">
          <template #body="slotProps">
            {{ tarihFormatla(slotProps.data.created_at) }}
          </template>
        </Column>

        <Column header="Kapanış">
          <template #body="slotProps">
            {{ tarihFormatla(slotProps.data.closed_at) }}
          </template>
        </Column>

        <Column header="Parça Satış">
          <template #body="slotProps">
            {{ tlFormatla(slotProps.data.parca_satis_toplami) }}
          </template>
        </Column>

        <Column header="Parça Maliyet">
          <template #body="slotProps">
            {{ tlFormatla(slotProps.data.parca_maliyet_toplami) }}
          </template>
        </Column>

        <Column header="İşçilik">
          <template #body="slotProps">
            {{ tlFormatla(slotProps.data.iscilik_geliri) }}
          </template>
        </Column>

        <Column header="Toplam Gelir">
          <template #body="slotProps">
            <strong>{{ tlFormatla(slotProps.data.toplam_gelir) }}</strong>
          </template>
        </Column>

        <Column header="Toplam Maliyet">
          <template #body="slotProps">
            <strong>{{ tlFormatla(slotProps.data.toplam_maliyet) }}</strong>
          </template>
        </Column>

        <Column header="Net Kâr">
          <template #body="slotProps">
            <Tag
              :value="tlFormatla(slotProps.data.net_kar)"
              :severity="karSeverity(slotProps.data.net_kar)"
            />
          </template>
        </Column>

        <Column header="Kâr Oranı">
          <template #body="slotProps">
            {{ yuzdeFormatla(slotProps.data.kar_orani) }}
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.profit-report-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.page-header h2 {
  margin: 0;
  color: #ffffff;
}

.page-header p {
  margin: 6px 0 0;
  color: #94a3b8;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.summary-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-card span {
  color: #94a3b8;
  font-size: 14px;
}

.summary-card strong {
  color: #e5e7eb;
  font-size: 22px;
}

.summary-card small {
  color: #cbd5e1;
}

.summary-card.main {
  border-color: #22c55e;
}

.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.p-input-icon-left {
  position: relative;
  display: inline-block;
}

.p-input-icon-left i {
  position: absolute;
  top: 50%;
  margin-top: -0.5rem;
  color: #999;
}

:global(html[data-theme="light"] .page-header h2),
:global(html[data-theme="light"] .summary-card strong) {
  color: #111827 !important;
}

:global(html[data-theme="light"] .page-header p),
:global(html[data-theme="light"] .summary-card span),
:global(html[data-theme="light"] .summary-card small) {
  color: #374151 !important;
}

:global(html[data-theme="light"] .summary-card) {
  background: #ffffff !important;
  border-color: #d1d5db !important;
}
</style>