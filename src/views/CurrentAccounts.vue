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
    <div class="stat-grid" style="margin-bottom: 20px;">
      <div class="stat-box">
        <h3>{{ tlFormatla(genelOzet.totalDebt) }}</h3>
        <span>Toplam Cari Borç</span>
      </div>
      <div class="stat-box">
        <h3 style="color: #10b981;">{{ tlFormatla(genelOzet.totalPaid) }}</h3>
        <span>Toplam Yapılan Ödeme</span>
      </div>
      <div class="stat-box" :style="{ borderLeft: genelOzet.remainingDebt > 0 ? '4px solid #ef4444' : '4px solid #10b981' }">
        <h3 :style="{ color: genelOzet.remainingDebt > 0 ? '#ef4444' : '#10b981' }">
          {{ tlFormatla(genelOzet.remainingDebt) }}
        </h3>
        <span>Kalan Net Borç</span>
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
              <div style="font-weight: 600; color: #f8fafc;">{{ slotProps.data.name }}</div>
              <span class="cari-badge" :class="slotProps.data.type.toLowerCase()">{{ slotProps.data.type }}</span>
            </template>
          </Column>
          
          <Column field="remaining_debt" header="Net Kalan" style="text-align: right;">
            <template #body="slotProps">
              <span :style="{ 
                color: slotProps.data.remaining_debt > 0.01 ? '#f87171' : '#34d399', 
                fontWeight: '700' 
              }">
                {{ tlFormatla(slotProps.data.remaining_debt) }}
              </span>
            </template>
          </Column>
          
          <Column header="Borç / Ödeme" style="text-align: right; width: 160px; font-size: 0.85rem;">
            <template #body="slotProps">
              <div style="color: #94a3b8;">Borç: {{ tlFormatla(slotProps.data.total_debt) }}</div>
              <div style="color: #34d399;">Ödeme: {{ tlFormatla(slotProps.data.total_paid) }}</div>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- Sağ Detay Bölümü -->
      <div class="cari-sag-panel panel">
        
        <!-- Cari Seçilmediyse Fallback Görünümü -->
        <div v-if="!seciliCari" class="fallback-panel">
          <i class="pi pi-wallet" style="font-size: 3.5rem; color: #475569; margin-bottom: 15px;" />
          <h3>Cari Hesap Seçilmedi</h3>
          <p>Detayları, işlem geçmişini ve ödeme hareketlerini görüntülemek için sol taraftaki listeden bir cari hesap seçin.</p>
        </div>

        <!-- Cari Detay Arayüzü -->
        <div v-else class="detay-panel">
          <div class="detay-header">
            <div>
              <span class="cari-badge-buyuk" :class="seciliCari.type.toLowerCase()">{{ seciliCari.type }}</span>
              <h3 class="detay-title">{{ seciliCari.name }}</h3>
              <div class="detay-iletisim" v-if="seciliCari.phone">
                <i class="pi pi-phone" /> {{ seciliCari.phone }}
              </div>
              <div class="detay-not" v-if="seciliCari.note">
                <strong>Not:</strong> {{ seciliCari.note }}
              </div>
            </div>
            
            <div class="detay-header-actions">
              <Button icon="pi pi-pencil" outlined rounded severity="info" @click="cariDuzenle(seciliCari)" style="margin-right: 8px;" />
              <Button icon="pi pi-trash" outlined rounded severity="danger" @click="cariSil(seciliCari)" />
            </div>
          </div>

          <!-- Seçili Cari Bakiyesi -->
          <div class="bakiye-kart">
            <div class="bakiye-sutun">
              <span class="baslik">Toplam Borç</span>
              <span class="tutar">{{ tlFormatla(seciliCari.total_debt) }}</span>
            </div>
            <div class="bakiye-sutun">
              <span class="baslik">Yapılan Ödeme</span>
              <span class="tutar" style="color: #34d399;">{{ tlFormatla(seciliCari.total_paid) }}</span>
            </div>
            <div class="bakiye-sutun">
              <span class="baslik">Kalan Borç</span>
              <span class="tutar" :style="{ color: seciliCari.remaining_debt > 0.01 ? '#f87171' : '#34d399' }">
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
      :style="{ width: '450px' }" 
      modal
    >
      <div class="dialog-form">
        <div class="form-group">
          <label>Firma / Kişi Adı <span style="color: #ef4444;">*</span></label>
          <InputText v-model="cariForm.name" placeholder="Örn: Öz Hilal Rektefiye Sanayi" autofocus />
        </div>
        
        <div class="form-group">
          <label>Cari Tipi <span style="color: #ef4444;">*</span></label>
          <InputText v-model="cariForm.type" placeholder="Örn: Turbocu, Rektefiyeci, Lastikçi" />
        </div>
        
        <div class="form-group">
          <label>Telefon Numarası</label>
          <InputText v-model="cariForm.phone" placeholder="Örn: 0555 123 4567" />
        </div>
        
        <div class="form-group">
          <label>Açıklama / Özel Not</label>
          <InputText v-model="cariForm.note" placeholder="Örn: Vade toleransı var, motor rektefiye işi" />
        </div>
      </div>
      
      <template #footer>
        <Button label="İptal" icon="pi pi-times" text @click="cariDialogAcik = false" />
        <Button label="Kaydet" icon="pi pi-check" severity="info" @click="cariKaydet" />
      </template>
    </Dialog>

    <!-- DIALOG 2: İşlem Ekle -->
    <Dialog 
      v-model:visible="islemDialogAcik" 
      header="Cari İşlem Ekle (Borç Kaydı)" 
      :style="{ width: '500px' }" 
      modal
    >
      <div class="dialog-form" v-if="seciliCari">
        <div class="form-group">
          <label>Cari Hesap</label>
          <InputText :value="seciliCari.name" readonly style="background-color: #1e293b; color: #94a3b8;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div class="form-group">
            <label>Fiş / İşlem Tarihi <span style="color: #ef4444;">*</span></label>
            <input type="date" v-model="islemForm.date" class="tarih-input" />
          </div>
          
          <div class="form-group">
            <label>İşlem Tipi <span style="color: #ef4444;">*</span></label>
            <Dropdown v-model="islemForm.transaction_type" :options="islemTipleri" />
          </div>
        </div>

        <div class="form-group">
          <label>Tutar (TL) <span style="color: #ef4444;">*</span></label>
          <input type="number" step="0.01" v-model="islemForm.amount" class="tarih-input" placeholder="Tutar girin" />
        </div>

        <div class="form-group">
          <label>Yapılan İş / Alınan Mal (Açıklama) <span style="color: #ef4444;">*</span></label>
          <InputText v-model="islemForm.description" placeholder="Örn: Motor rektefiye & kapak taşlama" />
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
          >
            <template #option="slotProps">
              {{ slotProps.option.plate }} - {{ slotProps.option.brand }} {{ slotProps.option.model }} ({{ slotProps.option.customer_name }})
            </template>
          </Dropdown>
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
          >
            <template #option="slotProps">
              İş Emri #{{ slotProps.option.id }} - {{ slotProps.option.plate }} ({{ slotProps.option.customer_name }}) [{{ slotProps.option.status }}]
            </template>
          </Dropdown>
        </div>

        <div class="form-group">
          <label>Not / Ekstra Açıklama</label>
          <InputText v-model="islemForm.note" placeholder="Örn: 2 gün sürdü, garanti verildi" />
        </div>
      </div>
      
      <template #footer>
        <Button label="İptal" icon="pi pi-times" text @click="islemDialogAcik = false" />
        <Button label="Kaydet" icon="pi pi-check" severity="info" @click="islemKaydet" />
      </template>
    </Dialog>

    <!-- DIALOG 3: Ödeme Ekle -->
    <Dialog 
      v-model:visible="odemeDialogAcik" 
      header="Ödeme Kaydet" 
      :style="{ width: '480px' }" 
      modal
    >
      <div class="dialog-form" v-if="seciliCari">
        <div class="form-group">
          <label>Cari Hesap</label>
          <InputText :value="seciliCari.name" readonly style="background-color: #1e293b; color: #94a3b8;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div class="form-group">
            <label>Ödeme Tarihi <span style="color: #ef4444;">*</span></label>
            <input type="date" v-model="odemeForm.date" class="tarih-input" />
          </div>
          
          <div class="form-group">
            <label>Ödeme Yöntemi <span style="color: #ef4444;">*</span></label>
            <Dropdown v-model="odemeForm.payment_method" :options="odemeYontemleri" />
          </div>
        </div>

        <div class="form-group">
          <label>Ödeme Tutarı (TL) <span style="color: #ef4444;">*</span></label>
          <input type="number" step="0.01" v-model="odemeForm.amount" class="tarih-input" placeholder="Ödeme tutarı girin" />
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
          >
            <template #option="slotProps">
              {{ tarihFormatla(slotProps.option.date) }} - {{ slotProps.option.description }} ({{ tlFormatla(slotProps.option.amount) }})
            </template>
          </Dropdown>
        </div>

        <div class="form-group">
          <label>Ödeme Açıklaması</label>
          <InputText v-model="odemeForm.description" placeholder="Örn: Nakit elden ödendi, EFT yapıldı" />
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

