import { initDB, ayarlariGetirBackend } from './database.js'
import { app, BrowserWindow, ipcMain, Menu, type IpcMainInvokeEvent } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import log from 'electron-log/main'
import { autoUpdater } from 'electron-updater'
import { runPhoneServerMigrations } from './phoneServer.js'
import { isRestoreInProgress } from './restoreState.js'

// Tüm console.log/warn/error çağrılarını kalıcı log dosyasına da yazar
// (app.getPath('logs') altında dönen dosya; Ayarlar > Log Klasörünü Aç ile açılan klasörle aynı)
log.initialize()
log.transports.file.level = 'info'

import { registerCustomerHandlers } from './controllers/customerController.js'
import { registerPartHandlers } from './controllers/partController.js'
import { registerVehicleHandlers } from './controllers/vehicleController.js'
import { registerMasterHandlers } from './controllers/masterController.js'
import { registerAccountHandlers } from './controllers/accountController.js'
import { registerWorkOrderHandlers } from './controllers/workOrderController.js'
import { registerPhoneHandlers } from './controllers/phoneController.js'
import { registerSettingsHandlers } from './controllers/settingsController.js'
import {
  registerBackupHandlers,
  otomatikYedekZamanlayicisiniBaslat,
  otomatikYedekAlBackend
} from './controllers/backupController.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  ipcMain.handle(kanal, (event, ...args) => {
    if (isRestoreInProgress() && kanal !== 'yedekten-geri-yukle') {
      return { success: false, error: 'Veritabanı yedekten geri yükleniyor, lütfen bekleyin.' }
    }
    return fonksiyon(event, ...args)
  })
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

  // Tüm IPC controller kaydı
  registerMasterHandlers(kanalEkle)
  registerCustomerHandlers(kanalEkle)
  registerPartHandlers(kanalEkle)
  registerVehicleHandlers(kanalEkle)
  registerWorkOrderHandlers(kanalEkle)
  registerAccountHandlers(kanalEkle)
  registerPhoneHandlers(kanalEkle)
  registerSettingsHandlers(kanalEkle)
  registerBackupHandlers(kanalEkle, () => win)
}

let isQuitting = false

app.on('before-quit', (event) => {
  if (isQuitting) return

  try {
    const settingsRes = ayarlariGetirBackend()
    const settings = settingsRes?.settings || {}
    if (settings.backup_on_exit === 'true') {
      event.preventDefault()

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

app.on('window-all-closed', () => {
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

  if (app.isPackaged) {
    autoUpdater.logger = log
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('Otomatik güncelleme kontrolü hatası:', err)
    })
  }
})