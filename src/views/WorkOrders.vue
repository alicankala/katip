<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const isEmirleri = ref([])
const araclarListesi = ref([])
const parcalarListesi = ref([])
const kalemler = ref([])
const isEmriLoglari = ref([])
const aktifUsta = ref(null)
const toast = useToast()
const confirmDialog = useConfirm()

const basariMesaji = (detay) => {
  toast.add({
    severity: 'success',
    summary: 'Başarılı',
    detail: detay,
    life: 2500
  })
}

const hataMesaji = (detay) => {
  toast.add({
    severity: 'error',
    summary: 'Hata',
    detail: detay,
    life: 4000
  })
}

const uyariMesaji = (detay) => {
  toast.add({
    severity: 'warn',
    summary: 'Uyarı',
    detail: detay,
    life: 3000
  })
}

const dialogAcik = ref(false)
const kalemDialogAcik = ref(false)
const tekrarAcDialogAcik = ref(false)
const tekrarAcilacakIsEmri = ref(null)

// Ödeme Takibi State
const odemeDialogAcik = ref(false)
const tamamlaDialogAcik = ref(false)
const odemeIptalDialogAcik = ref(false)
const tamamlanacakIsEmri = ref(null)

const odemeGecmisi = ref([])
const odemeOzeti = reactive({
  total_price: 0,
  toplam_tahsilat: 0,
  kalan_borc: 0,
  odeme_durumu: 'Ödenmedi'
})

const bugununTarihi = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const odemeForm = reactive({
  work_order_id: null,
  amount: 0,
  payment_method: 'Nakit',
  payment_date: bugununTarihi(),
  note: ''
})

const tamamlaForm = reactive({
  id: null,
  kalan_borc: 0,
  payment_option: 'full',
  amount: 0,
  payment_method: 'Nakit',
  payment_date: bugununTarihi(),
  note: ''
})

const iptalForm = reactive({
  payment_id: null,
  cancel_reason: ''
})

const tekrarAcForm = reactive({
  reason: ''
})


const aramaKelimesi = ref('')
const durumFiltresi = ref('Açık')
const seciliIsEmri = ref(null)
const islemGecmisiAcik = ref(false)
const maliyetKarAcik = ref(false)
const printPreviewOpen = ref(false)
const showPaymentSummary = ref(true)

const odemeDurumuHesapla = (row) => {
  if (!row) {
    return { status: 'Ödenmedi', text: '● Ödenmedi', color: '#ef4444' }
  }
  const total = Number(row.total_price || 0)
  const paid = Number(row.toplam_tahsilat || 0)
  const remaining = Number((total - paid).toFixed(2))

  if (paid <= 0.01) {
    return { status: 'Ödenmedi', text: '● Ödenmedi', color: '#ef4444' }
  }
  if (remaining <= 0.01) {
    return { status: 'Ödendi', text: '● Ödendi', color: '#10b981' }
  }
  if (remaining < -0.01) {
    return { status: 'Fazla Ödeme', text: '● Fazla Ödeme', color: '#a855f7' }
  }

  return {
    status: 'Kısmi',
    text: `● Kısmi · ${tlFormatla(remaining)} kaldı`,
    color: '#f59e0b'
  }
}

const tarihSaatFormatla = (tarihStr) => {
  if (!tarihStr) return '-'
  try {
    const d = new Date(tarihStr)
    if (isNaN(d.getTime())) return tarihStr
    return d.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return tarihStr
  }
}

const durumSecenekleri = ref(['Açık', 'Beklemede', 'Tamamlandı'])
const kalemTipleri = ref(['Parça', 'İşçilik'])
const seciliIsEmriTamamlandi = computed(() => {
  return seciliIsEmri.value?.status === 'Tamamlandı'
})
const maliyetOzeti = computed(() => {
  let parcaMaliyeti = 0
  let parcaSatisi = 0
  let iscilikGeliri = 0

  for (const kalem of kalemler.value) {
    const miktar = Number(kalem.quantity) || 0
    const toplam = Number(kalem.total_price) || 0

    if (kalem.type === 'Parça') {
      const alisFiyati = Number(kalem.part_buy_price) || 0
      parcaMaliyeti += miktar * alisFiyati
      parcaSatisi += toplam
    }

    if (kalem.type === 'İşçilik') {
      iscilikGeliri += toplam
    }
  }

  const toplamSatis = parcaSatisi + iscilikGeliri
  const toplamMaliyet = parcaMaliyeti
  const netKar = toplamSatis - toplamMaliyet
  const karOrani = toplamSatis > 0 ? (netKar / toplamSatis) * 100 : 0

  return {
    parcaMaliyeti,
    parcaSatisi,
    iscilikGeliri,
    toplamSatis,
    toplamMaliyet,
    netKar,
    karOrani
  }
})

const form = reactive({
  id: null,
  vehicle_id: null,
  description: '',
  mileage: '',
  total_price: 0,
  status: 'Açık',
})
const kalemForm = reactive({
  type: 'Parça',
  part_id: null,
  description: '',
  quantity: 1,
  unit_price: 0
})
const duzenlenenKalem = ref(null)

const kalemDuzenleForm = reactive({
  id: null,
  type: 'Parça',
  part_id: null,
  description: '',
  quantity: 1,
  unit_price: 0
})

const listeleriGetir = async () => {
  isEmirleri.value = await window.api.isEmirleriGetir()
  araclarListesi.value = await window.api.araclariGetir()
  parcalarListesi.value = await window.api.parcalariGetir()
}

const filtrelenmisIsEmirleri = computed(() => {
  let liste = isEmirleri.value

  if (durumFiltresi.value !== 'Tümü') {
    liste = liste.filter(i => i.status === durumFiltresi.value)
  }

  if (!aramaKelimesi.value) return liste

  const aranan = aramaKelimesi.value.toLowerCase()

return liste.filter(i =>
  (i.plate || '').toLowerCase().includes(aranan) ||
  (i.customer_name || '').toLowerCase().includes(aranan) ||
  (i.description || '').toLowerCase().includes(aranan) ||
  (i.opened_by_master_name || '').toLowerCase().includes(aranan) ||
  (i.closed_by_master_name || '').toLowerCase().includes(aranan)
)
})
const durumSayisi = (durum) => {
  if (durum === 'Tümü') return isEmirleri.value.length

  return isEmirleri.value.filter(i => i.status === durum).length
}
const yeniIsEmriAc = () => {
  if (!aktifUsta.value?.id) {
    uyariMesaji('İş emri açmak için önce usta girişi yapılmalıdır.')
    return
  }

  Object.assign(form, {
    id: null,
    vehicle_id: null,
    description: '',
    mileage: '',
    total_price: 0,
    status: 'Açık',
  })

  dialogAcik.value = true
}
const duzenle = (isEmri) => {
  if (isEmri?.status === 'Tamamlandı') {
    uyariMesaji('Tamamlanmış iş emri düzenlenemez. Gerekirse önce Tekrar Aç yapın.')
    return
  }

  Object.assign(form, {
    id: isEmri.id,
    vehicle_id: isEmri.vehicle_id,
    description: isEmri.description,
    mileage: isEmri.mileage || '',
    total_price: isEmri.total_price,
    status: isEmri.status
  })

  dialogAcik.value = true
}

const sil = (isEmri) => {
  if (!isEmri?.id) return

  if (isEmri.status === 'Tamamlandı') {
    uyariMesaji('Tamamlanmış iş emri silinemez. Gerekirse önce Tekrar Aç yapın.')
    return
  }

  confirmDialog.require({
    message: 'Bu iş emrini silmek istediğinize emin misiniz?',
    header: 'İş Emri Sil',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sil',
    rejectLabel: 'Vazgeç',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-secondary p-button-text',
    accept: async () => {
      const res = await window.api.isEmriSil(Number(isEmri.id))

      if (res && res.success) {
        basariMesaji('İş emri silindi.')
        await listeleriGetir()
      } else {
        hataMesaji(res?.error || 'İş emri silinemedi.')
      }
    }
  })
}

const kaydet = async () => {
  if (!aktifUsta.value?.id) {
    uyariMesaji('İş emri kaydetmek için önce usta girişi yapılmalıdır.')
    return
  }

  if (!form.vehicle_id) {
    uyariMesaji('Lütfen işlem yapılacak aracı seçin.')
    return
  }

  try {
    const temizVeri = {
      ...JSON.parse(JSON.stringify(form)),
      active_master_id: aktifUsta.value.id,
    }

    const res = form.id
      ? await window.api.isEmriGuncelle(temizVeri)
      : await window.api.isEmriEkle(temizVeri)

    if (res && res.success) {
      basariMesaji(form.id ? 'İş emri güncellendi.' : 'İş emri kaydedildi.')

      dialogAcik.value = false

Object.assign(form, {
  id: null,
  vehicle_id: null,
  description: '',
  mileage: '',
  total_price: 0,
  status: 'Açık'
})

      await listeleriGetir()
    } else {
      hataMesaji(res?.error || 'İş emri kaydedilemedi.')
    }
  } catch (error) {
    hataMesaji(error instanceof Error ? error.message : String(error))
  }
}
const durumKaydet = async (isEmri, yeniDurum, basariDetayi = 'İş emri durumu güncellendi.') => {
  const eskiDurum = isEmri.status

  try {
    const temizVeri = {
      ...JSON.parse(JSON.stringify(isEmri)),
      status: yeniDurum,
      active_master_id: aktifUsta.value.id
    }

    isEmri.status = yeniDurum

    if (seciliIsEmri.value?.id === isEmri.id) {
      seciliIsEmri.value.status = yeniDurum
    }

    const res = await window.api.isEmriGuncelle(temizVeri)

    if (res?.success) {
      basariMesaji(basariDetayi)

      await listeleriGetir()

      const guncel = isEmirleri.value.find(i => i.id === isEmri.id)
      if (guncel && seciliIsEmri.value?.id === isEmri.id) {
        seciliIsEmri.value = guncel
      }
    } else {
      isEmri.status = eskiDurum

      if (seciliIsEmri.value?.id === isEmri.id) {
        seciliIsEmri.value.status = eskiDurum
      }

      hataMesaji(res?.error || 'Durum güncellenemedi.')
    }
  } catch (error) {
    isEmri.status = eskiDurum

    if (seciliIsEmri.value?.id === isEmri.id) {
      seciliIsEmri.value.status = eskiDurum
    }

    hataMesaji(error instanceof Error ? error.message : String(error))
  }
}

const durumDegistir = async (isEmri, yeniDurum) => {
  if (!isEmri?.id || !yeniDurum) return
  if (isEmri.status === yeniDurum) return

  if (!aktifUsta.value?.id) {
    uyariMesaji('Durum değiştirmek için önce usta girişi yapılmalıdır.')
    return
  }

  if (isEmri.status === 'Tamamlandı') {
    uyariMesaji('Tamamlanmış iş emrinin durumu buradan değiştirilemez. Tekrar Aç butonunu kullanın.')
    return
  }

  if (yeniDurum === 'Tamamlandı') {
    await tamamlaModalAc(isEmri)
    return
  }

  await durumKaydet(isEmri, yeniDurum)
}

const odemeleriGetir = async (workOrderId) => {
  if (!workOrderId) {
    odemeGecmisi.value = []
    return
  }

  try {
    const res = await window.api.isEmriOdemeleriGetir(workOrderId)
    if (res && res.success) {
      odemeGecmisi.value = res.odemeler || []
    } else {
      odemeGecmisi.value = []
    }

    const ozetRes = await window.api.isEmriOdemeOzetiGetir(workOrderId)
    if (ozetRes && ozetRes.success) {
      Object.assign(odemeOzeti, ozetRes.ozet)
    }
  } catch (err) {
    console.error('Ödemeleri getirme hatası:', err)
  }
}

const getOdemeSeverity = (durum) => {
  switch (durum) {
    case 'Ödendi': return 'success'
    case 'Kısmi Ödendi': return 'warn'
    case 'Ödenmedi': return 'danger'
    case 'Fazla Ödeme': return 'info'
    default: return 'secondary'
  }
}

const odemeAlModalAc = async () => {
  if (!seciliIsEmri.value?.id) {
    uyariMesaji('Lütfen önce bir iş emri seçin.')
    return
  }

  await odemeleriGetir(seciliIsEmri.value.id)

  odemeForm.work_order_id = seciliIsEmri.value.id
  odemeForm.amount = odemeOzeti.kalan_borc > 0 ? odemeOzeti.kalan_borc : 0
  odemeForm.payment_method = 'Nakit'
  odemeForm.payment_date = bugununTarihi()
  odemeForm.note = ''

  odemeDialogAcik.value = true
}

