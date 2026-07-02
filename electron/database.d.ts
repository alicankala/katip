import type { Database } from 'better-sqlite3'

declare const db: Database
declare function initDB(): void
declare const dbPath: string

export { db as default, initDB, dbPath }