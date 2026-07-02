<script setup>
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Dropdown from 'primevue/dropdown'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const toast = useToast()
const confirm = useConfirm()

const giderler = ref([])
const loading = ref(false)
const giderFormDialog = ref(false)
const isEditing = ref(false)

const aramaMetni = ref('')
const seciliDurumFiltresi = ref('Tümü')
const seciliZamanFiltresi = ref('Tümü')
const seciliTurFiltresi = ref('Tümü')

const giderTurleri = [
  'İnternet',
  'Elektrik',
  'Doğalgaz',
  'Su',
  'Kira',
  'Vergi',
  'Sigorta',
  'Muhasebeci',
  'Aidat',
  'Abonelik',
  'Diğer'
]

const odemeYontemleri = [
  'Nakit',
  'Kart',
  'EFT/Havale',
  'Diğer'
]

const form = ref({
  id: null,
  expense_type: '',
  company_name: '',
  period: '',
  expense_date: '',
  due_date: '',
  amount: null,
  status: 'Ödenmedi',
  payment_date: '',
  payment_method: '',
  note: ''
})

const formHatalari = ref({})

const resetForm = () => {
  const bugun = new Date().toISOString().slice(0, 10)
  form.value = {
    id: null,
    expense_type: '',
    company_name: '',
    period: '',
    expense_date: bugun,
    due_date: '',
    amount: null,
    status: 'Ödenmedi',
    payment_date: '',
    payment_method: '',
    note: ''
  }
  formHatalari.value = {}
}

const giderleriYukle = async () => {
  loading.value = true
  try {
    const res = await window.api.giderleriGetir()
    if (res?.success) {
      giderler.value = Array.isArray(res.giderler) ? res.giderler : []
    } else {
      toast.add({ severity: 'error', summary: 'Hata', detail: res?.error || 'Giderler yüklenemedi.', life: 3000 })
    }
  } catch (error) {
    console.error('Giderleri yükleme hatası:', error)
    toast.add({ severity: 'error', summary: 'Hata', detail: 'Giderler yüklenirken bir hata oluştu.', life: 3000 })
  } finally {
    loading.value = false
  }
}

const formDogrula = () => {
  const hatalar = {}
  if (!form.value.expense_type || !form.value.expense_type.trim()) {
    hatalar.expense_type = 'Gider türü seçilmeli veya yazılmalıdır.'
  }
  if (!form.value.expense_date) {
    hatalar.expense_date = 'Gider tarihi seçilmelidir.'
  }
  if (!form.value.amount || Number(form.value.amount) <= 0) {
    hatalar.amount = 'Tutar sıfırdan büyük olmalıdır.'
  }
  if (form.value.status === 'Ödendi') {
    if (!form.value.payment_date) {
      hatalar.payment_date = 'Ödeme tarihi seçilmelidir.'
    }
    if (!form.value.payment_method) {
      hatalar.payment_method = 'Ödeme yöntemi seçilmelidir.'
    }
  }
  formHatalari.value = hatalar
  return Object.keys(hatalar).length === 0
}

const giderKaydet = async () => {
  if (!formDogrula()) return

  try {
    const payload = {
      ...form.value,
      amount: Number(form.value.amount) || 0
    }

    let res
    if (isEditing.value) {
      res = await window.api.giderGuncelle(payload)
    } else {
      res = await window.api.giderEkle(payload)
    }

    if (res?.success) {
      toast.add({
        severity: 'success',
        summary: 'Başarılı',
        detail: isEditing.value ? 'Gider kaydı güncellendi.' : 'Gider kaydı eklendi.',
        life: 3000
      })
      giderFormDialog.value = false
      giderleriYukle()
    } else {
      toast.add({ severity: 'error', summary: 'Hata', detail: res?.error || 'Gider kaydedilemedi.', life: 3000 })
    }
  } catch (error) {
    console.error('Gider kaydetme hatası:', error)
    toast.add({ severity: 'error', summary: 'Hata', detail: 'İşlem sırasında bir hata oluştu.', life: 3000 })
  }
}

