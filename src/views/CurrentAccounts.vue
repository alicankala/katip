<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

// Cari Listesi ve Seçimler
const cariler = ref([])
const seciliCari = ref(null)
const aramaKelimesi = ref('')
const seciliCariTipiFiltre = ref(null)
const sadeceBorcluOlanlar = ref(false)

// İşlem ve Ödeme Geçmişi
const islemler = ref([])
const odemeler = ref([])
const aktifTab = ref('islemler') // 'islemler' | 'odemeler'

// İlişkili Veri Listeleri
const araclarListesi = ref([])
const isEmirleriListesi = ref([])

// Dialog Kontrolleri
const cariDialogAcik = ref(false)
const islemDialogAcik = ref(false)
const odemeDialogAcik = ref(false)

const toast = useToast()
const confirmDialog = useConfirm()

// Cari Tipleri
const cariTipleri = [
  'Parçacı',
  'Kaportacı',
  'Boyacı',
  'Turbocu',
  'Rektefiyeci',
  'Tornacı',
  'Elektrikçi',
  'Egzozcu',
  'Döşemeci',
  'Diğer'
]

const dinamikCariTipleri = computed(() => {
  const tipler = new Set(cariTipleri)
  cariler.value.forEach(c => {
    if (c.type) {
      tipler.add(c.type)
    }
  })
  return Array.from(tipler).sort()
})

// İşlem Tipleri
const islemTipleri = [
  'Mal / Parça Alışı',
  'Dışarıya Yaptırılan İş',
  'Genel Gider',
  'Diğer'
]

// Ödeme Yöntemleri
const odemeYontemleri = [
  'Nakit',
  'Kredi Kartı',
  'Havale/EFT',
  'Diğer'
]

// Form Değişkenleri
const cariForm = reactive({
  id: null,
  name: '',
  type: '',
  phone: '',
  note: ''
})

const islemForm = reactive({
  id: null,
  current_account_id: null,
  date: '',
  transaction_type: '',
  description: '',
  amount: null,
  vehicle_id: null,
  work_order_id: null,
  note: ''
})

const odemeForm = reactive({
  id: null,
  current_account_id: null,
  transaction_id: null,
  date: '',
  amount: null,
  payment_method: '',
  description: ''
})

// Helper: Bugünün Tarihi (YYYY-MM-DD)
const bugununTarihi = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Toast Mesajları
const basariMesaji = (detay) => {
  toast.add({ severity: 'success', summary: 'Başarılı', detail: detay, life: 2500 })
}
const hataMesaji = (detay) => {
  toast.add({ severity: 'error', summary: 'Hata', detail: detay, life: 4000 })
}
const uyariMesaji = (detay) => {
  toast.add({ severity: 'warn', summary: 'Uyarı', detail: detay, life: 3000 })
}

// Formatters
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
      return `${parts[2]}.${parts[1]}.${parts[0]}` // YYYY-MM-DD to DD.MM.YYYY
    }
    return new Date(tarih).toLocaleDateString('tr-TR')
  } catch (e) {
    return tarih
  }
}

// Veri Yükleme Fonksiyonları
const carileriYukle = async () => {
  try {
    const res = await window.api.cariHesapleriGetir()
    if (res?.success) {
      cariler.value = res.accounts || []
      
      // Seçili cari varsa verisini güncelle
      if (seciliCari.value) {
        const guncelCari = cariler.value.find(c => c.id === seciliCari.value.id)
        if (guncelCari) {
          seciliCari.value = guncelCari
        } else {
          seciliCari.value = null
        }
      }
    } else {
      hataMesaji(res?.error || 'Cari hesaplar yüklenemedi.')
    }
  } catch (error) {
    hataMesaji('Cari hesaplar yüklenirken bir hata oluştu.')
  }
}

const cariDetaylariniYukle = async (cari) => {
  if (!cari) return
  seciliCari.value = cari
  try {
    const islemRes = await window.api.cariIslemleriGetir(cari.id)
    if (islemRes?.success) {
      islemler.value = islemRes.transactions || []
    }
    
    const odemeRes = await window.api.cariOdemeleriGetir(cari.id)
    if (odemeRes?.success) {
      odemeler.value = odemeRes.payments || []
    }
  } catch (error) {
    hataMesaji('Cari geçmiş hareketleri yüklenirken hata oluştu.')
  }
}

const iliskiliVerileriYukle = async () => {
  try {
    const araclar = await window.api.araclariGetir()
    araclarListesi.value = araclar || []
    
    const isEmirleri = await window.api.isEmirleriGetir()
    isEmirleriListesi.value = isEmirleri || []
  } catch (error) {
    console.error('İlişkili veriler yüklenemedi:', error)
  }
}

// Filtrelenmiş Cariler
const filtrelenmisCariler = computed(() => {
  let list = cariler.value

  // Arama kelimesi filtresi
  if (aramaKelimesi.value) {
    const aranan = aramaKelimesi.value.toLowerCase()
    list = list.filter(c => 
      (c.name || '').toLowerCase().includes(aranan) ||
      (c.phone || '').toLowerCase().includes(aranan) ||
      (c.note || '').toLowerCase().includes(aranan)
    )
  }

  // Tip filtresi
  if (seciliCariTipiFiltre.value) {
    list = list.filter(c => c.type === seciliCariTipiFiltre.value)
  }

  // Sadece kalan borcu olanlar
  if (sadeceBorcluOlanlar.value) {
    list = list.filter(c => c.remaining_debt > 0.01)
  }

  return list
})

// İstatistikler (Filtrelenmiş veya tümü üzerinden)
const genelOzet = computed(() => {
  let totalDebt = 0
  let totalPaid = 0
  
  cariler.value.forEach(c => {
    totalDebt += (c.total_debt || 0)
    totalPaid += (c.total_paid || 0)
  })

  return {
    totalDebt,
    totalPaid,
    remainingDebt: totalDebt - totalPaid
  }
})