const odemeKaydet = async () => {
  if (!odemeForm.work_order_id) return
  if (!odemeForm.amount || Number(odemeForm.amount) <= 0) {
    uyariMesaji('Geçerli bir ödeme tutarı giriniz.')
    return
  }
  if (!odemeForm.payment_method) {
    uyariMesaji('Lütfen ödeme yöntemi seçin.')
    return
  }

  const aktifMaster = aktifUsta.value || JSON.parse(localStorage.getItem('aktifUsta') || 'null')

  try {
    const res = await window.api.isEmriOdemeEkle({
      ...odemeForm,
      amount: Number(odemeForm.amount),
      active_master_id: aktifMaster?.id
    })

    if (res?.success) {
      basariMesaji('Ödeme başarıyla kaydedildi.')
      odemeDialogAcik.value = false
      await odemeleriGetir(seciliIsEmri.value.id)
      await listeleriGetir()
      if (seciliIsEmri.value) {
        const guncel = isEmirleri.value.find(i => i.id === seciliIsEmri.value.id)
        if (guncel) seciliIsEmri.value = guncel
      }
    } else {
      hataMesaji(res?.error || 'Ödeme kaydedilemedi.')
    }
  } catch (err) {
    hataMesaji(err instanceof Error ? err.message : String(err))
  }
}

const odemeIptalModalAc = (odeme) => {
  if (!odeme?.id) return
  iptalForm.payment_id = odeme.id
  iptalForm.cancel_reason = ''
  odemeIptalDialogAcik.value = true
}

const odemeIptalKaydet = async () => {
  if (!iptalForm.payment_id) return
  if (!iptalForm.cancel_reason || !iptalForm.cancel_reason.trim()) {
    uyariMesaji('Ödeme iptal sebebi zorunludur.')
    return
  }

  const aktifMaster = aktifUsta.value || JSON.parse(localStorage.getItem('aktifUsta') || 'null')

  try {
    const res = await window.api.isEmriOdemeIptal({
      payment_id: iptalForm.payment_id,
      cancel_reason: iptalForm.cancel_reason.trim(),
      active_master_id: aktifMaster?.id
    })

    if (res?.success) {
      basariMesaji('Ödeme kaydı iptal edildi.')
      odemeIptalDialogAcik.value = false
      await odemeleriGetir(seciliIsEmri.value.id)
      await listeleriGetir()
      if (seciliIsEmri.value) {
        const guncel = isEmirleri.value.find(i => i.id === seciliIsEmri.value.id)
        if (guncel) seciliIsEmri.value = guncel
      }
    } else {
      hataMesaji(res?.error || 'Ödeme iptal edilemedi.')
    }
  } catch (err) {
    hataMesaji(err instanceof Error ? err.message : String(err))
  }
}

// ── İş Emri Detay Sekme Durumu ──────────────────────────────────
const detaySekmesi = ref('kalemler') // 'kalemler' | 'fotograflar' | 'odemeler' | 'gecmis'

// ── Araç Fotoğrafları (Kabul / Hasar Tespiti) Yönetimi ─────────
const fotograflar = ref([])
const fotografKategorisiFiltre = ref('tumu')
const fotograflarYukleniyor = ref(false)
const seciliFotografModal = ref(null)

const fotograflariYukle = async (workOrderId) => {
  if (!workOrderId || !window.api?.isEmriFotograflariGetir) {
    fotograflar.value = []
    return
  }
  fotograflarYukleniyor.value = true
  try {
    const res = await window.api.isEmriFotograflariGetir(workOrderId)
    if (res?.success) {
      fotograflar.value = res.fotograflar || []
    } else {
      fotograflar.value = []
    }
  } catch (err) {
    console.error('Fotoğraflar yüklenemedi:', err)
    fotograflar.value = []
  } finally {
    fotograflarYukleniyor.value = false
  }
}

const fotografYukleModalAc = async () => {
  if (!seciliIsEmri.value?.id || !window.api?.isEmriFotografYukleDialog) return
  try {
    const res = await window.api.isEmriFotografYukleDialog({
      work_order_id: seciliIsEmri.value.id,
      category: fotografKategorisiFiltre.value === 'tumu' ? 'Araç Kabul' : fotografKategorisiFiltre.value
    })
    if (res?.success) {
      basariMesaji(`${res.count || 1} adet fotoğraf yüklendi.`)
      fotograflariYukle(seciliIsEmri.value.id)
    } else if (res?.error) {
      hataMesaji(res.error)
    }
  } catch (err) {
    hataMesaji('Fotoğraf eklenirken hata oluştu.')
  }
}

const fotografSil = async (photoId) => {
  if (!photoId || !window.api?.isEmriFotografSil) return
  if (!confirm('Bu fotoğrafı silmek istediğinize emin misiniz?')) return
  try {
    const res = await window.api.isEmriFotografSil(photoId)
    if (res?.success) {
      basariMesaji('Fotoğraf silindi.')
      if (seciliFotografModal.value?.id === photoId) {
        seciliFotografModal.value = null
      }
      fotograflariYukle(seciliIsEmri.value.id)
    } else {
      hataMesaji(res?.error || 'Fotoğraf silinemedi.')
    }
  } catch (err) {
    hataMesaji('Fotoğraf silinirken hata oluştu.')
  }
}

const fotografGuncelle = async () => {
  if (!seciliFotografModal.value?.id || !window.api?.isEmriFotografGuncelle) return
  try {
    const res = await window.api.isEmriFotografGuncelle({
      id: seciliFotografModal.value.id,
      category: seciliFotografModal.value.category,
      note: seciliFotografModal.value.note
    })
    if (res?.success) {
      basariMesaji('Fotoğraf notu ve kategorisi güncellendi.')
      fotograflariYukle(seciliIsEmri.value.id)
    } else {
      hataMesaji(res?.error || 'Güncellenemedi.')
    }
  } catch (err) {
    hataMesaji('Güncellenirken hata oluştu.')
  }
}

const filtrelenmisFotograflar = computed(() => {
  if (fotografKategorisiFiltre.value === 'tumu') return fotograflar.value
  return fotograflar.value.filter(f => f.category === fotografKategorisiFiltre.value)
})

const tamamlaModalAc = async (isEmri) => {
  if (!isEmri?.id) return
  const ozetRes = await window.api.isEmriOdemeOzetiGetir(isEmri.id)
  const ozet = ozetRes?.ozet || {}

  let defMethod = 'Nakit'
  if (window.api?.ayarlariGetir) {
    try {
      const setRes = await window.api.ayarlariGetir()
      if (setRes?.success && setRes.settings?.default_payment_method) {
        defMethod = setRes.settings.default_payment_method
      }
    } catch (e) {}
  }

  tamamlanacakIsEmri.value = isEmri
  tamamlaForm.id = isEmri.id
  tamamlaForm.kalan_borc = Number(ozet.kalan_borc !== undefined ? ozet.kalan_borc : (isEmri.total_price || 0))
  tamamlaForm.payment_option = tamamlaForm.kalan_borc <= 0 ? 'none' : 'full'
  tamamlaForm.amount = tamamlaForm.kalan_borc > 0 ? tamamlaForm.kalan_borc : 0
  tamamlaForm.payment_method = defMethod
  tamamlaForm.payment_date = bugununTarihi()
  tamamlaForm.note = ''

  tamamlaDialogAcik.value = true
}

const tamamlaVeOdemeKaydet = async () => {
  if (!tamamlaForm.id) return

  const aktifMaster = aktifUsta.value || JSON.parse(localStorage.getItem('aktifUsta') || 'null')
  if (!aktifMaster?.id) {
    uyariMesaji('İş emrini tamamlamak için aktif usta girişi yapılmalıdır.')
    return
  }

  if (tamamlaForm.kalan_borc <= 0.01) {
    tamamlaForm.payment_option = 'none'
    tamamlaForm.amount = 0
  }

  if (tamamlaForm.payment_option === 'partial') {
    if (!tamamlaForm.amount || Number(tamamlaForm.amount) <= 0) {
      uyariMesaji('Geçerli bir ödeme tutarı giriniz.')
      return
    }
    if (Number(tamamlaForm.amount) > tamamlaForm.kalan_borc + 0.01) {
      uyariMesaji(`Ödeme tutarı kalan borçtan (${tamamlaForm.kalan_borc} TL) büyük olamaz.`)
      return
    }
  }

  try {
    const res = await window.api.isEmriTamamlaVeOdemeKaydet({
      id: tamamlaForm.id,
      active_master_id: aktifMaster.id,
      payment_option: tamamlaForm.payment_option,
      amount: Number(tamamlaForm.amount || 0),
      payment_method: tamamlaForm.payment_method,
      payment_date: tamamlaForm.payment_date,
      note: tamamlaForm.note
    })

    if (res?.success) {
      basariMesaji('İş emri tamamlandı ve kaydedildi.')
      tamamlaDialogAcik.value = false
      await listeleriGetir()
      if (seciliIsEmri.value?.id === tamamlaForm.id) {
        const guncel = isEmirleri.value.find(i => i.id === tamamlaForm.id)
        if (guncel) seciliIsEmri.value = guncel
        await odemeleriGetir(tamamlaForm.id)
      }
    } else {
      hataMesaji(res?.error || 'İş emri tamamlanamadı.')
    }
  } catch (err) {
    hataMesaji(err instanceof Error ? err.message : String(err))
  }
}

const tekrarAc = (isEmri) => {
  if (!isEmri?.id) {
    hataMesaji('İş emri seçilemedi.')
    return
  }

  const aktifUstaBilgisi =
    aktifUsta.value || JSON.parse(localStorage.getItem('aktifUsta') || 'null')

  if (!aktifUstaBilgisi?.id) {
    uyariMesaji('İş emrini tekrar açmak için önce usta girişi yapılmalıdır.')
    return
  }

  if (isEmri.status !== 'Tamamlandı') {
    uyariMesaji('Sadece tamamlanmış iş emirleri tekrar açılabilir.')
    return
  }

  if (!window.api?.isEmriTekrarAc) {
    hataMesaji('Tekrar açma API bağlantısı bulunamadı.')
    return
  }

  tekrarAcilacakIsEmri.value = isEmri

  Object.assign(tekrarAcForm, {
    reason: ''
  })

  tekrarAcDialogAcik.value = true
}
const tekrarAcKaydet = async () => {
  const isEmri = tekrarAcilacakIsEmri.value

  if (!isEmri?.id) {
    hataMesaji('Tekrar açılacak iş emri bulunamadı.')
    return
  }

  const aktifUstaBilgisi =
    aktifUsta.value || JSON.parse(localStorage.getItem('aktifUsta') || 'null')

  if (!aktifUstaBilgisi?.id) {
    uyariMesaji('İş emrini tekrar açmak için önce usta girişi yapılmalıdır.')
    return
  }

  const reason = String(tekrarAcForm.reason || '').trim()

  if (!reason) {
    uyariMesaji('Tekrar açma sebebi boş bırakılamaz.')
    return
  }

  try {
    const res = await window.api.isEmriTekrarAc({
      id: isEmri.id,
      active_master_id: aktifUstaBilgisi.id,
      reason
    })

    if (res?.success) {
      basariMesaji('İş emri tekrar açıldı ve işlem geçmişine kaydedildi.')

      tekrarAcDialogAcik.value = false
      tekrarAcilacakIsEmri.value = null

      Object.assign(tekrarAcForm, {
        reason: ''
      })

      durumFiltresi.value = 'Açık'

      await listeleriGetir()

      const guncel = isEmirleri.value.find(i => i.id === isEmri.id)

      if (guncel) {
        seciliIsEmri.value = guncel
        await kalemleriGetir(guncel.id)
        await isEmriLoglariGetir(guncel.id)
      } else {
        seciliIsEmri.value = null
        kalemler.value = []
        isEmriLoglari.value = []
      }
    } else {
      hataMesaji(res?.error || 'İş emri tekrar açılamadı.')
    }
  } catch (error) {
    hataMesaji(error instanceof Error ? error.message : String(error))
  }
}
const kalemleriAc = async (isEmri) => {
  if (!isEmri?.id) return

if (seciliIsEmri.value?.id === isEmri.id) {
  seciliIsEmri.value = null
  kalemler.value = []
  islemGecmisiAcik.value = false
  maliyetKarAcik.value = false

  if (typeof isEmriLoglari !== 'undefined') {
    isEmriLoglari.value = []
  }

    Object.assign(kalemForm, {
      type: 'Parça',
      part_id: null,
      description: '',
      quantity: 1,
      unit_price: 0
    })

    return
  }

  detaySekmesi.value = 'kalemler'
  seciliIsEmri.value = isEmri
  islemGecmisiAcik.value = false
maliyetKarAcik.value = false

  Object.assign(kalemForm, {
    type: 'Parça',
    part_id: null,
    description: '',
    quantity: 1,
    unit_price: 0
  })

  await kalemleriGetir(isEmri.id)
  await odemeleriGetir(isEmri.id)
  await fotograflariYukle(isEmri.id)

  if (typeof isEmriLoglariGetir === 'function') {
    await isEmriLoglariGetir(isEmri.id)
  }
}

