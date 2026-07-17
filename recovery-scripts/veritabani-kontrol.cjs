const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = path.join(process.env.APPDATA, 'Kâtip');

const files = [
  path.join(root, 'otoservis.db'),
  path.join(
    root,
    'kurtarma-20260717_140744',
    'zip-acilimlari',
    'zip-1',
    'database',
    'otoservis.db'
  ),
  path.join(
    root,
    'kurtarma-20260717_140744',
    'zip-acilimlari',
    'zip-2',
    'database',
    'otoservis.db'
  )
];

const importantTables = [
  'customers',
  'vehicles',
  'work_orders',
  'work_order_items',
  'parts',
  'masters',
  'work_order_payments',
  'work_order_photos',
  'app_settings',
  'stock_movements'
];

for (const file of files) {
  console.log('\n================================================');
  console.log(file);

  if (!fs.existsSync(file)) {
    console.log('DOSYA BULUNAMADI');
    continue;
  }

  const stat = fs.statSync(file);
  console.log('Boyut:', stat.size);
  console.log('Tarih:', stat.mtime);

  let db;

  try {
    db = new Database(file, {
      readonly: true,
      fileMustExist: true
    });

    console.log(
      'SQLite kontrol:',
      db.pragma('quick_check', { simple: true })
    );

    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(row => String(row.name));

    console.log('Tablolar:', tables.join(', '));

    for (const table of importantTables) {
      if (!tables.includes(table)) {
        console.log(table + ': YOK');
        continue;
      }

      const safeName = table.replace(/"/g, '""');

      const result = db.prepare(
        'SELECT COUNT(*) AS count FROM "' + safeName + '"'
      ).get();

      console.log(
        table + ': ' + Number(result.count || 0) + ' kayıt'
      );
    }
  } catch (error) {
    console.log('OKUMA HATASI:', error.message);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}
