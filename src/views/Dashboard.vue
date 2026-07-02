<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'

const router = useRouter()

const istatistikler = ref({
  musteriSayisi: 0,
  aracSayisi: 0,
  musteriAktif: 0,
  musteriToplam: 0,
  aracAktif: 0,
  aracToplam: 0,
  acikIsEmri: 0,
  tamamlananIsEmri: 0,
toplamStok: 0,
dusukStok: 0,
bitenStok: 0
})

const sonAcikIsEmirleri = ref([])
const dusukStokParcalari = ref([])

const secereAcik = ref(false)
const secereVerileri = ref([])
const gecmisAramaMetni = ref('')
const gecmisArandi = ref(false)
const gecmisYukleniyor = ref(false)

const verileriYukle = async () => {
  const istatistikRes = await window.api.istatistikleriGetir()

  if (istatistikRes?.success) {
    istatistikler.value = {
      ...istatistikler.value,
      ...istatistikRes.veriler
    }
  }

  const isEmirleri = await window.api.isEmirleriGetir()

  sonAcikIsEmirleri.value = Array.isArray(isEmirleri)
    ? isEmirleri
        .filter((isEmri) => isEmri.status !== 'Tamamlandı')
        .slice(0, 5)
    : []
    if (window.api.dusukStokParcalariGetir) {
  dusukStokParcalari.value = await window.api.dusukStokParcalariGetir(5)
}
}

const gecmisDialogAc = () => {
  secereAcik.value = true
}

const gecmisSorgula = async () => {
  gecmisArandi.value = true
  gecmisYukleniyor.value = true

  try {
    const res = await window.api.servisGecmisiAra(gecmisAramaMetni.value)

    if (res?.success) {
      secereVerileri.value = Array.isArray(res.gecmis) ? res.gecmis : []
    } else {
      secereVerileri.value = []
    }
  } catch (error) {
    console.error('Servis geçmişi arama hatası:', error)
    secereVerileri.value = []
  } finally {
    gecmisYukleniyor.value = false
  }
}

const gecmisTemizle = () => {
  gecmisAramaMetni.value = ''
  gecmisArandi.value = false
  secereVerileri.value = []
}

const kalemBasligiGetir = (kalem) => {
  const parcaAdi = String(kalem?.part_name || '').trim()
  const aciklama = String(kalem?.description || '').trim()

  if (parcaAdi && aciklama && parcaAdi !== aciklama) {
    return `${parcaAdi} - ${aciklama}`
  }

  return parcaAdi || aciklama || 'Kalem'
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

const tlFormatla = (deger) => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY'
  }).format(Number(deger) || 0)
}

const getSeverity = (status) => {
  if (status === 'Tamamlandı') return 'success'
  if (status === 'Beklemede') return 'warning'
  if (status === 'Açık') return 'danger'
  return 'info'
}

const servisKabuleGit = () => {
  router.push('/service-reception')
}

const isEmirlerineGit = () => {
  router.push('/work-orders')
}

onMounted(() => {
  verileriYukle()
})
</script>

<template>
  <div class="page dashboard-page">
    <div class="dashboard-header">
      <div>
        <h1>Ana Panel</h1>
        <p>Servis, müşteri, araç ve stok durumunu buradan takip edebilirsiniz.</p>
      </div>

<div class="dashboard-actions">
  <Button
    label="Yeni Servis Kabul"
    icon="pi pi-bolt"
    severity="success"
    @click="servisKabuleGit"
  />
</div>
    </div>

    <div class="stat-grid">
<div class="stat-card accent-blue">
  <span>Açık İş Emri</span>
  <strong>{{ istatistikler.acikIsEmri }}</strong>
  <small>
    Tüm zamanlar tamamlanan:
    {{ istatistikler.tamamlananIsEmri }}
  </small>
</div>

<div class="stat-card accent-green">
  <span>Kayıtlı Müşteri</span>
  <strong>{{ istatistikler.musteriAktif }}</strong>
  <small>
    Tüm zamanlar müşteri kaydı:
    {{ istatistikler.musteriToplam }}
  </small>
</div>

