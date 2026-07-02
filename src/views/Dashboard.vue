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

    <!-- ── Page Header ──────────────────────────────── -->
    <div class="page-header dash-header">
      <div>
        <h1 class="page-title">Servis Yönetim Paneli</h1>
        <p class="page-subtitle">Günlük servis durumu, açık işler ve müşteri geçmişi</p>
      </div>
      <Button
        label="Yeni Servis Kabul"
        icon="pi pi-bolt"
        severity="success"
        @click="servisKabuleGit"
      />
    </div>

    <!-- ── Stat Cards ──────────────────────────────── -->
    <div class="dash-stat-grid">
      <div class="dash-stat-card accent-blue">
        <div class="stat-card-inner">
          <div class="stat-card-body">
            <div class="stat-card-label">Açık İş Emri</div>
            <div class="stat-card-value">{{ istatistikler.acikIsEmri }}</div>
            <div class="stat-card-sub">Tamamlanan: {{ istatistikler.tamamlananIsEmri }}</div>
          </div>
          <i class="pi pi-wrench stat-card-icon"></i>
        </div>
      </div>

      <div class="dash-stat-card accent-green">
        <div class="stat-card-inner">
          <div class="stat-card-body">
            <div class="stat-card-label">Kayıtlı Müşteri</div>
            <div class="stat-card-value">{{ istatistikler.musteriAktif }}</div>
            <div class="stat-card-sub">Toplam: {{ istatistikler.musteriToplam }}</div>
          </div>
          <i class="pi pi-users stat-card-icon"></i>
        </div>
      </div>

      <div class="dash-stat-card accent-amber">
        <div class="stat-card-inner">
          <div class="stat-card-body">
            <div class="stat-card-label">Servisteki Araç</div>
            <div class="stat-card-value">{{ istatistikler.aracAktif }}</div>
            <div class="stat-card-sub">Tamamlanan: {{ istatistikler.aracToplam }}</div>
          </div>
          <i class="pi pi-car stat-card-icon"></i>
        </div>
      </div>

      <div class="dash-stat-card accent-purple">
        <div class="stat-card-inner">
          <div class="stat-card-body">
            <div class="stat-card-label">Aktif Parça Kartı</div>
            <div class="stat-card-value">{{ istatistikler.toplamStok }}</div>
            <div class="stat-card-sub">Kritik: {{ istatistikler.dusukStok }}&nbsp;&nbsp;Biten: {{ istatistikler.bitenStok }}</div>
          </div>
          <i class="pi pi-box stat-card-icon"></i>
        </div>
      </div>
    </div>

    <!-- ── Content Grid ───────────────────────────── -->
    <div class="dashboard-content-grid">

      <!-- ─ Sol: Son Açık İş Emirleri ─ -->
      <div class="info-panel">
        <div class="panel-title-row">
          <div>
            <h2>Son Açık İş Emirleri</h2>
            <p>Tamamlanmamış son 5 iş emri</p>
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

        <div v-if="sonAcikIsEmirleri.length > 0" class="table-panel">
          <DataTable :value="sonAcikIsEmirleri" responsiveLayout="scroll" class="p-datatable-sm">
            <Column header="Tarih" style="width:130px">
              <template #body="slotProps">
                <span class="cell-date">{{ tarihFormatla(slotProps.data.created_at) }}</span>
              </template>
            </Column>
            <Column header="Plaka" style="width:110px">
              <template #body="slotProps">
                <span class="plate-cell">{{ slotProps.data.plate }}</span>
                <div class="cell-sub">{{ slotProps.data.brand || '-' }} {{ slotProps.data.model || '' }}</div>
              </template>
            </Column>
            <Column header="Müşteri">
              <template #body="slotProps">
                {{ slotProps.data.customer_name || '-' }}
              </template>
            </Column>
            <Column header="KM" style="width:90px">
              <template #body="slotProps">
                {{ slotProps.data.mileage ? Number(slotProps.data.mileage).toLocaleString('tr-TR') : '-' }}
              </template>
            </Column>
            <Column header="Tutar" style="width:110px">
              <template #body="slotProps">
                <strong class="cell-price">{{ tlFormatla(slotProps.data.total_price) }}</strong>
              </template>
            </Column>
            <Column header="Durum" style="width:110px">
              <template #body="slotProps">
                <Tag :value="slotProps.data.status" :severity="getSeverity(slotProps.data.status)" />
              </template>
            </Column>
          </DataTable>
        </div>

        <div v-else class="empty-state">
          <i class="pi pi-inbox"></i>
          <h3>Açık iş emri yok</h3>
          <p>Tamamlanmamış iş emri bulunmuyor.</p>
        </div>
      </div>

      <!-- ─ Sağ: Arama + Kritik Stok ─ -->
      <div class="right-panel">

        <!-- Müşteri / Plaka / Telefon Arama Modulü -->
        <div class="search-module">
          <div class="search-module-header">
            <i class="pi pi-search"></i>
            <span>Müşteri / Plaka / Telefon Ara</span>
          </div>
          <div class="search-module-input-row">
            <InputText
              v-model="gecmisAramaMetni"
              placeholder="Plaka, telefon, müşteri adı veya işlem yazın..."
              class="search-module-input"
              @keyup.enter="gecmisSorgula"
            />
            <Button
              icon="pi pi-search"
              :loading="gecmisYukleniyor"
              @click="gecmisSorgula"
              title="Ara"
            />
            <Button
              v-if="gecmisArandi"
              icon="pi pi-times"
              severity="secondary"
              outlined
              @click="gecmisTemizle"
              title="Temizle"
            />
          </div>

          <!-- Arama Sonucu -->
          <div v-if="gecmisYukleniyor" class="search-status">
            <i class="pi pi-spin pi-spinner"></i> Aranıyor...
          </div>

          <div v-else-if="secereVerileri.length > 0" class="search-results">
            <div
              v-for="(kayit, index) in secereVerileri"
              :key="kayit.id"
              class="history-card"
            >
              <div class="history-card-header">
                <div class="history-card-id">
                  <span class="plate-cell">{{ kayit.plate || 'Plakasız' }}</span>
                  <Tag :value="kayit.status || '-'" :severity="getSeverity(kayit.status)" />
                </div>
                <div class="history-card-meta">
                  <strong>{{ kayit.customer_name || 'Müşteri bilinmiyor' }}</strong>
                  <span>{{ kayit.brand || '' }} {{ kayit.model || '' }}</span>
                </div>
              </div>

              <div class="history-detail-grid">
                <div><span>Açılış</span><strong>{{ tarihFormatla(kayit.created_at) }}</strong></div>
                <div><span>Kapanış</span><strong>{{ kayit.closed_at ? tarihFormatla(kayit.closed_at) : '-' }}</strong></div>
                <div><span>KM</span><strong>{{ kayit.mileage ? Number(kayit.mileage).toLocaleString('tr-TR') : '-' }}</strong></div>
                <div><span>Usta</span><strong>{{ kayit.opened_by_master_name || '-' }}</strong></div>
              </div>

              <div v-if="kayit.description" class="history-desc">
                <span>Şikayet:</span> {{ kayit.description }}
              </div>

              <div v-if="kayit.kalemler && kayit.kalemler.length > 0" class="history-items-row">
                <span>Kalemler:</span>
                <ul>
                  <li v-for="kalem in kayit.kalemler" :key="kalem.id">
                    {{ kalemBasligiGetir(kalem) }}
                    <em v-if="Number(kalem.total_price) > 0">{{ tlFormatla(kalem.total_price) }}</em>
                  </li>
                </ul>
              </div>

              <div class="history-total">
                <span>{{ index + 1 }}. Servis</span>
                <strong class="cell-price">{{ tlFormatla(kayit.total_price) }}</strong>
              </div>
            </div>
          </div>

          <div v-else-if="gecmisArandi" class="search-empty">
            <i class="pi pi-search"></i>
            <p>Eşleşen kayıt bulunamadı.</p>
          </div>

          <div v-else class="search-hint">
            Araç plakası, müşteri adı, telefon veya yapılan işlem ile arama yapın.
          </div>
        </div>

        <!-- Kritik Stok Paneli -->
        <div v-if="dusukStokParcalari.length > 0" class="low-stock-box">
          <div class="low-stock-header">
            <i class="pi pi-exclamation-triangle"></i>
            <h3>Kritik Stok Uyardışı</h3>
          </div>
          <ul>
            <li v-for="parca in dusukStokParcalari" :key="parca.id">
              <strong>{{ parca.code }}</strong>
              <span>{{ parca.name }}</span>
              <em>{{ parca.stock }}/{{ parca.critical_stock ?? 5 }}</em>
            </li>
          </ul>
        </div>

        <div v-else class="stock-empty-box">
          <i class="pi pi-check-circle"></i>
          <strong>Kritik stokta parça yok</strong>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
