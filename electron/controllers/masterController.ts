import db, { dbPath } from '../database.js'
import { hashPin, verifyPin } from '../security.js'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerMasterHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
  // 1. Ustaları getir
  kanalEkle('ustalari-getir', () => {
    try {
      const ustalar = db.prepare(`
        SELECT id, name, is_active
        FROM masters
        WHERE IFNULL(is_active, 1) = 1
        ORDER BY id ASC
      `).all()

      return { success: true, ustalar, dbPath }
    } catch (error) {
      console.error('Ustaları getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 2. Usta PIN girişi
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
        SELECT id, name, pin, is_active
        FROM masters
        WHERE id = ?
          AND IFNULL(is_active, 1) = 1
        LIMIT 1
      `).get(masterId) as any

      if (!usta || !verifyPin(pin, usta.pin)) {
        throw new Error('Usta veya PIN hatalı.')
      }

      if (usta.pin === pin) {
        try {
          db.prepare("UPDATE masters SET pin = ? WHERE id = ?").run(hashPin(pin), usta.id)
        } catch (e) {}
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

  // 3. Usta PIN değiştir
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
        SELECT id, pin
        FROM masters
        WHERE id = ?
          AND IFNULL(is_active, 1) = 1
        LIMIT 1
      `).get(masterId) as any

      if (!usta || !verifyPin(eskiPin, usta.pin)) {
        throw new Error('Eski PIN hatalı.')
      }

      db.prepare(`
        UPDATE masters
        SET pin = ?
        WHERE id = ?
      `).run(hashPin(yeniPin), masterId)

      return { success: true }
    } catch (error) {
      console.error('PIN değiştirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