const kalemleriGetir = async (workOrderId) => {
  const res = await window.api.isEmriKalemleriGetir(workOrderId)

  if (res && res.success) {
    kalemler.value = res.kalemler
  } else {
    kalemler.value = []
    hataMesaji(res?.error || 'Kalemler getirilemedi.')
  }
}
const isEmriLoglariGetir = async (workOrderId) => {
  if (!window.api.isEmriLoglariGetir) {
    isEmriLoglari.value = []
    return
  }

  const res = await window.api.isEmriLoglariGetir(workOrderId)

  if (res?.success) {
    isEmriLoglari.value = Array.isArray(res.loglar) ? res.loglar : []
  } else {
    isEmriLoglari.value = []
  }
}

const parcaSecildi = (partId) => {
  const parca = parcalarListesi.value.find(p => p.id === partId)

  if (parca) {
    kalemForm.description = parca.name
    kalemForm.unit_price = parca.sell_price || 0
  }
}
const kalemDuzenleParcaSecildi = (partId) => {
  const parca = parcalarListesi.value.find(p => p.id === partId)

  if (parca) {
    kalemDuzenleForm.description = parca.name
    kalemDuzenleForm.unit_price = parca.sell_price || 0
  }
}

const kalemDuzenle = (kalem) => {
  if (!kalem?.id) return

  if (!aktifUsta.value?.id) {
    uyariMesaji('Kalem düzenlemek için önce usta girişi yapılmalıdır.')
    return
  }

  if (seciliIsEmriTamamlandi.value) {
    uyariMesaji('Tamamlanmış iş emrinde kalem düzenlenemez.')
    return
  }

  duzenlenenKalem.value = kalem

  Object.assign(kalemDuzenleForm, {
    id: kalem.id,
    type: kalem.type || 'Parça',
    part_id: kalem.type === 'Parça' ? kalem.part_id : null,
    description: kalem.description || kalem.part_name || '',
    quantity: Number(kalem.quantity) || 1,
    unit_price: Number(kalem.unit_price) || 0
  })

  kalemDialogAcik.value = true
}

const kalemGuncelleKaydet = async () => {
  if (!kalemDuzenleForm.id) {
    hataMesaji('Düzenlenecek kalem bulunamadı.')
    return
  }

  if (!aktifUsta.value?.id) {
    uyariMesaji('Kalem düzenlemek için önce usta girişi yapılmalıdır.')
    return
  }

  if (seciliIsEmriTamamlandi.value) {
    uyariMesaji('Tamamlanmış iş emrinde kalem düzenlenemez.')
    return
  }

  if (!kalemDuzenleForm.type) {
    uyariMesaji('Kalem tipi seçin.')
    return
  }

  if (kalemDuzenleForm.type === 'Parça' && !kalemDuzenleForm.part_id) {
    uyariMesaji('Lütfen kullanılacak parçayı seçin.')
    return
  }

  if (kalemDuzenleForm.type === 'İşçilik' && !kalemDuzenleForm.description) {
    uyariMesaji('Lütfen işçilik açıklaması yazın.')
    return
  }

  if (Number(kalemDuzenleForm.quantity) <= 0) {
    uyariMesaji('Adet/Miktar 0 olamaz.')
    return
  }

  const temizVeri = {
    id: kalemDuzenleForm.id,
    type: kalemDuzenleForm.type,
    part_id: kalemDuzenleForm.type === 'Parça' ? kalemDuzenleForm.part_id : null,
    description: kalemDuzenleForm.description,
    quantity: Number(kalemDuzenleForm.quantity) || 1,
    unit_price: Number(kalemDuzenleForm.unit_price) || 0,
    active_master_id: aktifUsta.value.id
  }

  const res = await window.api.isEmriKalemGuncelle(temizVeri)

  if (res?.success) {
    basariMesaji('Kalem güncellendi.')

    kalemDialogAcik.value = false
    duzenlenenKalem.value = null

    Object.assign(kalemDuzenleForm, {
      id: null,
      type: 'Parça',
      part_id: null,
      description: '',
      quantity: 1,
      unit_price: 0
    })

    await kalemleriGetir(seciliIsEmri.value.id)
    await listeleriGetir()

    const guncel = isEmirleri.value.find(i => i.id === seciliIsEmri.value.id)
    if (guncel) seciliIsEmri.value = guncel
  } else {
    hataMesaji(res?.error || 'Kalem güncellenemedi.')
  }
}

