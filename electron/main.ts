import Database from 'better-sqlite3'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import db, {
  initDB,
  dbPath,
  verifyBackupDatabase,
  uygulamaVerileriniYenileBackend,
  ayarlariGetirBackend,
  ayarKaydetBackend,
  topluAyarlariKaydetBackend,
  veritabaniKontrolEtBackend
} from './database.js'
import { hashPin, verifyPin } from './security'
import { app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeImage, type IpcMainInvokeEvent } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fsSync, { promises as fs } from 'node:fs'
import {
  startPhoneServer,
  stopPhoneServer,
  isServerRunning,
  getCurrentPort,
  getLocalIPAddress,
  getLocalIPAddresses,
  runPhoneServerMigrations,
  generatePairingToken,
  getMobileSessionsList,
  revokeMobileSession,
  revokeAllMobileSessions
} from './phoneServer.js'
import QRCode from 'qrcode'
import { registerCustomerHandlers } from './controllers/customerController.js'
import { registerPartHandlers, stokHareketiKaydet } from './controllers/partController.js'
import { registerVehicleHandlers } from './controllers/vehicleController.js'
import { registerMasterHandlers } from './controllers/masterController.js'
import { registerAccountHandlers } from './controllers/accountController.js'
import { registerWorkOrderHandlers, isEmriToplaminiGuncelle } from './controllers/workOrderController.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const execFileAsync = promisify(execFile)

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    title: 'Kâtip',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    resizable: true,
    maximizable: true,
    minimizable: true,
    center: true,
    show: false,
    frame: false,
    backgroundColor: '#0f172a',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs')
    }
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  win.on('maximize', () => {
    win?.webContents.send('window-maximized-state', true)
  })

  win.on('unmaximize', () => {
    win?.webContents.send('window-maximized-state', false)
  })

  win.once('ready-to-show', () => {
    win?.show()
    win?.maximize()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function kanalEkle(kanal: string, fonksiyon: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.removeHandler(kanal)
  ipcMain.handle(kanal, fonksiyon)
}


function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
function yedekKlasoruYoluGetir(): string {
  return path.join(app.getPath('userData'), 'yedekler')
}

function fotograflarKlasoruYoluGetir(): string {
  return path.join(app.getPath('userData'), 'fotograflar')
}

type YedekTuru = 'manual' | 'automatic' | 'pre-restore'

interface TamYedekSonucu {
  success: boolean
  path?: string
  filename?: string
  size?: number
  photoCount?: number
  photoBytes?: number
  error?: string
}

function tarihDamgasiOlustur(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${date}_${hours}${minutes}${seconds}`
}

async function yolVarMi(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function klasorOzetiGetir(rootDir: string): Promise<{ count: number; bytes: number }> {
  if (!(await yolVarMi(rootDir))) return { count: 0, bytes: 0 }

  let count = 0
  let bytes = 0
  const entries = await fs.readdir(rootDir, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      const child = await klasorOzetiGetir(entryPath)
      count += child.count
      bytes += child.bytes
    } else if (entry.isFile()) {
      const stat = await fs.stat(entryPath)
      count += 1
      bytes += stat.size
    }
  }

  return { count, bytes }
}

function yedekDosyaAdiOlustur(tur: YedekTuru, stamp: string): string {
  if (tur === 'automatic') return `otoservis_auto_backup_${stamp}.zip`
  if (tur === 'pre-restore') return `geri-yukleme-oncesi-tam-yedek-${stamp}.zip`
  return `katip-tam-yedek-${stamp}.zip`
}

async function zipArsiviOlustur(
  zipPath: string,
  databaseSnapshotPath: string,
  photosDir: string,
  manifest: Record<string, unknown>
): Promise<void> {
  const packageRoot = await fs.mkdtemp(path.join(app.getPath('temp'), 'katip-zip-stage-'))

  try {
    const databaseDir = path.join(packageRoot, 'database')
    const packagePhotosDir = path.join(packageRoot, 'fotograflar')

    await fs.mkdir(databaseDir, { recursive: true })
    await fs.mkdir(packagePhotosDir, { recursive: true })
    await fs.copyFile(databaseSnapshotPath, path.join(databaseDir, 'otoservis.db'))

    if (await yolVarMi(photosDir)) {
      await fs.cp(photosDir, packagePhotosDir, { recursive: true, force: true })
    }

    await fs.writeFile(
      path.join(packageRoot, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    )

    await fs.mkdir(path.dirname(zipPath), { recursive: true })
    await fs.rm(zipPath, { force: true })

    await execFileAsync(
      'tar.exe',
      ['-a', '-c', '-f', zipPath, '-C', packageRoot, 'database', 'fotograflar', 'manifest.json'],
      { windowsHide: true, maxBuffer: 50 * 1024 * 1024 }
    )
  } finally {
    await fs.rm(packageRoot, { recursive: true, force: true })
  }
}

async function tamYedekPaketiOlustur(tur: YedekTuru): Promise<TamYedekSonucu> {
  const backupDir = yedekKlasoruYoluGetir()
  const photosDir = fotograflarKlasoruYoluGetir()
  const stamp = tarihDamgasiOlustur()
  const backupFileName = yedekDosyaAdiOlustur(tur, stamp)
  const backupPath = path.join(backupDir, backupFileName)
  const tempRoot = await fs.mkdtemp(path.join(app.getPath('temp'), 'katip-full-backup-'))
  const snapshotPath = path.join(tempRoot, 'otoservis.db')

  try {
    await fs.mkdir(backupDir, { recursive: true })
    await db.backup(snapshotPath)

    const photoSummary = await klasorOzetiGetir(photosDir)
    const manifest = {
      backupVersion: 1,
      product: 'Kâtip',
      appVersion: app.getVersion(),
      createdAt: new Date().toISOString(),
      databaseFile: 'database/otoservis.db',
      photosFolder: 'fotograflar',
      photoCount: photoSummary.count,
      photoBytes: photoSummary.bytes
    }

    await zipArsiviOlustur(backupPath, snapshotPath, photosDir, manifest)
    const stat = await fs.stat(backupPath)

    return {
      success: true,
      path: backupPath,
      filename: backupFileName,
      size: stat.size,
      photoCount: photoSummary.count,
      photoBytes: photoSummary.bytes
    }
  } catch (error) {
    try { await fs.rm(backupPath, { force: true }) } catch {}
    console.error('[FullBackup] Hata:', error)
    return { success: false, error: getErrorMessage(error) }
  } finally {
    try { await fs.rm(tempRoot, { recursive: true, force: true }) } catch {}
  }
}

async function otomatikYedekleriTemizle(): Promise<void> {
  const backupDir = yedekKlasoruYoluGetir()
  const settingsRes = ayarlariGetirBackend()
  const retentionCount = Number(settingsRes?.settings?.backup_retention_count) || 14
  if (retentionCount <= 0) return

  const files = await fs.readdir(backupDir)
  const autoBackups: Array<{ name: string; path: string; time: number }> = []

  for (const fileName of files) {
    const isAutoBackup = fileName.startsWith('otoservis_auto_backup_') &&
      (fileName.endsWith('.zip') || fileName.endsWith('.db'))
    if (!isAutoBackup) continue

    const filePath = path.join(backupDir, fileName)
    const stat = await fs.stat(filePath)
    autoBackups.push({ name: fileName, path: filePath, time: stat.mtimeMs })
  }

  autoBackups.sort((a, b) => b.time - a.time)

  for (const item of autoBackups.slice(retentionCount)) {
    try {
      await fs.unlink(item.path)
      console.log('[AutoBackup] Eski yedek silindi:', item.name)
    } catch (error) {
      console.warn('[AutoBackup] Eski yedek silinemedi:', item.name, error)
    }
  }
}

async function sonOtomatikYedekZamaniGetir(): Promise<number> {
  const backupDir = yedekKlasoruYoluGetir()
  await fs.mkdir(backupDir, { recursive: true })
  const files = await fs.readdir(backupDir)
  let newestTime = 0

  for (const fileName of files) {
    const isAutoBackup = fileName.startsWith('otoservis_auto_backup_') &&
      (fileName.endsWith('.zip') || fileName.endsWith('.db'))
    if (!isAutoBackup) continue

    try {
      const stat = await fs.stat(path.join(backupDir, fileName))
      newestTime = Math.max(newestTime, stat.mtimeMs)
    } catch (error) {
      console.warn('[AutoBackup] Yedek tarihi okunamadı:', fileName, error)
    }
  }

  return newestTime
}

async function zipPaketiniGuvenliCikart(zipPath: string, targetDir: string): Promise<void> {
  const { stdout } = await execFileAsync(
    'tar.exe',
    ['-tf', zipPath],
    { windowsHide: true, maxBuffer: 50 * 1024 * 1024 }
  )

  const root = path.resolve(targetDir)
  const entries = String(stdout || '').split(/\r?\n/).filter(Boolean)

  for (const rawEntry of entries) {
    const normalizedEntryPath = String(rawEntry || '').replace(/\\/g, '/')
    const parts = normalizedEntryPath.split('/').filter(Boolean)

    if (!normalizedEntryPath || normalizedEntryPath.startsWith('/') ||
        /^[a-zA-Z]:/.test(normalizedEntryPath) || parts.includes('..')) {
      throw new Error(`Yedek paketinde güvenli olmayan dosya yolu var: ${normalizedEntryPath}`)
    }

    const outputPath = path.resolve(root, ...parts)
    if (outputPath !== root && !outputPath.startsWith(root + path.sep)) {
      throw new Error(`Yedek paketinde geçersiz dosya yolu var: ${normalizedEntryPath}`)
    }
  }

  await fs.mkdir(targetDir, { recursive: true })
  await execFileAsync(
    'tar.exe',
    ['-xf', zipPath, '-C', targetDir],
    { windowsHide: true, maxBuffer: 50 * 1024 * 1024 }
  )
}

function yedekZorunluTablolariniDogrula(databasePath: string): void {
  const requiredTables = [
    'masters',
    'customers',
    'vehicles',
    'work_orders',
    'work_order_items',
    'parts',
    'work_order_payments',
    'work_order_photos',
    'app_settings'
  ]

  const backupDb = new Database(databasePath, { readonly: true, fileMustExist: true })

  try {
    const rows = backupDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `).all() as Array<{ name: string }>

    const existingTables = new Set(rows.map(row => String(row.name)))
    const missingTables = requiredTables.filter(table => !existingTables.has(table))

    if (missingTables.length > 0) {
      throw new Error(
        'Bu yedek eksik olduğu için geri yüklenmedi. Eksik tablolar: ' +
        missingTables.join(', ')
      )
    }
  } finally {
    backupDb.close()
  }
}

