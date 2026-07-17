const path = require('node:path');
const Database = require('better-sqlite3');

const file = path.join(
  process.env.APPDATA,
  'Kâtip',
  'kurtarma-20260717_140744',
  'zip-acilimlari',
  'zip-1',
  'database',
  'otoservis.db'
);

const db = new Database(file, {
  readonly: true,
  fileMustExist: true
});

console.log('Kontrol:', db.pragma('quick_check', { simple: true }));

const tables = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all().map(x => x.name);

console.log('Tablolar:', tables.join(', '));

const kontrol = [
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

for (const table of kontrol) {
  if (!tables.includes(table)) {
    console.log(table + ': YOK');
    continue;
  }

  const sonuc = db.prepare(
    'SELECT COUNT(*) AS count FROM "' + table + '"'
  ).get();

  console.log(table + ': ' + sonuc.count + ' kayıt');
}

db.close();