/* Fallback panel styling */
.fallback-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #64748b;
  padding: 30px;
}
.fallback-panel h3 {
  margin: 10px 0 5px;
  color: #cbd5e1;
}
.fallback-panel p {
  font-size: 0.9rem;
  max-width: 320px;
  line-height: 1.4;
}

/* Badges for Cari types */
.cari-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  margin-top: 4px;
}
.cari-badge-buyuk {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
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
.detay-iletisim {
  color: #94a3b8;
  font-size: 0.9rem;
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.detay-not {
  background: #1e293b;
  border-left: 3px solid #3b82f6;
  padding: 8px 12px;
  border-radius: 4px;
  margin-top: 8px;
  font-size: 0.85rem;
  color: #cbd5e1;
}

/* Balance Card layout */
.bakiye-kart {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 15px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  text-align: center;
  gap: 10px;
  margin-bottom: 15px;
}
.bakiye-sutun {
  display: flex;
  flex-direction: column;
}
.bakiye-sutun .baslik {
  font-size: 0.78rem;
  text-transform: uppercase;
  color: #94a3b8;
  letter-spacing: 0.5px;
}
.bakiye-sutun .tutar {
  font-size: 1.15rem;
  font-weight: 700;
  color: #ef4444;
  margin-top: 4px;
}

.eylem-satiri {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.flex-1 {
  flex: 1;
}

/* Detail Tabs */
.detay-sekmeler {
  display: flex;
  gap: 5px;
  border-bottom: 1px solid #1f2937;
  margin-bottom: 12px;
}
.sekme-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #94a3b8;
  padding: 8px 16px;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  transition: all 0.2s;
  border-radius: 4px 4px 0 0;
}
.sekme-btn:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.03);
}
.sekme-btn.aktif {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}

.sekme-icerik {
  flex: 1;
}

/* Transaction List Inner styling */
.islem-type-tag {
  font-size: 0.78rem;
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
  font-size: 0.72rem;
  background: #020617;
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.2);
  padding: 1px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.islem-not {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 4px;
  font-style: italic;
}
.bagli-islem-bilgi {
  font-size: 0.75rem;
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
  font-size: 0.95rem;
  outline: none;
}
.tarih-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.odeme-yontem-tag {
  font-size: 0.78rem;
  background: rgba(16, 185, 129, 0.1);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
</style>
