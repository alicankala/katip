/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Renderer tarafında preload.ts ile açılan API
interface Window {
  api: {
    // Müşteriler
    musterileriGetir: () => Promise<any>
    musteriEkle: (musteri: any) => Promise<any>
    musteriSil: (id: number) => Promise<any>
    musteriGuncelle: (musteri: any) => Promise<any>

    // Yedek Parça / Stok
    parcalariGetir: () => Promise<any>
    parcaEkle: (parca: any) => Promise<any>
    parcaGuncelle: (parca: any) => Promise<any>
    parcaSil: (id: number) => Promise<any>
    stokHareketleriGetir: (partId: number) => Promise<any>
    dusukStokParcalariGetir: (limit?: number) => Promise<any[]>

    // Araçlar
    araclariGetir: () => Promise<any>
    aracEkle: (arac: any) => Promise<any>
    aracGuncelle: (arac: any) => Promise<any>
    aracSil: (id: number) => Promise<any>

    // İş Emirleri
    isEmirleriGetir: () => Promise<any>
    isEmriEkle: (isEmri: any) => Promise<any>
    isEmriSil: (id: number) => Promise<any>
    isEmriGuncelle: (isEmri: any) => Promise<any>
    isEmriKalemleriGetir: (workOrderId: number) => Promise<any>
    isEmriKalemEkle: (kalem: any) => Promise<any>
    isEmriKalemSil: (itemId: number) => Promise<any>

    // Ana Panel / Geçmiş
    istatistikleriGetir: () => Promise<any>
    musteriGecmisiGetir: (id: number) => Promise<any>

// Veritabanı
veritabaniYedekle: () => Promise<any>
yedekKlasorunuAc: () => Promise<any>
yedektenGeriYukle: () => Promise<any>
veritabaniBilgileriGetir: () => Promise<any>
  }
}