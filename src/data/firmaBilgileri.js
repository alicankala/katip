// Yazdırılan belgelerin (servis fişi, cari ekstre, gün sonu raporu) üst
// başlığında görünen dükkan bilgileri. Tek kaynak: bilgi değişirse yalnızca
// burası düzenlenir.
//
// telefon / vergiDairesi / vergiNo boş bırakılırsa çıktıda o satır hiç basılmaz.

export const firmaBilgileri = {
  unvan: 'Özgehan Otomotiv',
  altBaslik: 'Oto Servis · Bakım ve Onarım',
  adres: 'Mega Şaşmaz, Bahçekapı Mahallesi, 2685. Sokak, Şaşmaz Blv. Giriş: 8, No: A5, 06990 Etimesgut / Ankara',
  telefon: '',
  vergiDairesi: '',
  vergiNo: ''
}

// Çıktı başlığındaki adres/telefon/vergi satırlarını hazırlar; boş alanlar atlanır.
export function firmaIletisimSatirlari() {
  const satirlar = []

  if (firmaBilgileri.adres) satirlar.push(firmaBilgileri.adres)
  if (firmaBilgileri.telefon) satirlar.push(`Tel: ${firmaBilgileri.telefon}`)

  if (firmaBilgileri.vergiDairesi || firmaBilgileri.vergiNo) {
    satirlar.push(
      [firmaBilgileri.vergiDairesi, firmaBilgileri.vergiNo].filter(Boolean).join(' V.D. No: ')
    )
  }

  return satirlar
}
