import {
  startPhoneServer,
  stopPhoneServer,
  isServerRunning,
  getCurrentPort,
  getLocalIPAddress,
  getLocalIPAddresses,
  generatePairingToken,
  getMobileSessionsList,
  revokeMobileSession,
  revokeAllMobileSessions
} from '../phoneServer.js'
import QRCode from 'qrcode'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerPhoneHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
  // 1. Telefon Erişimi - Başlat
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

  // 2. Telefon Erişimi - Durdur
  kanalEkle('telefon-erisimi-durdur', async () => {
    try {
      await stopPhoneServer()
      return { success: true }
    } catch (error) {
      console.error('[PhoneServer] Stop handler error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 3. Telefon Erişimi - Durum Getir
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

  // 4. Telefon Erişimi - QR Kod / Eşleşme Jeneratörü
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

  // 5. Telefon Erişimi - Aktif Cihaz/Oturum Listesi
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

  // 6. Telefon Erişimi - Cihaz Oturumu Kapat
  kanalEkle('telefon-oturum-kapat', (_event, token: string) => {
    try {
      return revokeMobileSession(token)
    } catch (error) {
      console.error('[PhoneServer] Revoke session error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 7. Telefon Erişimi - Tüm Oturumları Kapat
  kanalEkle('telefon-tum-oturumlari-kapat', () => {
    try {
      return revokeAllMobileSessions()
    } catch (error) {
      console.error('[PhoneServer] Revoke all error:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