// Cari Ekle / Düzenle İşlemleri
const cariDuzenle = (cari) => {
  Object.assign(cariForm, {
    id: cari.id,
    name: cari.name,
    type: cari.type,
    phone: cari.phone,
    note: cari.note
  })
  cariDialogAcik.value = true
}

const cariKaydet = async () => {
  if (!cariForm.name) {
    uyariMesaji('Cari adı boş bırakılamaz.')
    return
  }
  if (!cariForm.type) {
    uyariMesaji('Cari tipi boş bırakılamaz.')
    return
  }

  try {
    const veri = JSON.parse(JSON.stringify(cariForm))
    const res = cariForm.id 
      ? await window.api.cariHesapGuncelle(veri)
      : await window.api.cariHesapEkle(veri)

    if (res?.success) {
      basariMesaji(cariForm.id ? 'Cari hesap güncellendi.' : 'Cari hesap kaydedildi.')
      cariDialogAcik.value = false
      
      // Formu temizle
      Object.assign(cariForm, { id: null, name: '', type: '', phone: '', note: '' })
      await carileriYukle()
    } else {
      hataMesaji(res?.error || 'Cari kaydedilemedi.')
    }
  } catch (error) {
    hataMesaji('Bir hata oluştu: ' + error.message)
  }
}

const cariSil = (cari) => {
  confirmDialog.require({
    message: `"${cari.name}" cari hesabını pasife almak istediğinizden emin misiniz?`,
    header: 'Cari Hesabı Pasifleştir',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Pasifleştir',
    rejectLabel: 'Vazgeç',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-secondary p-button-text',
    accept: async () => {
      const res = await window.api.cariHesapSil(cari.id)
      if (res?.success) {
        basariMesaji('Cari hesap pasifleştirildi.')
        if (seciliCari.value?.id === cari.id) {
          seciliCari.value = null
        }
        await carileriYukle()
      } else {
        hataMesaji(res?.error || 'İşlem başarısız.')
      }
    }
  })
}

// İşlem Ekleme / Silme
const islemEkleAc = () => {
  if (!seciliCari.value) return
  Object.assign(islemForm, {
    id: null,
    current_account_id: seciliCari.value.id,
    date: bugununTarihi(),
    transaction_type: 'Dışarıya Yaptırılan İş',
    description: '',
    amount: null,
    vehicle_id: null,
    work_order_id: null,
    note: ''
  })
  islemDialogAcik.value = true
}

const islemKaydet = async () => {
  if (!islemForm.date) {
    uyariMesaji('Tarih alanı zorunludur.')
    return
  }
  if (!islemForm.transaction_type) {
    uyariMesaji('İşlem tipi seçilmelidir.')
    return
  }
  if (!islemForm.amount || islemForm.amount <= 0) {
    uyariMesaji('Geçerli bir tutar girilmelidir.')
    return
  }

  try {
    const veri = JSON.parse(JSON.stringify(islemForm))
    const res = await window.api.cariIslemEkle(veri)
    if (res?.success) {
      basariMesaji('İşlem kaydı başarıyla eklendi.')
      islemDialogAcik.value = false
      await carileriYukle()
      await cariDetaylariniYukle(seciliCari.value)
    } else {
      hataMesaji(res?.error || 'İşlem kaydedilemedi.')
    }
  } catch (error) {
    hataMesaji('Bir hata oluştu.')
  }
}

const islemSil = (islem) => {
  confirmDialog.require({
    message: `Bu işlem kaydını silmek istediğinizden emin misiniz? Bu işlem carideki borç kaydını silecektir.`,
    header: 'İşlemi Sil',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sil',
    rejectLabel: 'Vazgeç',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-secondary p-button-text',
    accept: async () => {
      const res = await window.api.cariIslemSil(islem.id)
      if (res?.success) {
        basariMesaji('İşlem silindi.')
        await carileriYukle()
        await cariDetaylariniYukle(seciliCari.value)
      } else {
        hataMesaji(res?.error || 'İşlem silinemedi.')
      }
    }
  })
}

// Ödeme Ekleme / Silme
const odemeEkleAc = () => {
  if (!seciliCari.value) return
  Object.assign(odemeForm, {
    id: null,
    current_account_id: seciliCari.value.id,
    transaction_id: null,
    date: bugununTarihi(),
    amount: null,
    payment_method: 'Nakit',
    description: ''
  })
  odemeDialogAcik.value = true
}

const odemeKaydet = async () => {
  if (!odemeForm.date) {
    uyariMesaji('Tarih alanı zorunludur.')
    return
  }
  if (!odemeForm.amount || odemeForm.amount <= 0) {
    uyariMesaji('Geçerli bir tutar girilmelidir.')
    return
  }
  if (!odemeForm.payment_method) {
    uyariMesaji('Ödeme yöntemi seçilmelidir.')
    return
  }

  try {
    const veri = JSON.parse(JSON.stringify(odemeForm))
    const res = await window.api.cariOdemeEkle(veri)
    if (res?.success) {
      basariMesaji('Ödeme kaydı başarıyla eklendi.')
      odemeDialogAcik.value = false
      await carileriYukle()
      await cariDetaylariniYukle(seciliCari.value)
    } else {
      hataMesaji(res?.error || 'Ödeme kaydedilemedi.')
    }
  } catch (error) {
    hataMesaji('Bir hata oluştu.')
  }
}

const odemeSil = (odeme) => {
  confirmDialog.require({
    message: `Bu ödeme kaydını silmek istediğinizden emin misiniz? Bu işlem carideki ödenmiş bakiyeyi azaltacaktır.`,
    header: 'Ödemeyi Sil',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sil',
    rejectLabel: 'Vazgeç',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-secondary p-button-text',
    accept: async () => {
      const res = await window.api.cariOdemeSil(odeme.id)
      if (res?.success) {
        basariMesaji('Ödeme kaydı silindi.')
        await carileriYukle()
        await cariDetaylariniYukle(seciliCari.value)
      } else {
        hataMesaji(res?.error || 'Ödeme silinemedi.')
      }
    }
  })
}

