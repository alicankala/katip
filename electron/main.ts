import db, { initDB, dbPath } from './database.js'
import { app, BrowserWindow, ipcMain, shell, dialog, Menu, type IpcMainInvokeEvent } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { promises as fs } from 'node:fs'

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
  title: 'Özgehan Otomotiv',
  width: 1440,
  height: 900,
  minWidth: 1180,
  minHeight: 720,
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
  const toplam = db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) AS toplam
    FROM work_order_items
    WHERE work_order_id = ?
  `).get(Number(workOrderId))

  db.prepare(`
    UPDATE work_orders
    SET total_price = ?
    WHERE id = ?
  `).run(Number(toplam?.toplam || 0), Number(workOrderId))
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
function yedekKlasoruYoluGetir(): string {
  return path.join(app.getPath('userData'), 'yedekler')
}
function stokHareketiKaydet(veri: {
  partId: number
  workOrderId?: number | null
  type: string
  quantity: number
  oldStock: number
  newStock: number
  masterId?: number | null
  note?: string
}): void {
  db.prepare(`
    INSERT INTO stock_movements (
      part_id,
      work_order_id,
      type,
      quantity,
      old_stock,
      new_stock,
      master_id,
      note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(veri.partId),
    veri.workOrderId ?? null,
    veri.type,
    Number(veri.quantity) || 0,
    Number(veri.oldStock) || 0,
    Number(veri.newStock) || 0,
    veri.masterId ?? null,
    String(veri.note || '').trim()
  )
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

    return { success: true }
  })

  kanalEkle('pencere-kapat', () => {
    win?.close()
    return { success: true }
  })

  // Ustaları getir
  kanalEkle('ustalari-getir', () => {
    try {
      const ustalar = db.prepare(`
        SELECT id, name, is_active
        FROM masters
        WHERE IFNULL(is_active, 1) = 1
        ORDER BY id ASC
      `).all()

      return { success: true, ustalar }
    } catch (error) {
      console.error('Ustaları getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // Usta PIN girişi
  kanalEkle('usta-giris-yap', (_event, giris: any) => {
    try {
      const masterId = Number(giris.master_id)
      const pin = String(giris.pin || '').trim()

      if (!masterId) {
        throw new Error('Lütfen usta seçin.')
      }

      if (!pin) {
        throw new Error('Lütfen PIN girin.')
      }

      const usta = db.prepare(`
        SELECT id, name, is_active
        FROM masters
        WHERE id = ?
          AND pin = ?
          AND IFNULL(is_active, 1) = 1
        LIMIT 1
      `).get(masterId, pin) as any

      if (!usta) {
        throw new Error('Usta veya PIN hatalı.')
      }

      return {
        success: true,
        usta: {
          id: Number(usta.id),
          name: usta.name
        }
      }
    } catch (error) {
      console.error('Usta giriş hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // Usta PIN değiştir
  kanalEkle('usta-pin-degistir', (_event, veri: any) => {
    try {
      const masterId = Number(veri.master_id)
      const eskiPin = String(veri.eski_pin || '').trim()
      const yeniPin = String(veri.yeni_pin || '').trim()

      if (!masterId) {
        throw new Error('Usta bilgisi bulunamadı.')
      }

      if (!/^\d{4}$/.test(eskiPin)) {
        throw new Error('Eski PIN 4 haneli olmalıdır.')
      }

      if (!/^\d{4}$/.test(yeniPin)) {
        throw new Error('Yeni PIN 4 haneli olmalıdır.')
      }

      const usta = db.prepare(`
        SELECT id
        FROM masters
        WHERE id = ?
          AND pin = ?
          AND IFNULL(is_active, 1) = 1
        LIMIT 1
      `).get(masterId, eskiPin) as any

      if (!usta) {
        throw new Error('Eski PIN hatalı.')
      }

      db.prepare(`
        UPDATE masters
        SET pin = ?
        WHERE id = ?
      `).run(yeniPin, masterId)

      return { success: true }
    } catch (error) {
      console.error('PIN değiştirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 1. Müşterileri getir
kanalEkle('musterileri-getir', () => {
  return db.prepare(`
    SELECT *
    FROM customers
    WHERE IFNULL(is_active, 1) = 1
    ORDER BY id DESC
  `).all()
})

// 2. Müşteri ekle
// 2. Müşteri ekle
kanalEkle('musteri-ekle', (_event, musteri: any) => {
  try {
    const name = String(musteri.name || '').trim()
    const phone = String(musteri.phone || '').trim()
    const note = String(musteri.note || '').trim()

    if (!name) {
      throw new Error('Müşteri adı boş bırakılamaz.')
    }

    if (phone) {
      const telefonKontrol = db.prepare(`
        SELECT *
        FROM customers
        WHERE phone = ?
        LIMIT 1
      `).get(phone) as any

      if (telefonKontrol) {
        if (Number(telefonKontrol.is_active ?? 1) === 0) {
          db.prepare(`
            UPDATE customers
            SET name = ?, phone = ?, note = ?, is_active = 1
            WHERE id = ?
          `).run(
            name,
            phone,
            note || telefonKontrol.note || '',
            Number(telefonKontrol.id)
          )

          return {
            success: true,
            id: telefonKontrol.id,
            restored: true
          }
        }

        throw new Error(`Bu telefon numarasıyla kayıtlı müşteri var: ${telefonKontrol.name}`)
      }
    } else {
      const isimKontrol = db.prepare(`
        SELECT *
        FROM customers
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
          AND IFNULL(phone, '') = ''
        LIMIT 1
      `).get(name) as any

      if (isimKontrol) {
        if (Number(isimKontrol.is_active ?? 1) === 0) {
          db.prepare(`
            UPDATE customers
            SET name = ?, phone = ?, note = ?, is_active = 1
            WHERE id = ?
          `).run(
            name,
            phone,
            note || isimKontrol.note || '',
            Number(isimKontrol.id)
          )

          return {
            success: true,
            id: isimKontrol.id,
            restored: true
          }
        }

        throw new Error('Bu isimle telefonsuz müşteri zaten kayıtlı.')
      }
    }

    const stmt = db.prepare(`
      INSERT INTO customers (name, phone, note, is_active)
      VALUES (?, ?, ?, ?)
    `)

    const info = stmt.run(name, phone, note, 1)

    return { success: true, id: info.lastInsertRowid }
  } catch (error) {
    console.error('Müşteri kayıt hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// 3. Müşteri sil
// Müşteri pasife al
kanalEkle('musteri-sil', (_event, id: number) => {
  try {
    const customerId = Number(id)

    if (!customerId) {
      throw new Error('Pasife alınacak müşteri bulunamadı.')
    }

    db.prepare(`
      UPDATE customers
      SET is_active = 0
      WHERE id = ?
    `).run(customerId)

    return { success: true }
  } catch (error) {
    console.error('Müşteri pasife alma hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
  // 4. Müşteri güncelle
  kanalEkle('musteri-guncelle', (_event, musteri: any) => {
    try {
      db.prepare(`
        UPDATE customers
        SET name = ?, phone = ?, note = ?
        WHERE id = ?
      `).run(
        String(musteri.name || '').trim(),
        String(musteri.phone || '').trim(),
        String(musteri.note || '').trim(),
        Number(musteri.id)
      )

      return { success: true }
    } catch (error) {
      console.error('Müşteri güncelleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 5. Parçaları getir
kanalEkle('parcalari-getir', () => {
  return db.prepare(`
    SELECT *
    FROM parts
    WHERE IFNULL(is_active, 1) = 1
    ORDER BY id DESC
  `).all()
})
// Parçaları filtreli getir
kanalEkle('parcalari-filtreli-getir', (_event, filtre: any = {}) => {
  try {
    const durum = String(filtre.durum || 'tum').trim()
    const marka = String(filtre.brand || '').trim()
    const kategori = String(filtre.category || '').trim()

    const kosullar: string[] = []
    const parametreler: any[] = []

    if (durum === 'pasif') {
      kosullar.push('IFNULL(is_active, 1) = 0')
    } else if (durum === 'hepsi') {
      // Aktif + pasif tamamı gelsin
    } else {
      kosullar.push('IFNULL(is_active, 1) = 1')
    }

    if (durum === 'kritik') {
      kosullar.push('IFNULL(stock, 0) > 0')
      kosullar.push('IFNULL(stock, 0) <= IFNULL(critical_stock, 5)')
    }

    if (durum === 'biten') {
      kosullar.push('IFNULL(stock, 0) <= 0')
    }

    if (marka) {
      kosullar.push('brand = ?')
      parametreler.push(marka)
    }

    if (kategori) {
      kosullar.push('category = ?')
      parametreler.push(kategori)
    }

    const whereSql = kosullar.length > 0
      ? `WHERE ${kosullar.join(' AND ')}`
      : ''

    const parcalar = db.prepare(`
      SELECT *
      FROM parts
      ${whereSql}
      ORDER BY
        IFNULL(is_active, 1) DESC,
        name ASC,
        id DESC
    `).all(...parametreler)

    const ozet = db.prepare(`
      SELECT
        COUNT(CASE WHEN IFNULL(is_active, 1) = 1 THEN 1 END) AS aktif,
        COUNT(CASE WHEN IFNULL(is_active, 1) = 0 THEN 1 END) AS pasif,
        COUNT(CASE
          WHEN IFNULL(is_active, 1) = 1
           AND IFNULL(stock, 0) > 0
           AND IFNULL(stock, 0) <= IFNULL(critical_stock, 5)
          THEN 1
        END) AS kritik,
        COUNT(CASE
          WHEN IFNULL(is_active, 1) = 1
           AND IFNULL(stock, 0) <= 0
          THEN 1
        END) AS biten,
        COUNT(*) AS hepsi
      FROM parts
    `).get() as any

    const markalar = db.prepare(`
      SELECT DISTINCT brand
      FROM parts
      WHERE IFNULL(is_active, 1) = 1
        AND IFNULL(TRIM(brand), '') != ''
      ORDER BY brand ASC
    `).all()

    const kategoriler = db.prepare(`
      SELECT DISTINCT category
      FROM parts
      WHERE IFNULL(is_active, 1) = 1
        AND IFNULL(TRIM(category), '') != ''
      ORDER BY category ASC
    `).all()

    return {
      success: true,
      parcalar,
      ozet: {
        aktif: Number(ozet?.aktif || 0),
        pasif: Number(ozet?.pasif || 0),
        kritik: Number(ozet?.kritik || 0),
        biten: Number(ozet?.biten || 0),
        hepsi: Number(ozet?.hepsi || 0)
      },
      markalar: markalar.map((satir: any) => satir.brand),
      kategoriler: kategoriler.map((satir: any) => satir.category)
    }
  } catch (error) {
    console.error('Filtreli parça getirme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
// Düşük stok parçalarını getir
kanalEkle('dusuk-stok-parcalari-getir', (_event, limit: any = 5) => {
  const sinir = Number(limit) || 5

  return db.prepare(`
    SELECT *
    FROM parts
    WHERE IFNULL(is_active, 1) = 1
      AND IFNULL(stock, 0) <= IFNULL(critical_stock, 5)
    ORDER BY stock ASC, name ASC
    LIMIT ?
  `).all(sinir)
})
// 6. Parça ekle
kanalEkle('parca-ekle', (_event, parca: any) => {
  const transaction = db.transaction(() => {
    const code = String(parca.code || '').trim().toUpperCase()
    const name = String(parca.name || '').trim()
    const brand = String(parca.brand || '').trim()
    const category = String(parca.category || '').trim()
    const oemCode = String(parca.oem_code || '').trim().toUpperCase()
    const stock = Number(parca.stock) || 0
    const unit = String(parca.unit || 'Adet').trim() || 'Adet'
    const buyPrice = Number(parca.buy_price) || 0
    const sellPrice = Number(parca.sell_price) || 0
    const shelf = String(parca.shelf || '').trim()
    const note = String(parca.note || '').trim()
    const criticalStock =
      parca.critical_stock !== undefined &&
      parca.critical_stock !== null &&
      parca.critical_stock !== ''
        ? Number(parca.critical_stock)
        : 5

    const activeMasterId =
      parca.active_master_id !== undefined &&
      parca.active_master_id !== null &&
      parca.active_master_id !== ''
        ? Number(parca.active_master_id)
        : null

    if (!code) {
      throw new Error('Parça kodu boş bırakılamaz.')
    }

    if (!name) {
      throw new Error('Parça adı boş bırakılamaz.')
    }

    if (stock < 0) {
      throw new Error('Stok miktarı negatif olamaz.')
    }

    if (criticalStock < 0) {
      throw new Error('Kritik stok limiti negatif olamaz.')
    }

    const mevcutParca = db.prepare(`
      SELECT *
      FROM parts
      WHERE UPPER(TRIM(code)) = ?
      LIMIT 1
    `).get(code) as any

    if (mevcutParca) {
      const eskiStok = Number(mevcutParca.stock) || 0
      const yeniStok = eskiStok + stock

      db.prepare(`
        UPDATE parts
        SET
          name = ?,
          brand = ?,
          category = ?,
          oem_code = ?,
          stock = ?,
          unit = ?,
          buy_price = ?,
          sell_price = ?,
          shelf = ?,
          critical_stock = ?,
          note = ?,
          is_active = 1
        WHERE id = ?
      `).run(
        name,
        brand,
        category,
        oemCode,
        yeniStok,
        unit,
        buyPrice,
        sellPrice,
        shelf,
        criticalStock,
        note,
        Number(mevcutParca.id)
      )

      if (stock > 0) {
stokHareketiKaydet({
  partId: Number(mevcutParca.id),
  workOrderId: null,
  type: 'Giriş',
  quantity: stock,
  oldStock: eskiStok,
  newStock: yeniStok,
  masterId: activeMasterId,
  note: `Mevcut parçaya stok girişi yapıldı (${eskiStok} -> ${yeniStok})`
})
      }

      return {
        success: true,
        id: mevcutParca.id,
        updatedExisting: true,
        oldStock: eskiStok,
        newStock: yeniStok
      }
    }

    const stmt = db.prepare(`
      INSERT INTO parts (
        code,
        name,
        brand,
        category,
        oem_code,
        stock,
        unit,
        buy_price,
        sell_price,
        shelf,
        critical_stock,
        note,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const info = stmt.run(
      code,
      name,
      brand,
      category,
      oemCode,
      stock,
      unit,
      buyPrice,
      sellPrice,
      shelf,
      criticalStock,
      note,
      1
    )

    const partId = Number(info.lastInsertRowid)

    if (stock > 0) {
stokHareketiKaydet({
  partId,
  workOrderId: null,
  type: 'Giriş',
  quantity: stock,
  oldStock: 0,
  newStock: stock,
  masterId: activeMasterId,
  note: 'Parça ilk kayıt başlangıç stoku'
})
    }

    return { success: true, id: info.lastInsertRowid }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('Parça kayıt hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
// Parça güncelle
kanalEkle('parca-guncelle', (_event, parca: any) => {
  const transaction = db.transaction(() => {
    const partId = Number(parca.id)
    const code = String(parca.code || '').trim().toUpperCase()
    const name = String(parca.name || '').trim()
    const brand = String(parca.brand || '').trim()
    const category = String(parca.category || '').trim()
    const oemCode = String(parca.oem_code || '').trim().toUpperCase()
    const yeniStok = Number(parca.stock) || 0
    const unit = String(parca.unit || 'Adet').trim() || 'Adet'
    const buyPrice = Number(parca.buy_price) || 0
    const sellPrice = Number(parca.sell_price) || 0
    const shelf = String(parca.shelf || '').trim()
    const note = String(parca.note || '').trim()
    const criticalStock =
      parca.critical_stock !== undefined &&
      parca.critical_stock !== null &&
      parca.critical_stock !== ''
        ? Number(parca.critical_stock)
        : 5

    const activeMasterId =
      parca.active_master_id !== undefined &&
      parca.active_master_id !== null &&
      parca.active_master_id !== ''
        ? Number(parca.active_master_id)
        : null

    if (!partId) {
      throw new Error('Güncellenecek parça bulunamadı.')
    }

    if (!code) {
      throw new Error('Parça kodu boş bırakılamaz.')
    }

    if (!name) {
      throw new Error('Parça adı boş bırakılamaz.')
    }

    if (yeniStok < 0) {
      throw new Error('Stok miktarı negatif olamaz.')
    }

    if (criticalStock < 0) {
      throw new Error('Kritik stok limiti negatif olamaz.')
    }

    const kodKontrol = db.prepare(`
      SELECT *
      FROM parts
      WHERE UPPER(TRIM(code)) = ?
        AND id != ?
      LIMIT 1
    `).get(code, partId) as any

    if (kodKontrol) {
      throw new Error(`Bu parça kodu başka bir parçada kayıtlı: ${kodKontrol.code} - ${kodKontrol.name}`)
    }

    const eskiParca = db.prepare(`
      SELECT *
      FROM parts
      WHERE id = ?
    `).get(partId) as any

    if (!eskiParca) {
      throw new Error('Güncellenecek parça bulunamadı.')
    }

    const eskiStok = Number(eskiParca.stock) || 0
    const stokFarki = yeniStok - eskiStok

    db.prepare(`
      UPDATE parts
      SET
        code = ?,
        name = ?,
        brand = ?,
        category = ?,
        oem_code = ?,
        stock = ?,
        unit = ?,
        buy_price = ?,
        sell_price = ?,
        shelf = ?,
        critical_stock = ?,
        note = ?
      WHERE id = ?
    `).run(
      code,
      name,
      brand,
      category,
      oemCode,
      yeniStok,
      unit,
      buyPrice,
      sellPrice,
      shelf,
      criticalStock,
      note,
      partId
    )

    if (stokFarki !== 0) {
stokHareketiKaydet({
  partId,
  workOrderId: null,
  type: stokFarki > 0 ? 'Giriş' : 'Çıkış',
  quantity: Math.abs(stokFarki),
  oldStock: eskiStok,
  newStock: yeniStok,
  masterId: activeMasterId,
  note: `Manuel stok düzeltme (${eskiStok} -> ${yeniStok})`
})
    }

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('Parça güncelleme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
// 7. Parça sil
// Parça pasife al
kanalEkle('parca-sil', (_event, id: number) => {
  try {
    const partId = Number(id)

    if (!partId) {
      throw new Error('Pasife alınacak parça bulunamadı.')
    }

    db.prepare(`
      UPDATE parts
      SET is_active = 0
      WHERE id = ?
    `).run(partId)

    return { success: true }
  } catch (error) {
    console.error('Parça pasife alma hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

  // 8. Araçları getir
kanalEkle('araclari-getir', () => {
  return db.prepare(`
    SELECT
      vehicles.*,
      customers.name AS customer_name,
      customers.phone AS customer_phone
    FROM vehicles
    LEFT JOIN customers ON vehicles.customer_id = customers.id
    WHERE IFNULL(vehicles.is_active, 1) = 1
      AND IFNULL(customers.is_active, 1) = 1
    ORDER BY vehicles.id DESC
  `).all()
})
// Araç ekle
kanalEkle('arac-ekle', (_event, arac: any) => {
  try {
    const customerId = Number(arac.customer_id)
    const plate = String(arac.plate || '').trim().toUpperCase().replace(/\s+/g, '')
    const brand = String(arac.brand || '').trim()
    const model = String(arac.model || '').trim()
    const year = arac.year !== undefined && arac.year !== null && arac.year !== ''
      ? Number(arac.year)
      : null
    const mileage = arac.mileage !== undefined && arac.mileage !== null && arac.mileage !== ''
      ? Number(arac.mileage)
      : null
    const chassis = String(arac.chassis || '').trim()

    if (!customerId) {
      throw new Error('Araç için müşteri seçilmelidir.')
    }

    if (!plate) {
      throw new Error('Plaka boş bırakılamaz.')
    }

    const plakaKontrol = db.prepare(`
      SELECT 
        vehicles.*,
        customers.name AS customer_name
      FROM vehicles
      LEFT JOIN customers ON vehicles.customer_id = customers.id
      WHERE REPLACE(UPPER(TRIM(vehicles.plate)), ' ', '') = ?
      LIMIT 1
    `).get(plate) as any

    if (plakaKontrol) {
      throw new Error(
        `Bu plaka zaten kayıtlı: ${plakaKontrol.plate} - ${plakaKontrol.customer_name || 'Müşteri bilinmiyor'}`
      )
    }

    const stmt = db.prepare(`
      INSERT INTO vehicles (customer_id, plate, brand, model, year, mileage, chassis)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const info = stmt.run(
      customerId,
      plate,
      brand,
      model,
      year,
      mileage,
      chassis
    )

    return { success: true, id: info.lastInsertRowid }
  } catch (error) {
    console.error('Araç kayıt hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
// Araç güncelle
kanalEkle('arac-guncelle', (_event, arac: any) => {
  try {
    const vehicleId = Number(arac.id)
    const customerId = Number(arac.customer_id)
    const plate = String(arac.plate || '').trim().toUpperCase().replace(/\s+/g, '')
    const brand = String(arac.brand || '').trim()
    const model = String(arac.model || '').trim()
    const year = arac.year !== undefined && arac.year !== null && arac.year !== ''
      ? Number(arac.year)
      : null
    const mileage = arac.mileage !== undefined && arac.mileage !== null && arac.mileage !== ''
      ? Number(arac.mileage)
      : null
    const chassis = String(arac.chassis || '').trim()

    if (!vehicleId) {
      throw new Error('Güncellenecek araç bulunamadı.')
    }

    if (!customerId) {
      throw new Error('Araç için müşteri seçilmelidir.')
    }

    if (!plate) {
      throw new Error('Plaka boş bırakılamaz.')
    }

    const plakaKontrol = db.prepare(`
      SELECT 
        vehicles.*,
        customers.name AS customer_name
      FROM vehicles
      LEFT JOIN customers ON vehicles.customer_id = customers.id
      WHERE REPLACE(UPPER(TRIM(vehicles.plate)), ' ', '') = ?
        AND vehicles.id != ?
      LIMIT 1
    `).get(plate, vehicleId) as any

    if (plakaKontrol) {
      throw new Error(
        `Bu plaka başka bir araçta kayıtlı: ${plakaKontrol.plate} - ${plakaKontrol.customer_name || 'Müşteri bilinmiyor'}`
      )
    }

    db.prepare(`
      UPDATE vehicles
      SET customer_id = ?, plate = ?, brand = ?, model = ?, year = ?, mileage = ?, chassis = ?
      WHERE id = ?
    `).run(
      customerId,
      plate,
      brand,
      model,
      year,
      mileage,
      chassis,
      vehicleId
    )

    return { success: true }
  } catch (error) {
    console.error('Araç güncelleme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
// 10. Araç sil
// Araç pasife al
kanalEkle('arac-sil', (_event, id: number) => {
  try {
    const vehicleId = Number(id)

    if (!vehicleId) {
      throw new Error('Pasife alınacak araç bulunamadı.')
    }

    db.prepare(`
      UPDATE vehicles
      SET is_active = 0
      WHERE id = ?
    `).run(vehicleId)

    return { success: true }
  } catch (error) {
    console.error('Araç pasife alma hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
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
      closed_master.name AS closed_by_master_name
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
    const workOrderId = Number(id)

    const isEmri = db.prepare(`
      SELECT *
      FROM work_orders
      WHERE id = ?
    `).get(workOrderId)

    if (!isEmri) {
      throw new Error('Silinecek iş emri bulunamadı.')
    }

    const kalemler = db.prepare(`
      SELECT *
      FROM work_order_items
      WHERE work_order_id = ?
    `).all(workOrderId)

    for (const kalem of kalemler) {
      if (kalem.type === 'Parça' && kalem.part_id) {
        db.prepare(`
          UPDATE parts
          SET stock = stock + ?
          WHERE id = ?
        `).run(
          Number(kalem.quantity) || 0,
          Number(kalem.part_id)
        )

        db.prepare(`
          INSERT INTO stock_movements (part_id, work_order_id, type, quantity, note)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          Number(kalem.part_id),
          workOrderId,
          'Giriş',
          Number(kalem.quantity) || 0,
          'İş emri silindiği için stok geri eklendi'
        )
      }
    }
db.prepare(`
  UPDATE stock_movements
  SET work_order_id = NULL
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

    return { success: true }
  })

  try {
    return transaction()
  } catch (error) {
    console.error('İş emri silme hatası:', error)
    const err = error as Error
    return { success: false, error: err.message || String(error) }
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

// 15. İş emri kalemlerini getir
kanalEkle('is-emri-kalemleri-getir', (_event, workOrderId: any) => {
  try {
    const kalemler = db.prepare(`
SELECT 
  work_order_items.*,
  parts.code AS part_code,
  parts.name AS part_name,
  parts.buy_price AS part_buy_price,
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

    if (!workOrderId) {
      throw new Error('İş emri seçilmedi.')
    }

    if (!type) {
      throw new Error('Kalem tipi seçilmedi.')
    }

    if (type === 'Parça') {
      if (!partId) {
        throw new Error('Parça seçilmedi.')
      }

      const parca = db.prepare('SELECT * FROM parts WHERE id = ?').get(partId)

      if (!parca) {
        throw new Error('Seçilen parça bulunamadı.')
      }

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
      (work_order_id, type, part_id, description, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      workOrderId,
      type,
      partId,
      aciklama,
      quantity,
      unitPrice,
      totalPrice
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

    if (yeniTip === 'Parça' && !yeniPartId) {
      throw new Error('Parça seçilmelidir.')
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

    db.prepare(`
      UPDATE work_order_items
      SET
        type = ?,
        part_id = ?,
        description = ?,
        quantity = ?,
        unit_price = ?,
        total_price = ?
      WHERE id = ?
    `).run(
      yeniTip,
      yeniPartId,
      yeniAciklama,
      yeniMiktar,
      yeniBirimFiyat,
      yeniToplam,
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
// Stok hareketlerini getir
kanalEkle('stok-hareketleri-getir', (_event, partId: any) => {
  try {
    const hareketler = db.prepare(`
      SELECT 
        stock_movements.*,
        parts.code AS part_code,
        parts.name AS part_name,
        work_orders.id AS work_order_no,
        vehicles.plate AS vehicle_plate,
        customers.name AS customer_name,
masters.name AS master_name
      FROM stock_movements
      JOIN parts ON stock_movements.part_id = parts.id
      LEFT JOIN work_orders ON stock_movements.work_order_id = work_orders.id
      LEFT JOIN vehicles ON work_orders.vehicle_id = vehicles.id
      LEFT JOIN customers ON vehicles.customer_id = customers.id
      LEFT JOIN masters ON stock_movements.master_id = masters.id
      WHERE stock_movements.part_id = ?
      ORDER BY stock_movements.id DESC
    `).all(Number(partId))

    return { success: true, hareketler }
  } catch (error) {
    console.error('Stok hareketleri getirme hatası:', error)
    return { success: false, error: getErrorMessage(error) }
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
          THEN work_order_items.quantity * IFNULL(parts.buy_price, 0)
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
          THEN work_order_items.quantity * IFNULL(parts.buy_price, 0)
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
  closed_master.name AS closed_by_master_name
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
    const aramaLike = `%${arama}%`
    const plakaArama = `%${arama.toUpperCase().replace(/\s+/g, '')}%`

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
  closed_master.name AS closed_by_master_name
FROM work_orders
JOIN vehicles ON work_orders.vehicle_id = vehicles.id
JOIN customers ON vehicles.customer_id = customers.id
LEFT JOIN masters opened_master ON work_orders.opened_by_master_id = opened_master.id
LEFT JOIN masters closed_master ON work_orders.closed_by_master_id = closed_master.id
      WHERE
        ? = ''
        OR customers.name LIKE ?
        OR customers.phone LIKE ?
        OR REPLACE(UPPER(TRIM(vehicles.plate)), ' ', '') LIKE ?
      ORDER BY work_orders.created_at DESC, work_orders.id DESC
    `).all(
      arama,
      aramaLike,
      aramaLike,
      plakaArama
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

    const gecmis = kayitlar.map((kayit) => {
      return {
        ...kayit,
        kalemler: kalemleriGetir.all(Number(kayit.id))
      }
    })

    return { success: true, gecmis }
  } catch (error) {
    console.error('Servis geçmişi arama hatası:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

  // 17. Veritabanı yedekle
  kanalEkle('veritabani-yedekle', async () => {
    try {
      console.log('[Yedekleme] Islem basladi...')

      const backupDir = yedekKlasoruYoluGetir()
      console.log('[Yedekleme] Yedek klasoru yolu:', backupDir)

      await fs.mkdir(backupDir, { recursive: true })
      console.log('[Yedekleme] Klasor hazir')

      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const date = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const seconds = String(now.getSeconds()).padStart(2, '0')

      const timeStamp = `${year}-${month}-${date}-${hours}${minutes}${seconds}`
      const backupFileName = `otoservis-yedek-${timeStamp}.db`
      const backupPath = path.join(backupDir, backupFileName)

      console.log('[Yedekleme] Yedek dosya adi:', backupFileName)
      console.log('[Yedekleme] Yedek dosya tam yolu:', backupPath)

      console.log('[Yedekleme] db.backup() cagriliyor...')
      await db.backup(backupPath)
      console.log('[Yedekleme] db.backup() basarili')

      const kontrol = await fs.stat(backupPath)

      console.log('[Yedekleme] Dosya dogrulandi:', {
        path: backupPath,
        size: kontrol.size
      })

      return {
        success: true,
        path: backupPath,
        size: kontrol.size
      }
    } catch (error) {
      console.error('[Yedekleme] Hata olustu:', error)
      return { success: false, error: getErrorMessage(error) }
    }
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
  kanalEkle('yedekten-geri-yukle', async () => {
    try {
      if (!win) {
        throw new Error('Uygulama penceresi bulunamadı.')
      }

      const backupDir = yedekKlasoruYoluGetir()
      await fs.mkdir(backupDir, { recursive: true })

      const secim = await dialog.showOpenDialog(win, {
        title: 'Yedek Veritabanı Seç',
        defaultPath: backupDir,
        properties: ['openFile'],
        filters: [
          { name: 'SQLite Veritabanı', extensions: ['db'] },
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

      const secilenYedek = secim.filePaths[0]

      if (!secilenYedek.toLowerCase().endsWith('.db')) {
        throw new Error('Lütfen .db uzantılı bir yedek dosyası seçin.')
      }

      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const date = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const seconds = String(now.getSeconds()).padStart(2, '0')
      const timeStamp = `${year}-${month}-${date}-${hours}${minutes}${seconds}`

      const mevcutDbYedekPath = path.join(
        backupDir,
        `geri-yukleme-oncesi-yedek-${timeStamp}.db`
      )

      console.log('[Geri Yukleme] Secilen yedek:', secilenYedek)
      console.log('[Geri Yukleme] Mevcut veritabani:', dbPath)
      console.log('[Geri Yukleme] Onceki veritabani yedegi:', mevcutDbYedekPath)

      await db.backup(mevcutDbYedekPath)

      db.close()

      await fs.copyFile(secilenYedek, dbPath)

console.log('[Geri Yukleme] Yedek geri yuklendi. Uygulama kapatilacak...')

setTimeout(() => {
  app.quit()
}, 1200)

return {
  success: true,
  restoredFrom: secilenYedek,
  previousBackup: mevcutDbYedekPath,
  restartRequired: true
}
    } catch (error) {
      console.error('Yedekten geri yukleme hatasi:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
    // 20. Veritabanı bilgilerini getir
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

  // 21. Cari Hesaplar - Getir
  kanalEkle('cari-hesaplari-getir', () => {
    try {
      const accounts = db.prepare(`
        SELECT
          ca.*,
          COALESCE((SELECT SUM(amount) FROM account_transactions WHERE current_account_id = ca.id), 0) AS total_debt,
          COALESCE((SELECT SUM(amount) FROM account_payments WHERE current_account_id = ca.id), 0) AS total_paid,
          (COALESCE((SELECT SUM(amount) FROM account_transactions WHERE current_account_id = ca.id), 0) -
           COALESCE((SELECT SUM(amount) FROM account_payments WHERE current_account_id = ca.id), 0)) AS remaining_debt
        FROM current_accounts ca
        WHERE IFNULL(ca.is_active, 1) = 1
        ORDER BY ca.name ASC
      `).all()
      return { success: true, accounts }
    } catch (error) {
      console.error('Cari hesapları getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 22. Cari Hesap - Ekle
  kanalEkle('cari-hesap-ekle', (_event, hesap: any) => {
    try {
      const name = String(hesap.name || '').trim()
      const type = String(hesap.type || '').trim()
      const phone = String(hesap.phone || '').trim()
      const note = String(hesap.note || '').trim()

      if (!name) {
        throw new Error('Cari hesap adı boş bırakılamaz.')
      }
      if (!type) {
        throw new Error('Cari hesap tipi seçilmelidir.')
      }

      const stmt = db.prepare(`
        INSERT INTO current_accounts (name, type, phone, note, is_active)
        VALUES (?, ?, ?, ?, 1)
      `)
      const info = stmt.run(name, type, phone, note)
      return { success: true, id: info.lastInsertRowid }
    } catch (error) {
      console.error('Cari hesap ekleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 23. Cari Hesap - Güncelle
  kanalEkle('cari-hesap-guncelle', (_event, hesap: any) => {
    try {
      const id = Number(hesap.id)
      const name = String(hesap.name || '').trim()
      const type = String(hesap.type || '').trim()
      const phone = String(hesap.phone || '').trim()
      const note = String(hesap.note || '').trim()

      if (!id) {
        throw new Error('Güncellenecek cari hesap bulunamadı.')
      }
      if (!name) {
        throw new Error('Cari hesap adı boş bırakılamaz.')
      }
      if (!type) {
        throw new Error('Cari hesap tipi seçilmelidir.')
      }

      db.prepare(`
        UPDATE current_accounts
        SET name = ?, type = ?, phone = ?, note = ?
        WHERE id = ?
      `).run(name, type, phone, note, id)
      return { success: true }
    } catch (error) {
      console.error('Cari hesap güncelleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 24. Cari Hesap - Sil (Pasife Al)
  kanalEkle('cari-hesap-sil', (_event, id: number) => {
    try {
      const accountId = Number(id)
      if (!accountId) {
        throw new Error('Silinecek cari hesap bulunamadı.')
      }

      db.prepare(`
        UPDATE current_accounts
        SET is_active = 0
        WHERE id = ?
      `).run(accountId)
      return { success: true }
    } catch (error) {
      console.error('Cari hesap silme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 25. Cari İşlemleri Getir
  kanalEkle('cari-islemleri-getir', (_event, currentAccountId: number) => {
    try {
      const accountId = Number(currentAccountId)
      if (!accountId) {
        throw new Error('Cari hesap bilgisi geçersiz.')
      }

      const transactions = db.prepare(`
        SELECT
          t.*,
          v.plate AS vehicle_plate,
          v.brand AS vehicle_brand,
          v.model AS vehicle_model
        FROM account_transactions t
        LEFT JOIN vehicles v ON t.vehicle_id = v.id
        WHERE t.current_account_id = ?
        ORDER BY t.date DESC, t.id DESC
      `).all(accountId)
      return { success: true, transactions }
    } catch (error) {
      console.error('Cari işlemleri getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 26. Cari İşlem Ekle
  kanalEkle('cari-islem-ekle', (_event, islem: any) => {
    try {
      const current_account_id = Number(islem.current_account_id)
      const date = String(islem.date || '').trim()
      const transaction_type = String(islem.transaction_type || '').trim()
      const description = String(islem.description || '').trim()
      const amount = Number(islem.amount) || 0
      const vehicle_id = islem.vehicle_id ? Number(islem.vehicle_id) : null
      const work_order_id = islem.work_order_id ? Number(islem.work_order_id) : null
      const note = String(islem.note || '').trim()

      if (!current_account_id) {
        throw new Error('İşlem için cari hesap seçilmelidir.')
      }
      if (!date) {
        throw new Error('Tarih alanı boş bırakılamaz.')
      }
      if (!transaction_type) {
        throw new Error('İşlem tipi seçilmelidir.')
      }
      if (amount <= 0) {
        throw new Error('İşlem tutarı sıfırdan büyük olmalıdır.')
      }

      const stmt = db.prepare(`
        INSERT INTO account_transactions (
          current_account_id, date, transaction_type, description, amount, vehicle_id, work_order_id, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(current_account_id, date, transaction_type, description, amount, vehicle_id, work_order_id, note)
      return { success: true, id: info.lastInsertRowid }
    } catch (error) {
      console.error('Cari işlem ekleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 27. Cari İşlem Sil
  kanalEkle('cari-islem-sil', (_event, id: number) => {
    try {
      const transactionId = Number(id)
      if (!transactionId) {
        throw new Error('Silinecek işlem bulunamadı.')
      }

      db.prepare(`
        DELETE FROM account_transactions
        WHERE id = ?
      `).run(transactionId)
      return { success: true }
    } catch (error) {
      console.error('Cari işlem silme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 28. Cari Ödemeleri Getir
  kanalEkle('cari-odemeleri-getir', (_event, currentAccountId: number) => {
    try {
      const accountId = Number(currentAccountId)
      if (!accountId) {
        throw new Error('Cari hesap bilgisi geçersiz.')
      }

      const payments = db.prepare(`
        SELECT
          p.*,
          t.description AS transaction_description
        FROM account_payments p
        LEFT JOIN account_transactions t ON p.transaction_id = t.id
        WHERE p.current_account_id = ?
        ORDER BY p.date DESC, p.id DESC
      `).all(accountId)
      return { success: true, payments }
    } catch (error) {
      console.error('Cari ödemeleri getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 29. Cari Ödeme Ekle
  kanalEkle('cari-odeme-ekle', (_event, odeme: any) => {
    try {
      const current_account_id = Number(odeme.current_account_id)
      const transaction_id = odeme.transaction_id ? Number(odeme.transaction_id) : null
      const date = String(odeme.date || '').trim()
      const amount = Number(odeme.amount) || 0
      const payment_method = String(odeme.payment_method || '').trim()
      const description = String(odeme.description || '').trim()

      if (!current_account_id) {
        throw new Error('Ödeme için cari hesap seçilmelidir.')
      }
      if (!date) {
        throw new Error('Tarih alanı boş bırakılamaz.')
      }
      if (amount <= 0) {
        throw new Error('Ödeme tutarı sıfırdan büyük olmalıdır.')
      }
      if (!payment_method) {
        throw new Error('Ödeme yöntemi seçilmelidir.')
      }

      const stmt = db.prepare(`
        INSERT INTO account_payments (
          current_account_id, transaction_id, date, amount, payment_method, description
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(current_account_id, transaction_id, date, amount, payment_method, description)
      return { success: true, id: info.lastInsertRowid }
    } catch (error) {
      console.error('Cari ödeme ekleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 30. Cari Ödeme Sil
  kanalEkle('cari-odeme-sil', (_event, id: number) => {
    try {
      const paymentId = Number(id)
      if (!paymentId) {
        throw new Error('Silinecek ödeme kaydı bulunamadı.')
      }

      db.prepare(`
        DELETE FROM account_payments
        WHERE id = ?
      `).run(paymentId)
      return { success: true }
    } catch (error) {
      console.error('Cari ödeme silme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
}

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

app.whenReady().then(() => {
  initDB()
  ipcKopruleriniKur()
  Menu.setApplicationMenu(null)
  createWindow()
})