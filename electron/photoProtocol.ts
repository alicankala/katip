// İş emri fotoğraflarını arayüze taşıyan özel protokol.
//
// Eskiden `is-emri-fotograflari-getir` bir iş emrinin bütün fotoğraflarını
// diskten okuyup base64'e çevirip tek bir IPC yükü olarak gönderiyordu.
// Base64 boyutu %33 şişiriyor ve aynı anda dosya buffer'ı + base64 metni +
// yapılandırılmış kopya bellekte duruyordu (veri boyutunun ~4 katı). Ana
// paneldeki geçmiş araması bunu daha da büyütüyor: bir aracın TÜM iş emirleri
// için fotoğraflar paralel olarak çekiliyor.
//
// Artık arayüze yalnızca `katip-foto://foto/<id>` adresi gidiyor; baytları
// Chromium'un kendisi, <img> göründükçe, akış hâlinde bu protokolden çekiyor.
// Böylece IPC yükü sabit ve küçük kalıyor, bellek tepe noktası tek fotoğrafa
// iniyor ve tarayıcı önbelleği devreye giriyor.

import { app, net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import db from './database.js'

export const FOTO_SEMASI = 'katip-foto'

const ICERIK_TURLERI: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
}

// Arayüzün <img src> alanına koyacağı adres.
export function fotografAdresi(photoId: number | string): string {
  return `${FOTO_SEMASI}://foto/${Number(photoId)}`
}

// Fotoğrafların tutulduğu klasör (yükleme yollarıyla aynı yer).
function fotograflarKlasoru(): string {
  return path.join(app.getPath('userData'), 'fotograflar')
}

// Şema ayrıcalıkları app 'ready' olmadan ÖNCE tanıtılmalıdır; bu yüzden ayrı
// bir fonksiyon olarak duruyor ve main.ts'te modül seviyesinde çağrılıyor.
export function fotografSemasiniTanimla(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FOTO_SEMASI,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

// Asıl işleyici; app 'ready' olduktan sonra kaydedilir.
export function fotografProtokolunuKaydet(): void {
  protocol.handle(FOTO_SEMASI, async (request) => {
    try {
      const id = Number(new URL(request.url).pathname.replace(/^\//, ''))
      if (!Number.isFinite(id) || id <= 0) {
        return new Response('Gecersiz fotograf kimligi', { status: 400 })
      }

      const row = db.prepare('SELECT file_path FROM work_order_photos WHERE id = ?').get(id) as any
      const dosyaYolu = String(row?.file_path || '')
      if (!dosyaYolu) {
        return new Response('Fotograf bulunamadi', { status: 404 })
      }

      // Yol her zaman fotoğraf klasörünün içinde olmalı. Veritabanındaki
      // file_path'e körü körüne güvenilmez: yedekten gelen bir kayıt başka bir
      // yeri gösteriyorsa protokol onu servis etmemeli.
      const kok = path.resolve(fotograflarKlasoru())
      const tamYol = path.resolve(dosyaYolu)
      if (tamYol !== kok && !tamYol.startsWith(kok + path.sep)) {
        console.warn('[FotoProtokol] Fotograf klasoru disindaki yol reddedildi:', dosyaYolu)
        return new Response('Gecersiz yol', { status: 403 })
      }

      const uzanti = path.extname(tamYol).toLowerCase()
      const yanit = await net.fetch(pathToFileURL(tamYol).toString())
      if (!yanit.ok) {
        return new Response('Fotograf okunamadi', { status: 404 })
      }

      return new Response(yanit.body, {
        status: 200,
        headers: {
          'Content-Type': ICERIK_TURLERI[uzanti] || 'image/jpeg',
          // Bir fotoğraf satırı hep aynı kareyi gösterir (silme + yeni kayıt
          // yeni bir id üretir), bu yüzden önbelleklenmesi güvenli.
          'Cache-Control': 'private, max-age=3600'
        }
      })
    } catch (error) {
      console.error('[FotoProtokol] Hata:', error)
      return new Response('Fotograf servis edilemedi', { status: 500 })
    }
  })
}
