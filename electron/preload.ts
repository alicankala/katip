import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
    // Pencere
  pencereKucult: () => ipcRenderer.invoke('pencere-kucult'),
  pencereBuyutKucult: () => ipcRenderer.invoke('pencere-buyut-kucult'),
  pencereKapat: () => ipcRenderer.invoke('pencere-kapat'),
    // Ustalar / Giriş
  ustalariGetir: () => ipcRenderer.invoke('ustalari-getir'),
  ustaGirisYap: (giris) => ipcRenderer.invoke('usta-giris-yap', giris),
  ustaPinDegistir: (veri) => ipcRenderer.invoke('usta-pin-degistir', veri),
  // Müşteriler
  musterileriGetir: () => ipcRenderer.invoke('musterileri-getir'),
  musteriEkle: (musteri) => ipcRenderer.invoke('musteri-ekle', musteri),
  musteriSil: (id) => ipcRenderer.invoke('musteri-sil', id),
  musteriGuncelle: (musteri) => ipcRenderer.invoke('musteri-guncelle', musteri),
  
  // Yedek Parça
  parcalariGetir: () => ipcRenderer.invoke('parcalari-getir'),
  parcalariFiltreliGetir: (filtre) => ipcRenderer.invoke('parcalari-filtreli-getir', filtre),
  parcaEkle: (parca) => ipcRenderer.invoke('parca-ekle', parca),
  parcaGuncelle: (parca) => ipcRenderer.invoke('parca-guncelle', parca),
  parcaSil: (id) => ipcRenderer.invoke('parca-sil', id),
  stokHareketleriGetir: (partId) => ipcRenderer.invoke('stok-hareketleri-getir', partId),
  dusukStokParcalariGetir: (limit = 5) => ipcRenderer.invoke('dusuk-stok-parcalari-getir', limit),

  // Araçlar
  araclariGetir: () => ipcRenderer.invoke('araclari-getir'),
  aracEkle: (arac) => ipcRenderer.invoke('arac-ekle', arac),
  aracGuncelle: (arac) => ipcRenderer.invoke('arac-guncelle', arac),
  aracSil: (id) => ipcRenderer.invoke('arac-sil', id),

  // İş Emirleri
  isEmirleriGetir: () => ipcRenderer.invoke('is-emirleri-getir'),
  isEmriEkle: (isEmri) => ipcRenderer.invoke('is-emri-ekle', isEmri),
  isEmriSil: (id) => ipcRenderer.invoke('is-emri-sil', id),
  isEmriGuncelle: (isEmri) => ipcRenderer.invoke('is-emri-guncelle', isEmri),
isEmriKalemleriGetir: (workOrderId) => ipcRenderer.invoke('is-emri-kalemleri-getir', workOrderId),
isEmriKalemEkle: (kalem) => ipcRenderer.invoke('is-emri-kalem-ekle', kalem),
isEmriKalemGuncelle: (kalem) => ipcRenderer.invoke('is-emri-kalem-guncelle', kalem),
isEmriKalemSil: (itemId) => ipcRenderer.invoke('is-emri-kalem-sil', itemId),
isEmriLoglariGetir: (workOrderId) => ipcRenderer.invoke('is-emri-loglari-getir', workOrderId),
isEmriTekrarAc: (veri) => ipcRenderer.invoke('is-emri-tekrar-ac', veri),

// İstatistikler / Geçmiş (Ana Panel)
istatistikleriGetir: () => ipcRenderer.invoke('istatistikleri-getir'),
musteriGecmisiGetir: (id) => ipcRenderer.invoke('musteri-gecmisi-getir', id),
servisGecmisiAra: (aramaMetni) => ipcRenderer.invoke('servis-gecmisi-ara', aramaMetni),
karlilikRaporuGetir: () => ipcRenderer.invoke('karlilik-raporu-getir'),
  
  // Veritabanı
  veritabaniYedekle: () => ipcRenderer.invoke('veritabani-yedekle'),
  yedekKlasorunuAc: () => ipcRenderer.invoke('yedek-klasoru-ac'),
  yedekKlasoruAc: () => ipcRenderer.invoke('yedek-klasoru-ac'),
  yedektenGeriYukle: () => ipcRenderer.invoke('yedekten-geri-yukle'),
  veritabaniBilgileriGetir: () => ipcRenderer.invoke('veritabani-bilgileri-getir')
})