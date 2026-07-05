import type { Database } from 'better-sqlite3'

declare const db: Database
declare function initDB(): void
declare const dbPath: string
declare function verifyBackupDatabase(filePath: string): { valid: boolean; error?: string }

export { db as default, initDB, dbPath, verifyBackupDatabase }