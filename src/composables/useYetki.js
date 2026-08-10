// Oturum yetkisi: destek (admin) girişi bir usta değildir.
//
// Destek modu teknik bakım profilidir; dükkanın günlük işini (servis kabul,
// iş emri, tahsilat, stok hareketi, gün sonu kapatma, müşteri / araç / parça
// kaydı) yapamaz. Bu dosya arayüz tarafındaki tek yetki kaynağıdır; asıl
// engelleme main process'te electron/permissions.ts içinde yapılır.

import { computed, ref } from 'vue'

const AKTIF_USTA_DEGISTI = 'aktif-usta-degisti'

const aktifOturum = ref(oturumuOku())

function oturumuOku() {
  try {
    return JSON.parse(localStorage.getItem('aktifUsta') || 'null')
  } catch (e) {
    return null
  }
}

// App.vue giriş/çıkışta bu olayı yayınlar; açık ekranlar yetkiyi anında günceller.
if (typeof window !== 'undefined') {
  window.addEventListener(AKTIF_USTA_DEGISTI, () => {
    aktifOturum.value = oturumuOku()
  })
}

export function aktifUstaDegistiginiBildir() {
  aktifOturum.value = oturumuOku()
  window.dispatchEvent(new CustomEvent(AKTIF_USTA_DEGISTI))
}

export function useYetki() {
  const aktifUsta = computed(() => aktifOturum.value)

  const destekModu = computed(() =>
    aktifOturum.value?.role === 'admin' || String(aktifOturum.value?.id) === 'admin'
  )

  // Usta işi yapmaya yetkili mi (destek modu değil ve gerçek bir usta oturumu var mı)
  const ustaIsiYapabilir = computed(() => !!aktifOturum.value?.id && !destekModu.value)

  const destekEngelMesaji = 'Bu işlem destek modunda yapılamaz. Usta girişi ile yapılmalıdır.'

  // Engellenen bir düğmeye rağmen işlem denenirse tek tip uyarı gösterir.
  // İşleme devam edilmemeli: true dönerse çağıran fonksiyon durmalıdır.
  const destekModundaEngelle = (toast, detay) => {
    if (!destekModu.value) return false
    toast?.add({
      severity: 'warn',
      summary: 'Destek Modu',
      detail: detay || destekEngelMesaji,
      life: 4000
    })
    return true
  }

  return {
    aktifUsta,
    destekModu,
    ustaIsiYapabilir,
    destekEngelMesaji,
    destekModundaEngelle
  }
}
