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

  <Button
    label="İş Emirleri"
    icon="pi pi-wrench"
    severity="info"
    @click="isEmirlerineGit"
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
  <div class="quick-actions">
    <Button
      label="Müşteri Geçmişi"
      icon="pi pi-search"
      severity="secondary"
      @click="gecmisDialogAc"
    />
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
        placeholder="Müşteri adı, telefon veya plaka yazın..."
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
      Örnek: Ahmet Yılmaz, 34ABC123, 34 ABC 123 veya telefon numarası ile arayabilirsiniz.
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
  color: #e5e7eb;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 26px;
  gap: 18px;
}

.dashboard-header h1 {
  margin: 0;
  font-size: 34px;
  color: #f9fafb;
}

.dashboard-header p {
  margin: 8px 0 0;
  color: #cbd5e1;
  font-size: 16px;
}

.dashboard-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 18px;
  margin-bottom: 28px;
}

.stat-card {
  position: relative;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.stat-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 6px;
  height: 100%;
}

.accent-blue::before {
  background: #3b82f6;
}

.accent-green::before {
  background: #22c55e;
}

.accent-orange::before {
  background: #f59e0b;
}

.accent-purple::before {
  background: #8b5cf6;
}

.stat-card span {
  display: block;
  color: #cbd5e1;
  font-size: 15px;
  margin-bottom: 12px;
}

.stat-card strong {
  display: block;
  color: #ffffff;
  font-size: 38px;
  line-height: 1;
}
.stat-card small {
  display: block;
  margin-top: 10px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.4;
}

.dashboard-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
  gap: 18px;
}

.info-panel {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
}

.info-panel h2 {
  margin: 0 0 10px;
  color: #ffffff;
  font-size: 24px;
}

.info-panel p {
  margin: 0;
  color: #cbd5e1;
  font-size: 15px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}

.dashboard-table {
  margin-top: 8px;
}

.muted {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 4px;
}

.quick-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-box {
  background: #0f172a;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 14px;
  border-radius: 10px;
  line-height: 1.5;
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
  color: #374151;
  font-weight: 600;
  font-size: 13px;
}

.empty-message {
  text-align: center;
  color: #94a3b8;
  padding: 25px;
  background: #0f172a;
  border: 1px dashed #334155;
  border-radius: 10px;
}
.low-stock-box {
  background: #451a03;
  border: 1px solid #f59e0b;
  color: #fde68a;
  padding: 14px;
  border-radius: 10px;
}

.low-stock-box h3 {
  margin: 0 0 8px;
  color: #fef3c7;
  font-size: 18px;
}

.low-stock-box p {
  margin: 0 0 10px;
  color: #fde68a;
  font-size: 13px;
}

.low-stock-box ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.low-stock-box li {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid rgba(245, 158, 11, 0.35);
}

.low-stock-box li:first-child {
  border-top: none;
}

.low-stock-box strong {
  color: #ffffff;
}

.low-stock-box span {
  color: #fffbeb;
}

.low-stock-box em {
  font-style: normal;
  font-weight: bold;
  color: #ffffff;
}

.stock-empty-box {
  background: #0f172a;
  border: 1px dashed #334155;
  color: #cbd5e1;
  padding: 14px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stock-empty-box strong {
  color: #ffffff;
}

.stock-empty-box span {
  color: #94a3b8;
  font-size: 13px;
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
  color: #64748b;
  font-size: 13px;
}

.history-card-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.history-card {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 18px;
  color: #e5e7eb;
}

.history-card-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  border-bottom: 1px solid #334155;
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.history-card-header h3 {
  margin: 0;
  color: #ffffff;
  font-size: 20px;
}

.history-card-header span {
  display: block;
  margin-top: 5px;
  color: #94a3b8;
  font-size: 13px;
}

.service-title {
  color: #f8fafc;
  font-weight: 700;
  font-size: 16px;
  margin-bottom: 12px;
}

.history-detail-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.history-detail-grid div {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 10px;
}

.history-detail-grid span,
.history-section > span,
.history-total span {
  display: block;
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 5px;
}

.history-detail-grid strong {
  color: #ffffff;
  font-size: 14px;
}

.history-section {
  margin-top: 12px;
}

.history-section p {
  margin: 0;
  color: #e5e7eb;
  line-height: 1.5;
}

.history-items {
  margin: 0;
  padding-left: 18px;
}

.history-items li {
  padding: 5px 0;
  color: #e5e7eb;
}

.history-items li em {
  font-style: normal;
  color: #cbd5e1;
  margin-left: 8px;
}

.history-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-top: 1px solid #334155;
  margin-top: 14px;
  padding-top: 14px;
}

.history-total strong {
  color: #ffffff;
  font-size: 20px;
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
</style>