function yedekVeritabanindakiFotografYollariniDuzelt(databasePath: string, photosDir: string): void {
  const restoreDb = new Database(databasePath, { fileMustExist: true })

  try {
    const tableExists = restoreDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'work_order_photos'
    `).get()
    if (!tableExists) return

    const rows = restoreDb.prepare(`
      SELECT id, file_name, file_path FROM work_order_photos
    `).all() as Array<{ id: number; file_name?: string; file_path?: string }>

    const update = restoreDb.prepare(`
      UPDATE work_order_photos SET file_name = ?, file_path = ? WHERE id = ?
    `)

    const transaction = restoreDb.transaction(() => {
      for (const row of rows) {
        const rawName = String(row.file_name || row.file_path || '').trim()
        const safeFileName = path.basename(rawName)
        if (!safeFileName) continue
        update.run(safeFileName, path.join(photosDir, safeFileName), Number(row.id))
      }
    })
    transaction()
  } finally {
    restoreDb.close()
  }
}

async function sqliteYanDosyalariniSil(): Promise<void> {
  for (const suffix of ['-wal', '-shm']) {
    try { await fs.rm(dbPath + suffix, { force: true }) } catch {}
  }
}


function ipcKopruleriniKur() {
  // Pencere kontrolleri
  kanalEkle('pencere-kucult', () => {
    win?.minimize()
    return { success: true }
  })

  kanalEkle('pencere-buyut-kucult', () => {
    if (!win) return { success: false }

    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }

    return { success: true, isMaximized: win.isMaximized() }
  })

  kanalEkle('pencere-kapat', () => {
    win?.close()
    return { success: true }
  })

  kanalEkle('pencere-durum-getir', () => {
    return { success: true, isMaximized: win?.isMaximized() ?? false }
  })

  // Usta & PIN İşlemleri (Bileşene Ayrıldı)
  registerMasterHandlers(kanalEkle);

    // Müşteri İşlemleri (Bileşene Ayrıldı)
  registerCustomerHandlers(kanalEkle);

  // Parça & Stok İşlemleri (Bileşene Ayrıldı)
  registerPartHandlers(kanalEkle);

  // Araç İşlemleri (Bileşene Ayrıldı)
  registerVehicleHandlers(kanalEkle);

  // İş Emirleri & Kalemleri & İstatistikler & Raporlar (Bileşene Ayrıldı)
  registerWorkOrderHandlers(kanalEkle);

  // 17. Veritabanı + fotoğrafları tek ZIP paketinde yedekle
  kanalEkle('veritabani-yedekle', async () => {
    return await tamYedekPaketiOlustur('manual')
  })
    // 18. Yedek klasörünü aç
  kanalEkle('yedek-klasoru-ac', async () => {
    try {
      const backupDir = yedekKlasoruYoluGetir()

      await fs.mkdir(backupDir, { recursive: true })

      const sonuc = await shell.openPath(backupDir)

      if (sonuc) {
        throw new Error(sonuc)
      }

      return {
        success: true,
        path: backupDir
      }
    } catch (error) {
      console.error('Yedek klasörü açma hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
  // 19. Yedekten geri yükle
  kanalEkle('yedekten-geri-yukle', async (_event, secilenDosyaYolu?: string) => {
    try {
      if (!win) {
        throw new Error('Uygulama penceresi bulunamadı.')
      }

      const backupDir = yedekKlasoruYoluGetir()
      await fs.mkdir(backupDir, { recursive: true })

      let secilenYedek = ''
      if (secilenDosyaYolu) {
        secilenYedek = secilenDosyaYolu
      } else {
        const secim = await dialog.showOpenDialog(win, {
          title: 'Yedek Paketi Seç',
          defaultPath: backupDir,
          properties: ['openFile'],
          filters: [
            { name: 'Kâtip Tam Yedek Paketi', extensions: ['zip'] },
            { name: 'Eski SQLite Yedeği', extensions: ['db'] },
            { name: 'Tüm Dosyalar', extensions: ['*'] }
          ]
        })

        if (secim.canceled || secim.filePaths.length === 0) {
          return {
            success: false,
            cancelled: true,
            error: 'İşlem iptal edildi.'
          }
        }

        secilenYedek = secim.filePaths[0]
      }
      const stat = await fs.stat(secilenYedek)

      if (!stat.isFile()) {
        throw new Error('Seçilen yol geçerli bir dosya değil.')
      }

      const lowerPath = secilenYedek.toLowerCase()

      if (!lowerPath.endsWith('.zip') && !lowerPath.endsWith('.db')) {
        throw new Error('Lütfen .zip veya .db uzantılı bir yedek dosyası seçin.')
      }

      const now = new Date()
      const stamp =
        now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0')

      const userDataDir = app.getPath('userData')
      const activePhotosDir = path.join(userDataDir, 'fotograflar')
      const guvenlikDir = path.join(userDataDir, `geri-yukleme-oncesi-${stamp}`)
      const tempDir = path.join(app.getPath('temp'), `katip-restore-${stamp}`)

      await fs.mkdir(guvenlikDir, { recursive: true })
      await fs.mkdir(tempDir, { recursive: true })

      const yedekDbKontrolEt = (kontrolDbPath: string) => {
        let kontrolDb: any = null

        try {
          kontrolDb = new Database(kontrolDbPath, {
            readonly: true,
            fileMustExist: true
          })

          const quick = kontrolDb.pragma('quick_check', { simple: true })
          if (String(quick).toLowerCase() !== 'ok') {
            throw new Error('SQLite kontrolü başarısız: ' + quick)
          }

          const tablolar = kontrolDb.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
          `).all().map((row: any) => String(row.name))

          const gerekliTablolar = [
            'customers',
            'vehicles',
            'work_orders',
            'work_order_items',
            'parts',
            'masters'
          ]

          const eksikler = gerekliTablolar.filter(tablo => !tablolar.includes(tablo))
          if (eksikler.length > 0) {
            throw new Error('Yedek eksik tablolar içeriyor: ' + eksikler.join(', '))
          }
        } finally {
          try {
            kontrolDb?.close()
          } catch {}
        }
      }

      const restoreSonrasiOnar = async () => {
        try {
          if (fsSync.existsSync(activePhotosDir)) {
            const fotografDosyalari = await fs.readdir(activePhotosDir)

            const mevcutSatir = db.prepare(`
              SELECT id
              FROM work_order_photos
              WHERE file_name = ? OR file_path = ?
              LIMIT 1
            `)

            const isEmriVar = db.prepare(`
              SELECT id
              FROM work_orders
              WHERE id = ?
              LIMIT 1
            `)

            const ekle = db.prepare(`
              INSERT INTO work_order_photos (
                work_order_id,
                file_name,
                file_path,
                category,
                note
              )
              VALUES (?, ?, ?, ?, ?)
            `)

            const guncelle = db.prepare(`
              UPDATE work_order_photos
              SET file_path = ?
              WHERE id = ?
            `)

            const mevcutFotograflar = db.prepare(`
              SELECT id, file_name, file_path
              FROM work_order_photos
            `).all() as any[]

            const tx = db.transaction(() => {
              for (const row of mevcutFotograflar) {
                const fileName = String(row.file_name || path.basename(String(row.file_path || '')))
                if (!fileName) continue

                const yeniYol = path.join(activePhotosDir, fileName)
                if (fsSync.existsSync(yeniYol)) {
                  guncelle.run(yeniYol, Number(row.id))
                }
              }

              for (const fileName of fotografDosyalari) {
                const eslesme = /^wo_(\d+)_/i.exec(fileName)
                if (!eslesme) continue

                const workOrderId = Number(eslesme[1])
                if (!workOrderId) continue

                if (!isEmriVar.get(workOrderId)) continue

                const filePath = path.join(activePhotosDir, fileName)

                if (!mevcutSatir.get(fileName, filePath)) {
                  ekle.run(workOrderId, fileName, filePath, 'Araç Kabul', '')
                }
              }
            })

            tx()
          }
        } catch (error) {
          console.error('Fotoğraf yollarını onarma hatası:', error)
        }
      }

      let yedekDbPath = ''
      let yedekPhotosDir = ''

      if (lowerPath.endsWith('.zip')) {
        console.log('[Restore] ZIP açılıyor:', secilenYedek)

        await zipPaketiniGuvenliCikart(secilenYedek, tempDir)

        yedekDbPath = path.join(tempDir, 'database', 'otoservis.db')
        yedekPhotosDir = path.join(tempDir, 'fotograflar')

        if (!fsSync.existsSync(yedekDbPath)) {
          throw new Error('Seçilen ZIP içinde database/otoservis.db bulunamadı.')
        }
      } else {
        yedekDbPath = secilenYedek
      }

      yedekDbKontrolEt(yedekDbPath)

      console.log('[Restore] Mevcut veriler güvenliğe alınıyor...')

      if (fsSync.existsSync(dbPath)) {
        await fs.copyFile(dbPath, path.join(guvenlikDir, 'otoservis.db'))
      }

      if (fsSync.existsSync(activePhotosDir)) {
        await fs.cp(activePhotosDir, path.join(guvenlikDir, 'fotograflar'), {
          recursive: true,
          force: true
        })
      }

      // Veritabanı bağlantısını kapat
      db.close()

      // Geçici veritabanı dosyalarını sil
      try {
        await fs.rm(dbPath + '-wal', { force: true })
      } catch {}

      try {
        await fs.rm(dbPath + '-shm', { force: true })
      } catch {}

      // Yedek veritabanını kopyala
      await fs.copyFile(yedekDbPath, dbPath)

      if (yedekPhotosDir && fsSync.existsSync(yedekPhotosDir)) {
        await fs.rm(activePhotosDir, { recursive: true, force: true })
        await fs.cp(yedekPhotosDir, activePhotosDir, {
          recursive: true,
          force: true
        })
      }

      // Veritabanı bağlantısını yeniden aç ve şemaları güncelle (initDB)
      const yenileSonuc = await uygulamaVerileriniYenileBackend()
      if (!yenileSonuc.success) {
        throw new Error('Veritabanı yenileme hatası: ' + yenileSonuc.message)
      }

      // Geri yükleme sonrası onarım/fotoğraf bağlama işlemlerini yap
      await restoreSonrasiOnar()

      console.log('[Restore] Geri yükleme tamamlandı. Uygulama kapatılıyor...')

      setTimeout(() => {
        app.exit(0)
      }, 1200)

      return {
        success: true,
        restoredFrom: secilenYedek,
        previousBackup: guvenlikDir,
        restartRequired: true
      }
    } catch (error) {
      console.error('Yedekten geri yükleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 19b. Yedekleri listele
  kanalEkle('yedekleri-listele', async () => {
    try {
      const backupDir = yedekKlasoruYoluGetir()
      await fs.mkdir(backupDir, { recursive: true })
      const files = await fs.readdir(backupDir)
      const list: any[] = []

      for (const fileName of files) {
        const lowerName = fileName.toLowerCase()
        if (lowerName.endsWith('.zip') || lowerName.endsWith('.db')) {
          const filePath = path.join(backupDir, fileName)
          const stat = await fs.stat(filePath)
          list.push({
            name: fileName,
            path: filePath,
            size: formatBytes(stat.size),
            sizeBytes: stat.size,
            time: stat.mtimeMs,
            date: new Date(stat.mtimeMs).toLocaleString('tr-TR'),
            isZip: lowerName.endsWith('.zip')
          })
        }
      }

      // En yeni yedek en başta olacak şekilde sırala
      list.sort((a, b) => b.time - a.time)

      return { success: true, backups: list }
    } catch (error) {
      console.error('[YedekListele] Hata:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  kanalEkle('veritabani-bilgileri-getir', async () => {
    try {
      const backupDir = yedekKlasoruYoluGetir()

      await fs.mkdir(backupDir, { recursive: true })

      return {
        success: true,
        dbPath,
        backupDir
      }
    } catch (error) {
      console.error('Veritabanı bilgileri getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // Cari Hesaplar & Giderler (Bileşene Ayrıldı)
  registerAccountHandlers(kanalEkle);

  // 35. Telefon Erişimi - Başlat
  kanalEkle('telefon-erisimi-baslat', async (_event, port: number) => {
    try {
      const res = await startPhoneServer(Number(port || 4317))
      if (res.success) {
        return {
          ...res,
          ips: getLocalIPAddresses()
        }
      }
      return res
    } catch (error) {
      console.error('[PhoneServer] Start handler error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 36. Telefon Erişimi - Durdur
  kanalEkle('telefon-erisimi-durdur', async () => {
    try {
      await stopPhoneServer()
      return { success: true }
    } catch (error) {
      console.error('[PhoneServer] Stop handler error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 37. Telefon Erişimi - Durum Getir
  kanalEkle('telefon-erisimi-durum-getir', () => {
    try {
      return {
        success: true,
        running: isServerRunning(),
        port: getCurrentPort(),
        ip: getLocalIPAddress(),
        ips: getLocalIPAddresses()
      }
    } catch (error) {
      console.error('[PhoneServer] Status handler error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 38. Telefon Erişimi - QR Kod / Eşleşme Jeneratörü
  kanalEkle('telefon-eslesme-qr-olustur', async (_event, masterId?: number) => {
    try {
      const pairRes = generatePairingToken(masterId, 30)
      const qrDataUrl = await QRCode.toDataURL(pairRes.pairingUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
      return {
        ...pairRes,
        qrDataUrl
      }
    } catch (error) {
      console.error('[PhoneServer] QR gen error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 39. Telefon Erişimi - Aktif Cihaz/Oturum Listesi
  kanalEkle('telefon-oturumlari-getir', () => {
    try {
      return {
        success: true,
        sessions: getMobileSessionsList()
      }
    } catch (error) {
      console.error('[PhoneServer] Get sessions error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 40. Telefon Erişimi - Cihaz Oturumu Kapat
  kanalEkle('telefon-oturum-kapat', (_event, token: string) => {
    try {
      return revokeMobileSession(token)
    } catch (error) {
      console.error('[PhoneServer] Revoke session error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 41. Telefon Erişimi - Tüm Oturumları Kapat
  kanalEkle('telefon-tum-oturumlari-kapat', () => {
    try {
      return revokeAllMobileSessions()
    } catch (error) {
      console.error('[PhoneServer] Revoke all error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 38. Uygulama Verilerini Yenile
  kanalEkle('uygulama-verilerini-yenile', async () => {
    return await uygulamaVerileriniYenileBackend()
  })

  // 39. Ayarları Getir
  kanalEkle('ayarlari-getir', () => {
    return ayarlariGetirBackend()
  })

  // 40. Ayar Kaydet / Toplu Kaydet
  kanalEkle('ayarlari-kaydet', (_event, settings: any) => {
    if (typeof settings === 'object' && settings !== null) {
      return topluAyarlariKaydetBackend(settings)
    }
    return { success: false, error: 'Geçersiz ayar verisi.' }
  })

  // 41. Destek Sistem Bilgileri Getir
  kanalEkle('destek-sistem-bilgileri-getir', async () => {
    return await destekSistemBilgileriGetirBackend()
  })

  // 42. Veritabanı Kontrol Et
  kanalEkle('veritabani-kontrol-et', () => {
    return veritabaniKontrolEtBackend()
  })

  // 43. Otomatik Yedek Al
  kanalEkle('otomatik-yedek-al', async () => {
    return await otomatikYedekAlBackend()
  })

  // 44. Log Klasörünü Aç
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function otomatikYedekAlBackend(): Promise<TamYedekSonucu> {
  const result = await tamYedekPaketiOlustur('automatic')
  if (result.success) {
    try { await otomatikYedekleriTemizle() }
    catch (error) { console.warn('[AutoBackup] Saklama temizliği yapılamadı:', error) }
  }
  return result
}

async function destekSistemBilgileriGetirBackend(): Promise<any> {
  try {
    const backupDir = yedekKlasoruYoluGetir()
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
        appVersion: '1.0.0'
      }
    }
  } catch (error) {
    console.error('Destek sistem bilgileri getirme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
}
let otomatikYedekTimer: ReturnType<typeof setInterval> | null = null
let otomatikYedekCalisiyor = false

async function otomatikYedekKontrolEt(force = false): Promise<void> {
  if (otomatikYedekCalisiyor) return

  try {
    const settingsRes = ayarlariGetirBackend()
    const settings = settingsRes?.settings || {}
    if (settings.automatic_backup_enabled !== 'true') return

    if (!force) {
      const intervalHours = Math.max(1, Number(settings.backup_interval_hours) || 24)
      const lastBackupTime = await sonOtomatikYedekZamaniGetir()
      const intervalMilliseconds = intervalHours * 60 * 60 * 1000

      if (lastBackupTime > 0 && Date.now() - lastBackupTime < intervalMilliseconds) return
    }

    otomatikYedekCalisiyor = true
    const result = await otomatikYedekAlBackend()

    if (result.success) console.log('[AutoBackupScheduler] Tam yedek paketi alındı:', result.path)
    else console.error('[AutoBackupScheduler] Yedek alınamadı:', result.error)
  } catch (error) {
    console.error('[AutoBackupScheduler] Hata:', error)
  } finally {
    otomatikYedekCalisiyor = false
  }
}

function otomatikYedekZamanlayicisiniBaslat(): void {
  if (otomatikYedekTimer) {
    clearInterval(otomatikYedekTimer)
  }

  // Program açılır açılmaz otomatik arkaplan yedeğini doğrudan al (force = true)
  void otomatikYedekKontrolEt(true)

  // Her 15 dakikada bir süre dolmuş mu diye kontrol et (force = false)
  otomatikYedekTimer = setInterval(() => {
    void otomatikYedekKontrolEt(false)
  }, 15 * 60 * 1000)
}
let isQuitting = false

app.on('before-quit', (event) => {
  if (isQuitting) return

  try {
    const settingsRes = ayarlariGetirBackend()
    const settings = settingsRes?.settings || {}
    if (settings.backup_on_exit === 'true') {
      // Çıkış işlemini senkron olarak engelle
      event.preventDefault()

      // Asenkron olarak yedek al ve ardından uygulamayı kapat
      void (async () => {
        try {
          const result = await otomatikYedekAlBackend()
          if (!result.success) console.error('[BackupOnExit] Yedek alınamadı:', result.error)
        } catch (error) {
          console.error('[BackupOnExit] Hata:', error)
        } finally {
          isQuitting = true
          app.quit()
        }
      })()
    }
  } catch (error) {
    console.error('[BackupOnExit] Hata:', error)
    isQuitting = true
    app.quit()
  }
})

app.on('window-all-closed' , () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  initDB()
  runPhoneServerMigrations()
  ipcKopruleriniKur()
  Menu.setApplicationMenu(null)

otomatikYedekZamanlayicisiniBaslat()

  createWindow()
})