.dashboard-page {
  color: var(--text-primary);
}

/* ── Header ─────────────────────────────────── */
.dash-header {
  align-items: center;
}

/* ── Stat Cards ─────────────────────────────── */
.dash-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.dash-stat-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  border-left-width: 4px;
  border-left-style: solid;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.dash-stat-card:hover { box-shadow: var(--shadow-md); }
.dash-stat-card.accent-blue   { border-left-color: #2d7dd2; }
.dash-stat-card.accent-green  { border-left-color: #10b981; }
.dash-stat-card.accent-amber  { border-left-color: #f59e0b; }
.dash-stat-card.accent-purple { border-left-color: #8b5cf6; }

.stat-card-inner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.stat-card-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.stat-card-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-title);
  line-height: 1;
}

.stat-card-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.stat-card-icon {
  font-size: 20px;
  color: var(--border-color);
  opacity: 0.6;
  margin-top: 2px;
  flex-shrink: 0;
}

/* ── Content Grid ─────────────────────────────── */
.dashboard-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
  gap: 18px;
}

.info-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 20px;
}

.info-panel h2 {
  margin: 0 0 4px;
  color: var(--text-title);
  font-size: 18px;
  font-weight: 700;
}

.info-panel p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.cell-date { font-size: 13px; color: var(--text-secondary); }
.cell-sub  { font-size: 12.5px; color: var(--text-muted); margin-top: 3px; }
.cell-price { font-weight: 700; color: var(--status-done); }

