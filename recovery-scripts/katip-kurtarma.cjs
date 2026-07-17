const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let Database;
try {
  Database = require('better-sqlite3');
} catch (error) {
  console.error('\nHATA: better-sqlite3 bulunamadı.');
  console.error('Bu dosyayı package.json bulunan dukkan-arayuz klasöründe çalıştırın.');
  console.error(String(error && error.message ? error.message : error));
  process.exit(1);
}

const REQUIRED_TABLES = [
  'customers',
  'vehicles',
  'work_orders',
  'work_order_items',
  'parts',
  'stock_movements',
  'masters',
  'app_settings',
  'work_order_photos',
  'work_order_payments'
];

const CORE_TABLES = [
  'customers',
  'vehicles',
  'work_orders',
  'work_order_items',
  'parts',
  'masters'
];

function log(message = '') {
  console.log(message);
}

function fail(message) {
  console.error('\nHATA: ' + message);
  process.exit(1);
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) + '_' +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR');
}

function walk(root, matcher, maxDepth = 5) {
  const results = [];

  function visit(current, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      try {
        if (matcher(full, entry)) results.push(full);
      } catch {}

      if (entry.isDirectory()) {
        visit(full, depth + 1);
      }
    }
  }

  visit(root, 0);
  return results;
}

function findKatipRoot() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

  const direct = [
    path.join(appData, 'Kâtip'),
    path.join(appData, 'Katip'),
    path.join(appData, 'KATIP')
  ];

  for (const candidate of direct) {
    if (fs.existsSync(candidate)) return candidate;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(appData, { withFileTypes: true });
  } catch (error) {
    fail('APPDATA klasörü okunamadı: ' + error.message);
  }

  const found = entries.find(entry => {
    if (!entry.isDirectory()) return false;
    return normalizeName(entry.name) === 'katip';
  });

  if (found) return path.join(appData, found.name);

  fail('Kâtip veri klasörü bulunamadı. Aranan konum: ' + appData);
}

function inspectDatabase(filePath) {
  let db;

  try {
    db = new Database(filePath, {
      readonly: true,
      fileMustExist: true
    });

    const quick = db.pragma('quick_check', { simple: true });
    if (String(quick).toLowerCase() !== 'ok') {
      return {
        valid: false,
        reason: 'SQLite quick_check sonucu: ' + quick,
        tables: [],
        score: 0
      };
    }

    const rows = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `).all();

    const tables = rows.map(row => String(row.name));
    const tableSet = new Set(tables);
    const hasCore = CORE_TABLES.every(name => tableSet.has(name));
    const complete = REQUIRED_TABLES.every(name => tableSet.has(name));
    const score = REQUIRED_TABLES.filter(name => tableSet.has(name)).length;

    return {
      valid: hasCore,
      complete,
      tables,
      score,
      missing: REQUIRED_TABLES.filter(name => !tableSet.has(name))
    };
  } catch (error) {
    return {
      valid: false,
      reason: error.message,
      tables: [],
      score: 0
    };
  } finally {
    try {
      if (db) db.close();
    } catch {}
  }
}

function newestFirst(paths) {
  return paths.sort((a, b) => {
    let aTime = 0;
    let bTime = 0;

    try { aTime = fs.statSync(a).mtimeMs; } catch {}
    try { bTime = fs.statSync(b).mtimeMs; } catch {}

    return bTime - aTime;
  });
}

function expandZip(zipPath, destination) {
  fs.mkdirSync(destination, { recursive: true });

  const escapedZip = zipPath.replace(/'/g, "''");
  const escapedDest = destination.replace(/'/g, "''");

  const command =
    "$ErrorActionPreference='Stop'; " +
    "Expand-Archive -LiteralPath '" + escapedZip +
    "' -DestinationPath '" + escapedDest + "' -Force";

  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { stdio: 'pipe' }
  );
}

function findDatabaseInside(folder) {
  const preferred = [
    path.join(folder, 'database', 'otoservis.db'),
    path.join(folder, 'otoservis.db')
  ];

  for (const file of preferred) {
    if (fs.existsSync(file)) return file;
  }

  const found = walk(
    folder,
    (full, entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.db'),
    5
  );

  return newestFirst(found)[0] || null;
}

function findPhotosInside(folder) {
  const preferred = [
    path.join(folder, 'fotograflar'),
    path.join(folder, 'photos')
  ];

  for (const dir of preferred) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }

  const found = walk(
    folder,
    (full, entry) => {
      if (!entry.isDirectory()) return false;
      const name = normalizeName(entry.name);
      return name === 'fotograflar' || name === 'photos';
    },
    5
  );

  return newestFirst(found)[0] || null;
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dest = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(src, dest);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}

function repairPhotoPaths(databasePath, photosDir) {
  let db;

  try {
    db = new Database(databasePath);

    const tableExists = db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table' AND name = 'work_order_photos'
    `).get();

    if (!tableExists) return;

    const columns = db.prepare(`PRAGMA table_info(work_order_photos)`).all();
    const columnNames = new Set(columns.map(row => String(row.name)));

    if (!columnNames.has('file_path')) return;

    const rows = db.prepare(`
      SELECT id, file_path
      FROM work_order_photos
      WHERE file_path IS NOT NULL AND TRIM(file_path) != ''
    `).all();

    const update = db.prepare(`
      UPDATE work_order_photos
      SET file_path = ?
      WHERE id = ?
    `);

    const transaction = db.transaction(() => {
      for (const row of rows) {
        const basename = path.basename(String(row.file_path || ''));
        if (!basename) continue;

        const newPath = path.join(photosDir, basename);
        if (fs.existsSync(newPath)) {
          update.run(newPath, Number(row.id));
        }
      }
    });

    transaction();
  } catch (error) {
    console.warn('Fotoğraf yolları düzeltilemedi: ' + error.message);
  } finally {
    try {
      if (db) db.close();
    } catch {}
  }
}