const giderEkleDialogAc = () => {
  isEditing.value = false
  resetForm()
  giderFormDialog.value = true
}

const giderDuzenle = (gider) => {
  isEditing.value = true
  form.value = { ...gider }
  formHatalari.value = {}
  giderFormDialog.value = true
}

const giderSil = (gider) => {
  confirm.require({
    message: `"${gider.expense_type}" türündeki (${gider.company_name || 'Kurum belirtilmemiş'}) gider kaydını silmek istediğinize emin misiniz?`,
    header: 'Kayıt Silme Onayı',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Vazgeç',
    acceptLabel: 'Sil',
    rejectClass: 'p-button-secondary p-button-outlined',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        const res = await window.api.giderSil(gider.id)
        if (res?.success) {
          toast.add({ severity: 'success', summary: 'Başarılı', detail: 'Gider kaydı silindi.', life: 3000 })
          giderleriYukle()
        } else {
          toast.add({ severity: 'error', summary: 'Hata', detail: res?.error || 'Gider silinemedi.', life: 3000 })
        }
      } catch (error) {
        console.error('Gider silme hatası:', error)
        toast.add({ severity: 'error', summary: 'Hata', detail: 'Silme işlemi sırasında hata oluştu.', life: 3000 })
      }
    }
  })
}

const hizliOde = async (gider) => {
  const bugun = new Date().toISOString().slice(0, 10)
  const guncelGider = {
    ...gider,
    status: 'Ödendi',
    payment_date: bugun,
    payment_method: 'EFT/Havale'
  }

  try {
    const res = await window.api.giderGuncelle(guncelGider)
    if (res?.success) {
      toast.add({ severity: 'success', summary: 'Başarılı', detail: 'Ödeme kaydedildi (EFT/Havale).', life: 3000 })
      giderleriYukle()
    } else {
      toast.add({ severity: 'error', summary: 'Hata', detail: res?.error || 'Ödeme kaydedilemedi.', life: 3000 })
    }
  } catch (error) {
    console.error('Hızlı ödeme hatası:', error)
    toast.add({ severity: 'error', summary: 'Hata', detail: 'İşlem sırasında hata oluştu.', life: 3000 })
  }
}

// Tarih ve Sayı Formatlama Yardımcıları
const tarihFormatla = (tarih) => {
  if (!tarih) return '-'
  const [yil, ay, gun] = tarih.split('-')
  if (!yil || !ay || !gun) return tarih
  return `${gun}/${ay}/${yil}`
}

const tlFormatla = (deger) => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY'
  }).format(Number(deger) || 0)
}

// Dinamik Tür Filtresi Seçenekleri (Veritabanındaki türlere göre de şekillenir)
const dinamikTurSecenekleri = computed(() => {
  const turler = new Set(giderTurleri)
  giderler.value.forEach(g => {
    if (g.expense_type) turler.add(g.expense_type)
  })
  return ['Tümü', ...Array.from(turler)]
})

// İstatistikler (Bu Ay, Ödenen, Ödenmemiş, Yaklaşan)
const istatistikler = computed(() => {
  const bugun = new Date()
  const buAyYil = bugun.getFullYear()
  const buAyAy = String(bugun.getMonth() + 1).padStart(2, '0')
  const buAyPrefix = `${buAyYil}-${buAyAy}` // YYYY-MM
  const bugunStr = bugun.toISOString().slice(0, 10)

  let buAyToplam = 0
  let buAyOdenen = 0
  let toplamOdenmemis = 0
  let yaklasanTutar = 0
  let yaklasanAdet = 0

  giderler.value.forEach(g => {
    const isBuAy = g.expense_date && g.expense_date.startsWith(buAyPrefix)
    const tutar = Number(g.amount) || 0

    if (isBuAy) {
      buAyToplam += tutar
      if (g.status === 'Ödendi') {
        buAyOdenen += tutar
      }
    }

    if (g.status === 'Ödenmedi') {
      toplamOdenmemis += tutar
      
      // Son ödeme tarihi bugün veya gelecekteyse (ya da hiç girilmemişse, yaklaşan kabul edilebilir)
      if (!g.due_date || g.due_date >= bugunStr) {
        yaklasanTutar += tutar
        yaklasanAdet++
      }
    }
  })

  return {
    buAyToplam,
    buAyOdenen,
    buAyOdenmeyen: buAyToplam - buAyOdenen,
    toplamOdenmemis,
    yaklasanTutar,
    yaklasanAdet
  }
})

