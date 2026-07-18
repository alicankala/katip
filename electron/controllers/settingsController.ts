import db, {
  dbPath,
  uygulamaVerileriniYenileBackend,
  ayarlariGetirBackend,
  topluAyarlariKaydetBackend,
  veritabaniKontrolEtBackend
} from '../database.js'
import { app, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export async function destekSistemBilgileriGetirBackend(): Promise<any> {
  try {
    const backupDir = path.join(app.getPath('userData'), 'yedekler')
    let dbSize = '0 B'
    try {
      const stat = await fs.stat(dbPath)
      dbSize = formatBytes(stat.size)
    } catch (e) {}

    let lastBackupDate = 'Yapılmadı'
    let lastBackupName = 'Yok'
    let lastBackupSize = '0 B'

    try {
      await fs.mkdir(backupDir, { recursive: true })
      const files = await fs.readdir(backupDir)
      let newest: { name: string; path: string; time: number; size: number } | null = null
      for (const f of files) {
        if (f.endsWith('.zip') || f.endsWith('.db')) {
          const fp = path.join(backupDir, f)
          const stat = await fs.stat(fp)
          if (!newest || stat.mtimeMs > newest.time) {
            newest = { name: f, path: fp, time: stat.mtimeMs, size: stat.size }
          }
        }
      }
      if (newest) {
        lastBackupDate = new Date(newest.time).toLocaleString('tr-TR')
        lastBackupName = newest.name
        lastBackupSize = formatBytes(newest.size)
      }
    } catch (e) {}

    const musteriSayisi = Number((db.prepare('SELECT COUNT(*) AS count FROM customers WHERE IFNULL(is_active, 1) = 1').get() as any)?.count || 0)
    const aracSayisi = Number((db.prepare('SELECT COUNT(*) AS count FROM vehicles WHERE IFNULL(is_active, 1) = 1').get() as any)?.count || 0)
    const isEmriSayisi = Number((db.prepare('SELECT COUNT(*) AS count FROM work_orders').get() as any)?.count || 0)
    const parcaSayisi = Number((db.prepare('SELECT COUNT(*) AS count FROM parts WHERE IFNULL(is_active, 1) = 1').get() as any)?.count || 0)

    return {
      success: true,
      bilgiler: {
        dbPath,
        backupDir,
        dbSize,
        musteriSayisi,
        aracSayisi,
        isEmriSayisi,
        parcaSayisi,
        lastBackupDate,
        lastBackupName,
        lastBackupSize,
        appVersion: app.getVersion() || '1.0.0'
      }
    }
  } catch (error) {
    console.error('Destek sistem bilgileri getirme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
}

export function registerSettingsHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
  // 1. Uygulama Verilerini Yenile
  kanalEkle('uygulama-verilerini-yenile', async () => {
    return await uygulamaVerileriniYenileBackend()
  })

  // 2. Ayarları Getir
  kanalEkle('ayarlari-getir', () => {
    return ayarlariGetirBackend()
  })

  // 3. Ayar Kaydet / Toplu Kaydet
  kanalEkle('ayarlari-kaydet', (_event, settings: any) => {
    if (typeof settings === 'object' && settings !== null) {
      return topluAyarlariKaydetBackend(settings)
    }
    return { success: false, error: 'Geçersiz ayar verisi.' }
  })

  // 4. Destek Sistem Bilgileri Getir
  kanalEkle('destek-sistem-bilgileri-getir', async () => {
    return await destekSistemBilgileriGetirBackend()
  })

  // 5. Veritabanı Kontrol Et
  kanalEkle('veritabani-kontrol-et', () => {
    return veritabaniKontrolEtBackend()
  })

  // 6. Log Klasörünü Aç
  kanalEkle('log-klasoru-ac', async () => {
    try {
      const logDir = app.getPath('logs') || app.getPath('userData')
      await fs.mkdir(logDir, { recursive: true })
      await shell.openPath(logDir)
      return { success: true }
    } catch (err) {
      return { success: false, error: getErrorMessage(err) }
    }
  })
}