/* ── Right Panel & Search Module ────────────────── */
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.search-module {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-module-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-module-header i {
  color: var(--accent-color);
  font-size: 16px;
}

.search-module-header span {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-title);
}

.search-module-input-row {
  display: flex;
  gap: 8px;
}

.search-module-input {
  flex: 1;
}

.search-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--text-muted);
  font-size: 14px;
}

.search-results {
  max-height: 450px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
  padding-right: 4px;
}

/* Custom scrollbar for search results */
.search-results::-webkit-scrollbar {
  width: 6px;
}
.search-results::-webkit-scrollbar-track {
  background: transparent;
}
.search-results::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
.search-results::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.search-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.search-empty i {
  font-size: 20px;
}

.search-hint {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.4;
  padding: 4px 2px;
}

.plate-cell {
  background: var(--bg-active-box);
  color: var(--accent-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: monospace;
  font-weight: 700;
  font-size: 13px;
}

/* ── Low Stock ────────────────────────────────── */
.low-stock-box {
  background: var(--bg-panel);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-left: 4px solid var(--status-open);
  color: var(--text-primary);
  padding: 14px 16px;
  border-radius: 10px;
}

.low-stock-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.low-stock-header i {
  color: var(--status-open);
  font-size: 16px;
}

.low-stock-box h3 {
  margin: 0;
  color: var(--status-open);
  font-size: 15px;
  font-weight: 700;
}

.low-stock-box p {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 13.5px;
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
  padding: 7px 0;
  border-top: 1px solid rgba(239, 68, 68, 0.12);
  font-size: 13.5px;
}

.low-stock-box li:first-child { border-top: none; }
.low-stock-box strong { color: var(--text-title); font-weight: 600; }
.low-stock-box span   { color: var(--text-secondary); }
.low-stock-box em     { font-style: normal; font-weight: 700; color: var(--status-open); }

.stock-empty-box {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
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

.stock-empty-box i     { font-size: 24px; color: var(--status-done); margin-bottom: 4px; }
.stock-empty-box strong { color: var(--text-title); font-size: 14.5px; }
.stock-empty-box span   { color: var(--text-muted); font-size: 13px; }

/* ── Empty message ───────────────────────────── */
.empty-message {
  text-align: center;
  color: var(--text-muted);
  padding: 28px 20px;
  background: var(--bg-active-box);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  margin-top: 8px;
}

/* ── History Card ───────────────────────────── */
.history-card {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 18px;
  color: var(--text-primary);
}

.history-card-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  margin-bottom: 14px;
}

.history-card-id {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.history-card-meta {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.history-card-meta strong {
  font-size: 14px;
  color: var(--text-title);
}

.history-card-meta span {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.service-title {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}

.history-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.history-detail-grid div {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 9px 11px;
}

.history-detail-grid span,
.history-total span {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
  font-weight: 700;
}

.history-detail-grid strong {
  color: var(--text-title);
  font-size: 13.5px;
  font-weight: 600;
}

.history-desc {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 13.5px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.history-desc span {
  font-weight: 700;
  color: var(--text-title);
  margin-right: 4px;
}

.history-items-row {
  margin-bottom: 12px;
}

.history-items-row > span {
  font-weight: 700;
  color: var(--text-title);
  font-size: 13px;
  display: block;
  margin-bottom: 6px;
}

.history-items-row ul {
  margin: 0;
  padding-left: 18px;
  list-style-type: disc;
}

.history-items-row li {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.history-items-row li em {
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
  margin-top: 14px;
  padding-top: 14px;
}

.history-total strong {
  color: var(--text-title);
  font-size: 16px;
  font-weight: 700;
}

/* ── Responsive ───────────────────────────────── */
@media (max-width: 1100px) {
  .dash-stat-grid {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
  .dashboard-content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .history-search-row { grid-template-columns: 1fr; }
  .history-detail-grid { grid-template-columns: 1fr; }
  .history-card-header { flex-direction: column; }
}

/* ── Light theme ─────────────────────────────── */
:global(html[data-theme="light"] .search-module) {
  background: #ffffff !important;
  border-color: #c8d5e3 !important;
}
:global(html[data-theme="light"] .history-card) {
  background: #f8fafc !important;
  border-color: #c8d5e3 !important;
}
:global(html[data-theme="light"] .history-detail-grid div) {
  background: #ffffff !important;
  border-color: #dde6ef !important;
}
:global(html[data-theme="light"] .history-desc) {
  background: #ffffff !important;
  border-color: #dde6ef !important;
}
:global(html[data-theme="light"] .low-stock-box) {
  background: #fff7ed !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
  border-left-color: #ef4444 !important;
  color: #9a3412 !important;
}
:global(html[data-theme="light"] .low-stock-box h3),
:global(html[data-theme="light"] .low-stock-box strong),
:global(html[data-theme="light"] .low-stock-box em) {
  color: #b91c1c !important;
}
:global(html[data-theme="light"] .low-stock-box p),
:global(html[data-theme="light"] .low-stock-box span) {
  color: #7c2d12 !important;
}
</style>