// Filtrelenmiş Gider Listesi
const filtrelenmisGiderler = computed(() => {
  const bugun = new Date()
  const buAyYil = bugun.getFullYear()
  const buAyAy = String(bugun.getMonth() + 1).padStart(2, '0')
  const buAyPrefix = `${buAyYil}-${buAyAy}`
  const bugunStr = bugun.toISOString().slice(0, 10)

  return giderler.value.filter(g => {
    // 1. Arama Filtresi (Kurum adı, gider türü veya not)
    const aranan = aramaMetni.value.toLowerCase().trim()
    if (aranan) {
      const kurum = (g.company_name || '').toLowerCase()
      const tur = (g.expense_type || '').toLowerCase()
      const not = (g.note || '').toLowerCase()
      const donem = (g.period || '').toLowerCase()
      
      if (!kurum.includes(aranan) && !tur.includes(aranan) && !not.includes(aranan) && !donem.includes(aranan)) {
        return false
      }
    }

    // 2. Durum Filtresi (Ödendi, Ödenmedi)
    if (seciliDurumFiltresi.value !== 'Tümü' && g.status !== seciliDurumFiltresi.value) {
      return false
    }

    // 3. Tür Filtresi
    if (seciliTurFiltresi.value !== 'Tümü' && g.expense_type !== seciliTurFiltresi.value) {
      return false
    }

    // 4. Zaman Filtresi (Bu Ay, Gecikenler)
    if (seciliZamanFiltresi.value === 'Bu Ay') {
      if (!g.expense_date || !g.expense_date.startsWith(buAyPrefix)) {
        return false
      }
    } else if (seciliZamanFiltresi.value === 'Gecikenler') {
      // Gecikenler: Ödenmemiş ve son ödeme tarihi bugünden küçük olanlar
      if (g.status !== 'Ödenmedi' || !g.due_date || g.due_date >= bugunStr) {
        return false
      }
    }

    return true
  })
})

onMounted(() => {
  giderleriYukle()
})
</script>