<div class="stat-card accent-orange">
  <span>Servisteki Araç</span>
  <strong>{{ istatistikler.aracAktif }}</strong>
  <small>
    Tüm zamanlar tamamlanan servis:
    {{ istatistikler.aracToplam }}
  </small>
</div>

<div class="stat-card accent-purple">
  <span>Aktif Parça Kartı</span>
  <strong>{{ istatistikler.toplamStok }}</strong>
  <small>
    Kritik stok: {{ istatistikler.dusukStok }} parça
    <br>
    Biten stok: {{ istatistikler.bitenStok }} parça
  </small>
</div>
</div>

<div class="dashboard-content-grid">
      <div class="info-panel">
        <div class="panel-title-row">
          <div>
            <h2>Son Açık İş Emirleri</h2>
            <p>Tamamlanmamış son 5 iş emri.</p>
          </div>

          <Button
            label="Tümünü Gör"
            icon="pi pi-arrow-right"
            size="small"
            severity="secondary"
            outlined
            @click="isEmirlerineGit"
          />
        </div>

        <DataTable
          v-if="sonAcikIsEmirleri.length > 0"
          :value="sonAcikIsEmirleri"
          responsiveLayout="scroll"
          class="p-datatable-sm dashboard-table"
        >
          <Column header="Tarih">
            <template #body="slotProps">
              {{ tarihFormatla(slotProps.data.created_at) }}
            </template>
          </Column>

          <Column header="Araç">
            <template #body="slotProps">
              <strong>{{ slotProps.data.plate }}</strong>
              <div class="muted">
                {{ slotProps.data.brand || '-' }} {{ slotProps.data.model || '' }}
              </div>
            </template>
          </Column>

          <Column header="Müşteri">
            <template #body="slotProps">
              {{ slotProps.data.customer_name || '-' }}
            </template>
          </Column>

          <Column header="KM">
            <template #body="slotProps">
              {{ slotProps.data.mileage ? Number(slotProps.data.mileage).toLocaleString('tr-TR') : '-' }}
            </template>
          </Column>

          <Column header="Tutar">
            <template #body="slotProps">
              {{ tlFormatla(slotProps.data.total_price) }}
            </template>
          </Column>

          <Column header="Durum">
            <template #body="slotProps">
              <Tag
                :value="slotProps.data.status"
                :severity="getSeverity(slotProps.data.status)"
              />
            </template>
          </Column>
        </DataTable>

        <div
          v-else
          class="empty-message"
        >
          Açık iş emri bulunmuyor.
        </div>
      </div>

<div class="info-panel quick-panel">
  <div class="customer-history-box" @click="gecmisDialogAc">
    <div class="box-icon">
      <i class="pi pi-search" style="font-size: 1.3rem"></i>
    </div>
    <div class="box-content">
      <h3>Müşteri Geçmişi Ara</h3>
      <span>Plaka, tel, ad soyad veya iş emri metinleri ile hızlı sorgulama</span>
    </div>
  </div>
        <div
  v-if="dusukStokParcalari.length > 0"
  class="low-stock-box"
>
  <h3>Kritik Stok Uyarısı</h3>
  <p>Stok miktarı kendi kritik limitinde veya altında olan parçalar:</p>

  <ul>
    <li
      v-for="parca in dusukStokParcalari"
      :key="parca.id"
    >
      <strong>{{ parca.code }}</strong>
      <span>{{ parca.name }}</span>
      <em>{{ parca.stock }} / {{ parca.critical_stock ?? 5 }}</em>
    </li>
  </ul>
</div>

<div
  v-else
  class="stock-empty-box"
>
  <strong>Kritik stokta parça yok.</strong>
  <span>Takip edilmesi gereken düşük stok kaydı bulunmuyor.</span>
</div>
      </div>
    </div>

<Dialog
  v-model:visible="secereAcik"
  header="Müşteri Servis Geçmişi"
  :style="{ width: '950px' }"
  modal
  maximizable
