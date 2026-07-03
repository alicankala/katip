<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
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

const tekrarAcForm = reactive({
  reason: ''
})


const aramaKelimesi = ref('')
const durumFiltresi = ref('Açık')
const seciliIsEmri = ref(null)
const islemGecmisiAcik = ref(false)
const maliyetKarAcik = ref(false)
const printPreviewOpen = ref(false)

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
    confirmDialog.require({
      message: `Bu iş emrini tamamlandı olarak kapatmak istiyor musunuz? Kapatan usta: ${aktifUsta.value.name}`,
      header: 'İş Emrini Tamamla',
      icon: 'pi pi-check-circle',
      acceptLabel: 'Tamamla',
      rejectLabel: 'Vazgeç',
      acceptClass: 'p-button-success',
      rejectClass: 'p-button-secondary p-button-text',
      accept: async () => {
        await durumKaydet(isEmri, 'Tamamlandı', 'İş emri tamamlandı olarak kapatıldı.')
      }
    })

    return
  }

  await durumKaydet(isEmri, yeniDurum)
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

const servisFisiYazdir = () => {
  if (!seciliIsEmri.value) {
    uyariMesaji('Yazdırılacak iş emri seçilemedi.')
    return
  }
  printPreviewOpen.value = true
}

const servisFisiYazdirGercek = () => {
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
onMounted(() => {
  aktifUsta.value = JSON.parse(localStorage.getItem('aktifUsta') || 'null')
  listeleriGetir()
})
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2>İş Emirleri (Tamir Fişleri)</h2>

      <div style="display: flex; gap: 15px; align-items: center;">
        <span class="p-input-icon-left" style="width: 300px;">
          <i class="pi pi-search" />
          <InputText
            v-model="aramaKelimesi"
            placeholder="Plaka, Müşteri veya İşlem Ara..."
          />
        </span>

        <Button
          label="Yeni İş Emri Aç"
          icon="pi pi-file-edit"
          severity="info"
          @click="yeniIsEmriAc"
        />
      </div>
    </div>

    <div class="table-panel">
  <div class="work-order-tabs">
    <Button
      :label="`Açık (${durumSayisi('Açık')})`"
      icon="pi pi-wrench"
      :outlined="durumFiltresi !== 'Açık'"
      severity="danger"
      @click="durumFiltresi = 'Açık'"
    />

    <Button
      :label="`Beklemede (${durumSayisi('Beklemede')})`"
      icon="pi pi-clock"
      :outlined="durumFiltresi !== 'Beklemede'"
      severity="warn"
      @click="durumFiltresi = 'Beklemede'"
    />

    <Button
      :label="`Tamamlananlar (${durumSayisi('Tamamlandı')})`"
      icon="pi pi-check"
      :outlined="durumFiltresi !== 'Tamamlandı'"
      severity="success"
      @click="durumFiltresi = 'Tamamlandı'"
    />

    <Button
      :label="`Hepsi (${durumSayisi('Tümü')})`"
      icon="pi pi-list"
      :outlined="durumFiltresi !== 'Tümü'"
      severity="secondary"
      @click="durumFiltresi = 'Tümü'"
    />
  </div>

<DataTable
  :value="filtrelenmisIsEmirleri"
  responsiveLayout="scroll"
  tableStyle="width: 100%;"
  emptyMessage="Kayıtlı iş emri bulunamadı."
  rowHover
  @row-click="kalemleriAc($event.data)"
>
<Column field="plate" header="Araç Plakası" style="font-weight: bold;"></Column>
<Column field="customer_name" header="Müşteri"></Column>

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

<Column header="Açıklama" style="width: 220px;">
  <template #body="slotProps">
    <div class="work-order-description">
      {{ slotProps.data.description || '-' }}
    </div>
  </template>
</Column>

        <Column header="Toplam">
          <template #body="slotProps">
            <strong>{{ tlFormatla(slotProps.data.total_price) }}</strong>
          </template>
        </Column>

<Column header="Durum">
  <template #body="slotProps">
<Dropdown
  :modelValue="slotProps.data.status"
  :options="durumSecenekleri"
  class="durum-dropdown"
  :disabled="slotProps.data.status === 'Tamamlandı'"
  @click.stop
  @change="durumDegistir(slotProps.data, $event.value)"
>
      <template #value="valueSlot">
        <Tag
          :value="valueSlot.value"
          :severity="getSeverity(valueSlot.value)"
        />
      </template>

      <template #option="optionSlot">
        <Tag
          :value="optionSlot.option"
          :severity="getSeverity(optionSlot.option)"
        />
      </template>
    </Dropdown>
  </template>
</Column>

        <Column header="İşlem" :exportable="false" style="width: 150px;">
          <template #body="slotProps">

<Button
  v-if="slotProps.data.status === 'Tamamlandı'"
  label="Tekrar Aç"
  icon="pi pi-undo"
  size="small"
  severity="warning"
  outlined
  @click.stop="tekrarAc(slotProps.data)"
  style="margin-right: 8px;"
/>

<Button
  icon="pi pi-pencil"
  outlined
  rounded
  severity="info"
  :disabled="slotProps.data.status === 'Tamamlandı'"
  @click.stop="duzenle(slotProps.data)"
  style="margin-right: 8px;"
/>

<Button
  icon="pi pi-trash"
  outlined
  rounded
  severity="danger"
  :disabled="slotProps.data.status === 'Tamamlandı'"
  @click.stop="sil(slotProps.data)"
/>
          </template>
        </Column>
      </DataTable>
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
          style="background: #1f2937; border: 1px solid #374151; padding: 12px; border-radius: 8px; color: #cbd5e1;"
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


        <div
          v-if="!seciliIsEmriTamamlandi"
          style="background: #1f2937; border: 1px solid #374151; padding: 15px; border-radius: 8px;"
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
          style="background: #1f2937; border: 1px solid #374151; padding: 15px; border-radius: 8px; color: #cbd5e1;"
        >
          Bu iş emri tamamlandığı için kilitlidir. Parça, işçilik, açıklama veya tutar değiştirilemez. Gerekirse Tekrar Aç butonunu kullanın.
        </div>

        <div style="background: #1e1e1e; padding: 15px; border-radius: 8px;">
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

                <div class="extra-info-panel">
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
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 14px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.extra-info-panel h3 {
  margin: 0;
  color: #ffffff;
}

.extra-info-panel p {
  margin: 5px 0 0;
  color: #94a3b8;
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
</style>