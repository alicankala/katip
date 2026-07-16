import crypto from 'node:crypto'

export function hashPin(pin: string): string {
  const salt = 'OtoServis2026_Salt_#9982'
  return crypto.createHash('sha256').update(String(pin || '').trim() + salt).digest('hex')
}

export function verifyPin(enteredPin: string, storedDbPin: string): boolean {
  if (!storedDbPin) return false
  const cleanEntered = String(enteredPin || '').trim()
  const cleanStored = String(storedDbPin || '').trim()
  if (cleanStored === cleanEntered) return true
  return cleanStored === hashPin(cleanEntered)
}
