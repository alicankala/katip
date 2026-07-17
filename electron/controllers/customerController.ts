import db from '../database.js'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerCustomerHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
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

  // 3. Müşteri sil (Müşteri pasife al)
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
}
