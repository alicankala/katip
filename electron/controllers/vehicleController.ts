import db from '../database.js'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerVehicleHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
  // 1. Araçları getir
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

  // 2. Araç ekle
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

  // 3. Araç güncelle
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

  // 4. Araç sil (pasife al)
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
}
