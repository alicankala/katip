// Sağ alttaki bilgi şeridi (saat/tarih/döviz) için kur verisi sağlar.
// Kaynak: TCMB günlük kur XML'i (ücretsiz, anahtarsız, resmî).
// Kurlar hafta içi ~15:30'da güncellenir; hafta sonu son iş gününün kuru döner.

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
    for (const code of ['USD', 'EUR']) {
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
}