const kalemKaydet = async () => {
  if (!seciliIsEmri.value?.id) {
    uyariMesaji('İş emri seçilemedi.')
    return
  }
    if (!aktifUsta.value?.id) {
    uyariMesaji('Kalem eklemek için önce usta girişi yapılmalıdır.')
    return
  }

  if (seciliIsEmriTamamlandi.value) {
    uyariMesaji('Tamamlanmış iş emrine kalem eklenemez.')
    return
  }

  if (!kalemForm.type) {
    uyariMesaji('Kalem tipi seçin.')
    return
  }

  if (kalemForm.type === 'Parça' && !kalemForm.part_id) {
    uyariMesaji('Lütfen kullanılacak parçayı seçin.')
    return
  }

  if (kalemForm.type === 'İşçilik' && !kalemForm.description) {
    uyariMesaji('Lütfen işçilik açıklaması yazın.')
    return
  }

  if (Number(kalemForm.quantity) <= 0) {
    uyariMesaji('Adet/Miktar 0 olamaz.')
    return
  }

const temizVeri = {
  work_order_id: seciliIsEmri.value.id,
  type: kalemForm.type,
  part_id: kalemForm.type === 'Parça' ? kalemForm.part_id : null,
  description: kalemForm.description,
  quantity: Number(kalemForm.quantity) || 1,
  unit_price: Number(kalemForm.unit_price) || 0,
  active_master_id: aktifUsta.value.id
}

  const res = await window.api.isEmriKalemEkle(temizVeri)

  if (res && res.success) {
    basariMesaji('Kalem eklendi.')

    Object.assign(kalemForm, {
      type: 'Parça',
      part_id: null,
      description: '',
      quantity: 1,
      unit_price: 0
    })

    await kalemleriGetir(seciliIsEmri.value.id)
    await listeleriGetir()

    const guncel = isEmirleri.value.find(i => i.id === seciliIsEmri.value.id)
    if (guncel) seciliIsEmri.value = guncel
  } else {
    hataMesaji(res?.error || 'Kalem eklenemedi.')
  }
}
const kalemSil = (kalem) => {
  if (!kalem?.id) return
    if (!aktifUsta.value?.id) {
    uyariMesaji('Kalem silmek için önce usta girişi yapılmalıdır.')
    return
  }

  if (seciliIsEmriTamamlandi.value) {
    uyariMesaji('Tamamlanmış iş emrinden kalem silinemez.')
    return
  }

  const mesaj = kalem.type === 'Parça'
    ? 'Bu parça kalemini silmek istediğinize emin misiniz? Kullanılan stok geri eklenecek.'
    : 'Bu işçilik kalemini silmek istediğinize emin misiniz?'

  confirmDialog.require({
    message: mesaj,
    header: 'Kalem Sil',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sil',
    rejectLabel: 'Vazgeç',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-secondary p-button-text',
    accept: async () => {
      const res = await window.api.isEmriKalemSil({
  id: kalem.id,
  active_master_id: aktifUsta.value.id
})

      if (res && res.success) {
        basariMesaji('Kalem silindi.')

        await kalemleriGetir(seciliIsEmri.value.id)
        await listeleriGetir()

        const guncel = isEmirleri.value.find(i => i.id === seciliIsEmri.value.id)
        if (guncel) seciliIsEmri.value = guncel
      } else {
        hataMesaji(res?.error || 'Kalem silinemedi.')
      }
    }
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

const tlFormatla = (deger) => {
  return `${Number(deger || 0).toLocaleString('tr-TR')} ₺`
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
const yuzdeFormatla = (deger) => {
  return `%${Number(deger || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}`
}
const guvenliMetin = (deger) => {
  return String(deger ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const ayariBooleanYap = (val, varsayilan = true) => {
  if (val === undefined || val === null) return varsayilan
  if (typeof val === 'boolean') return val
  const s = String(val).trim().toLowerCase()
  if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false
  if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true
  return Boolean(val)
}

const servisFisiYazdir = async () => {
  // Load setting before opening preview
  let show = true
  try {
    const sRes = await window.api?.ayarlariGetir?.()
    if (sRes?.settings && sRes.settings.show_payment_summary_on_receipt !== undefined) {
      show = ayariBooleanYap(sRes.settings.show_payment_summary_on_receipt, true)
    }
  } catch (e) { console.error('Ayar getirilemedi', e) }
  showPaymentSummary.value = show
  printPreviewOpen.value = true
}

const servisFisiYazdirGercek = async () => {
  // Load setting before generating printable HTML
  let showPayment = true
  try {
    const sRes = await window.api?.ayarlariGetir?.()
    if (sRes?.settings && sRes.settings.show_payment_summary_on_receipt !== undefined) {
      showPayment = ayariBooleanYap(sRes.settings.show_payment_summary_on_receipt, true)
    }
  } catch (e) { console.error('Ayar getirilemedi', e) }

  if (!seciliIsEmri.value) {
    uyariMesaji('Yazdırılacak iş emri seçilemedi.')
    return
  }

  const isEmri = seciliIsEmri.value

  const firma = {
    unvan: 'Kâtip',
    altBaslik: 'Oto Servis Takip Sistemi',
    aciklama: 'Bakım, onarım ve servis takip fişi'
  }

  const kalemSatirlari = kalemler.value.map((kalem, index) => {
    const tip = kalem.type || '-'

    const aciklama = kalem.type === 'Parça'
      ? `${kalem.part_code || ''} ${kalem.part_name || kalem.description || ''}`.trim()
      : kalem.description || '-'

    return `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${guvenliMetin(tip)}</td>
        <td>${guvenliMetin(aciklama)}</td>
        <td class="right">${guvenliMetin(kalem.quantity || 0)}</td>
        <td class="right">${guvenliMetin(tlFormatla(kalem.unit_price))}</td>
        <td class="right strong">${guvenliMetin(tlFormatla(kalem.total_price))}</td>
      </tr>
    `
  }).join('')

  const toplamTutar = kalemler.value.reduce((toplam, kalem) => {
    return toplam + Number(kalem.total_price || 0)
  }, 0)

  const yazdirmaPenceresi = window.open('', '_blank')

  if (!yazdirmaPenceresi) {
    hataMesaji('Yazdırma penceresi açılamadı.')
    return
  }

  yazdirmaPenceresi.document.write(`
    <!doctype html>
    <html lang="tr">
      <head>
        <meta charset="UTF-8" />
        <title>Servis Fişi - İş Emri ${guvenliMetin(isEmri.id)}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #ffffff;
            font-size: 12.5px;
          }

          .page {
            max-width: 980px;
            margin: 0 auto;
          }

          .top-header {
            display: grid;
            grid-template-columns: 1.4fr 0.8fr;
            gap: 18px;
            align-items: stretch;
            border-bottom: 3px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 18px;
          }

          .company-box {
            display: flex;
            flex-direction: column;
            justify-content: center;
          }

          .company-name {
            font-size: 30px;
            font-weight: 900;
            letter-spacing: -0.5px;
            margin: 0;
            color: #111827;
          }

          .company-subtitle {
            margin-top: 5px;
            color: #374151;
            font-size: 14px;
            font-weight: 700;
          }

          .company-desc {
            margin-top: 8px;
            color: #6b7280;
            font-size: 12px;
          }

          .document-box {
            border: 1px solid #111827;
            border-radius: 8px;
            padding: 12px;
            text-align: right;
          }

          .document-title {
            font-size: 20px;
            font-weight: 900;
            margin-bottom: 8px;
            color: #111827;
          }

          .document-no {
            font-size: 15px;
            font-weight: 800;
            margin-bottom: 5px;
          }

          .muted {
            color: #6b7280;
          }

          .section {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            margin-bottom: 14px;
            overflow: hidden;
          }

          .section-title {
            background: #f3f4f6;
            border-bottom: 1px solid #d1d5db;
            padding: 8px 10px;
            font-weight: 900;
            font-size: 13px;
            color: #111827;
          }

          .section-body {
            padding: 10px;
          }

          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px 18px;
          }

          .info-row {
            display: grid;
            grid-template-columns: 125px 1fr;
            gap: 8px;
            align-items: start;
          }

          .label {
            color: #4b5563;
            font-weight: 700;
          }

          .value {
            color: #111827;
            font-weight: 600;
          }

          .description-box {
            min-height: 54px;
            line-height: 1.45;
            color: #111827;
            white-space: pre-wrap;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th {
            background: #f3f4f6;
            color: #111827;
            font-weight: 900;
            border: 1px solid #d1d5db;
            padding: 8px;
            text-align: left;
          }

          td {
            border: 1px solid #d1d5db;
            padding: 8px;
            vertical-align: top;
          }

          .center {
            text-align: center;
          }

          .right {
            text-align: right;
          }

          .strong {
            font-weight: 900;
          }

          .total-area {
            display: flex;
            justify-content: flex-end;
            margin-top: 12px;
          }

          .total-box {
            min-width: 280px;
            border: 2px solid #111827;
            border-radius: 8px;
            overflow: hidden;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 11px 12px;
            font-size: 15px;
            font-weight: 900;
            background: #f9fafb;
          }

          .warning-note {
            margin-top: 14px;
            border: 2px solid #f59e0b;
            background: #fffbeb;
            color: #92400e;
            padding: 10px 12px;
            border-radius: 8px;
            font-weight: 900;
            line-height: 1.45;
          }

          .footer-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 44px;
            margin-top: 54px;
          }

          .signature-box {
            border-top: 1px solid #111827;
            padding-top: 8px;
            text-align: center;
            font-weight: 800;
          }

          .signature-sub {
            margin-top: 4px;
            color: #6b7280;
            font-size: 11px;
            font-weight: 500;
          }

.print-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.print-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 999px;
  padding: 10px 18px;
  cursor: pointer;
  font-weight: 900;
  font-size: 13px;
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
}

.print-btn:hover {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
}

.print-icon {
  font-size: 15px;
  line-height: 1;
}

          @media print {
            body {
              padding: 0;
            }

            .page {
              max-width: none;
              margin: 0;
            }

            .print-actions {
              display: none;
            }

            .section {
              break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        <div class="page">
          <div class="print-actions">
            <button class="print-btn" onclick="window.print()">
              <span class="print-icon">🖨</span>
              <span>Yazdır</span>
            </button>
          </div>

          <div class="top-header">
            <div class="company-box">
              <h1 class="company-name">${guvenliMetin(firma.unvan)}</h1>
              <div class="company-subtitle">${guvenliMetin(firma.altBaslik)}</div>
              <div class="company-desc">${guvenliMetin(firma.aciklama)}</div>
            </div>

            <div class="document-box">
              <div class="document-title">SERVİS FİŞİ</div>
              <div class="document-no">İş Emri No: #${guvenliMetin(isEmri.id)}</div>
              <div class="muted">Fiş Tarihi: ${guvenliMetin(new Date().toLocaleString('tr-TR'))}</div>
              <div class="muted">Durum: ${guvenliMetin(isEmri.status || '-')}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Müşteri Bilgileri</div>

            <div class="section-body">
              <div class="info-grid">
                <div class="info-row">
                  <div class="label">Müşteri</div>
                  <div class="value">${guvenliMetin(isEmri.customer_name || '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Telefon</div>
                  <div class="value">${guvenliMetin(isEmri.customer_phone || '-')}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Araç ve İş Emri Bilgileri</div>

            <div class="section-body">
              <div class="info-grid">
                <div class="info-row">
                  <div class="label">Plaka</div>
                  <div class="value">${guvenliMetin(isEmri.plate || '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Marka / Model</div>
                  <div class="value">${guvenliMetin(`${isEmri.brand || '-'} / ${isEmri.model || '-'}`)}</div>
                </div>

                <div class="info-row">
                  <div class="label">Şase</div>
                  <div class="value">${guvenliMetin(isEmri.chassis || '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Kilometre</div>
                  <div class="value">${guvenliMetin(isEmri.mileage ? Number(isEmri.mileage).toLocaleString('tr-TR') + ' km' : '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Açılış Tarihi</div>
                  <div class="value">${guvenliMetin(tarihFormatla(isEmri.created_at))}</div>
                </div>

                <div class="info-row">
                  <div class="label">Kapanış Tarihi</div>
                  <div class="value">${guvenliMetin(tarihFormatla(isEmri.closed_at))}</div>
                </div>

                <div class="info-row">
                  <div class="label">Açan Usta</div>
                  <div class="value">${guvenliMetin(isEmri.opened_by_master_name || '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Kapatan Usta</div>
                  <div class="value">${guvenliMetin(isEmri.closed_by_master_name || '-')}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Müşteri Şikayeti / Yapılacak İşlem</div>

            <div class="section-body">
              <div class="description-box">${guvenliMetin(isEmri.description || '-')}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Parça ve İşçilik Kalemleri</div>

            <div class="section-body">
              <table>
                <thead>
                  <tr>
                    <th style="width: 42px;" class="center">#</th>
                    <th style="width: 90px;">Tip</th>
                    <th>Açıklama</th>
                    <th style="width: 80px;" class="right">Miktar</th>
                    <th style="width: 120px;" class="right">Birim Fiyat</th>
                    <th style="width: 130px;" class="right">Toplam</th>
                  </tr>
                </thead>

                <tbody>
                  ${kalemSatirlari || `
                    <tr>
                      <td colspan="6" class="center">Bu iş emrine ait kalem bulunamadı.</td>
                    </tr>
                  `}
                </tbody>
              </table>

              <div class="total-area">
                <div class="total-box">
                  <div class="total-row">
                    <span>Genel Toplam</span>
                    <span>${guvenliMetin(tlFormatla(toplamTutar || isEmri.total_price))}</span>
                  </div>
${showPayment ? `
                  <div class="total-row" style="margin-top: 4px; font-size: 12px; color: #555;">
                    <span>Tahsil Edilen:</span>
                    <span>${guvenliMetin(tlFormatla(odemeOzeti.toplam_tahsilat))}</span>
                  </div>
                  <div class="total-row" style="font-size: 12px; color: #555;">
                    <span>Kalan Borç:</span>
                    <span>${guvenliMetin(tlFormatla(odemeOzeti.kalan_borc))}</span>
                  </div>
                  <div class="total-row" style="font-size: 12px; color: #555;">
                    <span>Ödeme Durumu:</span>
                    <span>${guvenliMetin(odemeOzeti.odeme_durumu)}</span>
                  </div>
` : ''}
                </div>
              </div>

              <div class="warning-note">
                Bu belge fatura değildir. E-fatura, e-arşiv fatura veya resmi mali belge yerine geçmez.
                Sadece servis takip ve bilgilendirme fişidir.
              </div>
            </div>
          </div>

          <div class="footer-grid">
            <div class="signature-box">
              Müşteri İmzası
              <div class="signature-sub">Ad Soyad / İmza</div>
            </div>

            <div class="signature-box">
              Servis Yetkilisi
              <div class="signature-sub">${guvenliMetin(isEmri.closed_by_master_name || isEmri.opened_by_master_name || '-')}</div>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
          window.onafterprint = function() {
            window.close();
          };
        <\/script>
      </body>
    </html>
  `)

  yazdirmaPenceresi.document.close()
}
const verileriYenileDetayli = async () => {
  await listeleriGetir()
  if (seciliIsEmri.value?.id) {
    const guncel = isEmirleri.value.find(i => i.id === seciliIsEmri.value.id)
    if (guncel) {
      seciliIsEmri.value = guncel
      await kalemleriGetir(guncel.id)
      await odemeleriGetir(guncel.id)
    } else {
      seciliIsEmri.value = null
      kalemler.value = []
      odemeGecmisi.value = []
    }
  }
}

onMounted(async () => {
  aktifUsta.value = JSON.parse(localStorage.getItem('aktifUsta') || 'null')

  if (window.api?.ayarlariGetir) {
    try {
      const res = await window.api.ayarlariGetir()
      if (res?.success && res.settings?.work_orders_default_filter) {
        const filterVal = res.settings.work_orders_default_filter
        if (['Açık', 'Beklemede', 'Tümü'].includes(filterVal)) {
          durumFiltresi.value = filterVal
        }
      }
    } catch (e) {
      console.warn('İş emirleri filtre ayarı uygulanamadı:', e)
    }
  }

  listeleriGetir()
  window.addEventListener('app-data-refreshed', verileriYenileDetayli)
})

onUnmounted(() => {
  window.removeEventListener('app-data-refreshed', verileriYenileDetayli)
})
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <!-- Üst Başlık -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="margin: 0; font-size: 1.5rem; font-weight: 700; color: var(--text-title, #fff);">İş Emirleri</h2>
        <p style="margin: 4px 0 0; color: var(--text-muted, #94a3b8); font-size: 0.88rem;">
          Açık, bekleyen ve tamamlanan iş emirlerini yönetin.
        </p>
      </div>

      <Button
        label="Yeni İş Emri Aç"
        icon="pi pi-plus"
        severity="info"
        size="small"
        @click="yeniIsEmriAc"
      />
    </div>

    <!-- Toolbar & Filtre Çubuğu -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; background: var(--bg-panel); border: 1px solid var(--border-color); padding: 12px 16px; border-radius: 12px;">
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        <Button
          :label="`Açık (${durumSayisi('Açık')})`"
          icon="pi pi-wrench"
          size="small"
          :outlined="durumFiltresi !== 'Açık'"
          severity="danger"
          @click="durumFiltresi = 'Açık'"
        />

        <Button
          :label="`Beklemede (${durumSayisi('Beklemede')})`"
          icon="pi pi-clock"
          size="small"
          :outlined="durumFiltresi !== 'Beklemede'"
          severity="warn"
          @click="durumFiltresi = 'Beklemede'"
        />

        <Button
          :label="`Tamamlananlar (${durumSayisi('Tamamlandı')})`"
          icon="pi pi-check"
          size="small"
          :outlined="durumFiltresi !== 'Tamamlandı'"
          severity="success"
          @click="durumFiltresi = 'Tamamlandı'"
        />

        <Button
          :label="`Hepsi (${durumSayisi('Tümü')})`"
          icon="pi pi-list"
          size="small"
          :outlined="durumFiltresi !== 'Tümü'"
          severity="secondary"
          @click="durumFiltresi = 'Tümü'"
        />
      </div>

      <span class="p-input-icon-left" style="min-width: 280px;">
        <i class="pi pi-search" />
        <InputText
          v-model="aramaKelimesi"
          placeholder="Plaka, müşteri, usta veya açıklama ara..."
          style="width: 100%; font-size: 0.88rem;"
        />
      </span>
    </div>

    <!-- Kompakt Hibrit Liste / Tablo Paneli (72px Yükseklik) -->
    <div class="work-orders-table-panel">
      <!-- Başlık Satırı -->
      <div class="table-header-row">
        <div>Plaka ve Usta</div>
        <div>Açıklama ve Tarih</div>
        <div>Tutar ve Ödeme Durumu</div>
        <div>İş Emri Durumu</div>
        <div style="text-align: right;">İşlemler</div>
      </div>

      <!-- Satırlar Listesi -->
      <div class="table-body-rows">
        <div
          v-for="isEmri in filtrelenmisIsEmirleri"
          :key="isEmri.id"
          class="work-order-table-row"
          :class="{ 'is-selected': seciliIsEmri?.id === isEmri.id }"
          @click="kalemleriAc(isEmri)"
        >
          <!-- Kolon 1: Plaka ve Usta -->
          <div class="col-plate-master">
            <span class="plate-text">{{ isEmri.plate || 'PLAKASIZ' }}</span>
            <span class="master-customer-text">
              {{ isEmri.opened_by_master_name || 'Usta' }}
              <template v-if="isEmri.customer_name"> · {{ isEmri.customer_name }}</template>
            </span>
          </div>

          <!-- Kolon 2: Açıklama ve Tarih -->
          <div class="col-desc-date">
            <span class="desc-text" :title="isEmri.description">
              {{ isEmri.description || 'Şikayet / Açıklama Girilmedi' }}
            </span>
            <span class="date-text" :title="`Açılış: ${tarihSaatFormatla(isEmri.created_at)}${isEmri.closed_at ? ' | Kapanış: ' + tarihSaatFormatla(isEmri.closed_at) : ''}`">
              {{ tarihSaatFormatla(isEmri.created_at) }}
              <template v-if="isEmri.closed_at"> · Kapanış: {{ tarihSaatFormatla(isEmri.closed_at) }}</template>
            </span>
          </div>

          <!-- Kolon 3: Tutar ve Ödeme Durumu -->
          <div 
            class="col-finance"
            :title="`Toplam: ${tlFormatla(isEmri.total_price)} | Tahsil Edilen: ${tlFormatla(isEmri.toplam_tahsilat || 0)} | Kalan: ${tlFormatla((Number(isEmri.total_price || 0) - Number(isEmri.toplam_tahsilat || 0)).toFixed(2))}`"
          >
            <span class="price-text">{{ tlFormatla(isEmri.total_price) }}</span>
            <span class="payment-badge-text" :style="{ color: odemeDurumuHesapla(isEmri).color }">
              {{ odemeDurumuHesapla(isEmri).text }}
            </span>
          </div>

          <!-- Kolon 4: İş Emri Durumu -->
          <div class="col-status" @click.stop>
            <Dropdown
              :modelValue="isEmri.status"
              :options="durumSecenekleri"
              class="durum-dropdown-compact"
              :disabled="isEmri.status === 'Tamamlandı'"
              @change="durumDegistir(isEmri, $event.value)"
            >
              <template #value="valueSlot">
                <Tag :value="valueSlot.value" :severity="getSeverity(valueSlot.value)" style="font-size: 0.75rem; padding: 2px 8px;" />
              </template>
              <template #option="optionSlot">
                <Tag :value="optionSlot.option" :severity="getSeverity(optionSlot.option)" style="font-size: 0.75rem;" />
              </template>
            </Dropdown>
          </div>

          <!-- Kolon 5: İşlemler -->
          <div class="col-actions" @click.stop>
            <Button
              v-if="isEmri.status === 'Tamamlandı'"
              icon="pi pi-undo"
              size="small"
              severity="warning"
              text
              rounded
              title="Tekrar Aç"
              @click.stop="tekrarAc(isEmri)"
            />
            <Button
              icon="pi pi-pencil"
              size="small"
              severity="info"
              text
              rounded
              :disabled="isEmri.status === 'Tamamlandı'"
              title="Düzenle"
              @click.stop="duzenle(isEmri)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              severity="danger"
              text
              rounded
              :disabled="isEmri.status === 'Tamamlandı'"
              title="Sil"
              @click.stop="sil(isEmri)"
            />
          </div>
        </div>

        <div v-if="filtrelenmisIsEmirleri.length === 0" class="empty-state-row">
          Kayıtlı iş emri bulunamadı.
        </div>
      </div>
    </div>

    <div
      v-if="!seciliIsEmri"
      class="inline-empty-panel"
    >
      Kalem eklemek için listeden bir iş emri seçin.
    </div>

    <Dialog
      v-model:visible="dialogAcik"
      :header="form.id ? 'İş Emrini Düzenle / Kapat' : 'Yeni İş Emri Aç'"
      :style="{ width: '500px' }"
      modal
    >
      <div style="display: flex; flex-direction: column; gap: 15px; padding-top: 10px;">
        <div class="form-group">
          <label>İşlem Yapılacak Araç</label>

          <Dropdown
            v-model="form.vehicle_id"
            :options="araclarListesi"
            optionValue="id"
            placeholder="Plaka Seçiniz..."
            filter
            style="width: 100%"
            :disabled="form.id !== null"
          >
            <template #option="slotProps">
              <div>
                <strong>{{ slotProps.option.plate }}</strong>
                - {{ slotProps.option.customer_name }}
              </div>
            </template>

            <template #value="slotProps">
              <div v-if="slotProps.value">
                {{ araclarListesi.find(a => a.id === slotProps.value)?.plate }}
              </div>
              <span v-else>Plaka Seçiniz...</span>
            </template>
          </Dropdown>
        </div>
        
        <div class="form-group">
          <label>Genel Açıklama / Şikayet</label>
          <Textarea
            v-model="form.description"
            rows="3"
            placeholder="Örn: Yağ bakımı yapılacak, araçtan ses geliyor..."
            style="width: 100%"
          />
        </div>

<div class="form-group">
  <label>Toplam Tutar</label>
  <InputText
    :value="tlFormatla(form.total_price)"
    disabled
    style="width: 100%"
  />
</div>
      </div>

      <template #footer>
        <Button label="İptal" icon="pi pi-times" text @click="dialogAcik = false" />
        <Button label="Kaydet" icon="pi pi-check" @click="kaydet" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="tekrarAcDialogAcik"
      header="İş Emrini Tekrar Aç"
      :style="{ width: '520px' }"
      modal
    >
      <div style="display: flex; flex-direction: column; gap: 14px; padding-top: 8px;">
        <div
          style="background: var(--bg-active-box); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; color: var(--text-primary);"
        >
          <strong>Uyarı:</strong>
          Bu işlem tamamlanmış iş emrini tekrar açık duruma alır.
          Kapanış tarihi ve kapatan usta bilgisi temizlenir.
          İşlem geçmişine aktif usta, tarih ve sebep kaydedilir.
        </div>

        <div class="form-group">
          <label>Tekrar Açma Sebebi</label>
          <Textarea
            v-model="tekrarAcForm.reason"
            rows="4"
            placeholder="Örn: Eksik işlem fark edildi, müşteri ek işlem istedi, yanlışlıkla kapatıldı..."
            style="width: 100%"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="Vazgeç"
          icon="pi pi-times"
          text
          @click="tekrarAcDialogAcik = false"
        />

        <Button
          label="Tekrar Aç"
          icon="pi pi-undo"
          severity="warning"
          @click="tekrarAcKaydet"
        />
      </template>
    </Dialog>

    <!-- Ödeme Al Dialog -->
    <Dialog
      v-model:visible="odemeDialogAcik"
      header="İş Emri Ödemesi Al"
      :style="{ width: '460px' }"
      modal
    >
      <div style="display: flex; flex-direction: column; gap: 14px; padding-top: 8px;">
        <div style="background: var(--bg-active-box); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div><strong>Plaka:</strong> {{ seciliIsEmri?.plate }}</div>
          <div><strong>İş Emri Toplamı:</strong> {{ tlFormatla(odemeOzeti.total_price) }}</div>
          <div><strong>Mevcut Kalan Borç:</strong> <span style="color: #f87171; font-weight: bold;">{{ tlFormatla(odemeOzeti.kalan_borc) }}</span></div>
        </div>

        <div class="form-group">
          <label>Alınan Ödeme Tutarı (TL) <span class="zorunlu-alan">*</span></label>
          <InputText
            type="number"
            step="0.01"
            v-model="odemeForm.amount"
            style="width: 100%"
            autofocus
          />
        </div>

        <div class="form-group">
          <label>Ödeme Yöntemi <span class="zorunlu-alan">*</span></label>
          <Dropdown
            v-model="odemeForm.payment_method"
            :options="['Nakit', 'Kart', 'Havale / EFT', 'Diğer']"
            style="width: 100%"
          />
        </div>

        <div class="form-group">
          <label>Ödeme Tarihi <span class="zorunlu-alan">*</span></label>
          <InputText
            type="date"
            v-model="odemeForm.payment_date"
            style="width: 100%"
          />
        </div>

        <div class="form-group">
          <label>Açıklama / Not</label>
          <InputText
            v-model="odemeForm.note"
            placeholder="Örn: Kapora, Kısmi Ödeme veya Kredi Kartı Fiş No..."
            style="width: 100%"
          />
        </div>

        <div style="font-size: 0.85rem; color: var(--text-muted, #94a3b8); padding-top: 4px;">
          Tahsilatı Alan Usta: <strong>{{ aktifUsta?.name || 'Giriş Yapılmamış' }}</strong>
        </div>
      </div>

      <template #footer>
        <Button label="İptal" icon="pi pi-times" text @click="odemeDialogAcik = false" />
        <Button label="Ödemeyi Kaydet" icon="pi pi-check" severity="success" @click="odemeKaydet" />
      </template>
    </Dialog>

    <!-- İş Emrini Tamamla ve Kapat Dialog -->
    <Dialog
      v-model:visible="tamamlaDialogAcik"
      header="İş Emrini Tamamla ve Kapat"
      :style="{ width: '520px' }"
      modal
    >
      <div style="display: flex; flex-direction: column; gap: 16px; padding-top: 8px;">
        <div style="background: var(--bg-active-box); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div><strong>Araç:</strong> {{ tamamlanacakIsEmri?.plate }} - {{ tamamlanacakIsEmri?.customer_name }}</div>
          <div><strong>İş Emri Toplamı:</strong> {{ tlFormatla(tamamlanacakIsEmri?.total_price) }}</div>
          <div><strong>Kalan Borç:</strong> <strong :style="{ color: tamamlaForm.kalan_borc <= 0.01 ? '#34d399' : '#f87171' }">{{ tlFormatla(tamamlaForm.kalan_borc) }}</strong></div>
        </div>

        <!-- Ödeme Zaten Tamamen Alınmışsa -->
        <div v-if="tamamlaForm.kalan_borc <= 0.01" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; padding: 12px; border-radius: 8px; font-weight: 500; display: flex; align-items: center; gap: 10px;">
          <i class="pi pi-check-circle" style="font-size: 1.3rem;"></i>
          <span>Bu iş emrinin ödemesi daha önce tamamen alınmış.</span>
        </div>

        <!-- Kalan Borç Varsa Ödeme Seçenekleri -->
        <template v-else>
          <div class="form-group">
            <label>Kapanış Ödeme Seçeneği <span class="zorunlu-alan">*</span></label>
            <div style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-active-box); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" value="full" v-model="tamamlaForm.payment_option" style="accent-color: #10b981;" />
                <span style="color: var(--text-title);"><strong>Tamamı ödendi</strong> ({{ tlFormatla(tamamlaForm.kalan_borc) }} tahsil edildi)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" value="partial" v-model="tamamlaForm.payment_option" style="accent-color: #f59e0b;" />
                <span style="color: var(--text-title);"><strong>Kısmi ödeme alındı</strong> (Bir kısmı tahsil edildi)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" value="none" v-model="tamamlaForm.payment_option" style="accent-color: #ef4444;" />
                <span style="color: var(--text-title);"><strong>Ödeme alınmadı / Veresiye</strong> (Açık borç olarak kalsın)</span>
              </label>
            </div>
          </div>

          <div v-if="tamamlaForm.payment_option === 'partial'" class="form-group">
            <label>Alınan Ödeme Tutarı (TL) <span class="zorunlu-alan">*</span></label>
            <InputText
              type="number"
              step="0.01"
              v-model="tamamlaForm.amount"
              style="width: 100%"
            />
          </div>

          <div v-if="tamamlaForm.payment_option !== 'none'" class="form-group">
            <label>Ödeme Yöntemi <span class="zorunlu-alan">*</span></label>
            <Dropdown
              v-model="tamamlaForm.payment_method"
              :options="['Nakit', 'Kart', 'Havale / EFT', 'Diğer']"
              style="width: 100%"
            />
          </div>

          <div v-if="tamamlaForm.payment_option !== 'none'" class="form-group">
            <label>Ödeme Tarihi</label>
            <InputText
              type="date"
              v-model="tamamlaForm.payment_date"
              style="width: 100%"
            />
          </div>

          <div v-if="tamamlaForm.payment_option !== 'none'" class="form-group">
            <label>Açıklama / Not</label>
            <InputText
              v-model="tamamlaForm.note"
              placeholder="Kapanış ödemesi açıklaması..."
              style="width: 100%"
            />
          </div>
        </template>
      </div>

      <template #footer>
        <Button label="Vazgeç" icon="pi pi-times" text @click="tamamlaDialogAcik = false" />
        <Button label="İş Emrini Tamamla" icon="pi pi-check" severity="success" @click="tamamlaVeOdemeKaydet" />
      </template>
    </Dialog>

    <!-- Ödeme İptal Dialog -->
    <Dialog
      v-model:visible="odemeIptalDialogAcik"
      header="Ödeme Kaydını İptal Et"
      :style="{ width: '460px' }"
      modal
    >
      <div style="display: flex; flex-direction: column; gap: 14px; padding-top: 8px;">
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px; border-radius: 8px; color: #f87171;">
          <strong>Dikkat:</strong> Ödeme kaydı fiziksel olarak silinmeyecek, yetkili iptal kaydı olarak işaretlenecek ve toplam tahsilattan düşecektir.
        </div>

        <div class="form-group">
          <label>İptal Sebebi <span class="zorunlu-alan">*</span></label>
          <Textarea
            v-model="iptalForm.cancel_reason"
            rows="3"
            placeholder="Örn: Hatalı tutar girildi, nakit ödeme iade edildi..."
            style="width: 100%"
            autofocus
          />
        </div>
      </div>

      <template #footer>
        <Button label="Vazgeç" icon="pi pi-times" text @click="odemeIptalDialogAcik = false" />
        <Button label="Ödemeyi İptal Et" icon="pi pi-ban" severity="danger" @click="odemeIptalKaydet" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="printPreviewOpen"
      header="Servis Fişi Önizleme"
      :style="{ width: '850px' }"
      modal
    >
      <div class="print-preview-content">
        <div class="preview-sheet">
          <div class="top-header">
            <div class="company-box">
              <h1 class="company-name">Kâtip</h1>
              <div class="company-subtitle">Oto Servis Takip Sistemi</div>
              <div class="company-desc">Bakım, onarım ve servis takip fişi</div>
            </div>

            <div class="document-box">
              <div class="document-title">SERVİS FİŞİ</div>
              <div class="document-no">İş Emri No: #{{ seciliIsEmri?.id }}</div>
              <div class="muted">Fiş Tarihi: {{ new Date().toLocaleString('tr-TR') }}</div>
              <div class="muted">Durum: {{ seciliIsEmri?.status }}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Müşteri Bilgileri</div>
            <div class="section-body">
              <div class="info-grid">
                <div class="info-row">
                  <div class="label">Müşteri</div>
                  <div class="value">{{ seciliIsEmri?.customer_name || '-' }}</div>
                </div>
                <div class="info-row">
                  <div class="label">Telefon</div>
                  <div class="value">{{ seciliIsEmri?.customer_phone || '-' }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Araç ve İş Emri Bilgileri</div>
            <div class="section-body">
              <div class="info-grid">
                <div class="info-row">
                  <div class="label">Plaka</div>
                  <div class="value">{{ seciliIsEmri?.plate || '-' }}</div>
                </div>
                <div class="info-row">
                  <div class="label">Marka / Model</div>
                  <div class="value">{{ seciliIsEmri?.brand || '-' }} / {{ seciliIsEmri?.model || '-' }}</div>
                </div>
                <div class="info-row">
                  <div class="label">Şase</div>
                  <div class="value">{{ seciliIsEmri?.chassis || '-' }}</div>
                </div>
                <div class="info-row">
                  <div class="label">Kilometre</div>
                  <div class="value">{{ seciliIsEmri?.mileage ? Number(seciliIsEmri.mileage).toLocaleString('tr-TR') + ' km' : '-' }}</div>
                </div>
                <div class="info-row">
                  <div class="label">Açılış Tarihi</div>
                  <div class="value">{{ tarihFormatla(seciliIsEmri?.created_at) }}</div>
                </div>
                <div class="info-row">
                  <div class="label">Kapanış Tarihi</div>
                  <div class="value">{{ tarihFormatla(seciliIsEmri?.closed_at) }}</div>
                </div>
                <div class="info-row">
                  <div class="label">Açan Usta</div>
                  <div class="value">{{ seciliIsEmri?.opened_by_master_name || '-' }}</div>
                </div>
                <div class="info-row">
                  <div class="label">Kapatan Usta</div>
                  <div class="value">{{ seciliIsEmri?.closed_by_master_name || '-' }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Müşteri Şikayeti / Yapılacak İşlem</div>
            <div class="section-body">
              <div class="description-box">{{ seciliIsEmri?.description || '-' }}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Parça ve İşçilik Kalemleri</div>
            <div class="section-body">
              <table>
                <thead>
                  <tr>
                    <th style="width: 42px;" class="center">#</th>
                    <th style="width: 90px;">Tip</th>
                    <th>Açıklama</th>
                    <th style="width: 80px;" class="right">Miktar</th>
                    <th style="width: 120px;" class="right">Birim Fiyat</th>
                    <th style="width: 130px;" class="right">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(kalem, index) in kalemler" :key="kalem.id || index">
                    <td class="center">{{ index + 1 }}</td>
                    <td>{{ kalem.type || '-' }}</td>
                    <td>
                      {{ kalem.type === 'Parça' ? `${kalem.part_code || ''} ${kalem.part_name || kalem.description || ''}`.trim() : kalem.description || '-' }}
                    </td>
                    <td class="right">{{ kalem.quantity || 0 }}</td>
                    <td class="right">{{ tlFormatla(kalem.unit_price) }}</td>
                    <td class="right strong">{{ tlFormatla(kalem.total_price) }}</td>
                  </tr>
                  <tr v-if="kalemler.length === 0">
                    <td colspan="6" class="center">Bu iş emrine ait kalem bulunamadı.</td>
                  </tr>
                </tbody>
              </table>

              <div class="total-area">
                <div class="total-box">
                  <div class="total-row">
                    <span>Genel Toplam</span>
                    <span>{{ tlFormatla(kalemler.reduce((toplam, kalem) => toplam + Number(kalem.total_price || 0), 0) || seciliIsEmri?.total_price) }}</span>
                  </div>
                  <div class="total-row" style="margin-top: 4px; font-size: 12px; color: #555;" v-if="showPaymentSummary">
                    <span>Tahsil Edilen:</span>
                    <span>{{ tlFormatla(odemeOzeti.toplam_tahsilat) }}</span>
                  </div>
                  <div class="total-row" style="font-size: 12px; color: #555;" v-if="showPaymentSummary">
                    <span>Kalan Borç:</span>
                    <span>{{ tlFormatla(odemeOzeti.kalan_borc) }}</span>
                  </div>
                  <div class="total-row" style="font-size: 12px; color: #555;" v-if="showPaymentSummary">
                    <span>Ödeme Durumu:</span>
                    <span>{{ odemeOzeti.odeme_durumu }}</span>
                  </div>
                </div>
              </div>

              <div class="warning-note">
                Bu belge fatura değildir. E-fatura, e-arşiv fatura veya resmi mali belge yerine geçmez.
                Sadece servis takip ve bilgilendirme fişidir.
              </div>
            </div>
          </div>

          <div class="footer-grid">
            <div class="signature-box">
              Müşteri İmzası
              <div class="signature-sub">Ad Soyad / İmza</div>
            </div>
            <div class="signature-box">
              Servis Yetkilisi
              <div class="signature-sub">{{ seciliIsEmri?.closed_by_master_name || seciliIsEmri?.opened_by_master_name || '-' }}</div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          label="Yazdır"
          icon="pi pi-print"
          style="background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: bold; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);"
          @click="servisFisiYazdirGercek"
        />
      </template>
    </Dialog>

<div
  v-if="seciliIsEmri"
  class="inline-kalem-panel"
>
<Dialog
  v-model:visible="kalemDialogAcik"
  header="Kalem Düzenle"
  :style="{ width: '720px' }"
  modal
>
  <div style="display: flex; flex-direction: column; gap: 15px; padding-top: 10px;">
    <div class="form-group">
      <label>Tip</label>
      <Dropdown
        v-model="kalemDuzenleForm.type"
        :options="kalemTipleri"
        style="width: 100%"
        @change="Object.assign(kalemDuzenleForm, { part_id: null, description: '', quantity: 1, unit_price: 0 })"
      />
    </div>

    <div
      v-if="kalemDuzenleForm.type === 'Parça'"
      class="form-group"
    >
      <label>Parça Seç</label>
      <Dropdown
        v-model="kalemDuzenleForm.part_id"
        :options="parcalarListesi"
        optionLabel="name"
        optionValue="id"
        filter
        placeholder="Parça ara..."
        style="width: 100%"
        @change="kalemDuzenleParcaSecildi($event.value)"
      >
        <template #option="slotProps">
          <div>
            <strong>{{ slotProps.option.code }}</strong>
            - {{ slotProps.option.name }}
            <span style="color: #aaa;"> | Stok: {{ slotProps.option.stock }}</span>
          </div>
        </template>
      </Dropdown>
    </div>

    <div
      v-else
      class="form-group"
    >
      <label>İşçilik Açıklaması</label>
      <InputText
        v-model="kalemDuzenleForm.description"
        placeholder="Örn: Yağ bakım işçiliği"
        style="width: 100%"
      />
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <div class="form-group">
        <label>Miktar</label>
        <InputText
          type="number"
          v-model="kalemDuzenleForm.quantity"
          style="width: 100%"
        />
      </div>

      <div class="form-group">
        <label>Birim Fiyat</label>
        <InputText
          type="number"
          v-model="kalemDuzenleForm.unit_price"
          style="width: 100%"
        />
      </div>
    </div>

    <div
      style="background: var(--bg-active-box); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; color: var(--text-secondary);"
    >
      Parça miktarı veya parça seçimi değişirse stok hareketi otomatik güncellenir.
    </div>
  </div>

  <template #footer>
    <Button
      label="İptal"
      icon="pi pi-times"
      text
      @click="kalemDialogAcik = false"
    />

    <Button
      label="Güncelle"
      icon="pi pi-check"
      severity="success"
      @click="kalemGuncelleKaydet"
    />
  </template>
</Dialog>
  <div class="inline-kalem-header">
    <div>
      <h3>{{ seciliIsEmri.plate }} - İş Emri Kalemleri</h3>
      <p>Parça ve işçilik kalemlerini buradan doğrudan ekleyebilirsiniz.</p>
    </div>
  </div>
      <div v-if="seciliIsEmri" style="display: flex; flex-direction: column; gap: 20px;">
        <div style="background: var(--bg-active-box); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; color: var(--text-primary);">
          <div style="display: flex; justify-content: space-between; gap: 20px;">
            <div>
<strong>Plaka:</strong> {{ seciliIsEmri.plate }} <br>
<strong>Müşteri:</strong> {{ seciliIsEmri.customer_name }} <br>
<strong>Açılış Tarihi:</strong> {{ tarihFormatla(seciliIsEmri.created_at) }} <br>
<strong>Kapanış Tarihi:</strong> {{ tarihFormatla(seciliIsEmri.closed_at) }} <br>
<strong>Açan Usta:</strong> {{ seciliIsEmri.opened_by_master_name || '-' }} <br>
<strong>Kapatan Usta:</strong> {{ seciliIsEmri.closed_by_master_name || '-' }} <br>
<strong>Durum:</strong>
              <Tag
                :value="seciliIsEmri.status"
                :severity="getSeverity(seciliIsEmri.status)"
                style="margin-left: 5px;"
              />
            </div>

<div style="text-align: right;">
  <span style="color: #aaa;">İş Emri Toplamı</span>
  <h2 style="margin: 5px 0 10px; color: #4ade80;">
    {{ tlFormatla(seciliIsEmri.total_price) }}
  </h2>

  <Button
    label="Servis Fişi Yazdır"
    icon="pi pi-print"
    size="small"
    severity="secondary"
    @click="servisFisiYazdir"
  />
  <Button
  v-if="seciliIsEmriTamamlandi"
  label="Tekrar Aç"
  icon="pi pi-undo"
  size="small"
  severity="warning"
  outlined
  style="margin-top: 8px;"
  @click.stop="tekrarAc(seciliIsEmri)"
/>
</div>
          </div>
        </div>

        <!-- İş Emri Detay Sekme Menüsü -->
        <div class="work-order-tabs" style="margin-top: 14px; margin-bottom: 14px; display: flex; gap: 8px; flex-wrap: wrap;">
          <Button
            :label="`İş Emri Kalemleri (${kalemler.length})`"
            icon="pi pi-wrench"
            size="small"
            :severity="detaySekmesi === 'kalemler' ? 'primary' : 'secondary'"
            :outlined="detaySekmesi !== 'kalemler'"
            @click="detaySekmesi = 'kalemler'"
          />
          <Button
            :label="`Araç Fotoğrafları (${fotograflar.length})`"
            icon="pi pi-camera"
            size="small"
            :severity="detaySekmesi === 'fotograflar' ? 'primary' : 'secondary'"
            :outlined="detaySekmesi !== 'fotograflar'"
            @click="detaySekmesi = 'fotograflar'"
          />
          <Button
            :label="`Ödemeler & Tahsilat (${odemeOzeti.odeme_durumu || 'Ödenmedi'})`"
            icon="pi pi-credit-card"
            size="small"
            :severity="detaySekmesi === 'odemeler' ? 'primary' : 'secondary'"
            :outlined="detaySekmesi !== 'odemeler'"
            @click="detaySekmesi = 'odemeler'"
          />
          <Button
            label="İşlem Geçmişi & Maliyet"
            icon="pi pi-history"
            size="small"
            :severity="detaySekmesi === 'gecmis' ? 'primary' : 'secondary'"
            :outlined="detaySekmesi !== 'gecmis'"
            @click="detaySekmesi = 'gecmis'"
          />
        </div>

        <!-- SEKME 1: İş Emri Kalemleri (Parça & İşçilik) -->
        <div v-if="detaySekmesi === 'kalemler'" style="display: flex; flex-direction: column; gap: 14px;">
          <div
            v-if="!seciliIsEmriTamamlandi"
            style="background: var(--bg-active-box); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px;"
          >
          <h3 style="margin-top: 0;">Yeni Kalem Ekle</h3>

          <div style="display: grid; grid-template-columns: 130px 1fr 110px 130px 120px; gap: 10px; align-items: end;">
            <div class="form-group">
              <label>Tip</label>
              <Dropdown
                v-model="kalemForm.type"
                :options="kalemTipleri"
                style="width: 100%"
                @change="Object.assign(kalemForm, { part_id: null, description: '', quantity: 1, unit_price: 0 })"
              />
            </div>

            <div v-if="kalemForm.type === 'Parça'" class="form-group">
              <label>Parça Seç</label>
              <Dropdown
                v-model="kalemForm.part_id"
                :options="parcalarListesi"
                optionLabel="name"
                optionValue="id"
                filter
                placeholder="Parça ara..."
                style="width: 100%"
                @change="parcaSecildi($event.value)"
              >
                <template #option="slotProps">
                  <div>
                    <strong>{{ slotProps.option.code }}</strong>
                    - {{ slotProps.option.name }}
                    <span style="color: #aaa;"> | Stok: {{ slotProps.option.stock }}</span>
                  </div>
                </template>
              </Dropdown>
            </div>

            <div v-else class="form-group">
              <label>İşçilik Açıklaması</label>
              <InputText
                v-model="kalemForm.description"
                placeholder="Örn: Yağ bakım işçiliği"
                style="width: 100%"
              />
            </div>

            <div class="form-group">
              <label>Miktar</label>
              <InputText
                type="number"
                v-model="kalemForm.quantity"
                style="width: 100%"
              />
            </div>

            <div class="form-group">
              <label>Birim Fiyat</label>
              <InputText
                type="number"
                v-model="kalemForm.unit_price"
                style="width: 100%"
              />
            </div>

            <Button
              label="Ekle"
              icon="pi pi-plus"
              severity="success"
              @click="kalemKaydet"
            />
          </div>
        </div>

        <div
          v-else
          style="background: var(--bg-active-box); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; color: var(--text-secondary);"
        >
          Bu iş emri tamamlandığı için kilitlidir. Parça, işçilik, açıklama veya tutar değiştirilemez. Gerekirse Tekrar Aç butonunu kullanın.
        </div>

        <div style="background: var(--bg-panel); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px;">
<DataTable
  :value="kalemler"
  responsiveLayout="scroll"
  emptyMessage="Bu iş emrine henüz parça veya işçilik eklenmedi."
>
            <Column field="type" header="Tip"></Column>

            <Column header="Açıklama">
              <template #body="slotProps">
                <span v-if="slotProps.data.type === 'Parça'">
                  {{ slotProps.data.part_code }} - {{ slotProps.data.part_name }}
                </span>
                <span v-else>
                  {{ slotProps.data.description }}
                </span>
              </template>
            </Column>

            <Column field="quantity" header="Miktar"></Column>

            <Column header="Birim Fiyat">
              <template #body="slotProps">
                {{ tlFormatla(slotProps.data.unit_price) }}
              </template>
            </Column>

            <Column header="Toplam">
              <template #body="slotProps">
                <strong>{{ tlFormatla(slotProps.data.total_price) }}</strong>
              </template>
            </Column>

           <Column header="İşlem" style="width: 130px;">
  <template #body="slotProps">
    <Button
      icon="pi pi-pencil"
      outlined
      rounded
      severity="info"
      :disabled="seciliIsEmriTamamlandi"
      @click="kalemDuzenle(slotProps.data)"
      style="margin-right: 8px;"
    />

    <Button
      icon="pi pi-trash"
      outlined
      rounded
      severity="danger"
      :disabled="seciliIsEmriTamamlandi"
      @click="kalemSil(slotProps.data)"
    />
  </template>
</Column>
          </DataTable>
        </div>
        </div>

        <!-- SEKME 2: Ödemeler & Tahsilat -->
        <div v-if="detaySekmesi === 'odemeler'">
          <div style="background: var(--bg-active-box); border: 1px solid var(--border-color); padding: 18px; border-radius: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <div>
              <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-title);">Ödeme Durumu</h3>
              <p style="margin: 4px 0 0; font-size: 0.85rem; color: var(--text-muted);">Bu iş emrine ait ödeme özeti ve tahsilat geçmişi.</p>
            </div>
            <Button
              label="Ödeme Al"
              icon="pi pi-credit-card"
              severity="success"
              @click="odemeAlModalAc"
            />
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;">
            <div style="background: rgba(15, 23, 42, 0.4); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
              <span style="font-size: 0.8rem; color: var(--text-muted); display: block; text-transform: uppercase; font-weight: 600;">İş Emri Toplamı</span>
              <strong style="font-size: 1.1rem; color: var(--text-primary); display: block; margin-top: 4px;">{{ tlFormatla(odemeOzeti.total_price) }}</strong>
            </div>

            <div style="background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.2);">
              <span style="font-size: 0.8rem; color: #34d399; display: block; text-transform: uppercase; font-weight: 600;">Toplam Tahsil Edilen</span>
              <strong style="font-size: 1.1rem; color: #34d399; display: block; margin-top: 4px;">{{ tlFormatla(odemeOzeti.toplam_tahsilat) }}</strong>
            </div>

            <div style="background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.2);">
              <span style="font-size: 0.8rem; color: #f87171; display: block; text-transform: uppercase; font-weight: 600;">Kalan Borç</span>
              <strong style="font-size: 1.1rem; color: #f87171; display: block; margin-top: 4px;">{{ tlFormatla(odemeOzeti.kalan_borc) }}</strong>
            </div>

            <div style="background: rgba(15, 23, 42, 0.4); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: center;">
              <span style="font-size: 0.8rem; color: var(--text-muted); display: block; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Ödeme Durumu</span>
              <Tag
                :value="odemeOzeti.odeme_durumu"
                :severity="getOdemeSeverity(odemeOzeti.odeme_durumu)"
                style="align-self: start; font-weight: bold;"
              />
            </div>
          </div>

          <!-- Ödeme Geçmişi Tablosu -->
          <DataTable
            :value="odemeGecmisi"
            responsiveLayout="scroll"
            emptyMessage="Henüz tahsilat kaydı bulunmuyor."
            class="p-datatable-sm"
          >
            <Column header="Tarih">
              <template #body="slotProps">
                <span :style="{ textDecoration: slotProps.data.is_cancelled ? 'line-through' : 'none', color: slotProps.data.is_cancelled ? '#94a3b8' : 'inherit' }">
                  {{ tarihFormatla(slotProps.data.payment_date) }}
                </span>
              </template>
            </Column>

            <Column header="Tutar">
              <template #body="slotProps">
                <strong :style="{ textDecoration: slotProps.data.is_cancelled ? 'line-through' : 'none', color: slotProps.data.is_cancelled ? '#94a3b8' : '#34d399' }">
                  {{ tlFormatla(slotProps.data.amount) }}
                </strong>
              </template>
            </Column>

            <Column field="payment_method" header="Ödeme Yöntemi">
              <template #body="slotProps">
                <span :style="{ textDecoration: slotProps.data.is_cancelled ? 'line-through' : 'none', color: slotProps.data.is_cancelled ? '#94a3b8' : 'inherit' }">
                  {{ slotProps.data.payment_method }}
                </span>
              </template>
            </Column>

            <Column header="Alan Usta">
              <template #body="slotProps">
                <span :style="{ textDecoration: slotProps.data.is_cancelled ? 'line-through' : 'none', color: slotProps.data.is_cancelled ? '#94a3b8' : 'inherit' }">
                  {{ slotProps.data.received_by_master_name || '-' }}
                </span>
              </template>
            </Column>

            <Column header="Açıklama">
              <template #body="slotProps">
                <span :style="{ textDecoration: slotProps.data.is_cancelled ? 'line-through' : 'none', color: slotProps.data.is_cancelled ? '#94a3b8' : 'inherit' }">
                  {{ slotProps.data.note || '-' }}
                </span>
              </template>
            </Column>

            <Column header="Durum">
              <template #body="slotProps">
                <Tag
                  v-if="slotProps.data.is_cancelled"
                  value="İptal"
                  severity="danger"
                  style="font-size: 0.75rem;"
                />
                <Tag
                  v-else
                  value="Aktif"
                  severity="success"
                  style="font-size: 0.75rem;"
                />
              </template>
            </Column>

            <Column header="İşlem" style="width: 90px; text-align: center;">
              <template #body="slotProps">
                <Button
                  v-if="!slotProps.data.is_cancelled"
                  icon="pi pi-ban"
                  outlined
                  rounded
                  severity="danger"
                  title="Ödemeyi İptal Et"
                  @click="odemeIptalModalAc(slotProps.data)"
                />
              </template>
            </Column>
          </DataTable>
        </div>
        </div>

        <!-- SEKME 3: Araç Fotoğrafları -->
        <div v-if="detaySekmesi === 'fotograflar'">
          <div style="background: var(--bg-active-box); border: 1px solid var(--border-color); padding: 18px; border-radius: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
            <div>
              <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-title); display: flex; align-items: center; gap: 8px;">
                <i class="pi pi-camera" style="color: var(--accent-color);"></i>
                Araç Fotoğrafları (Kabul / Hasar Tespiti)
                <Tag :value="String(fotograflar.length)" severity="info" rounded style="font-size: 0.75rem;" />
              </h3>
              <p style="margin: 4px 0 0; font-size: 0.85rem; color: var(--text-muted);">
                Araç kabulünde çekilen fotoğraflar, çizik/hasar görselleri ve sökülen parça fotoğrafları.
              </p>
            </div>
            <Button
              label="Fotoğraf Ekle"
              icon="pi pi-plus"
              severity="primary"
              size="small"
              @click="fotografYukleModalAc"
            />
          </div>

          <!-- Kategori Filtreleri -->
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px;">
            <Button
              v-for="cat in ['tumu', 'Araç Kabul', 'Hasar / Çizik', 'Sökülen Parça', 'Tamir Sonrası']"
              :key="cat"
              :label="cat === 'tumu' ? `Tümü (${fotograflar.length})` : cat"
              size="small"
              :severity="fotografKategorisiFiltre === cat ? 'info' : 'secondary'"
              :text="fotografKategorisiFiltre !== cat"
              @click="fotografKategorisiFiltre = cat"
            />
          </div>

          <!-- Fotoğraflar Grid Görünümü -->
          <div v-if="filtrelenmisFotograflar.length > 0" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;">
            <div
              v-for="photo in filtrelenmisFotograflar"
              :key="photo.id"
              style="position: relative; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); background: var(--bg-card); cursor: pointer; transition: transform 0.15s ease;"
              @click="seciliFotografModal = { ...photo }"
            >
              <img
                :src="photo.url"
                :alt="photo.file_name"
                style="width: 100%; height: 130px; object-fit: cover; display: block;"
              />
              <div style="padding: 6px 8px; font-size: 0.78rem; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.6); color: #fff; position: absolute; bottom: 0; left: 0; right: 0;">
                <span style="font-weight: 600; font-size: 0.72rem; background: var(--accent-color); padding: 2px 6px; border-radius: 4px;">{{ photo.category }}</span>
                <i class="pi pi-eye" style="font-size: 0.8rem;"></i>
              </div>
            </div>
          </div>

          <!-- Boş Durum -->
          <div v-else style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.9rem; border: 1px dashed var(--border-color); border-radius: 8px;">
            <i class="pi pi-image" style="font-size: 2rem; margin-bottom: 8px; opacity: 0.5; display: block;"></i>
            <span>Henüz bu iş emrine ait fotoğraf yüklenmedi. "Fotoğraf Ekle" butonunu kullanarak görsel ekleyebilirsiniz.</span>
          </div>
        </div>

        <!-- Fotoğraf Önizleme & Detay Dialog -->
        <Dialog
          v-model:visible="seciliFotografModal"
          header="Fotoğraf Detayı & Önizleme"
          :style="{ width: '680px' }"
          modal
        >
          <div v-if="seciliFotografModal" style="display: flex; flex-direction: column; gap: 14px;">
            <div style="background: #000; border-radius: 8px; overflow: hidden; text-align: center; max-height: 420px; display: flex; align-items: center; justify-content: center;">
              <img :src="seciliFotografModal.url" style="max-width: 100%; max-height: 420px; object-fit: contain;" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label>Kategori</label>
                <Dropdown
                  v-model="seciliFotografModal.category"
                  :options="['Araç Kabul', 'Hasar / Çizik', 'Sökülen Parça', 'Tamir Sonrası']"
                  style="width: 100%;"
                />
              </div>

              <div class="form-group">
                <label>Not / Açıklama</label>
                <InputText
                  v-model="seciliFotografModal.note"
                  placeholder="Örn: Sol kapıda 10 cm çizik var"
                  style="width: 100%;"
                />
              </div>
            </div>
          </div>

          <template #footer>
            <Button label="Sil" icon="pi pi-trash" severity="danger" text @click="fotografSil(seciliFotografModal?.id)" />
            <Button label="Kaydet" icon="pi pi-check" severity="success" @click="fotografGuncelle" />
          </template>
        </Dialog>
        </div>

        <!-- SEKME 4: İşlem Geçmişi & Maliyet / Kâr Hesabı -->
        <div v-if="detaySekmesi === 'gecmis'" style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <h3>Ek Bilgiler</h3>
            <p>İşlem geçmişi ve iç maliyet/kâr hesabı gerektiğinde açılır.</p>
          </div>

          <div class="extra-info-actions">
            <Button
              :label="islemGecmisiAcik ? 'İşlem Geçmişini Gizle' : `İşlem Geçmişi (${isEmriLoglari.length})`"
              icon="pi pi-history"
              size="small"
              severity="secondary"
              outlined
              :disabled="isEmriLoglari.length === 0"
              @click="islemGecmisiAcik = !islemGecmisiAcik"
            />

            <Button
              :label="maliyetKarAcik ? 'Maliyet / Kârı Gizle' : 'İç Maliyet / Kâr'"
              icon="pi pi-chart-line"
              size="small"
              severity="info"
              outlined
              @click="maliyetKarAcik = !maliyetKarAcik"
            />
          </div>
        </div>

        <div
          v-if="islemGecmisiAcik && isEmriLoglari.length > 0"
          class="work-order-log-panel"
        >
          <h3>İşlem Geçmişi</h3>

          <div
            v-for="log in isEmriLoglari"
            :key="log.id"
            class="work-order-log-item"
          >
            <div>
              <strong>{{ log.action }}</strong>
              <span>
                {{ log.master_name || 'Usta bilinmiyor' }}
                -
                {{ tarihFormatla(log.created_at) }}
              </span>
            </div>

            <p>{{ log.reason || '-' }}</p>
          </div>
        </div>

        <div
          v-if="maliyetKarAcik"
          class="internal-profit-panel"
        >
          <div class="internal-profit-header">
            <div>
              <h3>İç Maliyet / Kâr Hesabı</h3>
              <p>Bu bölüm sadece servis içi takip içindir, müşteri fişinde gösterilmez.</p>
            </div>

            <Tag
              :value="maliyetOzeti.netKar >= 0 ? 'Kârlı' : 'Zarar'"
              :severity="maliyetOzeti.netKar >= 0 ? 'success' : 'danger'"
            />
          </div>

          <div class="profit-grid">
            <div class="profit-card">
              <span>Parça Alış Maliyeti</span>
              <strong>{{ tlFormatla(maliyetOzeti.parcaMaliyeti) }}</strong>
            </div>

            <div class="profit-card">
              <span>Parça Satış Toplamı</span>
              <strong>{{ tlFormatla(maliyetOzeti.parcaSatisi) }}</strong>
            </div>

            <div class="profit-card">
              <span>İşçilik Geliri</span>
              <strong>{{ tlFormatla(maliyetOzeti.iscilikGeliri) }}</strong>
            </div>

            <div class="profit-card">
              <span>Toplam Tahsilat</span>
              <strong>{{ tlFormatla(maliyetOzeti.toplamSatis) }}</strong>
            </div>

            <div class="profit-card">
              <span>Toplam Maliyet</span>
              <strong>{{ tlFormatla(maliyetOzeti.toplamMaliyet) }}</strong>
            </div>

            <div class="profit-card profit-card-main">
              <span>Net Kâr</span>
              <strong>{{ tlFormatla(maliyetOzeti.netKar) }}</strong>
              <small>Kâr oranı: {{ yuzdeFormatla(maliyetOzeti.karOrani) }}</small>
            </div>
          </div>
        </div>
        </div>
        
      </div>
    </div>
</template>

<style scoped>
.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-group label {
  font-size: 0.95rem;
  color: var(--text-secondary);
}


.inline-empty-panel {
  margin-top: 18px;
  background: var(--bg-active-box);
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  padding: 18px;
  border-radius: 8px;
  text-align: center;
}

.inline-kalem-panel {
  margin-top: 18px;
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  padding: 18px;
  border-radius: 10px;
}

.inline-kalem-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.inline-kalem-header h3 {
  margin: 0;
  color: var(--text-title);
}

.inline-kalem-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}
.durum-dropdown {
  min-width: 145px;
}

.durum-dropdown :deep(.p-dropdown-label) {
  padding-top: 5px;
  padding-bottom: 5px;
}
.work-order-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.internal-profit-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  padding: 15px;
  border-radius: 8px;
}

.internal-profit-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
}

.internal-profit-header h3 {
  margin: 0;
  color: var(--text-title);
}

.internal-profit-header p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.profit-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.profit-card {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profit-card span {
  color: var(--text-secondary);
  font-size: 14px;
}

.profit-card strong {
  color: var(--text-title);
  font-size: 19px;
}

.profit-card small {
  color: var(--text-muted);
}

.profit-card-main {
  border-color: #22c55e;
}
.work-order-log-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  padding: 15px;
  border-radius: 8px;
}

.work-order-log-panel h3 {
  margin: 0 0 12px;
  color: var(--text-title);
}

.work-order-log-item {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.work-order-log-item:last-child {
  margin-bottom: 0;
}

.work-order-log-item div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.work-order-log-item strong {
  color: var(--text-title);
}

.work-order-log-item span {
  color: var(--text-muted);
  font-size: 14px;
}

.work-order-log-item p {
  margin: 0;
  color: var(--text-secondary);
}
.work-order-description {
  max-width: 220px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.extra-info-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.extra-info-panel h3 {
  margin: 0;
  color: var(--text-title);
}

.extra-info-panel p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.extra-info-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* Servis Fişi Önizleme Sınıfları */
.print-preview-content {
  background-color: #1e293b;
  padding: 20px;
  border-radius: 6px;
  max-height: 70vh;
  overflow-y: auto;
}

:global(html[data-theme="light"] .print-preview-content) {
  background-color: #f1f5f9;
}

.preview-sheet {
  background-color: #ffffff;
  color: #111827;
  padding: 30px;
  border-radius: 4px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
  max-width: 800px;
  margin: 0 auto;
}

.preview-sheet .top-header {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr;
  gap: 18px;
  align-items: stretch;
  border-bottom: 3px solid #111827;
  padding-bottom: 16px;
  margin-bottom: 18px;
}

.preview-sheet .company-box {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.preview-sheet .company-name {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.5px;
  margin: 0;
  color: #111827;
}

.preview-sheet .company-subtitle {
  margin-top: 5px;
  color: #374151;
  font-size: 13px;
  font-weight: 700;
}

.preview-sheet .company-desc {
  margin-top: 8px;
  color: #6b7280;
  font-size: 11px;
}

.preview-sheet .document-box {
  border: 1px solid #111827;
  border-radius: 8px;
  padding: 12px;
  text-align: right;
}

.preview-sheet .document-title {
  font-size: 18px;
  font-weight: 900;
  margin-bottom: 8px;
  color: #111827;
}

.preview-sheet .document-no {
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 5px;
}

.preview-sheet .muted {
  color: #6b7280;
}

.preview-sheet .section {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  margin-bottom: 14px;
  overflow: hidden;
  background: #ffffff;
}

.preview-sheet .section-title {
  background: #f3f4f6;
  border-bottom: 1px solid #d1d5db;
  padding: 8px 10px;
  font-weight: 900;
  font-size: 13px;
  color: #111827;
}

.preview-sheet .section-body {
  padding: 10px;
}

.preview-sheet .info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 18px;
}

.preview-sheet .info-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
  align-items: start;
}

.preview-sheet .label {
  color: #4b5563;
  font-weight: 700;
}

.preview-sheet .value {
  color: #111827;
  font-weight: 600;
}

.preview-sheet .description-box {
  min-height: 54px;
  line-height: 1.45;
  color: #111827;
  white-space: pre-wrap;
}

.preview-sheet table {
  width: 100%;
  border-collapse: collapse;
}

.preview-sheet th {
  background: #f3f4f6;
  color: #111827;
  font-weight: 900;
  border: 1px solid #d1d5db;
  padding: 8px;
  text-align: left;
}

.preview-sheet td {
  border: 1px solid #d1d5db;
  padding: 8px;
  vertical-align: top;
  color: #111827;
}

.preview-sheet .center {
  text-align: center;
}

.preview-sheet .right {
  text-align: right;
}

.preview-sheet .strong {
  font-weight: 900;
}

.preview-sheet .total-area {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.preview-sheet .total-box {
  min-width: 280px;
  border: 2px solid #111827;
  border-radius: 8px;
  overflow: hidden;
}

.preview-sheet .total-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 12px;
  font-size: 14px;
  font-weight: 900;
  background: #f9fafb;
  color: #111827;
}

.preview-sheet .warning-note {
  margin-top: 14px;
  border: 2px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  padding: 10px 12px;
  border-radius: 8px;
  font-weight: 900;
  line-height: 1.45;
}

.preview-sheet .footer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 44px;
  margin-top: 40px;
}

.preview-sheet .signature-box {
  border-top: 1px solid #111827;
  padding-top: 8px;
  text-align: center;
  font-weight: 800;
  color: #111827;
}

.preview-sheet .signature-sub {
  margin-top: 4px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 500;
}

:global(html[data-theme="light"] .extra-info-panel) {
  background: #ffffff !important;
  border-color: #d1d5db !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .extra-info-panel h3) {
  color: #111827 !important;
}

:global(html[data-theme="light"] .extra-info-panel p) {
  color: #374151 !important;
}

/* Kompakt Hibrit Liste / Tablo Stilleri (72px Yükseklik) */
.work-orders-table-panel {
  background: var(--bg-panel, #1e293b);
  border: 1px solid var(--border-color, #334155);
  border-radius: 10px;
  overflow: hidden;
}

.table-header-row {
  display: grid;
  grid-template-columns: 20% 38% 18% 12% 12%;
  align-items: center;
  padding: 10px 16px;
  background: rgba(15, 23, 42, 0.6);
  border-bottom: 1px solid var(--border-color, #334155);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #94a3b8);
}

.table-body-rows {
  display: flex;
  flex-direction: column;
}

.work-order-table-row {
  display: grid;
  grid-template-columns: 20% 38% 18% 12% 12%;
  align-items: center;
  height: 72px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color, #334155);
  background: var(--bg-panel, #1e293b);
  cursor: pointer;
  transition: background 0.15s ease-in-out;
  user-select: none;
}

.work-order-table-row:last-child {
  border-bottom: none;
}

.work-order-table-row:hover {
  background: rgba(56, 189, 248, 0.05);
}

.work-order-table-row.is-selected {
  background: rgba(56, 189, 248, 0.09);
  box-shadow: inset 3px 0 0 #38bdf8;
}

.col-plate-master {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding-right: 12px;
  min-width: 0;
}

.plate-text {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--text-title, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.master-customer-text {
  font-size: 0.78rem;
  color: var(--text-muted, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-desc-date {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding-right: 16px;
  min-width: 0;
}

.desc-text {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-title, #f1f5f9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.date-text {
  font-size: 0.76rem;
  color: var(--text-muted, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-finance {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding-right: 12px;
  min-width: 0;
}

.price-text {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-title, #fff);
}

.payment-badge-text {
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.col-status {
  display: flex;
  align-items: center;
}

.durum-dropdown-compact {
  border: none;
  background: transparent;
  padding: 0;
}

.durum-dropdown-compact :deep(.p-dropdown-label) {
  padding: 0;
}

.col-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.empty-state-row {
  padding: 32px;
  text-align: center;
  color: var(--text-muted, #94a3b8);
  font-size: 0.9rem;
}
</style>