// Lifecycle Hooks
onMounted(async () => {
  await carileriYukle()
  await iliskiliVerileriYukle()
})
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2 class="page-title">Cari Hesap Takibi</h2>
        <p class="page-subtitle">Tedarikçiler, taşeron ustalar ve dış iş ortaklarının hesap bakiye ve işlem takibi</p>
      </div>
      
      <Button 
        label="Yeni Cari Hesap Ekle" 
        icon="pi pi-plus" 
        severity="info" 
        @click="Object.assign(cariForm, { id: null, name: '', type: '', phone: '', note: '' }); cariDialogAcik = true" 
      />
    </div>

    <!-- İstatistik Kartları -->
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-info">
          <h3>{{ tlFormatla(genelOzet.totalDebt) }}</h3>
          <span>Toplam Cari Borç</span>
        </div>
        <div class="stat-icon-wrapper red">
          <i class="pi pi-arrow-up-right" />
        </div>
      </div>
      <div class="stat-box">
        <div class="stat-info">
          <h3 style="color: #10b981;">{{ tlFormatla(genelOzet.totalPaid) }}</h3>
          <span>Toplam Yapılan Ödeme</span>
        </div>
        <div class="stat-icon-wrapper green">
          <i class="pi pi-arrow-down-left" />
        </div>
      </div>
      <div class="stat-box remaining-debt-box" :class="{ 'has-debt': genelOzet.remainingDebt > 0.01 }">
        <div class="stat-info">
          <h3>{{ tlFormatla(genelOzet.remainingDebt) }}</h3>
          <span>Kalan Net Borç</span>
        </div>
        <div class="stat-icon-wrapper" :class="genelOzet.remainingDebt > 0.01 ? 'red' : 'green'">
          <i class="pi pi-wallet" />
        </div>
      </div>
    </div>

    <!-- İki Sütunlu Ana Bölüm -->
    <div class="cari-layout">
      
      <!-- Sol Cari Hesap Listesi Bölümü -->
      <div class="cari-sol-panel panel">
        <div class="filtre-row" style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
          <span class="p-input-icon-left" style="flex: 1; min-width: 200px; position: relative;">
            <i class="pi pi-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #64748b;" />
            <InputText 
              v-model="aramaKelimesi" 
              placeholder="Cari Hesap Ara (Firma, not...)" 
              style="width: 100%; padding-left: 35px;" 
            />
          </span>
          
          <Dropdown 
            v-model="seciliCariTipiFiltre" 
            :options="dinamikCariTipleri" 
            placeholder="Cari Tipi Filtrele" 
            showClear 
            style="width: 180px;"
          />

          <Button 
            :label="sadeceBorcluOlanlar ? 'Tüm Cariler' : 'Sadece Borcu Olanlar'"
            :icon="sadeceBorcluOlanlar ? 'pi pi-filter-slash' : 'pi pi-filter'"
            :severity="sadeceBorcluOlanlar ? 'info' : 'secondary'"
            outlined
            @click="sadeceBorcluOlanlar = !sadeceBorcluOlanlar"
          />
        </div>

        <DataTable 
          :value="filtrelenmisCariler" 
          responsiveLayout="scroll" 
          emptyMessage="Kayıtlı cari bulunamadı."
          selectionMode="single"
          :selection="seciliCari"
          @row-select="(e) => cariDetaylariniYukle(e.data)"
          class="cari-tablo"
        >
          <Column field="name" header="Cari Adı / Firma">
            <template #body="slotProps">
              <div class="cari-liste-ad">{{ slotProps.data.name }}</div>
              <div class="cari-liste-alt">
                <span class="cari-badge" :class="slotProps.data.type.toLowerCase()">{{ slotProps.data.type }}</span>
                <span v-if="slotProps.data.phone" class="cari-liste-tel">
                  <i class="pi pi-phone" /> {{ slotProps.data.phone }}
                </span>
              </div>
            </template>
          </Column>
          
          <Column field="remaining_debt" header="Net Bakiye" style="text-align: right; width: 130px;">
            <template #body="slotProps">
              <span class="bakiye-deger" :class="slotProps.data.remaining_debt > 0.01 ? 'borclu' : 'borcsuz'">
                {{ tlFormatla(slotProps.data.remaining_debt) }}
              </span>
            </template>
          </Column>
          
          <Column header="Toplam Borç / Ödeme" style="text-align: right; width: 160px; font-size: 0.92rem;">
            <template #body="slotProps">
              <div class="borc-odeme-detay">
                <span class="borc">B: {{ tlFormatla(slotProps.data.total_debt) }}</span>
                <span class="odeme">Ö: {{ tlFormatla(slotProps.data.total_paid) }}</span>
              </div>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- Sağ Detay Bölümü -->
      <div class="cari-sag-panel panel">
        
        <!-- Cari Seçilmediyse Fallback Görünümü -->
        <div v-if="!seciliCari" class="fallback-panel">
          <div class="fallback-icon-frame">
            <i class="pi pi-wallet" />
          </div>
          <h3>Cari Hesap Seçilmedi</h3>
          <p>Detayları, işlem geçmişini ve ödeme hareketlerini görüntülemek için sol taraftaki listeden bir cari hesap seçin.</p>
        </div>

        <!-- Cari Detay Arayüzü -->
        <div v-else class="detay-panel">
          <div class="detay-header">
            <div class="detay-header-info">
              <span class="cari-badge-buyuk" :class="seciliCari.type.toLowerCase()">{{ seciliCari.type }}</span>
              <h3 class="detay-title">{{ seciliCari.name }}</h3>
              <div class="detay-meta">
                <div class="detay-iletisim" v-if="seciliCari.phone">
                  <i class="pi pi-phone" /> <span>{{ seciliCari.phone }}</span>
                </div>
                <div class="detay-not" v-if="seciliCari.note">
                  <i class="pi pi-info-circle" /> <span><strong>Not:</strong> {{ seciliCari.note }}</span>
                </div>
              </div>
            </div>
            
            <div class="detay-header-actions">
              <Button icon="pi pi-pencil" outlined rounded severity="info" @click="cariDuzenle(seciliCari)" title="Cariyi Düzenle" />
              <Button icon="pi pi-trash" outlined rounded severity="danger" @click="cariSil(seciliCari)" title="Cariyi Sil" />
            </div>
          </div>

          <!-- Seçili Cari Bakiyesi -->
          <div class="bakiye-kart">
            <div class="bakiye-sutun total-debt">
              <span class="baslik">Toplam Borç</span>
              <span class="tutar">{{ tlFormatla(seciliCari.total_debt) }}</span>
            </div>
            <div class="bakiye-sutun total-paid">
              <span class="baslik">Yapılan Ödeme</span>
              <span class="tutar">{{ tlFormatla(seciliCari.total_paid) }}</span>
            </div>
            <div class="bakiye-sutun remaining-debt">
              <span class="baslik">Kalan Borç</span>
              <span class="tutar" :class="{ 'has-debt': seciliCari.remaining_debt > 0.01 }">
                {{ tlFormatla(seciliCari.remaining_debt) }}
              </span>
            </div>
          </div>

          <!-- Detay Eylem Butonları -->
          <div class="eylem-satiri">
            <Button 
              label="İşlem Ekle (Borçlandır)" 
              icon="pi pi-file-edit" 
              severity="info" 
              class="flex-1"
              @click="islemEkleAc" 
            />
            <Button 
              label="Ödeme Yap" 
              icon="pi pi-money-bill" 
              severity="success" 
              class="flex-1"
              @click="odemeEkleAc" 
            />
          </div>

          <!-- Sekme Başlıkları -->
          <div class="detay-sekmeler">
            <button 
              class="sekme-btn" 
              :class="{ aktif: aktifTab === 'islemler' }" 
              @click="aktifTab = 'islemler'"
            >
              <i class="pi pi-list" /> İşlem Geçmişi ({{ islemler.length }})
            </button>
            <button 
              class="sekme-btn" 
              :class="{ aktif: aktifTab === 'odemeler' }" 
              @click="aktifTab = 'odemeler'"
            >
              <i class="pi pi-wallet" /> Ödeme Geçmişi ({{ odemeler.length }})
            </button>
          </div>

          <!-- Sekme İçeriği 1: İşlemler -->
          <div v-if="aktifTab === 'islemler'" class="sekme-icerik">
            <DataTable :value="islemler" responsiveLayout="scroll" emptyMessage="Kayıtlı işlem bulunamadı." class="p-datatable-sm">
              <Column field="date" header="Tarih" style="width: 110px;">
                <template #body="slotProps">
                  {{ tarihFormatla(slotProps.data.date) }}
                </template>
              </Column>
              
              <Column field="transaction_type" header="Tür" style="width: 140px;">
                <template #body="slotProps">
                  <span class="islem-type-tag">{{ slotProps.data.transaction_type }}</span>
                </template>
              </Column>
              
              <Column field="description" header="Açıklama / Detay">
                <template #body="slotProps">
                  <div>{{ slotProps.data.description }}</div>
                  
                  <!-- İlişkili Araç / İş Emri Bilgisi varsa göster -->
                  <div class="iliskili-etiket-satir" v-if="slotProps.data.vehicle_plate || slotProps.data.work_order_id">
                    <span class="iliskili-etiket" v-if="slotProps.data.vehicle_plate">
                      <i class="pi pi-car" /> {{ slotProps.data.vehicle_plate }}
                    </span>
                    <span class="iliskili-etiket" v-if="slotProps.data.work_order_id">
                      <i class="pi pi-wrench" /> İş Emri #{{ slotProps.data.work_order_id }}
                    </span>
                  </div>
                  
                  <small class="islem-not" v-if="slotProps.data.note"><strong>Not:</strong> {{ slotProps.data.note }}</small>
                </template>
              </Column>
              
              <Column field="amount" header="Tutar" style="text-align: right; width: 110px;">
                <template #body="slotProps">
                  <span style="font-weight: 700;">{{ tlFormatla(slotProps.data.amount) }}</span>
                </template>
              </Column>
              
              <Column style="width: 50px; text-align: center;">
                <template #body="slotProps">
                  <Button icon="pi pi-trash" severity="danger" text rounded @click="islemSil(slotProps.data)" />
                </template>
              </Column>
            </DataTable>
          </div>

          <!-- Sekme İçeriği 2: Ödemeler -->
          <div v-if="aktifTab === 'odemeler'" class="sekme-icerik">
            <DataTable :value="odemeler" responsiveLayout="scroll" emptyMessage="Kayıtlı ödeme bulunamadı." class="p-datatable-sm">
              <Column field="date" header="Tarih" style="width: 110px;">
                <template #body="slotProps">
                  {{ tarihFormatla(slotProps.data.date) }}
                </template>
              </Column>
              
              <Column field="payment_method" header="Yöntem" style="width: 110px;">
                <template #body="slotProps">
                  <span class="odeme-yontem-tag">{{ slotProps.data.payment_method }}</span>
                </template>
              </Column>
              
              <Column field="description" header="Açıklama">
                <template #body="slotProps">
                  {{ slotProps.data.description || 'Genel Ödeme' }}
                  <div v-if="slotProps.data.transaction_description" class="bagli-islem-bilgi">
                    <i class="pi pi-link" /> Bağlı Fiş/İş: {{ slotProps.data.transaction_description }}
                  </div>
                </template>
              </Column>
              
              <Column field="amount" header="Tutar" style="text-align: right; width: 110px;">
                <template #body="slotProps">
                  <span style="font-weight: 700; color: #34d399;">{{ tlFormatla(slotProps.data.amount) }}</span>
                </template>
              </Column>
              
              <Column style="width: 50px; text-align: center;">
                <template #body="slotProps">
                  <Button icon="pi pi-trash" severity="danger" text rounded @click="odemeSil(slotProps.data)" />
                </template>
              </Column>
            </DataTable>
          </div>

        </div>
      </div>

    </div>

    <!-- DIALOG 1: Cari Ekle / Düzenle -->
    <Dialog 
      v-model:visible="cariDialogAcik" 
      :header="cariForm.id ? 'Cari Hesap Bilgilerini Düzenle' : 'Yeni Cari Hesap Kaydı'" 
      :style="{ width: '460px' }" 
      modal
    >
      <div class="dialog-form">
        <div class="form-group">
          <label>Firma / Kişi Adı <span class="zorunlu-alan">*</span></label>
          <InputText v-model="cariForm.name" placeholder="Örn: Öz Hilal Rektefiye Sanayi veya Ahmet Demir" autofocus />
          <span class="form-helper">Cari firmanın resmi adını ya da kişinin adını ve soyadını yazın.</span>
        </div>
        
        <div class="form-group">
          <label>Cari Tipi <span class="zorunlu-alan">*</span></label>
          <Dropdown 
            v-model="cariForm.type" 
            :options="dinamikCariTipleri" 
            editable 
            placeholder="Cari tipi seçin veya yazın (Örn: Parçacı)" 
            style="width: 100%;"
          />
          <span class="form-helper">Tedarikçinin kategorisi (Örn: Parçacı, Kaportacı). Seçebilir ya da yeni yazabilirsiniz.</span>
        </div>
        
        <div class="form-group">
          <label>Telefon Numarası</label>
          <InputText v-model="cariForm.phone" placeholder="Örn: 0555 123 4567" />
          <span class="form-helper">İletişim için cep veya iş telefonu numarası.</span>
        </div>
        
        <div class="form-group">
          <label>Açıklama / Özel Not</label>
          <InputText v-model="cariForm.note" placeholder="Örn: Ödemeler ay sonu yapılır, motor rektefiye iş ortağı" />
          <span class="form-helper">Cari hesaba dair özel vade anlaşmaları, fatura detayları veya genel notlar.</span>
        </div>
      </div>
      
      <template #footer>
        <Button label="İptal" icon="pi pi-times" text @click="cariDialogAcik = false" />
        <Button label="Kaydet" icon="pi pi-check" severity="info" @click="cariKaydet" />
      </template>
    </Dialog>

    <!-- DIALOG 2: Cari İşlem Ekle (Borç Kaydı) -->
    <Dialog 
      v-model:visible="islemDialogAcik" 
      header="Cari İşlem Ekle (Borç Kaydı)" 
      :style="{ width: '520px' }" 
      modal
    >
      <div class="dialog-form" v-if="seciliCari">
        <div class="form-group">
          <label>Cari Hesap</label>
          <InputText :value="seciliCari.name" readonly style="background-color: #1e293b; color: #94a3b8;" class="form-readonly-input" />
        </div>

        <div class="form-row-two">
          <div class="form-group">
            <label>Fiş / İşlem Tarihi <span class="zorunlu-alan">*</span></label>
            <input type="date" v-model="islemForm.date" class="tarih-input" />
            <span class="form-helper">İşlemin yapıldığı fatura/fiş tarihi.</span>
          </div>
          
          <div class="form-group">
            <label>İşlem Tipi <span class="zorunlu-alan">*</span></label>
            <Dropdown v-model="islemForm.transaction_type" :options="islemTipleri" style="width: 100%;" />
            <span class="form-helper">İşlemin finansal kategorisi.</span>
          </div>
        </div>

        <div class="form-group">
          <label>Tutar (TL) <span class="zorunlu-alan">*</span></label>
          <input type="number" step="0.01" v-model="islemForm.amount" class="tarih-input" placeholder="0.00" />
          <span class="form-helper">Borç olarak kaydedilecek tutar (KDV dahil).</span>
        </div>

        <div class="form-group">
          <label>Yapılan İş / Alınan Mal (Açıklama) <span class="zorunlu-alan">*</span></label>
          <InputText v-model="islemForm.description" placeholder="Örn: Motor rektefiye & kapak taşlama veya 4 Adet Lastik Alımı" />
          <span class="form-helper">Alınan hizmetin veya parçanın kısa detayı.</span>
        </div>

        <div class="form-group">
          <label>İlişkili Araç (İsteğe Bağlı)</label>
          <Dropdown 
            v-model="islemForm.vehicle_id" 
            :options="araclarListesi" 
            optionLabel="plate" 
            optionValue="id" 
            placeholder="Araç plaka seçin"
            filter
            showClear
            style="width: 100%;"
          >
            <template #option="slotProps">
              {{ slotProps.option.plate }} - {{ slotProps.option.brand }} {{ slotProps.option.model }} ({{ slotProps.option.customer_name }})
            </template>
          </Dropdown>
          <span class="form-helper">Bu borç belirli bir araca aitse seçebilirsiniz.</span>
        </div>

        <div class="form-group">
          <label>İlişkili İş Emri (İsteğe Bağlı)</label>
          <Dropdown 
            v-model="islemForm.work_order_id" 
            :options="isEmirleriListesi" 
            optionLabel="id" 
            optionValue="id" 
            placeholder="İş emri seçin"
            filter
            showClear
            style="width: 100%;"
          >
            <template #option="slotProps">
              İş Emri #{{ slotProps.option.id }} - {{ slotProps.option.plate }} ({{ slotProps.option.customer_name }}) [{{ slotProps.option.status }}]
            </template>
          </Dropdown>
          <span class="form-helper">Bu işlem aktif bir servis iş emri ile ilgiliyse finansal eşleşme sağlar.</span>
        </div>

        <div class="form-group">
          <label>Not / Ekstra Açıklama</label>
          <InputText v-model="islemForm.note" placeholder="Örn: Fatura No: 12345, Garanti verildi" />
          <span class="form-helper">Varsa fatura no, teslimat detayları veya diğer notlar.</span>
        </div>
      </div>
      
      <template #footer>
        <Button label="İptal" icon="pi pi-times" text @click="islemDialogAcik = false" />
        <Button label="Kaydet" icon="pi pi-check" severity="info" @click="islemKaydet" />
      </template>
    </Dialog>

    <!-- DIALOG 3: Ödeme Kaydet -->
    <Dialog 
      v-model:visible="odemeDialogAcik" 
      header="Ödeme Kaydet" 
      :style="{ width: '500px' }" 
      modal
    >
      <div class="dialog-form" v-if="seciliCari">
        <div class="form-group">
          <label>Cari Hesap</label>
          <InputText :value="seciliCari.name" readonly style="background-color: #1e293b; color: #94a3b8;" class="form-readonly-input" />
        </div>

        <div class="form-row-two">
          <div class="form-group">
            <label>Ödeme Tarihi <span class="zorunlu-alan">*</span></label>
            <input type="date" v-model="odemeForm.date" class="tarih-input" />
            <span class="form-helper">Ödemenin fiili yapıldığı tarih.</span>
          </div>
          
          <div class="form-group">
            <label>Ödeme Yöntemi <span class="zorunlu-alan">*</span></label>
            <Dropdown v-model="odemeForm.payment_method" :options="odemeYontemleri" style="width: 100%;" />
            <span class="form-helper">Yapılan ödeme kanalı.</span>
          </div>
        </div>

        <div class="form-group">
          <label>Ödeme Tutarı (TL) <span class="zorunlu-alan">*</span></label>
          <input type="number" step="0.01" v-model="odemeForm.amount" class="tarih-input" placeholder="0.00" />
          <span class="form-helper">Yapılan ödemenin tutarı.</span>
        </div>

        <div class="form-group">
          <label>İlişkili İş / Fiş (İsteğe Bağlı)</label>
          <Dropdown 
            v-model="odemeForm.transaction_id" 
            :options="islemler" 
            optionLabel="description" 
            optionValue="id" 
            placeholder="Belirli bir borç fişiyle eşleştirin"
            showClear
            style="width: 100%;"
          >
            <template #option="slotProps">
              {{ tarihFormatla(slotProps.option.date) }} - {{ slotProps.option.description }} ({{ tlFormatla(slotProps.option.amount) }})
            </template>
          </Dropdown>
          <span class="form-helper">Bu ödemeyi belirli bir borç faturasına bağlayarak o faturayı kapatabilirsiniz.</span>
        </div>

        <div class="form-group">
          <label>Ödeme Açıklaması</label>
          <InputText v-model="odemeForm.description" placeholder="Örn: Vakıfbank EFT - Dekont No: 98765 veya Nakit elden" />
          <span class="form-helper">Banka adı, dekont numarası, parayı teslim alan kişi vb. detaylar.</span>
        </div>
      </div>
      
      <template #footer>
        <Button label="İptal" icon="pi pi-times" text @click="odemeDialogAcik = false" />
        <Button label="Kaydet" icon="pi pi-check" severity="success" @click="odemeKaydet" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.cari-layout {
  display: flex;
  gap: 20px;
  height: calc(100vh - 240px);
  min-height: 500px;
}