<template>
  <div class="page general-expenses-page">
    
    <!-- Üst Başlık ve Ekleme Butonu -->
    <div class="page-header header-row">
      <div>
        <h1 class="page-title">Genel Gider Takibi</h1>
        <p class="page-subtitle">İşletmenizin sabit ve genel giderlerini (fatura, kira, vergi vb.) buradan yönetebilirsiniz.</p>
      </div>
      <Button
        label="Yeni Gider Ekle"
        icon="pi pi-plus"
        severity="primary"
        @click="giderEkleDialogAc"
      />
    </div>

    <!-- Özet İstatistik Kartları -->
    <div class="stats-row">
      <div class="stat-card border-blue">
        <div class="stat-card-label">Bu Ay Toplam Gider</div>
        <div class="stat-card-value">{{ tlFormatla(istatistikler.buAyToplam) }}</div>
        <div class="stat-card-sub">Ödenmeyen: {{ tlFormatla(istatistikler.buAyOdenmeyen) }}</div>
      </div>

      <div class="stat-card border-green">
        <div class="stat-card-label">Bu Ay Ödenen</div>
        <div class="stat-card-value text-green">{{ tlFormatla(istatistikler.buAyOdenen) }}</div>
        <div class="stat-card-sub">Ödeme tamamlanan tutar</div>
      </div>

      <div class="stat-card border-red">
        <div class="stat-card-label">Toplam Ödenmemiş</div>
        <div class="stat-card-value text-red">{{ tlFormatla(istatistikler.toplamOdenmemis) }}</div>
        <div class="stat-card-sub">Tüm zamanlar ödeme bekleyen</div>
      </div>

      <div class="stat-card border-orange">
        <div class="stat-card-label">Yaklaşan Ödemeler</div>
        <div class="stat-card-value text-orange">{{ tlFormatla(istatistikler.yaklasanTutar) }}</div>
        <div class="stat-card-sub">{{ istatistikler.yaklasanAdet }} fatura / ödeme yaklaşıyor</div>
      </div>
    </div>

    <!-- Filtreleme Paneli -->
    <div class="filter-panel">
      <div class="filter-group flex-1">
        <label>Arama</label>
        <span class="p-input-icon-left w-full">
          <i class="pi pi-search" />
          <InputText
            v-model="aramaMetni"
            placeholder="Kurum, dönem, açıklama veya tür yazın..."
            class="w-full"
          />
        </span>
      </div>

      <div class="filter-group select-w">
        <label>Ödeme Durumu</label>
        <Dropdown
          v-model="seciliDurumFiltresi"
          :options="['Tümü', 'Ödendi', 'Ödenmedi']"
          class="w-full"
        />
      </div>

      <div class="filter-group select-w">
        <label>Zaman Dilimi</label>
        <Dropdown
          v-model="seciliZamanFiltresi"
          :options="['Tümü', 'Bu Ay', 'Gecikenler']"
          class="w-full"
        />
      </div>

      <div class="filter-group select-w">
        <label>Gider Türü</label>
        <Dropdown
          v-model="seciliTurFiltresi"
          :options="dinamikTurSecenekleri"
          class="w-full"
        />
      </div>
    </div>

    <!-- Tablo Bölümü -->
    <div class="table-container">
      <DataTable
        :value="filtrelenmisGiderler"
        :loading="loading"
        responsiveLayout="scroll"
        class="p-datatable-sm w-full"
        paginator
        :rows="12"
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
        currentPageReportTemplate="{first} - {last} arası gösteriliyor (Toplam {totalRecords} kayıt)"
      >
        <Column header="Gider Türü" style="width: 140px">
          <template #body="slotProps">
            <span class="type-badge">{{ slotProps.data.expense_type }}</span>
          </template>
        </Column>

        <Column header="Kurum/Firma" field="company_name">
          <template #body="slotProps">
            <span class="company-text">{{ slotProps.data.company_name || '-' }}</span>
          </template>
        </Column>

        <Column header="Dönem" field="period" style="width: 110px">
          <template #body="slotProps">
            <span class="text-sm font-semibold">{{ slotProps.data.period || '-' }}</span>
          </template>
        </Column>

        <Column header="Gider Tarihi" style="width: 110px">
          <template #body="slotProps">
            <span class="text-sm">{{ tarihFormatla(slotProps.data.expense_date) }}</span>
          </template>
        </Column>

        <Column header="Son Ödeme" style="width: 110px">
          <template #body="slotProps">
            <span
              class="text-sm font-semibold"
              :class="{
                'text-red font-bold': slotProps.data.status === 'Ödenmedi' && slotProps.data.due_date && slotProps.data.due_date < new Date().toISOString().slice(0,10)
              }"
            >
              {{ tarihFormatla(slotProps.data.due_date) }}
            </span>
          </template>
        </Column>

        <Column header="Tutar" style="width: 120px">
          <template #body="slotProps">
            <strong class="price-text">{{ tlFormatla(slotProps.data.amount) }}</strong>
          </template>
        </Column>

        <Column header="Durum" style="width: 110px">
          <template #body="slotProps">
            <Tag
              :value="slotProps.data.status"
              :severity="slotProps.data.status === 'Ödendi' ? 'success' : 'danger'"
            />
          </template>
        </Column>

        <Column header="Ödeme Bilgisi">
          <template #body="slotProps">
            <div v-if="slotProps.data.status === 'Ödendi'" class="payment-info-cell">
              <span class="text-xs">{{ tarihFormatla(slotProps.data.payment_date) }}</span>
              <span class="method-badge">{{ slotProps.data.payment_method }}</span>
            </div>
            <div v-else>
              <Button
                label="Hızlı Öde"
                icon="pi pi-check"
                size="small"
                severity="success"
                outlined
                class="p-button-xs"
                @click="hizliOde(slotProps.data)"
              />
            </div>
          </template>
        </Column>

        <Column header="Açıklama" field="note">
          <template #body="slotProps">
            <span class="note-text" :title="slotProps.data.note">{{ slotProps.data.note || '-' }}</span>
          </template>
        </Column>

        <Column header="İşlemler" style="width: 110px; text-align: center">
          <template #body="slotProps">
            <div class="action-buttons">
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                outlined
                size="small"
                @click="giderDuzenle(slotProps.data)"
                title="Düzenle"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                outlined
                size="small"
                @click="giderSil(slotProps.data)"
                title="Sil"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Ekleme / Düzenleme Dialog Formu -->
    <Dialog
      v-model:visible="giderFormDialog"
      :header="isEditing ? 'Gider Bilgilerini Düzenle' : 'Yeni Genel Gider Kaydı'"
      :style="{ width: '550px' }"
      modal
      class="p-fluid"
    >
      <div class="form-grid">
        
        <!-- Gider Türü (Yazılabilir Dropdown) -->
        <div class="field">
          <label for="expense_type" class="required">Gider Türü</label>
          <Dropdown
            id="expense_type"
            v-model="form.expense_type"
            :options="giderTurleri"
            editable
            placeholder="Seçin veya özel tür yazın..."
            :class="{ 'p-invalid': formHatalari.expense_type }"
          />
          <small v-if="formHatalari.expense_type" class="p-error">{{ formHatalari.expense_type }}</small>
        </div>

        <div class="form-row">
          <!-- Kurum/Firma Adı -->
          <div class="field flex-1">
            <label for="company_name">Kurum / Firma Adı</label>
            <InputText
              id="company_name"
              v-model="form.company_name"
              placeholder="Örn: Türk Telekom, Maliye vb."
            />
          </div>

          <!-- Dönem Bilgisi -->
          <div class="field flex-1">
            <label for="period">Dönem</label>
            <InputText
              id="period"
              v-model="form.period"
              placeholder="Örn: Temmuz 2026, 2026/07"
            />
          </div>
        </div>

        <div class="form-row">
          <!-- Gider Tarihi -->
          <div class="field flex-1">
            <label for="expense_date" class="required">Gider / Fatura Tarihi</label>
            <input
              id="expense_date"
              type="date"
              v-model="form.expense_date"
              class="custom-date-input"
              :class="{ 'date-invalid': formHatalari.expense_date }"
            />
            <small v-if="formHatalari.expense_date" class="p-error">{{ formHatalari.expense_date }}</small>
          </div>

          <!-- Son Ödeme Tarihi -->
          <div class="field flex-1">
            <label for="due_date">Son Ödeme Tarihi</label>
            <input
              id="due_date"
              type="date"
              v-model="form.due_date"
              class="custom-date-input"
            />
          </div>
        </div>

        <div class="form-row">
          <!-- Tutar -->
          <div class="field flex-1">
            <label for="amount" class="required">Tutar (TL)</label>
            <InputText
              id="amount"
              type="number"
              v-model="form.amount"
              placeholder="0.00"
              step="0.01"
              min="0.01"
              :class="{ 'p-invalid': formHatalari.amount }"
            />
            <small v-if="formHatalari.amount" class="p-error">{{ formHatalari.amount }}</small>
          </div>

          <!-- Ödeme Durumu -->
          <div class="field flex-1">
            <label for="status">Ödeme Durumu</label>
            <Dropdown
              id="status"
              v-model="form.status"
              :options="['Ödenmedi', 'Ödendi']"
            />
          </div>
        </div>

        <!-- Ödendi durumunda açılan alanlar -->
        <div v-if="form.status === 'Ödendi'" class="paid-details-box">
          <div class="form-row">
            <!-- Ödeme Tarihi -->
            <div class="field flex-1">
              <label for="payment_date" class="required">Ödeme Tarihi</label>
              <input
                id="payment_date"
                type="date"
                v-model="form.payment_date"
                class="custom-date-input"
                :class="{ 'date-invalid': formHatalari.payment_date }"
              />
              <small v-if="formHatalari.payment_date" class="p-error">{{ formHatalari.payment_date }}</small>
            </div>

            <!-- Ödeme Yöntemi -->
            <div class="field flex-1">
              <label for="payment_method" class="required">Ödeme Yöntemi</label>
              <Dropdown
                id="payment_method"
                v-model="form.payment_method"
                :options="odemeYontemleri"
                placeholder="Seçin..."
                :class="{ 'p-invalid': formHatalari.payment_method }"
              />
              <small v-if="formHatalari.payment_method" class="p-error">{{ formHatalari.payment_method }}</small>
            </div>
          </div>
        </div>

        <!-- Açıklama / Not -->
        <div class="field">
          <label for="note">Açıklama / Not</label>
          <Textarea
            id="note"
            v-model="form.note"
            rows="3"
            placeholder="Gidere ait detaylı açıklama yazabilirsiniz..."
          />
        </div>

      </div>

      <template #footer>
        <Button label="Vazgeç" icon="pi pi-times" severity="secondary" outlined @click="giderFormDialog = false" />
        <Button label="Kaydet" icon="pi pi-check" @click="giderKaydet" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.general-expenses-page {
  color: var(--text-primary);
}

