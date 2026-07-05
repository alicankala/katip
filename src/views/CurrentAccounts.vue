<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
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
const yonFiltresi = ref('Tümü') // Tümü, Alacaklar, Borçlar
const aktifAnaSekme = ref('genel-ozet')

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
  note: '',
  direction: 'Borç'
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
    list = list.filter(c => {
      const rem = Number(c.remaining_debt || 0)
      const dir = c.direction || 'Borç'
      if (dir === 'Borç') {
        return rem > 0.01
      } else {
        return rem < -0.01
      }
    })
  }

  // Yön filtresi
  if (yonFiltresi.value === 'Alacaklar') {
    list = list.filter(c => (c.direction || 'Borç') === 'Alacak')
  } else if (yonFiltresi.value === 'Borçlar') {
    list = list.filter(c => (c.direction || 'Borç') === 'Borç')
  }

  return list
})

// İstatistikler (Filtrelenmiş veya tümü üzerinden)
const genelOzet = computed(() => {
  let totalDebt = 0   // Bizim toplam borcumuz (Payable)
  let totalCredit = 0 // Bizim toplam alacağımız (Receivable)
  
  cariler.value.forEach(c => {
    const rem = Number(c.remaining_debt || 0)
    const dir = c.direction || 'Borç'

    if (dir === 'Borç') {
      if (rem > 0.01) {
        totalDebt += rem
      } else if (rem < -0.01) {
        totalCredit += Math.abs(rem)
      }
    } else { // Alacak
      if (rem > 0.01) {
        totalCredit += rem
      } else if (rem < -0.01) {
        totalDebt += Math.abs(rem)
      }
    }
  })

  const netDurum = totalCredit - totalDebt

  return {
    totalDebt,
    totalCredit,
    netDurum,
    durumMetni: netDurum >= 0 ? 'Net Alacaklıyız' : 'Net Borçluyuz'
  }
})

const bakiyeSinifi = (cari) => {
  if (!cari) return ''
  const rem = Number(cari.remaining_debt || 0)
  const dir = cari.direction || 'Borç'
  if (dir === 'Borç') {
    return rem > 0.01 ? 'borclu' : 'borcsuz'
  } else {
    return rem > 0.01 ? 'borcsuz' : 'borclu'
  }
}

const bakiyeMetni = (cari) => {
  if (!cari) return ''
  const rem = Number(cari.remaining_debt || 0)
  const dir = cari.direction || 'Borç'
  if (Math.abs(rem) < 0.01) return 'Dengede'
  if (dir === 'Borç') {
    return rem > 0.01 ? 'Borcumuz' : 'Alacağımız'
  } else {
    return rem > 0.01 ? 'Alacağımız' : 'Borcumuz'
  }
}