.cari-sol-panel {
  flex: 1.1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.cari-sag-panel {
  flex: 0.9;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}

.cari-tablo {
  flex: 1;
  overflow-y: auto;
}

/* Badges for Cari types */
.cari-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  margin-top: 4px;
}
.cari-badge-buyuk {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 8px;
}

/* Color schemes for badges */
.parçacı { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
.kaportacı { background: rgba(139, 92, 246, 0.15); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); }
.boyacı { background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.3); }
.turbocu { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
.rektefiyeci { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
.tornacı { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
.elektrikçi { background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }
.egzozcu { background: rgba(107, 114, 128, 0.15); color: #9ca3af; border: 1px solid rgba(107, 114, 128, 0.3); }
.döşemeci { background: rgba(217, 70, 239, 0.15); color: #e879f9; border: 1px solid rgba(217, 70, 239, 0.3); }
.diğer { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }

/* Details view header styling */
.detay-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid #1f2937;
  padding-bottom: 15px;
  margin-bottom: 15px;
}
.detay-title {
  margin: 0;
  font-size: 1.4rem;
  color: #f9fafb;
}

.eylem-satiri {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.flex-1 {
  flex: 1;
}

.sekme-icerik {
  flex: 1;
}

/* Transaction List Inner styling */
.islem-type-tag {
  font-size: 0.88rem;
  background: #334155;
  color: #e2e8f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.iliskili-etiket-satir {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.iliskili-etiket {
  font-size: 0.82rem;
  background: rgba(56, 189, 248, 0.08);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.islem-not {
  display: block;
  font-size: 0.85rem;
  color: #64748b;
  margin-top: 4px;
  font-style: italic;
}
.bagli-islem-bilgi {
  font-size: 0.85rem;
  color: #64748b;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Form layouts */
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding-top: 10px;
}

/* Custom styles for native input type="date" and "number" to fit dark design */
.tarih-input {
  width: 100%;
  padding: 8px 12px;
  background-color: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  color: #f1f5f9;
  font-family: inherit;
  font-size: 1rem;
  outline: none;
}
.tarih-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.odeme-yontem-tag {
  font-size: 0.88rem;
  background: rgba(16, 185, 129, 0.1);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-box {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}

.stat-box:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--accent-color);
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-info h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: var(--text-title);
}

.stat-info span {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.stat-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.stat-icon-wrapper.red {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.stat-icon-wrapper.green {
  background: rgba(16, 185, 129, 0.1);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.stat-box.remaining-debt-box {
  border-left: 4px solid #34d399;
}

.stat-box.remaining-debt-box.has-debt {
  border-left: 4px solid #f87171;
}

.stat-box.remaining-debt-box h3 {
  color: #34d399;
}

.stat-box.remaining-debt-box.has-debt h3 {
  color: #f87171;
}

/* Light Theme overrides for statistics */
:global(html[data-theme="light"] .stat-box) {
  background: #ffffff !important;
  border-color: #e5e7eb !important;
  color: #111827 !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05) !important;
}
:global(html[data-theme="light"] .stat-box:hover) {
  border-color: #3b82f6 !important;
}
:global(html[data-theme="light"] .stat-info h3) {
  color: #111827 !important;
}
:global(html[data-theme="light"] .stat-box.remaining-debt-box h3) {
  color: #166534 !important;
}
:global(html[data-theme="light"] .stat-box.remaining-debt-box.has-debt h3) {
  color: #b91c1c !important;
}

/* List item improvements */
.cari-liste-ad {
  font-weight: 600;
  color: #f8fafc;
  font-size: 1.05rem;
  margin-bottom: 3px;
}
:global(html[data-theme="light"] .cari-liste-ad) {
  color: #111827;
}

.cari-liste-alt {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cari-liste-tel {
  font-size: 0.88rem;
  color: #94a3b8;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
:global(html[data-theme="light"] .cari-liste-tel) {
  color: #4b5563;
}

.bakiye-deger {
  font-weight: 700;
  font-size: 1.05rem;
}
.bakiye-deger.borclu {
  color: #f87171;
}
.bakiye-deger.borcsuz {
  color: #34d399;
}

.borc-odeme-detay {
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
  gap: 2px;
}
.borc-odeme-detay .borc {
  color: #94a3b8;
}
:global(html[data-theme="light"] .borc-odeme-detay .borc) {
  color: #4b5563;
}
.borc-odeme-detay .odeme {
  color: #34d399;
}

/* Highlighted Row */
:global(.cari-tablo .p-datatable-tbody > tr.p-highlight) {
  background: rgba(56, 189, 248, 0.08) !important;
  color: #38bdf8 !important;
  border-left: 3px solid #38bdf8;
}
:global(html[data-theme="light"] .cari-tablo .p-datatable-tbody > tr.p-highlight) {
  background: rgba(56, 189, 248, 0.12) !important;
}

/* Fallback Panel styles */
.fallback-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #94a3b8;
  padding: 40px 20px;
  border: 2px dashed rgba(148, 163, 184, 0.15);
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.2);
}
:global(html[data-theme="light"] .fallback-panel) {
  border-color: rgba(75, 85, 99, 0.2) !important;
  background: rgba(243, 244, 246, 0.5) !important;
  color: #4b5563 !important;
}

.fallback-icon-frame {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}
.fallback-icon-frame i {
  font-size: 2.2rem;
  color: #64748b;
}

.fallback-panel h3 {
  margin: 10px 0 5px;
  color: #f8fafc;
  font-size: 1.2rem;
  font-weight: 700;
}
:global(html[data-theme="light"] .fallback-panel h3) {
  color: #111827 !important;
}

.fallback-panel p {
  font-size: 0.95rem;
  max-width: 320px;
  line-height: 1.5;
  color: #64748b;
}
:global(html[data-theme="light"] .fallback-panel p) {
  color: #4b5563 !important;
}

/* Detail Panel and Header */
.detay-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.detay-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.detay-iletisim, .detay-not {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 0.95rem;
}
:global(html[data-theme="light"] .detay-iletisim),
:global(html[data-theme="light"] .detay-not) {
  color: #4b5563 !important;
}
.detay-not {
  background: rgba(59, 130, 246, 0.05);
  border-left: 3px solid #3b82f6;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.95rem;
  color: #cbd5e1;
  align-items: flex-start;
}
.detay-not i {
  margin-top: 3px;
  color: #3b82f6;
}
.detay-header-actions {
  display: flex;
  gap: 8px;
}

/* Balance Card layout */
.bakiye-kart {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  text-align: center;
  gap: 8px;
  margin-bottom: 20px;
}
:global(html[data-theme="light"] .bakiye-kart) {
  background: linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%) !important;
  border-color: #cbd5e1 !important;
}

.bakiye-sutun {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 0;
}
.bakiye-sutun:not(:last-child) {
  border-right: 1px solid #334155;
}
:global(html[data-theme="light"] .bakiye-sutun:not(:last-child)) {
  border-right-color: #cbd5e1 !important;
}

.bakiye-sutun .baslik {
  font-size: 0.85rem;
  text-transform: uppercase;
  color: #94a3b8;
  letter-spacing: 0.5px;
  font-weight: 700;
}
:global(html[data-theme="light"] .bakiye-sutun .baslik) {
  color: #4b5563 !important;
}

.bakiye-sutun .tutar {
  font-size: 1.25rem;
  font-weight: 800;
  color: #f8fafc;
  margin-top: 6px;
}
:global(html[data-theme="light"] .bakiye-sutun .tutar) {
  color: #111827 !important;
}

.bakiye-sutun.total-debt .tutar {
  color: #f87171;
}
:global(html[data-theme="light"] .bakiye-sutun.total-debt .tutar) {
  color: #dc2626 !important;
}

.bakiye-sutun.total-paid .tutar {
  color: #34d399;
}
:global(html[data-theme="light"] .bakiye-sutun.total-paid .tutar) {
  color: #16a34a !important;
}

.bakiye-sutun.remaining-debt .tutar {
  color: #34d399;
}
:global(html[data-theme="light"] .bakiye-sutun.remaining-debt .tutar) {
  color: #16a34a !important;
}

.bakiye-sutun.remaining-debt .tutar.has-debt {
  color: #f87171;
}
:global(html[data-theme="light"] .bakiye-sutun.remaining-debt .tutar.has-debt) {
  color: #dc2626 !important;
}

/* Detail Tabs */
.detay-sekmeler {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #334155;
  margin-bottom: 16px;
  padding-bottom: 1px;
}
:global(html[data-theme="light"] .detay-sekmeler) {
  border-bottom-color: #cbd5e1 !important;
}

.sekme-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #94a3b8;
  padding: 10px 18px;
  font-size: 0.98rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.2s ease-in-out;
  border-radius: 8px 8px 0 0;
}
.sekme-btn:hover {
  color: #f1f5f9;
  background: rgba(148, 163, 184, 0.05);
}
:global(html[data-theme="light"] .sekme-btn:hover) {
  color: #111827 !important;
  background: rgba(0, 0, 0, 0.03) !important;
}

.sekme-btn.aktif {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
  background: rgba(56, 189, 248, 0.06);
}
:global(html[data-theme="light"] .sekme-btn.aktif) {
  color: #0284c7 !important;
  border-bottom-color: #0284c7 !important;
  background: rgba(2, 132, 199, 0.06) !important;
}

/* Form layout helpers */
.zorunlu-alan {
  color: #ef4444;
  margin-left: 2px;
  font-weight: bold;
}
.form-helper {
  font-size: 0.82rem;
  color: #64748b;
  margin-top: 3px;
  line-height: 1.3;
}
:global(html[data-theme="light"] .form-helper) {
  color: #4b5563 !important;
}

.form-row-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 600px) {
  .form-row-two {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

.form-readonly-input {
  background-color: #1e293b !important;
  color: #94a3b8 !important;
  border-color: #334155 !important;
}
:global(html[data-theme="light"] .form-readonly-input) {
  background-color: #f3f4f6 !important;
  color: #4b5563 !important;
  border-color: #cbd5e1 !important;
}

:global(html[data-theme="light"] .tarih-input) {
  background-color: #ffffff !important;
  color: #111827 !important;
  border-color: #cbd5e1 !important;
}
:global(html[data-theme="light"] .tarih-input:focus) {
  border-color: #3b82f6 !important;
}

:global(html[data-theme="light"] .stat-icon-wrapper.red) {
  background: rgba(239, 68, 68, 0.1) !important;
  color: #dc2626 !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
}
:global(html[data-theme="light"] .stat-icon-wrapper.green) {
  background: rgba(16, 185, 129, 0.1) !important;
  color: #16a34a !important;
  border-color: rgba(16, 185, 129, 0.2) !important;
}

:global(html[data-theme="light"] .bakiye-deger.borclu) {
  color: #dc2626 !important;
}
:global(html[data-theme="light"] .bakiye-deger.borcsuz) {
  color: #16a34a !important;
}

:global(html[data-theme="light"] .islem-type-tag) {
  background: #e5e7eb !important;
  color: #374151 !important;
}

:global(html[data-theme="light"] .iliskili-etiket) {
  background: rgba(2, 132, 199, 0.08) !important;
  color: #0284c7 !important;
  border-color: rgba(2, 132, 199, 0.2) !important;
}

:global(html[data-theme="light"] .odeme-yontem-tag) {
  background: rgba(16, 185, 129, 0.1) !important;
  color: #10b981 !important;
  border-color: rgba(16, 185, 129, 0.25) !important;
}

:global(html[data-theme="light"] .parçacı) { background: rgba(59, 130, 246, 0.1) !important; color: #1d4ed8 !important; border-color: rgba(59, 130, 246, 0.25) !important; }
:global(html[data-theme="light"] .kaportacı) { background: rgba(139, 92, 246, 0.1) !important; color: #6d28d9 !important; border-color: rgba(139, 92, 246, 0.25) !important; }
:global(html[data-theme="light"] .boyacı) { background: rgba(236, 72, 153, 0.1) !important; color: #be185d !important; border-color: rgba(236, 72, 153, 0.25) !important; }
:global(html[data-theme="light"] .turbocu) { background: rgba(245, 158, 11, 0.1) !important; color: #b45309 !important; border-color: rgba(245, 158, 11, 0.25) !important; }
:global(html[data-theme="light"] .rektefiyeci) { background: rgba(239, 68, 68, 0.1) !important; color: #b91c1c !important; border-color: rgba(239, 68, 68, 0.25) !important; }
:global(html[data-theme="light"] .tornacı) { background: rgba(16, 185, 129, 0.1) !important; color: #047857 !important; border-color: rgba(16, 185, 129, 0.25) !important; }
:global(html[data-theme="light"] .elektrikçi) { background: rgba(6, 182, 212, 0.1) !important; color: #0e7490 !important; border-color: rgba(6, 182, 212, 0.25) !important; }
:global(html[data-theme="light"] .egzozcu) { background: rgba(107, 114, 128, 0.1) !important; color: #4b5563 !important; border-color: rgba(107, 114, 128, 0.25) !important; }
:global(html[data-theme="light"] .döşemeci) { background: rgba(217, 70, 239, 0.1) !important; color: #a21caf !important; border-color: rgba(217, 70, 239, 0.25) !important; }
:global(html[data-theme="light"] .diğer) { background: rgba(148, 163, 184, 0.1) !important; color: #475569 !important; border-color: rgba(148, 163, 184, 0.25) !important; }

:global(html[data-theme="light"] .cari-tablo .p-datatable-tbody > tr.p-highlight) {
  background: rgba(56, 189, 248, 0.12) !important;
  color: #0369a1 !important;
}
</style>
