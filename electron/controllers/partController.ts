import db from '../database.js'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function stokHareketiKaydet(veri: {
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

export function registerPartHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
  // 1. Parçaları getir
  kanalEkle('parcalari-getir', () => {
    return db.prepare(`
      SELECT *
      FROM parts
      WHERE IFNULL(is_active, 1) = 1
      ORDER BY id DESC
    `).all()
  })

  // 2. Parçaları filtreli getir
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
        kosullar.push('IFNULL(critical_stock_enabled, 1) = 1')
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
             AND IFNULL(critical_stock_enabled, 1) = 1
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

  // 3. Düşük stok parçalarını getir
  kanalEkle('dusuk-stok-parcalari-getir', (_event, limit: any = 5) => {
    const sinir = Number(limit) || 5

    return db.prepare(`
      SELECT *
      FROM parts
      WHERE IFNULL(is_active, 1) = 1
        AND (
          IFNULL(stock, 0) <= 0
          OR (IFNULL(critical_stock_enabled, 1) = 1 AND IFNULL(stock, 0) <= IFNULL(critical_stock, 5))
        )
      ORDER BY stock ASC, name ASC
      LIMIT ?
    `).all(sinir)
  })

  // 4. Parça ekle
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

      const criticalStockEnabled =
        parca.critical_stock_enabled !== undefined &&
        parca.critical_stock_enabled !== null
          ? (parca.critical_stock_enabled ? 1 : 0)
          : 0

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
            critical_stock_enabled = ?,
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
          criticalStockEnabled,
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
          critical_stock_enabled,
          note,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        criticalStockEnabled,
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

  // 5. Parça güncelle
  kanalEkle('parca-guncelle', (_event, parca: any) => {
    const transaction = db.transaction(() => {
      const partId = Number(parca.id)
      if (!partId) {
        throw new Error('Güncellenecek parça bulunamadı.')
      }

      const eskiParca = db.prepare(`
        SELECT *
        FROM parts
        WHERE id = ?
      `).get(partId) as any

      if (!eskiParca) {
        throw new Error('Güncellenecek parça bulunamadı.')
      }

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

      const criticalStockEnabled =
        parca.critical_stock_enabled !== undefined &&
        parca.critical_stock_enabled !== null
          ? (parca.critical_stock_enabled ? 1 : 0)
          : (eskiParca ? eskiParca.critical_stock_enabled : 0)

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
          critical_stock_enabled = ?,
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
        criticalStockEnabled,
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

  // 6. Parça sil (pasife al)
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

  // 7. Stok hareketlerini getir
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
}