function main() {
  log('');
  log('KÂTİP VERİ KURTARMA BAŞLADI');
  log('--------------------------------');

  const katipRoot = findKatipRoot();
  const activeDb = path.join(katipRoot, 'otoservis.db');
  const activePhotos = path.join(katipRoot, 'fotograflar');
  const rescueDir = path.join(katipRoot, 'kurtarma-' + stamp());
  const extractionRoot = path.join(rescueDir, 'zip-acilimlari');

  fs.mkdirSync(rescueDir, { recursive: true });
  fs.mkdirSync(extractionRoot, { recursive: true });

  log('Kâtip klasörü: ' + katipRoot);

  const dbFiles = walk(
    katipRoot,
    (full, entry) => {
      if (!entry.isFile()) return false;
      if (!entry.name.toLowerCase().endsWith('.db')) return false;
      return path.resolve(full) !== path.resolve(activeDb);
    },
    6
  );

  const rollbackPatterns = [
    'geri-yukleme-oncesi',
    'restore-rollback',
    'backup',
    'yedek',
    'otoservis'
  ];

  dbFiles.sort((a, b) => {
    const aName = normalizeName(path.basename(a));
    const bName = normalizeName(path.basename(b));
    const aPriority = rollbackPatterns.some(x => aName.includes(x)) ? 1 : 0;
    const bPriority = rollbackPatterns.some(x => bName.includes(x)) ? 1 : 0;

    if (aPriority !== bPriority) return bPriority - aPriority;

    return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
  });

  const candidates = [];

  for (const file of dbFiles) {
    const info = inspectDatabase(file);
    if (!info.valid) continue;

    candidates.push({
      dbPath: file,
      photosPath: null,
      sourceType: 'db',
      sourcePath: file,
      info,
      mtimeMs: fs.statSync(file).mtimeMs
    });
  }

  const zipFiles = walk(
    katipRoot,
    (full, entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.zip'),
    6
  );

  for (let i = 0; i < zipFiles.length; i++) {
    const zip = zipFiles[i];
    const folder = path.join(extractionRoot, 'zip-' + String(i + 1));

    try {
      expandZip(zip, folder);
      const dbInZip = findDatabaseInside(folder);
      if (!dbInZip) continue;

      const info = inspectDatabase(dbInZip);
      if (!info.valid) continue;

      candidates.push({
        dbPath: dbInZip,
        photosPath: findPhotosInside(folder),
        sourceType: 'zip',
        sourcePath: zip,
        info,
        mtimeMs: fs.statSync(zip).mtimeMs
      });
    } catch (error) {
      console.warn('ZIP açılamadı, atlandı: ' + zip);
      console.warn('  ' + error.message);
    }
  }

  const completeCandidates = candidates.filter(candidate => candidate.info.complete);

  completeCandidates.sort((a, b) => {
    if (a.info.score !== b.info.score) return b.info.score - a.info.score;
    return b.mtimeMs - a.mtimeMs;
  });

  const selected = completeCandidates[0];

  if (!selected) {
    log('');
    log('Tam tablo yapısına sahip sağlam yedek bulunamadı.');
    log('Bulunan adaylar:');

    for (const candidate of candidates) {
      log(
        '- ' + candidate.sourcePath +
        ' | tablo puanı: ' + candidate.info.score + '/' + REQUIRED_TABLES.length +
        ' | eksik: ' + candidate.info.missing.join(', ')
      );
    }

    fail(
      'Aktif veritabanına dokunulmadı. ' +
      'Bu terminal çıktısını ChatGPT’ye gönderin.'
    );
  }

  log('');
  log('Kullanılacak sağlam yedek:');
  log(selected.sourcePath);
  log('Tablolar: ' + selected.info.score + '/' + REQUIRED_TABLES.length);

  if (fs.existsSync(activeDb)) {
    const brokenCopy = path.join(rescueDir, 'mevcut-bozuk-otoservis.db');
    fs.copyFileSync(activeDb, brokenCopy);
    log('Mevcut veritabanı korundu: ' + brokenCopy);
  }

  for (const suffix of ['-wal', '-shm']) {
    const file = activeDb + suffix;
    try {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    } catch {}
  }

  fs.copyFileSync(selected.dbPath, activeDb);
  log('Sağlam veritabanı geri getirildi.');

  let photosSource = selected.photosPath;

  if (!photosSource) {
    const rollbackPhotoDirs = walk(
      katipRoot,
      (full, entry) => {
        if (!entry.isDirectory()) return false;
        const name = normalizeName(entry.name);
        return (
          name.includes('geri-yukleme-oncesi-fotograflar') ||
          name.includes('fotograflar-restore-rollback')
        );
      },
      6
    );

    photosSource = newestFirst(rollbackPhotoDirs)[0] || null;
  }

  if (photosSource && fs.existsSync(photosSource)) {
    if (fs.existsSync(activePhotos)) {
      const oldPhotosCopy = path.join(rescueDir, 'mevcut-fotograflar');
      copyDirectory(activePhotos, oldPhotosCopy);
      fs.rmSync(activePhotos, { recursive: true, force: true });
      log('Mevcut fotoğraflar korundu: ' + oldPhotosCopy);
    }

    copyDirectory(photosSource, activePhotos);
    log('Fotoğraflar geri getirildi: ' + photosSource);
  } else {
    log('Uyarı: Ayrı fotoğraf klasörü bulunamadı.');
  }

  repairPhotoPaths(activeDb, activePhotos);

  const finalCheck = inspectDatabase(activeDb);
  if (!finalCheck.complete) {
    fail(
      'Son doğrulama başarısız. Eksik tablolar: ' +
      finalCheck.missing.join(', ')
    );
  }

  log('');
  log('KURTARMA TAMAMLANDI.');
  log('Şimdi şu komutu çalıştırın:');
  log('npm run dev');
  log('');
}

try {
  main();
} catch (error) {
  console.error('\nBEKLENMEYEN HATA:');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