// Cari Ekle / Düzenle İşlemleri
const cariDuzenle = (cari) => {
  Object.assign(cariForm, {
    id: cari.id,
    name: cari.name,
    type: cari.type,
    phone: cari.phone,
    note: cari.note,
    direction: cari.direction || 'Borç'
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
      Object.assign(cariForm, { id: null, name: '', type: '', phone: '', note: '', direction: 'Borç' })
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

// Gider Değişkenleri ve Form İşlemleri
const giderler = ref([])
const giderFormDialog = ref(false)
const isEditingGider = ref(false)
const giderAramaMetni = ref('')
const seciliGiderDurumFiltresi = ref('Tümü')
const seciliGiderTurFiltresi = ref('Tümü')

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


const giderForm = ref({
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

const resetGiderForm = () => {
  const bugun = new Date().toISOString().slice(0, 10)
  giderForm.value = {
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
}

const giderleriYukle = async () => {
  try {
    const res = await window.api.giderleriGetir()
    if (res?.success) {
      giderler.value = Array.isArray(res.giderler) ? res.giderler : []
    }
  } catch (error) {
    console.error('Giderleri yükleme hatası:', error)
  }
}

const filtrelenmisGiderler = computed(() => {
  let list = giderler.value

  // Arama metni
  if (giderAramaMetni.value) {
    const aranan = giderAramaMetni.value.toLowerCase()
    list = list.filter(g =>
      (g.expense_type || '').toLowerCase().includes(aranan) ||
      (g.company_name || '').toLowerCase().includes(aranan) ||
      (g.note || '').toLowerCase().includes(aranan)
    )
  }

  // Durum filtresi
  if (seciliGiderDurumFiltresi.value !== 'Tümü') {
    list = list.filter(g => g.status === seciliGiderDurumFiltresi.value)
  }

  // Tür filtresi
  if (seciliGiderTurFiltresi.value !== 'Tümü') {
    list = list.filter(g => g.expense_type === seciliGiderTurFiltresi.value)
  }

  return list
})

const genelGiderOzeti = computed(() => {
  let odenmis = 0
  let odenmemis = 0
  
  giderler.value.forEach(g => {
    const amt = Number(g.amount || 0)
    if (g.status === 'Ödendi') {
      odenmis += amt
    } else {
      odenmemis += amt
    }
  })

  return {
    odenmis,
    odenmemis,
    toplam: odenmis + odenmemis
  }
})

const tumHareketlerListesi = computed(() => {
  const list = []

  // Cari işlemler ve ödemeler ekle
  cariler.value.forEach(c => {
    const txs = c.transactions || []
    txs.forEach(tx => {
      list.push({
        tarih: tx.date,
        cari_adi: c.name,
        hareket_turu: 'İşlem',
        islem_detayi: tx.transaction_type,
        aciklama: tx.description || 'Cari İşlem',
        tutar: Number(tx.amount || 0),
        yon: c.direction === 'Alacak' ? 'Alacak' : 'Borç'
      })
    })

    const pms = c.payments || []
    pms.forEach(pm => {
      list.push({
        tarih: pm.date,
        cari_adi: c.name,
        hareket_turu: 'Ödeme/Tahsilat',
        islem_detayi: pm.payment_method,
        aciklama: pm.description || (c.direction === 'Alacak' ? 'Tahsilat' : 'Ödeme'),
        tutar: Number(pm.amount || 0),
        yon: c.direction === 'Alacak' ? 'Tahsilat' : 'Ödeme'
      })
    })
  })

  // Genel giderler ekle
  giderler.value.forEach(g => {
    list.push({
      tarih: g.expense_date,
      cari_adi: g.company_name || 'Genel Gider',
      hareket_turu: 'Gider',
      islem_detayi: g.expense_type,
      aciklama: `${g.status === 'Ödendi' ? 'Ödendi' : 'Ödenmedi'} - ${g.note || ''}`,
      tutar: Number(g.amount || 0),
      yon: 'Gider'
    })
  })

  // Tarihe göre azalan sırala
  return list.sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
})

const giderEkleDialogAc = () => {
  isEditingGider.value = false
  resetGiderForm()
  giderFormDialog.value = true
}

const giderDuzenle = (gider) => {
  isEditingGider.value = true
  giderForm.value = { ...gider }
  giderFormDialog.value = true
}

const giderKaydet = async () => {
  if (!giderForm.value.expense_type) {
    uyariMesaji('Gider türü seçilmelidir.')
    return
  }
  if (!giderForm.value.amount || Number(giderForm.value.amount) <= 0) {
    uyariMesaji('Tutar sıfırdan büyük olmalıdır.')
    return
  }

  try {
    const payload = {
      ...giderForm.value,
      amount: Number(giderForm.value.amount) || 0
    }

    let res
    if (isEditingGider.value) {
      res = await window.api.giderGuncelle(payload)
    } else {
      res = await window.api.giderEkle(payload)
    }

    if (res?.success) {
      basariMesaji(isEditingGider.value ? 'Gider kaydı güncellendi.' : 'Gider kaydı eklendi.')
      giderFormDialog.value = false
      await giderleriYukle()
    } else {
      hataMesaji(res?.error || 'Gider kaydedilemedi.')
    }
  } catch (error) {
    hataMesaji('Bir hata oluştu: ' + error.message)
  }
}

const giderSil = (gider) => {
  confirmDialog.require({
    message: `"${gider.expense_type}" türündeki gider kaydını silmek istediğinize emin misiniz?`,
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
          basariMesaji('Gider kaydı silindi.')
          await giderleriYukle()
        } else {
          hataMesaji(res?.error || 'Gider silinemedi.')
        }
      } catch (error) {
        hataMesaji('Silme sırasında hata oluştu.')
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
      basariMesaji('Ödeme kaydedildi (EFT/Havale).')
      await giderleriYukle()
} else {
      hataMesaji(res?.error || 'Ödeme kaydedilemedi.')
    }
  } catch (error) {
    hataMesaji('Ödeme sırasında hata oluştu.')
  }
}

// Lifecycle Hooks
onMounted(async () => {
  await carileriYukle()
  await iliskiliVerileriYukle()
  await giderleriYukle()

  const route = useRoute()
  if (route.query.tab === 'giderler') {
    aktifAnaSekme.value = 'giderler'
  }
})
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2 class="page-title">Cari Hesap Takibi</h2>
        <p class="page-subtitle">Tedarikçiler, müşteriler, taşeron ustalar ve işletme giderlerinin tek ekrandan finans yönetimi</p>
      </div>
      
      <div style="display: flex; gap: 8px;">
        <Button 
          v-if="aktifAnaSekme === 'giderler'"
          label="Yeni Gider Kaydı Ekle" 
          icon="pi pi-plus" 
          severity="warning" 
          @click="giderEkleDialogAc" 
        />
        <Button 
          v-else
          label="Yeni Cari Hesap Ekle" 
          icon="pi pi-plus" 
          severity="info" 
          @click="Object.assign(cariForm, { id: null, name: '', type: '', phone: '', note: '', direction: 'Borç' }); cariDialogAcik = true" 
        />
      </div>
    </div>

    <!-- Üst Sekme Menüsü -->
    <div class="tab-menu" style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid #334155; padding-bottom: 10px; flex-wrap: wrap;">
      <Button 
        label="Genel Özet" 
        icon="pi pi-th-large" 
        :text="aktifAnaSekme !== 'genel-ozet'"
        severity="info" 
        @click="aktifAnaSekme = 'genel-ozet'" 
      />
      <Button 
        label="Alacaklar" 
        icon="pi pi-arrow-down-left" 
        :text="aktifAnaSekme !== 'alacaklar'"
        severity="success" 
        @click="aktifAnaSekme = 'alacaklar'; yonFiltresi = 'Alacaklar'" 
      />
      <Button 
        label="Borçlar" 
        icon="pi pi-up-right" 
        :text="aktifAnaSekme !== 'borclar'"
        severity="danger" 
        @click="aktifAnaSekme = 'borclar'; yonFiltresi = 'Borçlar'" 
      />
      <Button 
        label="Giderler" 
        icon="pi pi-receipt" 
        :text="aktifAnaSekme !== 'giderler'"
        severity="warning" 
        @click="aktifAnaSekme = 'giderler'" 
      />
      <Button 
        label="Tüm Hareketler" 
        icon="pi pi-list" 
        :text="aktifAnaSekme !== 'tum-hareketler'"
        severity="secondary" 
        @click="aktifAnaSekme = 'tum-hareketler'" 
      />
    </div>

    <!-- 1. SEKME: Genel Özet -->
    <div v-if="aktifAnaSekme === 'genel-ozet'" class="genel-ozet-section" style="display: flex; flex-direction: column; gap: 20px;">
      <!-- İstatistik Kartları -->
      <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
        <div class="stat-box" style="border-left: 4px solid #34d399;">
          <div class="stat-info">
            <h3 style="color: #34d399; font-size: 1.8rem; font-weight: 700; margin: 0;">{{ tlFormatla(genelOzet.totalCredit) }}</h3>
            <span style="color: #94a3b8; font-size: 14px;">Toplam Alacak</span>
          </div>
          <div class="stat-icon-wrapper green" style="background: rgba(16, 185, 129, 0.1); color: #34d399; padding: 10px; border-radius: 8px;">
            <i class="pi pi-arrow-down-left" />
          </div>
        </div>

        <div class="stat-box" style="border-left: 4px solid #f87171;">
          <div class="stat-info">
            <h3 style="color: #f87171; font-size: 1.8rem; font-weight: 700; margin: 0;">{{ tlFormatla(genelOzet.totalDebt) }}</h3>
            <span style="color: #94a3b8; font-size: 14px;">Toplam Borç</span>
          </div>
          <div class="stat-icon-wrapper red" style="background: rgba(239, 68, 68, 0.1); color: #f87171; padding: 10px; border-radius: 8px;">
            <i class="pi pi-arrow-up-right" />
          </div>
        </div>

        <div class="stat-box remaining-debt-box" :class="{ 'has-debt': genelOzet.netDurum < 0 }" style="border-left: 4px solid #38bdf8;">
          <div class="stat-info">
            <h3 style="font-size: 1.8rem; font-weight: 700; margin: 0;" :style="{ color: genelOzet.netDurum >= 0 ? '#34d399' : '#f87171' }">
              {{ tlFormatla(Math.abs(genelOzet.netDurum)) }}
            </h3>
            <span style="color: #94a3b8; font-size: 14px;">Net Cari Durum ({{ genelOzet.durumMetni }})</span>
          </div>
          <div class="stat-icon-wrapper" :class="genelOzet.netDurum >= 0 ? 'green' : 'red'" style="padding: 10px; border-radius: 8px;">
            <i class="pi pi-wallet" />
          </div>
        </div>

        <div class="stat-box" style="border-left: 4px solid #fb923c;">
          <div class="stat-info">
            <h3 style="color: #fb923c; font-size: 1.8rem; font-weight: 700; margin: 0;">{{ tlFormatla(genelGiderOzeti.toplam) }}</h3>
            <span style="color: #94a3b8; font-size: 14px;">Toplam Gider</span>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
              Ödenmiş: {{ tlFormatla(genelGiderOzeti.odenmis) }} | Ödenmemiş: {{ tlFormatla(genelGiderOzeti.odenmemis) }}
            </div>
          </div>
          <div class="stat-icon-wrapper" style="background: rgba(251, 146, 60, 0.1); color: #fb923c; padding: 10px; border-radius: 8px;">
            <i class="pi pi-receipt" />
          </div>
        </div>

        <div class="stat-box" :style="{ borderLeft: '4px solid ' + (genelOzet.netDurum - genelGiderOzeti.odenmemis >= 0 ? '#34d399' : '#f87171') }">
          <div class="stat-info">
            <h3 style="font-size: 1.8rem; font-weight: 700; margin: 0;" :style="{ color: genelOzet.netDurum - genelGiderOzeti.odenmemis >= 0 ? '#34d399' : '#f87171' }">
              {{ tlFormatla(Math.abs(genelOzet.netDurum - genelGiderOzeti.odenmemis)) }}
            </h3>
            <span style="color: #94a3b8; font-size: 14px;">Net İşletme Durumu ({{ genelOzet.netDurum - genelGiderOzeti.odenmemis >= 0 ? 'Net Artıdayız' : 'Net Eksideyiz' }})</span>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
              Net Cari Durum - Ödenmemiş Giderler
            </div>
          </div>
          <div class="stat-icon-wrapper" :class="genelOzet.netDurum - genelGiderOzeti.odenmemis >= 0 ? 'green' : 'red'" style="padding: 10px; border-radius: 8px;">
            <i class="pi pi-chart-pie" />
          </div>
        </div>
      </div>

      <!-- Hızlı Özet Blokları -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px;">
        <div class="panel" style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px;">
          <h4 style="color: #38bdf8; margin: 0 0 12px; border-bottom: 1px solid #334155; padding-bottom: 8px;">En Yüksek Açık Cari Bakiyeler</h4>
          <div v-if="cariler.filter(c => Math.abs(c.remaining_debt) > 0.01).length === 0" style="color: #94a3b8; text-align: center; padding: 20px 0;">
            Açık cari bakiye bulunamadı.
          </div>
          <div v-else style="display: flex; flex-direction: column; gap: 10px;">
            <div 
              v-for="c in cariler.filter(c => Math.abs(c.remaining_debt) > 0.01).sort((a,b) => Math.abs(b.remaining_debt) - Math.abs(a.remaining_debt)).slice(0, 5)" 
              :key="c.id" 
              style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #334155;"
            >
              <div>
                <span style="font-weight: 600; color: #fff;">{{ c.name }}</span>
                <span class="direction-badge" :class="c.direction === 'Alacak' ? 'alacak' : 'borc'" style="margin-left: 8px;">
                  {{ c.direction || 'Borç' }}
                </span>
              </div>
              <span class="bakiye-deger" :class="bakiyeSinifi(c)" style="font-weight: 700;">
                {{ tlFormatla(Math.abs(c.remaining_debt)) }}
              </span>
            </div>
          </div>
        </div>

        <div class="panel" style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px;">
          <h4 style="color: #fb923c; margin: 0 0 12px; border-bottom: 1px solid #334155; padding-bottom: 8px;">Ödenmemiş Genel Giderler</h4>
          <div v-if="giderler.filter(g => g.status !== 'Ödendi').length === 0" style="color: #94a3b8; text-align: center; padding: 20px 0;">
            Ödenmemiş genel gider bulunamadı.
          </div>
          <div v-else style="display: flex; flex-direction: column; gap: 10px;">
            <div 
              v-for="g in giderler.filter(g => g.status !== 'Ödendi').sort((a,b) => new Date(a.due_date || a.expense_date) - new Date(b.due_date || b.expense_date)).slice(0, 5)" 
              :key="g.id" 
              style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #334155;"
            >
              <div>
                <span style="font-weight: 600; color: #fff;">{{ g.expense_type }}</span>
                <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">{{ g.company_name || '' }}</span>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 700; color: #f87171;">{{ tlFormatla(g.amount) }}</div>
                <div style="font-size: 11px; color: #94a3b8;">Vade: {{ tarihFormatla(g.due_date || g.expense_date) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. ve 3. SEKME: Alacaklar / Borçlar -->
    <div v-if="aktifAnaSekme === 'alacaklar' || aktifAnaSekme === 'borclar'" class="cari-layout">
      <!-- Sol Cari Hesap Listesi Bölümü -->
      <div class="cari-sol-panel panel">
        <div class="filtre-row" style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
          <span class="p-input-icon-left" style="flex: 1; min-width: 200px;">
            <i class="pi pi-search" />
            <InputText 
              v-model="aramaKelimesi" 
              placeholder="Cari Hesap Ara (Firma, not...)" 
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
              <div class="cari-liste-alt" style="display: flex; gap: 6px; align-items: center;">
                <span class="cari-badge" :class="(slotProps.data.type || '').toLowerCase()">{{ slotProps.data.type }}</span>
                <span class="direction-badge" :class="slotProps.data.direction === 'Alacak' ? 'alacak' : 'borc'">
                  {{ slotProps.data.direction || 'Borç' }}
                </span>
                <span class="status-badge" :class="Math.abs(slotProps.data.remaining_debt) < 0.01 ? 'closed' : 'open'">
                  {{ Math.abs(slotProps.data.remaining_debt) < 0.01 ? (slotProps.data.direction === 'Alacak' ? 'Tahsil Edildi' : 'Ödendi') : 'Açık' }}
                </span>
                <span v-if="slotProps.data.phone" class="cari-liste-tel">
                  <i class="pi pi-phone" /> {{ slotProps.data.phone }}
                </span>
              </div>
            </template>
          </Column>
          
          <Column field="remaining_debt" header="Net Bakiye" style="text-align: right; width: 140px;">
            <template #body="slotProps">
              <span class="bakiye-deger" :class="bakiyeSinifi(slotProps.data)">
                {{ tlFormatla(Math.abs(slotProps.data.remaining_debt)) }}
              </span>
              <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">
                {{ bakiyeMetni(slotProps.data) }}
              </div>
            </template>
          </Column>
          
          <Column header="Toplam Borç / Ödeme" style="text-align: right; width: 160px; font-size: 0.92rem;">
            <template #body="slotProps">
              <div class="borc-odeme-detay">
                <span class="borc">{{ slotProps.data.direction === 'Alacak' ? 'A' : 'B' }}: {{ tlFormatla(slotProps.data.total_debt) }}</span>
                <span class="odeme">{{ slotProps.data.direction === 'Alacak' ? 'T' : 'Ö' }}: {{ tlFormatla(slotProps.data.total_paid) }}</span>
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
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
                <span class="cari-badge-buyuk" :class="(seciliCari.type || '').toLowerCase()">{{ seciliCari.type }}</span>
                <span class="direction-badge" :class="seciliCari.direction === 'Alacak' ? 'alacak' : 'borc'">
                  {{ seciliCari.direction || 'Borç' }}
                </span>
                <span class="status-badge" :class="Math.abs(seciliCari.remaining_debt) < 0.01 ? 'closed' : 'open'">
                  {{ Math.abs(seciliCari.remaining_debt) < 0.01 ? (seciliCari.direction === 'Alacak' ? 'Tahsil Edildi' : 'Ödendi') : 'Açık' }}
                </span>
              </div>
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
              <span class="baslik">{{ seciliCari.direction === 'Alacak' ? 'Toplam Alacak' : 'Toplam Borç' }}</span>
              <span class="tutar">{{ tlFormatla(seciliCari.total_debt) }}</span>
            </div>
            <div class="bakiye-sutun total-paid">
              <span class="baslik">{{ seciliCari.direction === 'Alacak' ? 'Yapılan Tahsilat' : 'Yapılan Ödeme' }}</span>
              <span class="tutar">{{ tlFormatla(seciliCari.total_paid) }}</span>
            </div>
            <div class="bakiye-sutun remaining-debt">
              <span class="baslik">{{ seciliCari.direction === 'Alacak' ? 'Kalan Alacak' : 'Kalan Borç' }}</span>
              <span class="tutar" :class="{ 'has-debt': bakiyeSinifi(seciliCari) === 'borclu' }">
                {{ tlFormatla(Math.abs(seciliCari.remaining_debt)) }}
              </span>
            </div>
          </div>

          <!-- Detay Eylem Butonları -->
          <div class="eylem-satiri">
            <Button 
              :label="seciliCari.direction === 'Alacak' ? 'Hizmet / Satış Ekle' : 'İşlem Ekle (Borçlandır)'" 
              icon="pi pi-file-edit" 
              severity="info" 
              class="flex-1"
              @click="islemEkleAc" 
            />
            <Button 
              :label="seciliCari.direction === 'Alacak' ? 'Tahsilat Ekle (Ödeme Al)' : 'Ödeme Yap'" 
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
              İşlem Geçmişi ({{ islemler.length }})
            </button>
            <button 
              class="sekme-btn" 
              :class="{ aktif: aktifTab === 'odemeler' }" 
              @click="aktifTab = 'odemeler'"
            >
              Ödeme &amp; Tahsilat ({{ odemeler.length }})
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

    <!-- 4. SEKME: Giderler -->
    <div v-if="aktifAnaSekme === 'giderler'" class="giderler-section panel" style="display: flex; flex-direction: column; gap: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 class="finance-section-title" style="margin: 0; color: #fb923c; border-left-color: #fb923c;">Genel Gider Takibi</h3>
        <Button label="Yeni Gider Kaydı Ekle" icon="pi pi-plus" severity="warning" @click="giderEkleDialogAc" />
      </div>

      <!-- Gider Filtreleri -->
      <div class="filtre-row" style="display: flex; gap: 10px; flex-wrap: wrap;">
        <span class="p-input-icon-left" style="flex: 1; min-width: 200px;">
          <i class="pi pi-search" />
          <InputText v-model="giderAramaMetni" placeholder="Gider Ara (Kurum, açıklama...)" />
        </span>
        
        <Dropdown 
          v-model="seciliGiderTurFiltresi" 
          :options="['Tümü', ...giderTurleri]" 
          placeholder="Gider Türü Filtrele" 
          style="width: 180px;"
        />

        <Dropdown 
          v-model="seciliGiderDurumFiltresi" 
          :options="['Tümü', 'Ödendi', 'Ödenmedi']" 
          placeholder="Durum Filtrele" 
          style="width: 160px;"
        />
      </div>

      <!-- Gider Tablosu -->
      <DataTable 
        :value="filtrelenmisGiderler" 
        responsiveLayout="scroll" 
        emptyMessage="Gider kaydı bulunamadı."
        class="p-datatable-sm"
      >
        <Column field="expense_type" header="Gider Türü" style="width: 140px;"></Column>
        <Column field="company_name" header="Kurum/Alacaklı"></Column>
        <Column field="period" header="Dönem" style="width: 130px;"></Column>
        <Column header="Tarih" style="width: 110px;">
          <template #body="slotProps">
            {{ tarihFormatla(slotProps.data.expense_date) }}
          </template>
        </Column>
        <Column header="Vade Tarihi" style="width: 110px;">
          <template #body="slotProps">
            {{ tarihFormatla(slotProps.data.due_date) }}
          </template>
        </Column>
        <Column header="Tutar" style="text-align: right; width: 120px;">
          <template #body="slotProps">
            <strong style="color: #fb923c;">{{ tlFormatla(slotProps.data.amount) }}</strong>
          </template>
        </Column>
        <Column header="Durum" style="text-align: center; width: 110px;">
          <template #body="slotProps">
            <span 
              class="status-badge" 
              :class="slotProps.data.status === 'Ödendi' ? 'closed' : 'open'"
            >
              {{ slotProps.data.status }}
            </span>
          </template>
        </Column>
        <Column field="note" header="Açıklama/Not"></Column>
        <Column style="width: 140px; text-align: center;">
          <template #body="slotProps">
            <div style="display: flex; gap: 4px; justify-content: center;">
              <Button 
                v-if="slotProps.data.status !== 'Ödendi'" 
                icon="pi pi-check" 
                severity="success" 
                text 
                rounded 
                title="Hızlı Öde" 
                @click="hizliOde(slotProps.data)" 
              />
              <Button 
                icon="pi pi-pencil" 
                severity="info" 
                text 
                rounded 
                title="Düzenle" 
                @click="giderDuzenle(slotProps.data)" 
              />
              <Button 
                icon="pi pi-trash" 
                severity="danger" 
                text 
                rounded 
                title="Sil" 
                @click="giderSil(slotProps.data)" 
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- 5. SEKME: Tüm Hareketler -->
    <div v-if="aktifAnaSekme === 'tum-hareketler'" class="tum-hareketler-section panel" style="display: flex; flex-direction: column; gap: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px;">
      <h3 class="finance-section-title" style="margin: 0; color: #94a3b8; border-left-color: #94a3b8;">Finansal Hareket Geçmişi</h3>
      
      <DataTable 
        :value="tumHareketlerListesi" 
        responsiveLayout="scroll" 
        emptyMessage="Hareket kaydı bulunamadı."
        paginator 
        :rows="20"
        class="p-datatable-sm"
      >
        <Column header="Tarih" style="width: 120px;">
          <template #body="slotProps">
            {{ tarihFormatla(slotProps.data.tarih) }}
          </template>
        </Column>
        <Column field="cari_adi" header="Cari Hesap / Alacaklı"></Column>
        <Column field="hareket_turu" header="Kategori" style="width: 130px;"></Column>
        <Column field="islem_detayi" header="İşlem Detayı" style="width: 150px;"></Column>
        <Column field="aciklama" header="Açıklama"></Column>
        <Column header="Tutar" style="text-align: right; width: 140px;">
          <template #body="slotProps">
            <strong :style="{ color: slotProps.data.yon === 'Alacak' || slotProps.data.yon === 'Tahsilat' ? '#34d399' : (slotProps.data.yon === 'Gider' ? '#fb923c' : '#f87171') }">
              {{ tlFormatla(slotProps.data.tutar) }}
            </strong>
          </template>
        </Column>
        <Column header="Tür" style="text-align: center; width: 110px;">
          <template #body="slotProps">
            <span 
              class="direction-badge" 
              :class="slotProps.data.yon.toLowerCase() === 'alacak' || slotProps.data.yon.toLowerCase() === 'tahsilat' ? 'alacak' : (slotProps.data.yon.toLowerCase() === 'gider' ? 'egzozcu' : 'borc')"
            >
              {{ slotProps.data.yon }}
            </span>
          </template>
        </Column>
      </DataTable>
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
          <label>Cari Yönü (Tip) <span class="zorunlu-alan">*</span></label>
          <div style="display: flex; gap: 16px; margin-top: 4px; background: #0f172a; padding: 10px; border-radius: 8px; border: 1px solid #334155;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="radio" id="dir-borc" value="Borç" v-model="cariForm.direction" style="width: 16px; height: 16px; accent-color: #ef4444;" />
              <label for="dir-borc" style="cursor: pointer; margin: 0; font-weight: 500; font-size: 0.9rem; color: #fff;">Borç (Biz borçluyuz - Tedarikçi)</label>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="radio" id="dir-alacak" value="Alacak" v-model="cariForm.direction" style="width: 16px; height: 16px; accent-color: #10b981;" />
              <label for="dir-alacak" style="cursor: pointer; margin: 0; font-weight: 500; font-size: 0.9rem; color: #fff;">Alacak (Bize borçlu - Müşteri)</label>
            </div>
          </div>
          <span class="form-helper">Bizim borçlandığımız (Borç) veya bize borçlu olan (Alacak) cari tipini belirtin.</span>
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

    <!-- Cari İşlem Ekle (Borç/Alacak Kaydı) -->
    <Dialog 
      v-if="seciliCari"
      v-model:visible="islemDialogAcik" 
      :header="seciliCari.direction === 'Alacak' ? 'Cari İşlem Ekle (Hizmet / Satış Kaydı)' : 'Cari İşlem Ekle (Borç Kaydı)'" 
      :style="{ width: '520px' }" 
      modal
    >
      <div class="dialog-form">
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
          <label>{{ seciliCari.direction === 'Alacak' ? 'Hizmet / Satış Tutarı (TL)' : 'Tutar (TL)' }} <span class="zorunlu-alan">*</span></label>
          <input type="number" step="0.01" v-model="islemForm.amount" class="tarih-input" placeholder="0.00" />
          <span class="form-helper">{{ seciliCari.direction === 'Alacak' ? 'Alacak olarak kaydedilecek tutar (KDV dahil).' : 'Borç olarak kaydedilecek tutar (KDV dahil).' }}</span>
        </div>

        <div class="form-group">
          <label>{{ seciliCari.direction === 'Alacak' ? 'Yapılan İş / Verilen Hizmet (Açıklama) *' : 'Yapılan İş / Alınan Mal (Açıklama) *' }}</label>
          <InputText v-model="islemForm.description" :placeholder="seciliCari.direction === 'Alacak' ? 'Örn: Motor bakımı veya Servis Hizmeti' : 'Örn: Motor rektefiye & kapak taşlama veya 4 Adet Lastik Alımı'" />
          <span class="form-helper">Detay açıklaması.</span>
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

    <!-- DIALOG 3: Ödeme Kaydet / Tahsilat Ekle -->
    <Dialog 
      v-if="seciliCari"
      v-model:visible="odemeDialogAcik" 
      :header="seciliCari.direction === 'Alacak' ? 'Tahsilat Ekle (Ödeme Girişi)' : 'Ödeme Kaydet'" 
      :style="{ width: '500px' }" 
      modal
    >
      <div class="dialog-form">
        <div class="form-group">
          <label>Cari Hesap</label>
          <InputText :value="seciliCari.name" readonly style="background-color: #1e293b; color: #94a3b8;" class="form-readonly-input" />
        </div>

        <div class="form-row-two">
          <div class="form-group">
            <label>{{ seciliCari.direction === 'Alacak' ? 'Tahsilat Tarihi' : 'Ödeme Tarihi' }} <span class="zorunlu-alan">*</span></label>
            <input type="date" v-model="odemeForm.date" class="tarih-input" />
            <span class="form-helper">Ödemenin/Tahsilatın fiili yapıldığı tarih.</span>
          </div>
          
          <div class="form-group">
            <label>{{ seciliCari.direction === 'Alacak' ? 'Tahsilat Yöntemi' : 'Ödeme Yöntemi' }} <span class="zorunlu-alan">*</span></label>
            <Dropdown v-model="odemeForm.payment_method" :options="odemeYontemleri" style="width: 100%;" />
            <span class="form-helper">{{ seciliCari.direction === 'Alacak' ? 'Tahsilat yöntemi.' : 'Yapılan ödeme kanalı.' }}</span>
          </div>
        </div>

        <div class="form-group">
          <label>{{ seciliCari.direction === 'Alacak' ? 'Tahsil Edilen Tutar (TL)' : 'Ödeme Tutarı (TL)' }} <span class="zorunlu-alan">*</span></label>
          <input type="number" step="0.01" v-model="odemeForm.amount" class="tarih-input" placeholder="0.00" />
          <span class="form-helper">{{ seciliCari.direction === 'Alacak' ? 'Alınan tahsilat tutarı.' : 'Yapılan ödemenin tutarı.' }}</span>
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

    <!-- DIALOG 4: Gider Ekle / Düzenle -->
    <Dialog 
      v-model:visible="giderFormDialog" 
      :header="isEditingGider ? 'Gider Kaydını Düzenle' : 'Yeni Gider Kaydı Ekle'" 
      :style="{ width: '480px' }" 
      modal
    >
      <div class="dialog-form">
        <div class="form-row-two" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div class="form-group">
            <label>Gider Türü <span class="zorunlu-alan" style="color: #f87171;">*</span></label>
            <Dropdown 
              v-model="giderForm.expense_type" 
              :options="giderTurleri" 
              editable 
              placeholder="Tür seçin veya yazın" 
              style="width: 100%;"
            />
          </div>
          
          <div class="form-group">
            <label>Kurum / Firma</label>
            <InputText v-model="giderForm.company_name" placeholder="Örn: Enerjisa, Telekom" style="width: 100%;" />
          </div>
        </div>

        <div class="form-row-two" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div class="form-group">
            <label>Dönem / Ay</label>
            <InputText v-model="giderForm.period" placeholder="Örn: Temmuz 2026" style="width: 100%;" />
          </div>
          
          <div class="form-group">
            <label>Tutar (TL) <span class="zorunlu-alan" style="color: #f87171;">*</span></label>
            <InputText type="number" step="0.01" v-model="giderForm.amount" placeholder="0.00" style="width: 100%;" />
          </div>
        </div>

        <div class="form-row-two" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div class="form-group">
            <label>Gider Tarihi <span class="zorunlu-alan" style="color: #f87171;">*</span></label>
            <InputText type="date" v-model="giderForm.expense_date" style="width: 100%;" />
          </div>
          
          <div class="form-group">
            <label>Vade Tarihi</label>
            <InputText type="date" v-model="giderForm.due_date" style="width: 100%;" />
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label>Durum <span class="zorunlu-alan" style="color: #f87171;">*</span></label>
          <div style="display: flex; gap: 16px; margin-top: 4px; background: #0f172a; padding: 10px; border-radius: 8px; border: 1px solid #334155;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="radio" id="gider-durum-odenmedi" value="Ödenmedi" v-model="giderForm.status" style="width: 16px; height: 16px; accent-color: #ef4444;" />
              <label for="gider-durum-odenmedi" style="cursor: pointer; margin: 0; font-weight: 500; font-size: 0.9rem; color: #fff;">Ödenmedi (Açık Borç)</label>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="radio" id="gider-durum-odendi" value="Ödendi" v-model="giderForm.status" style="width: 16px; height: 16px; accent-color: #10b981;" />
              <label for="gider-durum-odendi" style="cursor: pointer; margin: 0; font-weight: 500; font-size: 0.9rem; color: #fff;">Ödendi (Kapatılmış)</label>
            </div>
          </div>
        </div>

        <div class="form-row-two" v-if="giderForm.status === 'Ödendi'" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div class="form-group">
            <label>Ödeme Tarihi</label>
            <InputText type="date" v-model="giderForm.payment_date" style="width: 100%;" />
          </div>
          
          <div class="form-group">
            <label>Ödeme Yöntemi</label>
            <Dropdown 
              v-model="giderForm.payment_method" 
              :options="odemeYontemleri" 
              placeholder="Ödeme kanalı seçin" 
              style="width: 100%;"
            />
          </div>
        </div>

        <div class="form-group">
          <label>Not / Detay</label>
          <InputText v-model="giderForm.note" placeholder="Ekstra açıklama girin..." style="width: 100%;" />
        </div>
      </div>
      
      <template #footer>
        <Button label="İptal" icon="pi pi-times" text @click="giderFormDialog = false" />
        <Button label="Kaydet" icon="pi pi-check" severity="warning" @click="giderKaydet" />
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

.direction-badge {
  font-size: 0.72rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}
.direction-badge.alacak {
  background-color: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.direction-badge.borc {
  background-color: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.status-badge {
  font-size: 0.72rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}
.status-badge.open {
  background-color: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.status-badge.closed {
  background-color: rgba(16, 185, 129, 0.1);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

:global(html[data-theme="light"] .direction-badge.alacak) {
  background-color: rgba(16, 185, 129, 0.1) !important;
  color: #15803d !important;
  border-color: rgba(16, 185, 129, 0.2) !important;
}
:global(html[data-theme="light"] .direction-badge.borc) {
  background-color: rgba(239, 68, 68, 0.1) !important;
  color: #b91c1c !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
}
:global(html[data-theme="light"] .status-badge.open) {
  background-color: rgba(239, 68, 68, 0.1) !important;
  color: #b91c1c !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
}
:global(html[data-theme="light"] .status-badge.closed) {
  background-color: rgba(16, 185, 129, 0.1) !important;
  color: #15803d !important;
  border-color: rgba(16, 185, 129, 0.2) !important;
}

:global(html[data-theme="light"] input[type="radio"]) {
  accent-color: #15803d !important;
}

:global(html[data-theme="light"] .dialog-form label) {
  color: #111827 !important;
}
</style>
