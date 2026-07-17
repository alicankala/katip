const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');

const katip = path.join(process.env.APPDATA, 'Kâtip');
const dbPath = path.join(katip, 'otoservis.db');
const photosDir = path.join(katip, 'fotograflar');

function tableExists(db, name) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(name));
}

function ensureColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all();
  if (!cols.some(c => String(c.name) === column)) {
    db.exec(`ALTER TABLE "${table.replace(/"/g, '""')}" ADD COLUMN "${column.replace(/"/g, '""')}" ${definition}`);
  }
}

if (!fs.existsSync(dbPath)) {
  console.error('Aktif veritabani bulunamadi: ' + dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  const quick = db.pragma('quick_check', { simple: true });
  if (String(quick).toLowerCase() !== 'ok') {
    throw new Error('SQLite kontrolu basarisiz: ' + quick);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE,
      setting_value TEXT,
      key TEXT UNIQUE,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS work_order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Nakit',
      payment_date TEXT,
      received_by INTEGER,
      note TEXT,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      cancelled_at TEXT,
      cancelled_by INTEGER,
      cancel_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS work_order_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      category TEXT DEFAULT 'Araç Kabul',
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS work_order_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      action TEXT,
      old_status TEXT,
      new_status TEXT,
      master_id INTEGER,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Eksik kolonlar varsa ekle
  for (const [col, def] of [
    ['file_name', "TEXT"],
    ['file_path', "TEXT"],
    ['category', "TEXT DEFAULT 'Araç Kabul'"],
    ['note', "TEXT DEFAULT ''"],
    ['created_at', "TEXT DEFAULT CURRENT_TIMESTAMP"]
  ]) ensureColumn(db, 'work_order_photos', col, def);

  for (const [col, def] of [
    ['amount', "REAL NOT NULL DEFAULT 0"],
    ['payment_method', "TEXT NOT NULL DEFAULT 'Nakit'"],
    ['payment_date', "TEXT"],
    ['received_by', "INTEGER"],
    ['note', "TEXT"],
    ['is_cancelled', "INTEGER NOT NULL DEFAULT 0"],
    ['cancelled_at', "TEXT"],
    ['cancelled_by', "INTEGER"],
    ['cancel_reason', "TEXT"],
    ['created_at', "TEXT DEFAULT CURRENT_TIMESTAMP"]
  ]) ensureColumn(db, 'work_order_payments', col, def);

  // Fotoğraf dosyalarını yeniden veritabanına bağla
  if (fs.existsSync(photosDir)) {
    const files = fs.readdirSync(photosDir, { withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => e.name);

    const existsStmt = db.prepare(`
      SELECT id FROM work_order_photos
      WHERE file_path = ? OR file_name = ?
      LIMIT 1
    `);

    const insertStmt = db.prepare(`
      INSERT INTO work_order_photos
      (work_order_id, file_name, file_path, category, note)
      VALUES (?, ?, ?, ?, ?)
    `);

    const addPhotos = db.transaction(() => {
      for (const fileName of files) {
        const match = /^wo_(\d+)_/i.exec(fileName);
        if (!match) continue;

        const workOrderId = Number(match[1]);
        const filePath = path.join(photosDir, fileName);

        const woExists = db.prepare('SELECT id FROM work_orders WHERE id = ?').get(workOrderId);
        if (!woExists) continue;

        if (!existsStmt.get(filePath, fileName)) {
          insertStmt.run(workOrderId, fileName, filePath, 'Araç Kabul', '');
        }
      }
    });

    addPhotos();
  }

  const counts = {};
  for (const table of ['customers', 'vehicles', 'work_orders', 'work_order_items', 'parts', 'masters', 'work_order_payments', 'work_order_photos']) {
    if (tableExists(db, table)) {
      counts[table] = Number(db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c || 0);
    }
  }

  console.log('');
  console.log('ONARMA TAMAMLANDI');
  console.log(counts);
  console.log('');

  process.exit(0);
} catch (error) {
  console.error('ONARMA HATASI:', error && error.stack ? error.stack : error);
  process.exit(1);
} finally {
  try { db.close(); } catch {}
}