>
  <div class="form-area">
    <div class="history-search-row">
      <InputText
        v-model="gecmisAramaMetni"
        class="history-search-input"
        placeholder="Ad soyad, telefon, plaka, marka/model veya iş emri/şikayet detayı..."
        @keyup.enter="gecmisSorgula"
      />

      <Button
        label="Ara"
        icon="pi pi-search"
        :loading="gecmisYukleniyor"
        @click="gecmisSorgula"
      />

      <Button
        label="Temizle"
        icon="pi pi-times"
        severity="secondary"
        outlined
        @click="gecmisTemizle"
      />
    </div>

    <p class="history-helper">
      Örnek: Ahmet Yılmaz, 34ABC123, Megane, fren balatası, tekleme şikayeti veya telefon numarası ile arayabilirsiniz.
    </p>

    <div
      v-if="gecmisYukleniyor"
      class="empty-message"
    >
      Servis geçmişi aranıyor...
    </div>

    <div
      v-else-if="secereVerileri.length > 0"
      class="history-card-list"
    >
      <div
        v-for="(kayit, index) in secereVerileri"
        :key="kayit.id"
        class="history-card"
      >
        <div class="history-card-header">
          <div>
            <h3>
              {{ kayit.customer_name || 'Müşteri bilinmiyor' }}
              -
              {{ kayit.plate || 'Plaka yok' }}
            </h3>

            <span>
              {{ kayit.brand || '-' }} {{ kayit.model || '' }}
            </span>
          </div>

          <Tag
            :value="kayit.status || '-'"
            :severity="getSeverity(kayit.status)"
          />
        </div>

        <div class="service-title">
          {{ index + 1 }}. Servis Kaydı
        </div>

<div class="history-detail-grid">
  <div>
    <span>Açılış</span>
    <strong>{{ tarihFormatla(kayit.created_at) }}</strong>
  </div>

  <div>
    <span>Kapanış</span>
    <strong>
      {{ kayit.closed_at ? tarihFormatla(kayit.closed_at) : '-' }}
    </strong>
  </div>

  <div>
    <span>Durum</span>
    <strong>{{ kayit.status || '-' }}</strong>
  </div>

  <div>
    <span>KM</span>
    <strong>
      {{ kayit.mileage ? Number(kayit.mileage).toLocaleString('tr-TR') : '-' }}
    </strong>
  </div>

  <div>
    <span>Açan Usta</span>
    <strong>{{ kayit.opened_by_master_name || '-' }}</strong>
  </div>

  <div>
    <span>Kapatan Usta</span>
    <strong>{{ kayit.closed_by_master_name || '-' }}</strong>
  </div>
</div>

        <div class="history-section">
          <span>Şikayet / İşlem</span>
          <p>{{ kayit.description || '-' }}</p>
        </div>

        <div class="history-section">
          <span>Kalemler</span>

          <ul
            v-if="kayit.kalemler && kayit.kalemler.length > 0"
            class="history-items"
          >
            <li
              v-for="kalem in kayit.kalemler"
              :key="kalem.id"
            >
              <span>{{ kalemBasligiGetir(kalem) }}</span>

              <em v-if="Number(kalem.total_price) > 0">
                {{ tlFormatla(kalem.total_price) }}
              </em>
            </li>
          </ul>

          <p v-else>-</p>
        </div>

        <div class="history-total">
          <span>Toplam</span>
          <strong>{{ tlFormatla(kayit.total_price) }}</strong>
        </div>
      </div>
    </div>

    <div
      v-else-if="gecmisArandi"
      class="empty-message"
    >
      Aramanızla eşleşen servis geçmişi bulunamadı.
    </div>

    <div
      v-else
      class="empty-message"
    >
      Servis geçmişini görmek için müşteri adı, telefon veya plaka ile arama yapın.
    </div>
  </div>
</Dialog>
  </div>
</template>

<style scoped>
.dashboard-page {
  color: var(--text-primary);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 18px;
}

.dashboard-header h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-title);
  letter-spacing: -0.02em;
}

.dashboard-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.dashboard-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  position: relative;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
}

.accent-blue::before {
  background: #3b82f6;
}

.accent-green::before {
  background: #10b981;
}

.accent-orange::before {
  background: #f59e0b;
}

.accent-purple::before {
  background: #8b5cf6;
}