.header-row {
  align-items: center;
}

/* ── İstatistik Kartları ─────────────────────────── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.stat-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  border-left-width: 4px;
  border-left-style: solid;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.stat-card.border-blue   { border-left-color: #2d7dd2; }
.stat-card.border-green  { border-left-color: #10b981; }
.stat-card.border-red    { border-left-color: #ef4444; }
.stat-card.border-orange { border-left-color: #f59e0b; }

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
  line-height: 1.1;
}

.stat-card-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.text-green  { color: #10b981 !important; }
.text-red    { color: #ef4444 !important; }
.text-orange { color: #f59e0b !important; }

/* ── Filtreleme Paneli ───────────────────────────── */
.filter-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 16px 20px;
  display: flex;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 18px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.select-w {
  width: 160px;
  flex-shrink: 0;
}

/* ── Tablo Özelleştirmeleri ──────────────────────── */
.table-container {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
}

.type-badge {
  background: rgba(45, 125, 210, 0.12);
  color: var(--accent-color);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12.5px;
  font-weight: 700;
  display: inline-block;
}

.company-text {
  font-weight: 600;
  color: var(--text-title);
  font-size: 13.5px;
}

.price-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-title);
}

.payment-info-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.method-badge {
  background: var(--bg-active-box);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 10.5px;
  font-weight: 600;
  display: inline-block;
  align-self: flex-start;
}

.note-text {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 6px;
}

/* ── Form & Dialog Tasarımı ──────────────────────── */
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 10px;
}

.form-row {
  display: flex;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.field label.required::after {
  content: " *";
  color: #ef4444;
}

/* Custom HTML5 Date Input Styling to match PrimeVue inputs */
.custom-date-input {
  background: var(--bg-input, #ffffff);
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-primary);
  font-family: inherit;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.custom-date-input:focus {
  border-color: var(--accent-color, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.date-invalid {
  border-color: #ef4444 !important;
}

.paid-details-box {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.p-button-xs {
  padding: 2px 8px !important;
  font-size: 11px !important;
}

/* Responsive grid */
@media (max-width: 1100px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .filter-panel {
    flex-wrap: wrap;
  }
  .select-w {
    flex: 1;
    min-width: 130px;
  }
}

@media (max-width: 700px) {
  .stats-row {
    grid-template-columns: 1fr;
  }
  .form-row {
    flex-direction: column;
    gap: 14px;
  }
}
</style>
