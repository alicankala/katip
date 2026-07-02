import path from 'node:path'
import { app } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const dbPath = path.join(app.getPath('userData'), 'otoservis.db')
const db = new Database(dbPath)

// Turkish character and case insensitive normalization function
function normalizeString(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o');
}

db.function('normalize_text', (val) => {
  return normalizeString(val);
});

function schemaVersionTablosuHazirla() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0
    );
  `)

  const row = db.prepare(`
    SELECT version
    FROM schema_version
    WHERE id = 1
  `).get()

  if (!row) {
    db.prepare(`
      INSERT INTO schema_version (id, version)
      VALUES (1, 0)
    `).run()
  }
}

function schemaVersionGetir() {
  schemaVersionTablosuHazirla()

  const row = db.prepare(`
    SELECT version
    FROM schema_version
    WHERE id = 1
  `).get()

  return Number(row?.version) || 0
}

function schemaVersionAyarla(version) {
  schemaVersionTablosuHazirla()

  db.prepare(`
    UPDATE schema_version
    SET version = ?
    WHERE id = 1
  `).run(version)
}

function kolonVarMi(tableName, columnName) {
  const kolonlar = db.prepare(`PRAGMA table_info(${tableName})`).all()

  return kolonlar.some((kolon) => kolon.name === columnName)
}

function kolonEkleEksikse(tableName, columnName, columnDefinition) {
  if (kolonVarMi(tableName, columnName)) {
    return
  }

  db.exec(`
    ALTER TABLE ${tableName}
    ADD COLUMN ${columnName} ${columnDefinition};
  `)
}

function migrationCalistir(version, callback) {
  const mevcutVersion = schemaVersionGetir()

  if (mevcutVersion >= version) {
    return
  }

  const transaction = db.transaction(() => {
    callback()
    schemaVersionAyarla(version)
  })

  transaction()
}

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      note TEXT
    );

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT,
  brand TEXT,
  category TEXT,
  oem_code TEXT,
  stock INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'Adet',
  buy_price REAL DEFAULT 0,
  sell_price REAL DEFAULT 0,
  shelf TEXT,
  critical_stock INTEGER DEFAULT 5,
  note TEXT
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  plate TEXT UNIQUE,
  brand TEXT,
  model TEXT,
  year INTEGER,
  mileage INTEGER,
  chassis TEXT,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER,
  description TEXT,
  mileage INTEGER,
  total_price REAL DEFAULT 0,
  status TEXT DEFAULT 'Açık',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  opened_by_master_id INTEGER,
  closed_by_master_id INTEGER,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY(opened_by_master_id) REFERENCES masters(id),
  FOREIGN KEY(closed_by_master_id) REFERENCES masters(id)
);

    CREATE TABLE IF NOT EXISTS work_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      part_id INTEGER,
      description TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
      FOREIGN KEY(part_id) REFERENCES parts(id)
    );

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id INTEGER NOT NULL,
  work_order_id INTEGER,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  old_stock REAL,
  new_stock REAL,
  master_id INTEGER,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(part_id) REFERENCES parts(id),
  FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
  FOREIGN KEY(master_id) REFERENCES masters(id)
);
  `)
  migrationCalistir(1, () => {
    kolonEkleEksikse('work_orders', 'total_price', 'REAL DEFAULT 0')
  })

  migrationCalistir(2, () => {
    kolonEkleEksikse('vehicles', 'chassis', 'TEXT')
  })

  migrationCalistir(3, () => {
    kolonEkleEksikse('work_orders', 'mileage', 'INTEGER')
  })
    migrationCalistir(4, () => {
    kolonEkleEksikse('customers', 'is_active', 'INTEGER DEFAULT 1')
  })

  migrationCalistir(5, () => {
    kolonEkleEksikse('vehicles', 'is_active', 'INTEGER DEFAULT 1')
  })

migrationCalistir(6, () => {
  kolonEkleEksikse('parts', 'is_active', 'INTEGER DEFAULT 1')
})

migrationCalistir(7, () => {
  kolonEkleEksikse('vehicles', 'mileage', 'INTEGER')
})

migrationCalistir(8, () => {
  kolonEkleEksikse('work_orders', 'closed_at', 'DATETIME')
})
migrationCalistir(9, () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS masters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.prepare(`
    INSERT INTO masters (name, pin, is_active)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM masters WHERE name = ?
    )
  `).run('Ali Kala', '1111', 1, 'Ali Kala')

  db.prepare(`
    INSERT INTO masters (name, pin, is_active)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM masters WHERE name = ?
    )
  `).run('Bünyamin Kala', '2222', 1, 'Bünyamin Kala')

  db.prepare(`
    INSERT INTO masters (name, pin, is_active)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM masters WHERE name = ?
    )
  `).run('Yusuf Kala', '3333', 1, 'Yusuf Kala')
})

migrationCalistir(10, () => {
  kolonEkleEksikse('work_orders', 'opened_by_master_id', 'INTEGER')
  kolonEkleEksikse('work_orders', 'closed_by_master_id', 'INTEGER')
})

migrationCalistir(11, () => {
  kolonEkleEksikse('parts', 'critical_stock', 'INTEGER DEFAULT 5')
})
migrationCalistir(12, () => {
  kolonEkleEksikse('parts', 'brand', 'TEXT')
  kolonEkleEksikse('parts', 'category', 'TEXT')
  kolonEkleEksikse('parts', 'oem_code', 'TEXT')
  kolonEkleEksikse('parts', 'unit', 'TEXT DEFAULT "Adet"')
  kolonEkleEksikse('parts', 'note', 'TEXT')
})
migrationCalistir(13, () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_order_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      master_id INTEGER,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
      FOREIGN KEY(master_id) REFERENCES masters(id)
    );
  `)
})
migrationCalistir(14, () => {
  kolonEkleEksikse('stock_movements', 'old_stock', 'REAL')
  kolonEkleEksikse('stock_movements', 'new_stock', 'REAL')
  kolonEkleEksikse('stock_movements', 'master_id', 'INTEGER')
})

migrationCalistir(15, () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS current_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      phone TEXT,
      note TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS account_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      current_account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      vehicle_id INTEGER,
      work_order_id INTEGER,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(current_account_id) REFERENCES current_accounts(id),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY(work_order_id) REFERENCES work_orders(id)
    );

    CREATE TABLE IF NOT EXISTS account_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      current_account_id INTEGER NOT NULL,
      transaction_id INTEGER,
      date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(current_account_id) REFERENCES current_accounts(id),
      FOREIGN KEY(transaction_id) REFERENCES account_transactions(id) ON DELETE SET NULL
    );
  })
  
  migrationCalistir(16, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS general_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_type TEXT NOT NULL,
        company_name TEXT,
        period TEXT,
        expense_date TEXT NOT NULL,
        due_date TEXT,
        amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Ödenmedi',
        payment_date TEXT,
        payment_method TEXT,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
  })

  console.log('Veritabanı hazır ve tablolar oluşturuldu! Yol:', dbPath)
}

export default db
export { dbPath }