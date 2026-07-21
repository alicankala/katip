import crypto from 'node:crypto'

// Eski sabit salt: geriye dönük uyumluluk için hâlâ doğrulamada deneniyor,
// yeni hash üretiminde artık kullanılmıyor (bkz. setActiveSalt / ensureSecuritySalt).
const LEGACY_SALT = 'OtoServis2026_Salt_#9982'

let activeSalt: string = LEGACY_SALT

export function setActiveSalt(salt: string): void {
  if (salt && typeof salt === 'string' && salt.length >= 16) {
    activeSalt = salt
  }
}

function hashWithSalt(pin: string, salt: string): string {
  return crypto.createHash('sha256').update(String(pin || '').trim() + salt).digest('hex')
}

export function hashPin(pin: string): string {
  return hashWithSalt(pin, activeSalt)
}

export function verifyPin(enteredPin: string, storedDbPin: string): boolean {
  if (!storedDbPin) return false
  const cleanStored = String(storedDbPin || '').trim()
  if (hashWithSalt(enteredPin, activeSalt) === cleanStored) return true
  // Kurulum bazlı rastgele salt'a geçmeden önce oluşturulmuş hash'ler için geriye dönük kontrol
  if (activeSalt !== LEGACY_SALT && hashWithSalt(enteredPin, LEGACY_SALT) === cleanStored) return true
  return false
}
