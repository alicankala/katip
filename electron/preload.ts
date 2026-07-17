import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Pencere
  pencereKucult: () => ipcRenderer.invoke('pencere-kucult'),
  pencereBuyutKucult: () => ipcRenderer.invoke('pencere-buyut-kucult'),
  pencereKapat: () => ipcRenderer.invoke('pencere-kapat'),
  pencereDurumGetir: () => ipcRenderer.invoke('pencere-durum-getir'),
  onPencereDurumDegisti: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: any, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window-maximized-state', handler)
    return () => {
      ipcRenderer.removeListener('window-maximized-state', handler)
    }
  },
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
isEmriOdemeleriGetir: (workOrderId) => ipcRenderer.invoke('is-emri-odemeleri-getir', workOrderId),
isEmriOdemeEkle: (odeme) => ipcRenderer.invoke('is-emri-odeme-ekle', odeme),
isEmriOdemeIptal: (veri) => ipcRenderer.invoke('is-emri-odeme-iptal', veri),
isEmriOdemeOzetiGetir: (workOrderId) => ipcRenderer.invoke('is-emri-odeme-ozeti-getir', workOrderId),
musteriIsEmriAlacaklariGetir: (customerId) => ipcRenderer.invoke('musteri-is-emri-alacaklari-getir', customerId),
isEmriTamamlaVeOdemeKaydet: (veri) => ipcRenderer.invoke('is-emri-tamamla-ve-odeme-kaydet', veri),

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
  veritabaniBilgileriGetir: () => ipcRenderer.invoke('veritabani-bilgileri-getir'),

  // Cari Hesaplar
  cariHesapleriGetir: () => ipcRenderer.invoke('cari-hesaplari-getir'),
  cariHesaplariGetir: () => ipcRenderer.invoke('cari-hesaplari-getir'),
  cariHesapEkle: (hesap) => ipcRenderer.invoke('cari-hesap-ekle', hesap),
  cariHesapGuncelle: (hesap) => ipcRenderer.invoke('cari-hesap-guncelle', hesap),
  cariHesapSil: (id) => ipcRenderer.invoke('cari-hesap-sil', id),
  cariIslemleriGetir: (currentAccountId) => ipcRenderer.invoke('cari-islemleri-getir', currentAccountId),
  cariIslemEkle: (islem) => ipcRenderer.invoke('cari-islem-ekle', islem),
  cariIslemSil: (id) => ipcRenderer.invoke('cari-islem-sil', id),
  cariOdemeleriGetir: (currentAccountId) => ipcRenderer.invoke('cari-odemeleri-getir', currentAccountId),
  cariOdemeEkle: (odeme) => ipcRenderer.invoke('cari-odeme-ekle', odeme),
  cariOdemeSil: (id) => ipcRenderer.invoke('cari-odeme-sil', id),

  // Genel Giderler
  giderleriGetir: () => ipcRenderer.invoke('giderleri-getir'),
  giderEkle: (gider) => ipcRenderer.invoke('gider-ekle', gider),
  giderGuncelle: (gider) => ipcRenderer.invoke('gider-guncelle', gider),
  giderSil: (id) => ipcRenderer.invoke('gider-sil', id),

  // Telefon Erişimi
  telefonErisimiBaslat: (port) => ipcRenderer.invoke('telefon-erisimi-baslat', port),
  telefonErisimiDurdur: () => ipcRenderer.invoke('telefon-erisimi-durdur'),
  telefonErisimiDurumGetir: () => ipcRenderer.invoke('telefon-erisimi-durum-getir'),
  telefonEslesmeQrOlustur: (masterId?: number) => ipcRenderer.invoke('telefon-eslesme-qr-olustur', masterId),
  telefonOturumlariGetir: () => ipcRenderer.invoke('telefon-oturumlari-getir'),
  telefonOturumKapat: (token: string) => ipcRenderer.invoke('telefon-oturum-kapat', token),
  telefonTumOturumlariKapat: () => ipcRenderer.invoke('telefon-tum-oturumlari-kapat'),

  // Veri Yenileme & Ayarlar
  uygulamaVerileriniYenile: () => ipcRenderer.invoke('uygulama-verilerini-yenile'),
  ayarlariGetir: () => ipcRenderer.invoke('ayarlari-getir'),
  ayarlariKaydet: (settings) => ipcRenderer.invoke('ayarlari-kaydet', settings),
  destekSistemBilgileriGetir: () => ipcRenderer.invoke('destek-sistem-bilgileri-getir'),
  veritabaniKontrolEt: () => ipcRenderer.invoke('veritabani-kontrol-et'),
  otomatikYedekAl: () => ipcRenderer.invoke('otomatik-yedek-al'),
  logKlasoruAc: () => ipcRenderer.invoke('log-klasoru-ac'),

  // Araç Fotoğrafları
  isEmriFotograflariGetir: (workOrderId) => ipcRenderer.invoke('is-emri-fotograflari-getir', workOrderId),
  isEmriFotografYukleDialog: (veri) => ipcRenderer.invoke('is-emri-fotograf-yukle-dialog', veri),
  isEmriFotografSil: (photoId) => ipcRenderer.invoke('is-emri-fotograf-sil', photoId),
  isEmriFotografGuncelle: (veri) => ipcRenderer.invoke('is-emri-fotograf-guncelle', veri)
})