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
function isEmriToplaminiGuncelle(workOrderId: number | string): void {
  const woId = Number(workOrderId)
  const toplam = db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) AS toplam
    FROM work_order_items
    WHERE work_order_id = ?
  `).get(woId) as any

  const yeniToplam = Number(toplam?.toplam || 0)

  const tahsilat = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS toplam
    FROM work_order_payments
    WHERE work_order_id = ? AND IFNULL(is_cancelled, 0) = 0
  `).get(woId) as any

  const toplamTahsilat = Number(tahsilat?.toplam || 0)

  if (yeniToplam < toplamTahsilat - 0.01) {
    throw new Error('İş emri toplamı alınmış ödemelerin altına düşürülemez.')
  }

  db.prepare(`
    UPDATE work_orders
    SET total_price = ?
    WHERE id = ?
  `).run(yeniToplam, woId)
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
// 11. İş emirlerini getir
kanalEkle('is-emirleri-getir', () => {
  return db.prepare(`
    SELECT 
      work_orders.*,
      vehicles.plate,
      vehicles.brand,
      vehicles.model,
      vehicles.chassis,
      customers.name AS customer_name,
      customers.phone AS customer_phone,
      opened_master.name AS opened_by_master_name,
      closed_master.name AS closed_by_master_name,
      COALESCE((
        SELECT SUM(amount)
        FROM work_order_payments
        WHERE work_order_id = work_orders.id AND IFNULL(is_cancelled, 0) = 0
      ), 0) AS toplam_tahsilat
    FROM work_orders
    JOIN vehicles ON work_orders.vehicle_id = vehicles.id
    JOIN customers ON vehicles.customer_id = customers.id
    LEFT JOIN masters opened_master ON work_orders.opened_by_master_id = opened_master.id
    LEFT JOIN masters closed_master ON work_orders.closed_by_master_id = closed_master.id
    ORDER BY work_orders.id DESC
  `).all()
})

  // 12. İş emri ekle
  kanalEkle('is-emri-ekle', (_event, isEmri: any) => {
    try {
const stmt = db.prepare(`
  INSERT INTO work_orders (
    vehicle_id,
    description,
    mileage,
    total_price,
    status,
    closed_at,
    opened_by_master_id,
    closed_by_master_id
  )
  VALUES (
    ?,
    ?,
    ?,
    ?,
    ?,
    CASE WHEN ? = 'Tamamlandı' THEN CURRENT_TIMESTAMP ELSE NULL END,
    ?,
    ?
  )
`)

const mileage =
  isEmri.mileage !== undefined &&
  isEmri.mileage !== null &&
  isEmri.mileage !== ''
    ? Number(isEmri.mileage)
    : null

const vehicleId = Number(isEmri.vehicle_id)
const status = String(isEmri.status || 'Açık').trim() || 'Açık'

const activeMasterId =
  isEmri.active_master_id !== undefined &&
  isEmri.active_master_id !== null &&
  isEmri.active_master_id !== ''
    ? Number(isEmri.active_master_id)
    : null

const closedByMasterId = status === 'Tamamlandı'
  ? activeMasterId
  : null

const info = stmt.run(
  vehicleId,
  String(isEmri.description || '').trim(),
  mileage,
  Number(isEmri.total_price) || 0,
  status,
  status,
  activeMasterId,
  closedByMasterId
)

if (mileage !== null) {
  db.prepare(`
    UPDATE vehicles
    SET mileage = ?
    WHERE id = ?
  `).run(mileage, vehicleId)
}

      return { success: true, id: info.lastInsertRowid }
    } catch (error) {
      console.error('İş emri kayıt hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

// 13. İş emri sil
kanalEkle('is-emri-sil', (_event, id: any) => {
  const transaction = db.transaction(() => {
    const workOrderId =
      typeof id === 'object' && id !== null
        ? Number(id.id)
        : Number(id)

    const activeMasterId =
      typeof id === 'object' &&
      id !== null &&
      id.active_master_id !== undefined &&
      id.active_master_id !== null &&
      id.active_master_id !== '' &&
      id.active_master_id !== 'admin'
        ? Number(id.active_master_id)
        : null

    if (!workOrderId) {
      throw new Error('Silinecek iş emri bulunamadı.')
    }

    const isEmri = db.prepare(`
      SELECT *
      FROM work_orders
      WHERE id = ?
    `).get(workOrderId) as any

    if (!isEmri) {
      throw new Error('Silinecek iş emri bulunamadı.')
    }

    const aktifOdeme = db.prepare(`
      SELECT COUNT(*) AS count
      FROM work_order_payments
      WHERE work_order_id = ? AND IFNULL(is_cancelled, 0) = 0
    `).get(workOrderId) as any

    if (aktifOdeme && Number(aktifOdeme.count) > 0) {
      throw new Error('Bu iş emrinde tahsilat kaydı bulunduğu için silinemez. Önce tahsilat kaydını iptal edin.')
    }

    const fotograflar = db.prepare(`
      SELECT *
      FROM work_order_photos
      WHERE work_order_id = ?
    `).all(workOrderId) as any[]

    const kalemler = db.prepare(`
      SELECT *
      FROM work_order_items
      WHERE work_order_id = ?
    `).all(workOrderId) as any[]

    for (const kalem of kalemler) {
      if ((kalem.type === 'Parça' || kalem.type === 'Parca') && kalem.part_id) {
        const partId = Number(kalem.part_id)
        const miktar = Number(kalem.quantity) || 0

        if (partId && miktar > 0) {
          const parca = db.prepare(`
            SELECT stock
            FROM parts
            WHERE id = ?
          `).get(partId) as any

          const eskiStok = Number(parca?.stock) || 0
          const yeniStok = eskiStok + miktar

          db.prepare(`
            UPDATE parts
            SET stock = ?
            WHERE id = ?
          `).run(yeniStok, partId)

          stokHareketiKaydet({
            partId,
            workOrderId: null,
            type: 'Giriş',
            quantity: miktar,
            oldStock: eskiStok,
            newStock: yeniStok,
            masterId: activeMasterId,
            note: `İş emri #${workOrderId} silindiği için stok geri eklendi`
          })
        }
      }
    }

    // Bu iş emrine bağlı eski stok hareketleri iş emri silinince foreign key hatası vermesin.
    try {
      db.prepare(`
        UPDATE stock_movements
        SET work_order_id = NULL
        WHERE work_order_id = ?
      `).run(workOrderId)
    } catch (e) {
      db.prepare(`
        DELETE FROM stock_movements
        WHERE work_order_id = ?
      `).run(workOrderId)
    }

    // Önce bağlı kayıtları sil, sonra ana iş emrini sil.
    db.prepare(`
      DELETE FROM work_order_payments
      WHERE work_order_id = ?
    `).run(workOrderId)

    db.prepare(`
      DELETE FROM work_order_photos
      WHERE work_order_id = ?
    `).run(workOrderId)

    db.prepare(`
      DELETE FROM work_order_logs
      WHERE work_order_id = ?
    `).run(workOrderId)

    db.prepare(`
      DELETE FROM work_order_items
      WHERE work_order_id = ?
    `).run(workOrderId)

    db.prepare(`
      DELETE FROM work_orders
      WHERE id = ?
    `).run(workOrderId)

    for (const fotograf of fotograflar) {
      const filePath = String(fotograf.file_path || '')
      if (!filePath) continue

      try {
        if (fsSync.existsSync(filePath)) {
          fsSync.unlinkSync(filePath)
        }
      } catch (e) {
        console.warn('[Photos] İş emri silinirken fotoğraf dosyası silinemedi:', filePath, e)
      }
    }

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri silme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// 14. İş emri güncelle / kapat
kanalEkle('is-emri-guncelle', (_event, isEmri: any) => {
  try {
    const workOrderId = Number(isEmri.id)

    if (!workOrderId) {
      throw new Error('Güncellenecek iş emri bulunamadı.')
    }

const mileage =
  isEmri.mileage !== undefined &&
  isEmri.mileage !== null &&
  isEmri.mileage !== ''
    ? Number(isEmri.mileage)
    : null

const status = String(isEmri.status || 'Açık').trim() || 'Açık'

const activeMasterId =
  isEmri.active_master_id !== undefined &&
  isEmri.active_master_id !== null &&
  isEmri.active_master_id !== ''
    ? Number(isEmri.active_master_id)
    : null

db.prepare(`
  UPDATE work_orders
  SET
    description = ?,
    mileage = ?,
    status = ?,
    closed_at = CASE
      WHEN ? = 'Tamamlandı' THEN COALESCE(closed_at, CURRENT_TIMESTAMP)
      ELSE NULL
    END,
    closed_by_master_id = CASE
      WHEN ? = 'Tamamlandı' THEN COALESCE(closed_by_master_id, ?)
      ELSE NULL
    END
  WHERE id = ?
`).run(
  String(isEmri.description || '').trim(),
  mileage,
  status,
  status,
  status,
  activeMasterId,
  workOrderId
)

if (mileage !== null) {
  const mevcutIsEmri = db.prepare(`
    SELECT vehicle_id
    FROM work_orders
    WHERE id = ?
  `).get(workOrderId) as any

  if (mevcutIsEmri?.vehicle_id) {
    db.prepare(`
      UPDATE vehicles
      SET mileage = ?
      WHERE id = ?
    `).run(mileage, Number(mevcutIsEmri.vehicle_id))
  }
}

    // Toplam tutar frontend'den alınmaz, kalemlerden yeniden hesaplanır
    isEmriToplaminiGuncelle(workOrderId)

    return { success: true }
  } catch (error) {
    console.error('İş emri güncelleme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// İş emri işlem geçmişini getir
kanalEkle('is-emri-loglari-getir', (_event, workOrderId: any) => {
  try {
    const loglar = db.prepare(`
      SELECT
        work_order_logs.*,
        masters.name AS master_name
      FROM work_order_logs
      LEFT JOIN masters ON work_order_logs.master_id = masters.id
      WHERE work_order_logs.work_order_id = ?
      ORDER BY work_order_logs.id DESC
    `).all(Number(workOrderId))

    return { success: true, loglar }
  } catch (error) {
    console.error('İş emri işlem geçmişi hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// Tamamlanan iş emrini sebep girerek tekrar aç
kanalEkle('is-emri-tekrar-ac', (_event, veri: any) => {
  const transaction = db.transaction(() => {
    const workOrderId = Number(veri.id)
    const activeMasterId = Number(veri.active_master_id)
    const reason = String(veri.reason || '').trim()

    if (!workOrderId) {
      throw new Error('Tekrar açılacak iş emri bulunamadı.')
    }

    if (!activeMasterId) {
      throw new Error('İş emrini tekrar açmak için önce usta girişi yapılmalıdır.')
    }

    if (!reason) {
      throw new Error('Tekrar açma sebebi boş bırakılamaz.')
    }

    const isEmri = db.prepare(`
      SELECT *
      FROM work_orders
      WHERE id = ?
    `).get(workOrderId) as any

    if (!isEmri) {
      throw new Error('İş emri bulunamadı.')
    }

    if (isEmri.status !== 'Tamamlandı') {
      throw new Error('Sadece tamamlanmış iş emirleri tekrar açılabilir.')
    }

    db.prepare(`
      UPDATE work_orders
      SET
        status = 'Açık',
        closed_at = NULL,
        closed_by_master_id = NULL
      WHERE id = ?
    `).run(workOrderId)

    db.prepare(`
      INSERT INTO work_order_logs (
        work_order_id,
        action,
        old_status,
        new_status,
        master_id,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      workOrderId,
      'Tekrar Açıldı',
      isEmri.status,
      'Açık',
      activeMasterId,
      reason
    )

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri tekrar açma hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// İş emri ödemelerini getir
kanalEkle('is-emri-odemeleri-getir', (_event, workOrderId?: any) => {
  try {
    let query = `
      SELECT 
        work_order_payments.*,
        m1.name AS received_by_master_name,
        m2.name AS cancelled_by_master_name,
        vehicles.plate,
        customers.name AS customer_name
      FROM work_order_payments
      JOIN work_orders ON work_order_payments.work_order_id = work_orders.id
      JOIN vehicles ON work_orders.vehicle_id = vehicles.id
      JOIN customers ON vehicles.customer_id = customers.id
      LEFT JOIN masters m1 ON work_order_payments.received_by = m1.id
      LEFT JOIN masters m2 ON work_order_payments.cancelled_by = m2.id
    `
    const params: any[] = []

    if (workOrderId) {
      query += ` WHERE work_order_payments.work_order_id = ? `
      params.push(Number(workOrderId))
    }

    query += ` ORDER BY work_order_payments.id DESC `

    const odemeler = db.prepare(query).all(...params)

    return { success: true, odemeler }
  } catch (error) {
    console.error('İş emri ödemeleri getirme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// İş emri ödemesi ekle
kanalEkle('is-emri-odeme-ekle', (_event, odeme: any) => {
  const transaction = db.transaction(() => {
    const workOrderId = Number(odeme.work_order_id)
    const amount = Number(odeme.amount) || 0
    const paymentMethod = String(odeme.payment_method || 'Nakit').trim()
    const paymentDate = String(odeme.payment_date || new Date().toISOString().slice(0, 10)).trim()
    const note = String(odeme.note || '').trim()
    const activeMasterId = odeme.active_master_id !== undefined && odeme.active_master_id !== null && odeme.active_master_id !== '' && odeme.active_master_id !== 'admin'
      ? Number(odeme.active_master_id)
      : null

    if (!workOrderId) {
      throw new Error('İş emri seçilmelidir.')
    }

    const isEmri = db.prepare(`
      SELECT * FROM work_orders WHERE id = ?
    `).get(workOrderId) as any

    if (!isEmri) {
      throw new Error('İş emri bulunamadı.')
    }

    if (amount <= 0) {
      throw new Error('Ödeme tutarı 0\'dan büyük olmalıdır.')
    }

    if (!paymentMethod) {
      throw new Error('Ödeme yöntemi seçilmelidir.')
    }

    // Toplam tahsilatı ve kalan borcu hesapla
    const tahsilat = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS toplam
      FROM work_order_payments
      WHERE work_order_id = ? AND IFNULL(is_cancelled, 0) = 0
    `).get(workOrderId) as any

    const toplamTahsilat = Number(tahsilat?.toplam || 0)
    const kalanBorc = Number((isEmri.total_price - toplamTahsilat).toFixed(2))

    if (amount > kalanBorc + 0.01) {
      throw new Error(`Ödeme tutarı kalan borçtan (${kalanBorc.toLocaleString('tr-TR')} TL) büyük olamaz.`)
    }

    db.prepare(`
      INSERT INTO work_order_payments (
        work_order_id,
        amount,
        payment_method,
        payment_date,
        received_by,
        note
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(workOrderId, amount, paymentMethod, paymentDate, activeMasterId, note)

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri ödeme ekleme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// İş emri ödemesi iptal et
kanalEkle('is-emri-odeme-iptal', (_event, veri: any) => {
  const transaction = db.transaction(() => {
    const paymentId = Number(veri.payment_id)
    const cancelReason = String(veri.cancel_reason || '').trim()
    const activeMasterId = veri.active_master_id !== undefined && veri.active_master_id !== null && veri.active_master_id !== '' && veri.active_master_id !== 'admin'
      ? Number(veri.active_master_id)
      : null

    if (!paymentId) {
      throw new Error('İptal edilecek ödeme kaydı bulunamadı.')
    }

    if (!cancelReason) {
      throw new Error('İptal sebebi girilmesi zorunludur.')
    }

    const odeme = db.prepare(`
      SELECT * FROM work_order_payments WHERE id = ?
    `).get(paymentId) as any

    if (!odeme) {
      throw new Error('Ödeme kaydı bulunamadı.')
    }

    if (odeme.is_cancelled === 1) {
      throw new Error('Bu ödeme kaydı zaten iptal edilmiş.')
    }

    const cancelledAt = new Date().toISOString()

    db.prepare(`
      UPDATE work_order_payments
      SET 
        is_cancelled = 1,
        cancelled_at = ?,
        cancelled_by = ?,
        cancel_reason = ?
      WHERE id = ?
    `).run(cancelledAt, activeMasterId, cancelReason, paymentId)

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri ödeme iptal hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// İş emri ödeme özetini getir
kanalEkle('is-emri-odeme-ozeti-getir', (_event, workOrderId: any) => {
  try {
    const woId = Number(workOrderId)
    const isEmri = db.prepare(`
      SELECT id, total_price FROM work_orders WHERE id = ?
    `).get(woId) as any

    if (!isEmri) {
      throw new Error('İş emri bulunamadı.')
    }

    const tahsilat = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS toplam
      FROM work_order_payments
      WHERE work_order_id = ? AND IFNULL(is_cancelled, 0) = 0
    `).get(woId) as any

    const totalPrice = Number(isEmri.total_price || 0)
    const toplamTahsilat = Number(tahsilat?.toplam || 0)
    const kalanBorc = Number((totalPrice - toplamTahsilat).toFixed(2))

    let odemeDurumu = 'Ödenmedi'
    if (toplamTahsilat <= 0) {
      odemeDurumu = 'Ödenmedi'
    } else if (kalanBorc > 0.01) {
      odemeDurumu = 'Kısmi Ödendi'
    } else if (Math.abs(kalanBorc) <= 0.01) {
      odemeDurumu = 'Ödendi'
    } else {
      odemeDurumu = 'Fazla Ödeme'
    }

    return {
      success: true,
      ozet: {
        work_order_id: woId,
        total_price: totalPrice,
        toplam_tahsilat: toplamTahsilat,
        kalan_borc: kalanBorc,
        odeme_durumu: odemeDurumu
      }
    }
  } catch (error) {
    console.error('İş emri ödeme özeti hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// Müşteri iş emri alacaklarını getir (Cari Hesap için)
kanalEkle('musteri-is-emri-alacaklari-getir', (_event, customerId?: any) => {
  try {
    let query = `
      SELECT
        work_orders.id AS work_order_id,
        work_orders.vehicle_id,
        work_orders.total_price,
        work_orders.status AS work_order_status,
        work_orders.created_at,
        work_orders.closed_at,
        vehicles.plate,
        vehicles.brand,
        vehicles.model,
        customers.id AS customer_id,
        customers.name AS customer_name,
        customers.phone AS customer_phone,
        COALESCE((
          SELECT SUM(amount)
          FROM work_order_payments
          WHERE work_order_id = work_orders.id AND IFNULL(is_cancelled, 0) = 0
        ), 0) AS toplam_tahsilat
      FROM work_orders
      JOIN vehicles ON work_orders.vehicle_id = vehicles.id
      JOIN customers ON vehicles.customer_id = customers.id
    `
    const params: any[] = []

    if (customerId) {
      query += ` WHERE customers.id = ? `
      params.push(Number(customerId))
    }

    query += ` ORDER BY work_orders.id DESC`

    const list = db.prepare(query).all(...params) as any[]

    const alacaklar = list.map(item => {
      const totalPrice = Number(item.total_price || 0)
      const toplamTahsilat = Number(item.toplam_tahsilat || 0)
      const kalanBorc = Number((totalPrice - toplamTahsilat).toFixed(2))

      let odemeDurumu = 'Ödenmedi'
      if (toplamTahsilat <= 0) {
        odemeDurumu = 'Ödenmedi'
      } else if (kalanBorc > 0.01) {
        odemeDurumu = 'Kısmi Ödendi'
      } else if (Math.abs(kalanBorc) <= 0.01) {
        odemeDurumu = 'Ödendi'
      } else {
        odemeDurumu = 'Fazla Ödeme'
      }

      return {
        ...item,
        total_price: totalPrice,
        toplam_tahsilat: toplamTahsilat,
        kalan_borc: kalanBorc,
        odeme_durumu: odemeDurumu
      }
    })

    return { success: true, alacaklar }
  } catch (error) {
    console.error('Müşteri iş emri alacakları hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// İş emri tamamla ve ödeme kaydet (Tek transaction)
kanalEkle('is-emri-tamamla-ve-odeme-kaydet', (_event, veri: any) => {
  const transaction = db.transaction(() => {
    const workOrderId = Number(veri.id)
    const activeMasterId = veri.active_master_id !== undefined && veri.active_master_id !== null && veri.active_master_id !== '' && veri.active_master_id !== 'admin'
      ? Number(veri.active_master_id)
      : null
    const paymentOption = String(veri.payment_option || 'none') // 'full' | 'partial' | 'none'
    const amount = Number(veri.amount) || 0
    const paymentMethod = String(veri.payment_method || 'Nakit').trim()
    const paymentDate = String(veri.payment_date || new Date().toISOString().slice(0, 10)).trim()
    const note = String(veri.note || '').trim()

    if (!workOrderId) {
      throw new Error('İş emri seçilmelidir.')
    }

    const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(workOrderId) as any
    if (!wo) {
      throw new Error('İş emri bulunamadı.')
    }

    // Update status to Tamamlandı
    db.prepare(`
      UPDATE work_orders
      SET 
        status = 'Tamamlandı',
        closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
        closed_by_master_id = COALESCE(closed_by_master_id, ?)
      WHERE id = ?
    `).run(activeMasterId, workOrderId)

    if (paymentOption === 'full' || paymentOption === 'partial') {
      const tahsilat = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS toplam
        FROM work_order_payments
        WHERE work_order_id = ? AND IFNULL(is_cancelled, 0) = 0
      `).get(workOrderId) as any

      const toplamTahsilat = Number(tahsilat?.toplam || 0)
      const kalanBorc = Number((wo.total_price - toplamTahsilat).toFixed(2))

      // Kalan borç 0 veya tolerans dahilinde 0 ise ödeme ekleme yapma!
      if (kalanBorc > 0.01) {
        let odenecekTutar = paymentOption === 'full' ? kalanBorc : amount
        odenecekTutar = Number(odenecekTutar.toFixed(2))

        if (odenecekTutar > 0) {
          if (odenecekTutar > kalanBorc + 0.01) {
            throw new Error(`Ödeme tutarı kalan borçtan (${kalanBorc.toLocaleString('tr-TR')} TL) büyük olamaz.`)
          }

          db.prepare(`
            INSERT INTO work_order_payments (
              work_order_id,
              amount,
              payment_method,
              payment_date,
              received_by,
              note
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            workOrderId,
            odenecekTutar,
            paymentMethod,
            paymentDate,
            activeMasterId,
            note || (paymentOption === 'full' ? 'İş emri kapatılırken alınan tam ödeme' : 'İş emri kapatılırken alınan kısmi ödeme')
          )
        }
      }
    }

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri tamamlama ve ödeme kaydetme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// 15. İş emri kalemlerini getir
kanalEkle('is-emri-kalemleri-getir', (_event, workOrderId: any) => {
  try {
    const kalemler = db.prepare(`
      SELECT 
        work_order_items.*,
        parts.code AS part_code,
        parts.name AS part_name,
        work_order_items.buy_price AS part_buy_price,
        parts.sell_price AS part_sell_price
      FROM work_order_items
      LEFT JOIN parts ON work_order_items.part_id = parts.id
      WHERE work_order_items.work_order_id = ?
      ORDER BY work_order_items.id DESC
    `).all(Number(workOrderId))

    return { success: true, kalemler }
  } catch (error) {
    console.error('İş emri kalemleri getirme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// 16. İş emrine kalem ekle
kanalEkle('is-emri-kalem-ekle', (_event, kalem: any) => {
  const transaction = db.transaction(() => {
    const workOrderId = Number(kalem.work_order_id)
    const type = String(kalem.type || '').trim()
    const quantity = Number(kalem.quantity) || 1
    const unitPrice = Number(kalem.unit_price) || 0
    const totalPrice = quantity * unitPrice
    const partId = kalem.part_id ? Number(kalem.part_id) : null
    const activeMasterId =
  kalem.active_master_id !== undefined &&
  kalem.active_master_id !== null &&
  kalem.active_master_id !== ''
    ? Number(kalem.active_master_id)
    : null
    let buyPrice = 0

    if (!workOrderId) {
      throw new Error('İş emri seçilmedi.')
    }

    if (!type) {
      throw new Error('Kalem tipi seçilmedi.')
    }

    if (type === 'Parça' && partId) {
      const parca = db.prepare('SELECT * FROM parts WHERE id = ?').get(partId) as any

      if (!parca) {
        throw new Error('Seçilen parça bulunamadı.')
      }

      buyPrice = Number(parca.buy_price) || 0

      if (Number(parca.stock || 0) < quantity) {
        throw new Error(`Stok yetersiz. Mevcut stok: ${parca.stock}`)
      }

      const eskiStok = Number(parca.stock) || 0
      const yeniStok = eskiStok - quantity

      db.prepare(`
        UPDATE parts
        SET stock = ?
        WHERE id = ?
      `).run(yeniStok, partId)

      stokHareketiKaydet({
        partId,
        workOrderId,
        type: 'Çıkış',
        quantity,
        oldStock: eskiStok,
        newStock: yeniStok,
        masterId: activeMasterId,
        note: 'İş emrinde kullanıldı'
      })
    }

    const aciklama = type === 'Parça'
      ? String(kalem.description || '').trim()
      : String(kalem.description || '').trim()

    const info = db.prepare(`
      INSERT INTO work_order_items 
      (work_order_id, type, part_id, description, quantity, unit_price, total_price, buy_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workOrderId,
      type,
      partId,
      aciklama,
      quantity,
      unitPrice,
      totalPrice,
      buyPrice
    )

    isEmriToplaminiGuncelle(workOrderId)

    return { success: true, id: info.lastInsertRowid }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri kalem ekleme hatası:', error)
    const err = error as Error
    return { success: false, error: err.message || String(error) }
  }
})
// İş emri kalemi güncelle
kanalEkle('is-emri-kalem-guncelle', (_event, veri: any) => {
  const transaction = db.transaction(() => {
    const kalemId = Number(veri.id)
    const yeniTip = String(veri.type || '').trim()
    const yeniPartId = yeniTip === 'Parça' && veri.part_id
      ? Number(veri.part_id)
      : null
    const yeniAciklama = String(veri.description || '').trim()
    const yeniMiktar = Number(veri.quantity) || 1
    const yeniBirimFiyat = Number(veri.unit_price) || 0
    const yeniToplam = yeniMiktar * yeniBirimFiyat

    const activeMasterId =
      veri.active_master_id !== undefined &&
      veri.active_master_id !== null &&
      veri.active_master_id !== ''
        ? Number(veri.active_master_id)
        : null

    if (!kalemId) {
      throw new Error('Güncellenecek kalem bulunamadı.')
    }

    if (!activeMasterId) {
      throw new Error('Kalem düzenlemek için önce usta girişi yapılmalıdır.')
    }

    if (!yeniTip) {
      throw new Error('Kalem tipi seçilmelidir.')
    }

    if (yeniTip === 'Parça' && !yeniPartId && !yeniAciklama) {
      throw new Error('Katalog dışı parça için açıklama/ad belirtilmelidir.')
    }

    if (yeniTip === 'İşçilik' && !yeniAciklama) {
      throw new Error('İşçilik açıklaması boş bırakılamaz.')
    }

    if (yeniMiktar <= 0) {
      throw new Error('Miktar 0 olamaz.')
    }

    const eskiKalem = db.prepare(`
      SELECT
        work_order_items.*,
        work_orders.status AS work_order_status
      FROM work_order_items
      JOIN work_orders ON work_order_items.work_order_id = work_orders.id
      WHERE work_order_items.id = ?
    `).get(kalemId) as any

    if (!eskiKalem) {
      throw new Error('Güncellenecek kalem bulunamadı.')
    }

    if (eskiKalem.work_order_status === 'Tamamlandı') {
      throw new Error('Tamamlanmış iş emrinde kalem düzenlenemez.')
    }

    const workOrderId = Number(eskiKalem.work_order_id)
    const eskiTip = String(eskiKalem.type || '').trim()
    const eskiPartId = eskiKalem.part_id ? Number(eskiKalem.part_id) : null
    const eskiMiktar = Number(eskiKalem.quantity) || 0

    const stokGirisYap = (partId: number, miktar: number, not: string) => {
      if (!partId || miktar <= 0) return

      const parca = db.prepare(`
        SELECT *
        FROM parts
        WHERE id = ?
      `).get(partId) as any

      if (!parca) {
        throw new Error('Stok girişi yapılacak parça bulunamadı.')
      }

      const eskiStok = Number(parca.stock) || 0
      const yeniStok = eskiStok + miktar

      db.prepare(`
        UPDATE parts
        SET stock = ?
        WHERE id = ?
      `).run(yeniStok, partId)

      stokHareketiKaydet({
        partId,
        workOrderId,
        type: 'Giriş',
        quantity: miktar,
        oldStock: eskiStok,
        newStock: yeniStok,
        masterId: activeMasterId,
        note: not
      })
    }

    const stokCikisYap = (partId: number, miktar: number, not: string) => {
      if (!partId || miktar <= 0) return

      const parca = db.prepare(`
        SELECT *
        FROM parts
        WHERE id = ?
      `).get(partId) as any

      if (!parca) {
        throw new Error('Stok çıkışı yapılacak parça bulunamadı.')
      }

      const eskiStok = Number(parca.stock) || 0

      if (eskiStok < miktar) {
        throw new Error(`Stok yetersiz. Mevcut stok: ${eskiStok}`)
      }

      const yeniStok = eskiStok - miktar

      db.prepare(`
        UPDATE parts
        SET stock = ?
        WHERE id = ?
      `).run(yeniStok, partId)

      stokHareketiKaydet({
        partId,
        workOrderId,
        type: 'Çıkış',
        quantity: miktar,
        oldStock: eskiStok,
        newStock: yeniStok,
        masterId: activeMasterId,
        note: not
      })
    }

    if (
      eskiTip === 'Parça' &&
      yeniTip === 'Parça' &&
      eskiPartId &&
      yeniPartId &&
      eskiPartId === yeniPartId
    ) {
      const fark = yeniMiktar - eskiMiktar

      if (fark > 0) {
        stokCikisYap(
          yeniPartId,
          fark,
          'İş emri kalemi düzenlendi, miktar artırıldı'
        )
      } else if (fark < 0) {
        stokGirisYap(
          eskiPartId,
          Math.abs(fark),
          'İş emri kalemi düzenlendi, miktar azaltıldı'
        )
      }
    } else {
      if (eskiTip === 'Parça' && eskiPartId) {
        stokGirisYap(
          eskiPartId,
          eskiMiktar,
          'İş emri kalemi düzenlendi, eski parça stoka geri eklendi'
        )
      }

      if (yeniTip === 'Parça' && yeniPartId) {
        stokCikisYap(
          yeniPartId,
          yeniMiktar,
          'İş emri kalemi düzenlendi, yeni parça stoktan düşüldü'
        )
      }
    }

    let yeniBuyPrice = 0
    if (yeniTip === 'Parça') {
      if (yeniPartId === eskiPartId) {
        yeniBuyPrice = Number(eskiKalem.buy_price) || 0
      } else {
        const parca = db.prepare('SELECT buy_price FROM parts WHERE id = ?').get(yeniPartId) as any
        yeniBuyPrice = parca ? (Number(parca.buy_price) || 0) : 0
      }
    }

    db.prepare(`
      UPDATE work_order_items
      SET
        type = ?,
        part_id = ?,
        description = ?,
        quantity = ?,
        unit_price = ?,
        total_price = ?,
        buy_price = ?
      WHERE id = ?
    `).run(
      yeniTip,
      yeniPartId,
      yeniAciklama,
      yeniMiktar,
      yeniBirimFiyat,
      yeniToplam,
      yeniBuyPrice,
      kalemId
    )

    isEmriToplaminiGuncelle(workOrderId)

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri kalemi güncelleme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
// 17. İş emri kalemi sil
kanalEkle('is-emri-kalem-sil', (_event, itemId: any) => {
  const transaction = db.transaction(() => {
    const kalemId =
      typeof itemId === 'object' && itemId !== null
        ? Number(itemId.id)
        : Number(itemId)

    const activeMasterId =
      typeof itemId === 'object' &&
      itemId !== null &&
      itemId.active_master_id !== undefined &&
      itemId.active_master_id !== null &&
      itemId.active_master_id !== ''
        ? Number(itemId.active_master_id)
        : null

    const kalem = db.prepare(`
      SELECT *
      FROM work_order_items
      WHERE id = ?
    `).get(kalemId) as any

    if (!kalem) {
      throw new Error('Silinecek kalem bulunamadı.')
    }

    if (kalem.type === 'Parça' && kalem.part_id) {
      const partId = Number(kalem.part_id)
      const miktar = Number(kalem.quantity) || 0

      const parca = db.prepare(`
        SELECT *
        FROM parts
        WHERE id = ?
      `).get(partId) as any

      const eskiStok = Number(parca?.stock) || 0
      const yeniStok = eskiStok + miktar

      db.prepare(`
        UPDATE parts
        SET stock = ?
        WHERE id = ?
      `).run(yeniStok, partId)

      stokHareketiKaydet({
        partId,
        workOrderId: Number(kalem.work_order_id),
        type: 'Giriş',
        quantity: miktar,
        oldStock: eskiStok,
        newStock: yeniStok,
        masterId: activeMasterId,
        note: 'İş emri kalemi silindiği için stok geri eklendi'
      })
    }

    db.prepare(`
      DELETE FROM work_order_items
      WHERE id = ?
    `).run(kalemId)

    isEmriToplaminiGuncelle(Number(kalem.work_order_id))

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri kalemi silme hatası:', error)
    const err = error as Error
    return { success: false, error: err.message || String(error) }
  }
})


// İç kârlılık raporu getir
kanalEkle('karlilik-raporu-getir', () => {
  try {
    const rapor = db.prepare(`
      SELECT
        work_orders.id,
        work_orders.status,
        work_orders.created_at,
        work_orders.closed_at,
        work_orders.total_price,

        vehicles.plate,
        vehicles.brand,
        vehicles.model,

        customers.name AS customer_name,
        customers.phone AS customer_phone,

        opened_master.name AS opened_by_master_name,
        closed_master.name AS closed_by_master_name,

        COALESCE(SUM(CASE
          WHEN work_order_items.type = 'Parça'
          THEN work_order_items.total_price
          ELSE 0
        END), 0) AS parca_satis_toplami,

        COALESCE(SUM(CASE
          WHEN work_order_items.type = 'Parça'
          THEN work_order_items.quantity * IFNULL(work_order_items.buy_price, 0)
          ELSE 0
        END), 0) AS parca_maliyet_toplami,

        COALESCE(SUM(CASE
          WHEN work_order_items.type = 'İşçilik'
          THEN work_order_items.total_price
          ELSE 0
        END), 0) AS iscilik_geliri,

        COALESCE(SUM(work_order_items.total_price), 0) AS toplam_gelir,

        COALESCE(SUM(CASE
          WHEN work_order_items.type = 'Parça'
          THEN work_order_items.quantity * IFNULL(work_order_items.buy_price, 0)
          ELSE 0
        END), 0) AS toplam_maliyet

      FROM work_orders
      JOIN vehicles ON work_orders.vehicle_id = vehicles.id
      JOIN customers ON vehicles.customer_id = customers.id
      LEFT JOIN masters opened_master ON work_orders.opened_by_master_id = opened_master.id
      LEFT JOIN masters closed_master ON work_orders.closed_by_master_id = closed_master.id
      LEFT JOIN work_order_items ON work_order_items.work_order_id = work_orders.id
      LEFT JOIN parts ON work_order_items.part_id = parts.id

      GROUP BY work_orders.id
      ORDER BY work_orders.id DESC
    `).all() as any[]

    const veriler = rapor.map((satir) => {
      const toplamGelir = Number(satir.toplam_gelir || 0)
      const toplamMaliyet = Number(satir.toplam_maliyet || 0)
      const netKar = toplamGelir - toplamMaliyet
      const karOrani = toplamGelir > 0 ? (netKar / toplamGelir) * 100 : 0

      return {
        ...satir,
        parca_satis_toplami: Number(satir.parca_satis_toplami || 0),
        parca_maliyet_toplami: Number(satir.parca_maliyet_toplami || 0),
        iscilik_geliri: Number(satir.iscilik_geliri || 0),
        toplam_gelir: toplamGelir,
        toplam_maliyet: toplamMaliyet,
        net_kar: netKar,
        kar_orani: karOrani
      }
    })

    return {
      success: true,
      rapor: veriler
    }
  } catch (error) {
    console.error('Kârlılık raporu hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// 15. Ana panel istatistikleri
kanalEkle('istatistikleri-getir', () => {
  try {
const resMusteri = db.prepare(`
  SELECT
    (
      SELECT COUNT(*)
      FROM customers
      WHERE IFNULL(is_active, 1) = 1
    ) AS toplam,

    (
      SELECT COUNT(DISTINCT customers.id)
      FROM work_orders
      JOIN vehicles ON work_orders.vehicle_id = vehicles.id
      JOIN customers ON vehicles.customer_id = customers.id
      WHERE work_orders.status != 'Tamamlandı'
        AND IFNULL(vehicles.is_active, 1) = 1
        AND IFNULL(customers.is_active, 1) = 1
    ) AS aktif
`).get() as any

    const resArac = db.prepare(`
      SELECT
        COUNT(DISTINCT CASE WHEN status != 'Tamamlandı' THEN vehicle_id END) AS aktif,
        COUNT(CASE WHEN status = 'Tamamlandı' THEN 1 END) AS toplam
      FROM work_orders
    `).get() as any

    const resIsEmri = db.prepare(`
      SELECT
        COUNT(CASE WHEN status != 'Tamamlandı' THEN 1 END) AS acik,
        COUNT(CASE WHEN status = 'Tamamlandı' THEN 1 END) AS tamamlanan
      FROM work_orders
    `).get() as any

const resStok = db.prepare(`
  SELECT
    COUNT(*) AS aktif,
    COALESCE(SUM(CASE WHEN IFNULL(stock, 0) <= IFNULL(critical_stock, 5) THEN 1 ELSE 0 END), 0) AS dusuk,
    COALESCE(SUM(CASE WHEN IFNULL(stock, 0) <= 0 THEN 1 ELSE 0 END), 0) AS biten
  FROM parts
  WHERE IFNULL(is_active, 1) = 1
`).get() as any

    return {
      success: true,
      veriler: {
        // Eski alanlar bozulmasın diye duruyor
        musteriSayisi: Number(resMusteri?.aktif || 0),
        aracSayisi: Number(resArac?.aktif || 0),

        // Müşteri kartı
        musteriAktif: Number(resMusteri?.aktif || 0),
        musteriToplam: Number(resMusteri?.toplam || 0),

        // Araç kartı
        aracAktif: Number(resArac?.aktif || 0),
        aracToplam: Number(resArac?.toplam || 0),

        // İş emri kartı
        acikIsEmri: Number(resIsEmri?.acik || 0),
        tamamlananIsEmri: Number(resIsEmri?.tamamlanan || 0),

        // Stok kartı
toplamStok: Number(resStok?.aktif || 0),
dusukStok: Number(resStok?.dusuk || 0),
bitenStok: Number(resStok?.biten || 0)
      }
    }
  } catch (error) {
    console.error('Dashboard hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
  // 16. Müşteri servis geçmişi
  kanalEkle('musteri-gecmisi-getir', (_event, musteriId: any) => {
    try {
      const gecmis = db.prepare(`
SELECT 
  work_orders.*,
  vehicles.plate,
  vehicles.brand,
  vehicles.model,
  vehicles.chassis,
  opened_master.name AS opened_by_master_name,
  closed_master.name AS closed_by_master_name,
  COALESCE((
    SELECT SUM(amount)
    FROM work_order_payments
    WHERE work_order_id = work_orders.id AND IFNULL(is_cancelled, 0) = 0
  ), 0) AS toplam_tahsilat
FROM work_orders
JOIN vehicles ON work_orders.vehicle_id = vehicles.id
LEFT JOIN masters opened_master ON work_orders.opened_by_master_id = opened_master.id
LEFT JOIN masters closed_master ON work_orders.closed_by_master_id = closed_master.id
WHERE vehicles.customer_id = ?
ORDER BY work_orders.id DESC
      `).all(Number(musteriId))

      return { success: true, gecmis }
    } catch (error) {
      console.error('Müşteri geçmişi hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

// Müşteri / plaka servis geçmişi ara
kanalEkle('servis-gecmisi-ara', (_event, aramaMetni: any) => {
  try {
    const arama = String(aramaMetni || '').trim()

    // Turkish character and case insensitive normalization function
    const normalizeString = (str: string) => {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/İ/g, 'i')
        .replace(/I/g, 'ı')
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o');
    }

    const temizArama = normalizeString(arama)
    const temizAramaLike = `%${temizArama}%`
    const plakaTemizArama = `%${temizArama.replace(/\s+/g, '')}%`

    const kayitlar = db.prepare(`
      SELECT
        work_orders.*,
        vehicles.plate,
        vehicles.brand,
        vehicles.model,
        vehicles.chassis,
        vehicles.mileage AS vehicle_mileage,
        customers.id AS customer_id,
        customers.name AS customer_name,
        customers.phone AS customer_phone,
        opened_master.name AS opened_by_master_name,
        closed_master.name AS closed_by_master_name,
        COALESCE((
          SELECT SUM(amount)
          FROM work_order_payments
          WHERE work_order_id = work_orders.id AND IFNULL(is_cancelled, 0) = 0
        ), 0) AS toplam_tahsilat
      FROM work_orders
      JOIN vehicles ON work_orders.vehicle_id = vehicles.id
      JOIN customers ON vehicles.customer_id = customers.id
      LEFT JOIN masters opened_master ON work_orders.opened_by_master_id = opened_master.id
      LEFT JOIN masters closed_master ON work_orders.closed_by_master_id = closed_master.id
      WHERE
        ? = ''
        OR normalize_text(customers.name) LIKE ?
        OR normalize_text(customers.phone) LIKE ?
        OR normalize_text(REPLACE(vehicles.plate, ' ', '')) LIKE ?
        OR normalize_text(vehicles.brand) LIKE ?
        OR normalize_text(vehicles.model) LIKE ?
        OR normalize_text(work_orders.description) LIKE ?
        OR work_orders.id IN (
          SELECT DISTINCT work_order_id
          FROM work_order_items
          LEFT JOIN parts ON work_order_items.part_id = parts.id
          WHERE normalize_text(work_order_items.description) LIKE ?
             OR normalize_text(parts.name) LIKE ?
             OR normalize_text(parts.code) LIKE ?
        )
      ORDER BY work_orders.created_at DESC, work_orders.id DESC
    `).all(
      temizArama,
      temizAramaLike,
      temizAramaLike,
      plakaTemizArama,
      temizAramaLike,
      temizAramaLike,
      temizAramaLike,
      temizAramaLike,
      temizAramaLike,
      temizAramaLike
    ) as any[]

    const kalemleriGetir = db.prepare(`
      SELECT
        work_order_items.*,
        parts.code AS part_code,
        parts.name AS part_name
      FROM work_order_items
      LEFT JOIN parts ON work_order_items.part_id = parts.id
      WHERE work_order_items.work_order_id = ?
      ORDER BY work_order_items.id ASC
    `)

    const fotograflariGetir = db.prepare(`
      SELECT id, file_name, file_path, category, note, created_at
      FROM work_order_photos
      WHERE work_order_id = ?
      ORDER BY id DESC
    `)

    const gecmis = kayitlar.map((kayit) => {
      const photos = fotograflariGetir.all(Number(kayit.id)) as any[]
      const fotograflar = photos.map((p) => {
        let url = ''
        try {
          const fileData = fsSync.readFileSync(p.file_path)
          const ext = path.extname(p.file_path).toLowerCase().replace('.', '') || 'jpeg'
          const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
          url = `data:${mimeType};base64,${fileData.toString('base64')}`
        } catch (e) {
          console.warn('[Photos] Search foto okunamadı:', p.file_path, e)
        }
        return {
          id: p.id,
          file_name: p.file_name,
          category: p.category || 'Araç Kabul',
          note: p.note || '',
          created_at: p.created_at,
          url
        }
      })

      return {
        ...kayit,
        kalemler: kalemleriGetir.all(Number(kayit.id)),
        fotograflar
      }
    })

    return { success: true, gecmis }
  } catch (error) {
    console.error('Servis geçmişi arama hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

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

  // 45. İş Emri Fotoğraflarını Getir
  kanalEkle('is-emri-fotograflari-getir', async (_event, workOrderId: number) => {
    try {
      const woId = Number(workOrderId)
      if (!woId) return { success: false, error: 'İş emri ID geçersiz.' }

      const rows = db.prepare(`
        SELECT * FROM work_order_photos
        WHERE work_order_id = ?
        ORDER BY id DESC
      `).all(woId) as any[]

      const fotograflar: any[] = []
      for (const row of rows) {
        let url = ''
        try {
          const fileData = await fs.readFile(row.file_path)
          const ext = path.extname(row.file_path).toLowerCase().replace('.', '') || 'jpeg'
          const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
          url = `data:${mimeType};base64,${fileData.toString('base64')}`
        } catch (e) {
          console.warn('[Photos] Dosya okunamadı:', row.file_path, e)
        }

        fotograflar.push({
          id: row.id,
          work_order_id: row.work_order_id,
          file_name: row.file_name,
          category: row.category || 'Araç Kabul',
          note: row.note || '',
          created_at: row.created_at,
          url
        })
      }

      return { success: true, fotograflar }
    } catch (error) {
      console.error('Fotoğrafları getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 46. İş Emrine Fotoğraf Yükle (Dialog İle)
  kanalEkle('is-emri-fotograf-yukle-dialog', async (_event, veri: { work_order_id: number; category?: string; note?: string }) => {
    try {
      const woId = Number(veri?.work_order_id)
      if (!woId) return { success: false, error: 'İş emri seçilmedi.' }

      const result = await dialog.showOpenDialog({
        title: 'Fotoğraf Seçin (Araç Kabul / Hasar Tespiti)',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Resim Dosyaları', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
      })

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      const photoDir = path.join(app.getPath('userData'), 'fotograflar')
      await fs.mkdir(photoDir, { recursive: true })

      const category = String(veri?.category || 'Araç Kabul').trim()
      const note = String(veri?.note || '').trim()

      let addedCount = 0
      for (let i = 0; i < result.filePaths.length; i++) {
        const srcPath = result.filePaths[i]
        const targetFileName = `wo_${woId}_${Date.now()}_${i}.jpg`
        const targetPath = path.join(photoDir, targetFileName)

        try {
          const img = nativeImage.createFromPath(srcPath)
          const size = img.getSize()
          let resized = img
          const maxDim = 1280
          if (size.width > maxDim || size.height > maxDim) {
            if (size.width > size.height) {
              resized = img.resize({ width: maxDim, quality: 'better' })
            } else {
              resized = img.resize({ height: maxDim, quality: 'better' })
            }
          }
          const compressedBuffer = resized.toJPEG(75)
          await fs.writeFile(targetPath, compressedBuffer)
        } catch (e) {
          await fs.copyFile(srcPath, targetPath)
        }

        db.prepare(`
          INSERT INTO work_order_photos (work_order_id, file_name, file_path, category, note)
          VALUES (?, ?, ?, ?, ?)
        `).run(woId, targetFileName, targetPath, category, note)

        addedCount++
      }

      return { success: true, count: addedCount }
    } catch (error) {
      console.error('Fotoğraf yükleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 47. İş Emri Fotoğrafı Sil
  kanalEkle('is-emri-fotograf-sil', async (_event, photoId: number) => {
    try {
      const id = Number(photoId)
      if (!id) return { success: false, error: 'Fotoğraf ID geçersiz.' }

      const photo = db.prepare('SELECT * FROM work_order_photos WHERE id = ?').get(id) as any
      if (photo && photo.file_path) {
        try {
          await fs.unlink(photo.file_path)
        } catch (e) {
          console.warn('[Photos] Fiziksel dosya silinemedi veya zaten yok:', photo.file_path)
        }
      }

      db.prepare('DELETE FROM work_order_photos WHERE id = ?').run(id)
      return { success: true }
    } catch (error) {
      console.error('Fotoğraf silme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 48. Fotoğraf Notu / Kategorisi Güncelle
  kanalEkle('is-emri-fotograf-guncelle', (_event, veri: { id: number; category?: string; note?: string }) => {
    try {
      const id = Number(veri?.id)
      if (!id) return { success: false, error: 'Fotoğraf seçilmedi.' }

      db.prepare(`
        UPDATE work_order_photos
        SET category = ?, note = ?
        WHERE id = ?
      `).run(
        String(veri.category || 'Araç Kabul').trim(),
        String(veri.note || '').trim(),
        id
      )
      return { success: true }
    } catch (error) {
      console.error('Fotoğraf güncelleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
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