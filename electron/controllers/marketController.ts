// Sağ alttaki bilgi şeridi (saat/tarih/döviz/hava) için veri sağlar.
// Kur kaynağı: TCMB günlük kur XML'i (ücretsiz, anahtarsız, resmî).
// Kurlar hafta içi ~15:30'da güncellenir; hafta sonu son iş gününün kuru döner.
// Hava durumu kaynağı: Open-Meteo (ücretsiz, anahtarsız); şehir app_settings
// içindeki weather_city anahtarından okunur (varsayılan: Ankara).

import db from '../database.js'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
const CACHE_SURESI_MS = 30 * 60 * 1000 // 30 dakika

interface KurBilgisi {
  alis: number | null
  satis: number | null
}

interface KurVerisi {
  kurlar: Record<string, KurBilgisi>
  kaynakTarihi: string | null
  guncellendi: string
}

let kurCache: { veri: KurVerisi | null; zaman: number } = { veri: null, zaman: 0 }

function kurAyikla(xml: string, code: string): KurBilgisi | null {
  const blok = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${code}"[\\s\\S]*?</Currency>`))
  if (!blok) return null

  const sayiCek = (tag: string): number | null => {
    const m = blok[0].match(new RegExp(`<${tag}>([\\d.]+)</${tag}>`))
    const val = m ? parseFloat(m[1]) : NaN
    return Number.isFinite(val) ? val : null
  }

  const alis = sayiCek('ForexBuying')
  const satis = sayiCek('ForexSelling')
  if (alis === null && satis === null) return null
  return { alis, satis }
}

async function kurlariGetir(): Promise<KurVerisi> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(TCMB_URL, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`TCMB kur servisi yanıt vermedi (HTTP ${res.status}).`)
    }
    const xml = await res.text()

    const kurlar: Record<string, KurBilgisi> = {}
    for (const code of ['USD', 'EUR', 'GBP']) {
      const kur = kurAyikla(xml, code)
      if (kur) kurlar[code] = kur
    }

    if (Object.keys(kurlar).length === 0) {
      throw new Error('Kur verisi çözümlenemedi.')
    }

    const tarihMatch = xml.match(/Tarih="([^"]+)"/)
    return {
      kurlar,
      kaynakTarihi: tarihMatch ? tarihMatch[1] : null,
      guncellendi: new Date().toISOString()
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Hava Durumu (Open-Meteo) ──────────────────────

interface HavaVerisi {
  sehir: string
  sicaklik: number
  durum: string
  kod: number
  guncellendi: string
}

let havaCache: { veri: HavaVerisi | null; zaman: number; sehir: string } = { veri: null, zaman: 0, sehir: '' }
const geoCache: Record<string, { lat: number; lon: number; ad: string }> = {}

// WMO hava durumu kodlarının Türkçe karşılıkları
function havaDurumuAciklama(kod: number): string {
  if (kod === 0) return 'Açık'
  if (kod === 1) return 'Az Bulutlu'
  if (kod === 2) return 'Parçalı Bulutlu'
  if (kod === 3) return 'Bulutlu'
  if (kod === 45 || kod === 48) return 'Sisli'
  if (kod >= 51 && kod <= 57) return 'Çiseleme'
  if (kod >= 61 && kod <= 67) return 'Yağmurlu'
  if (kod >= 71 && kod <= 77) return 'Karlı'
  if (kod >= 80 && kod <= 82) return 'Sağanak Yağış'
  if (kod === 85 || kod === 86) return 'Kar Sağanağı'
  if (kod >= 95) return 'Gök Gürültülü Fırtına'
  return 'Bilinmiyor'
}

async function zamanAsimliFetch(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function havaDurumuGetir(sehir: string): Promise<HavaVerisi> {
  let geo = geoCache[sehir]
  if (!geo) {
    const gres = await zamanAsimliFetch(
      'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(sehir) + '&count=1&language=tr'
    )
    if (!gres.ok) throw new Error(`Şehir arama servisi yanıt vermedi (HTTP ${gres.status}).`)
    const gjson: any = await gres.json()
    const sonuc = gjson?.results?.[0]
    if (!sonuc) throw new Error(`Şehir bulunamadı: ${sehir}`)
    geo = { lat: Number(sonuc.latitude), lon: Number(sonuc.longitude), ad: String(sonuc.name || sehir) }
    geoCache[sehir] = geo
  }

  const wres = await zamanAsimliFetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code&timezone=auto`
  )
  if (!wres.ok) throw new Error(`Hava durumu servisi yanıt vermedi (HTTP ${wres.status}).`)
  const wjson: any = await wres.json()
  const current = wjson?.current
  const sicaklik = Number(current?.temperature_2m)
  const kod = Number(current?.weather_code)
  if (!Number.isFinite(sicaklik)) throw new Error('Hava durumu verisi çözümlenemedi.')

  return {
    sehir: geo.ad,
    sicaklik: Math.round(sicaklik),
    durum: havaDurumuAciklama(kod),
    kod: Number.isFinite(kod) ? kod : -1,
    guncellendi: new Date().toISOString()
  }
}

export function registerMarketHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
  kanalEkle('doviz-kurlari-getir', async () => {
    if (kurCache.veri && Date.now() - kurCache.zaman < CACHE_SURESI_MS) {
      return { success: true, ...kurCache.veri, cached: true }
    }

    try {
      const veri = await kurlariGetir()
      kurCache = { veri, zaman: Date.now() }
      return { success: true, ...veri, cached: false }
    } catch (error) {
      console.error('Döviz kuru getirme hatası:', error)
      // İnternet yoksa elde bayat veri varsa onu döndür; şerit en azından son kuru gösterir
      if (kurCache.veri) {
        return { success: true, ...kurCache.veri, cached: true, stale: true }
      }
      return { success: false, error: getErrorMessage(error) }
    }
  })

  kanalEkle('hava-durumu-getir', async () => {
    let sehir = 'Ankara'
    try {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('weather_city') as any
      if (row?.value && String(row.value).trim()) sehir = String(row.value).trim()
    } catch (e) {}

    if (havaCache.veri && havaCache.sehir === sehir && Date.now() - havaCache.zaman < CACHE_SURESI_MS) {
      return { success: true, ...havaCache.veri, cached: true }
    }

    try {
      const veri = await havaDurumuGetir(sehir)
      havaCache = { veri, zaman: Date.now(), sehir }
      return { success: true, ...veri, cached: false }
    } catch (error) {
      console.error('Hava durumu getirme hatası:', error)
      if (havaCache.veri && havaCache.sehir === sehir) {
        return { success: true, ...havaCache.veri, cached: true, stale: true }
      }
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