.stat-card span {
  display: block;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.stat-card strong {
  display: block;
  color: var(--text-title);
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
}

.stat-card small {
  display: block;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.dashboard-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
  gap: 20px;
}

.info-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-md);
}

.info-panel h2 {
  margin: 0 0 4px;
  color: var(--text-title);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.info-panel p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.dashboard-table {
  margin-top: 8px;
}

.muted {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 4px;
}

.quick-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.customer-history-box {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.04));
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  padding: 20px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.customer-history-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.6);
}

.customer-history-box .box-icon {
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
  padding: 10px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.customer-history-box .box-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.customer-history-box h3 {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
}

.customer-history-box span {
  font-size: 12px;
  color: #c7d2fe;
  line-height: 1.4;
}

.note-box {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 14px;
  border-radius: 8px;
  line-height: 1.5;
  font-size: 13px;
}

.form-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 13px;
}

.empty-message {
  text-align: center;
  color: var(--text-muted);
  padding: 32px 20px;
  background: var(--bg-active-box);
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  font-size: 14px;
}

.low-stock-box {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fef3c7;
  padding: 16px;
  border-radius: 10px;
}

.low-stock-box h3 {
  margin: 0 0 6px;
  color: #f59e0b;
  font-size: 16px;
  font-weight: 700;
}

.low-stock-box p {
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.low-stock-box ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.low-stock-box li {
  display: grid;
  grid-template-columns: 85px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid rgba(245, 158, 11, 0.15);
  font-size: 13px;
}

.low-stock-box li:first-child {
  border-top: none;
}

.low-stock-box strong {
  color: var(--text-title);
  font-weight: 600;
}

.low-stock-box span {
  color: var(--text-secondary);
  text-align: left;
}

.low-stock-box em {
  font-style: normal;
  font-weight: bold;
  color: #f59e0b;
}

.stock-empty-box {
  background: var(--bg-active-box);
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  padding: 20px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
}

.stock-empty-box strong {
  color: var(--text-title);
  font-size: 14px;
}

.stock-empty-box span {
  color: var(--text-muted);
  font-size: 12px;
}

@media (max-width: 1100px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }

  .dashboard-content-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

.history-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
}

.history-search-input {
  width: 100%;
}

.history-helper {
  margin: -6px 0 4px;
  color: var(--text-muted);
  font-size: 12px;
}

.history-card-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.history-card {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  color: var(--text-primary);
}

.history-card-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.history-card-header h3 {
  margin: 0;
  color: var(--text-title);
  font-size: 18px;
  font-weight: 700;
}

.history-card-header span {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.service-title {
  color: var(--text-title);
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 12px;
}

.history-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.history-detail-grid div {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
}

.history-detail-grid span,
.history-section > span,
.history-total span {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
  font-weight: 600;
}

.history-detail-grid strong {
  color: var(--text-title);
  font-size: 14px;
  font-weight: 700;
}

.history-section {
  margin-top: 12px;
}

.history-section p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.history-items {
  margin: 0;
  padding-left: 18px;
}

.history-items li {
  padding: 4px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.history-items li em {
  font-style: normal;
  color: var(--text-muted);
  margin-left: 8px;
}

.history-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--border-color);
  margin-top: 16px;
  padding-top: 16px;
}

.history-total strong {
  color: var(--text-title);
  font-size: 18px;
  font-weight: 700;
}

@media (max-width: 700px) {
  .history-search-row {
    grid-template-columns: 1fr;
  }

  .history-detail-grid {
    grid-template-columns: 1fr;
  }

  .history-card-header {
    flex-direction: column;
  }
}

:global(html[data-theme="light"] .customer-history-box) {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.03)) !important;
  border-color: rgba(99, 102, 241, 0.2) !important;
  color: #4f46e5 !important;
}

:global(html[data-theme="light"] .customer-history-box .box-icon) {
  background: rgba(99, 102, 241, 0.1) !important;
  color: #4f46e5 !important;
}

:global(html[data-theme="light"] .customer-history-box h3) {
  color: #312e81 !important;
}

:global(html[data-theme="light"] .customer-history-box span) {
  color: #4f46e5 !important;
}
</style>