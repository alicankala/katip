import type { Database } from 'better-sqlite3'

declare const db: Database
declare function getDatabase(): Database
declare function initDB(): void
declare const dbPath: string
declare function verifyBackupDatabase(filePath: string): { valid: boolean; error?: string }
declare function ayarlariGetirBackend(): { success: boolean; settings: Record<string, string> }
declare function ayarKaydetBackend(key: string, value: string): { success: boolean; error?: string }
declare function topluAyarlariKaydetBackend(settingsObj: Record<string, string>): { success: boolean; error?: string }
declare function veritabaniKontrolEtBackend(): { success: boolean; message: string; checkedAt?: string }

export {
  db as default,
  getDatabase,
  initDB,
  dbPath,
  verifyBackupDatabase,
  uygulamaVerileriniYenileBackend,
  ayarlariGetirBackend,
  ayarKaydetBackend,
  topluAyarlariKaydetBackend,
  veritabaniKontrolEtBackend
}