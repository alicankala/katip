const fs = require('node:fs');
const path = require('node:path');

const mainPath = path.join(process.cwd(), 'electron', 'main.ts');

if (!fs.existsSync(mainPath)) {
  console.error('HATA: electron/main.ts bulunamadı. Bu dosyayı dukkan-arayuz ana klasöründe çalıştır.');
  process.exit(1);
}

let text = fs.readFileSync(mainPath, 'utf8');

const backupPath = path.join(process.cwd(), 'electron', 'main.is-emri-silme-oncesi.ts');
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, text, 'utf8');
  console.log('Yedek alındı:', backupPath);
}

const channelSingle = "kanalEkle('is-emri-sil'";
const channelDouble = 'kanalEkle("is-emri-sil"';

let channelIndex = text.indexOf(channelSingle);
if (channelIndex < 0) channelIndex = text.indexOf(channelDouble);

if (channelIndex < 0) {
  console.error('HATA: is-emri-sil kanalı bulunamadı.');
  process.exit(1);
}

let start = text.lastIndexOf('\n// 13.', channelIndex);
if (start < 0 || channelIndex - start > 700) start = text.lastIndexOf('\n  // 13.', channelIndex);
if (start < 0 || channelIndex - start > 700) start = text.lastIndexOf('\n', channelIndex);
if (start < 0) start = channelIndex;
else start = start + 1;

const nextSingle = "kanalEkle('is-emri-guncelle'";
const nextDouble = 'kanalEkle("is-emri-guncelle"';

let nextIndex = text.indexOf(nextSingle, channelIndex + 1);
if (nextIndex < 0) nextIndex = text.indexOf(nextDouble, channelIndex + 1);

if (nextIndex < 0) {
  console.error('HATA: is-emri-guncelle kanalı bulunamadı.');
  process.exit(1);
}

let end = text.lastIndexOf('\n// 14.', nextIndex);
if (end < 0 || nextIndex - end > 700) end = text.lastIndexOf('\n  // 14.', nextIndex);
if (end < 0 || nextIndex - end > 700) end = text.lastIndexOf('\n', nextIndex);
if (end < 0) end = nextIndex;
else end = end + 1;

const replacement = "// 13. İş emri sil\nkanalEkle('is-emri-sil', (_event, id: any) => {\n  const transaction = db.transaction(() => {\n    const workOrderId =\n      typeof id === 'object' && id !== null\n        ? Number(id.id)\n        : Number(id)\n\n    const activeMasterId =\n      typeof id === 'object' &&\n      id !== null &&\n      id.active_master_id !== undefined &&\n      id.active_master_id !== null &&\n      id.active_master_id !== '' &&\n      id.active_master_id !== 'admin'\n        ? Number(id.active_master_id)\n        : null\n\n    if (!workOrderId) {\n      throw new Error('Silinecek iş emri bulunamadı.')\n    }\n\n    const isEmri = db.prepare(`\n      SELECT *\n      FROM work_orders\n      WHERE id = ?\n    `).get(workOrderId) as any\n\n    if (!isEmri) {\n      throw new Error('Silinecek iş emri bulunamadı.')\n    }\n\n    const aktifOdeme = db.prepare(`\n      SELECT COUNT(*) AS count\n      FROM work_order_payments\n      WHERE work_order_id = ? AND IFNULL(is_cancelled, 0) = 0\n    `).get(workOrderId) as any\n\n    if (aktifOdeme && Number(aktifOdeme.count) > 0) {\n      throw new Error('Bu iş emrinde tahsilat kaydı bulunduğu için silinemez. Önce tahsilat kaydını iptal edin.')\n    }\n\n    const fotograflar = db.prepare(`\n      SELECT *\n      FROM work_order_photos\n      WHERE work_order_id = ?\n    `).all(workOrderId) as any[]\n\n    const kalemler = db.prepare(`\n      SELECT *\n      FROM work_order_items\n      WHERE work_order_id = ?\n    `).all(workOrderId) as any[]\n\n    for (const kalem of kalemler) {\n      if ((kalem.type === 'Parça' || kalem.type === 'Parca') && kalem.part_id) {\n        const partId = Number(kalem.part_id)\n        const miktar = Number(kalem.quantity) || 0\n\n        if (partId && miktar > 0) {\n          const parca = db.prepare(`\n            SELECT stock\n            FROM parts\n            WHERE id = ?\n          `).get(partId) as any\n\n          const eskiStok = Number(parca?.stock) || 0\n          const yeniStok = eskiStok + miktar\n\n          db.prepare(`\n            UPDATE parts\n            SET stock = ?\n            WHERE id = ?\n          `).run(yeniStok, partId)\n\n          stokHareketiKaydet({\n            partId,\n            workOrderId: null,\n            type: 'Giriş',\n            quantity: miktar,\n            oldStock: eskiStok,\n            newStock: yeniStok,\n            masterId: activeMasterId,\n            note: `İş emri #${workOrderId} silindiği için stok geri eklendi`\n          })\n        }\n      }\n    }\n\n    // Bu iş emrine bağlı eski stok hareketleri iş emri silinince foreign key hatası vermesin.\n    try {\n      db.prepare(`\n        UPDATE stock_movements\n        SET work_order_id = NULL\n        WHERE work_order_id = ?\n      `).run(workOrderId)\n    } catch (e) {\n      db.prepare(`\n        DELETE FROM stock_movements\n        WHERE work_order_id = ?\n      `).run(workOrderId)\n    }\n\n    // Önce bağlı kayıtları sil, sonra ana iş emrini sil.\n    db.prepare(`\n      DELETE FROM work_order_payments\n      WHERE work_order_id = ?\n    `).run(workOrderId)\n\n    db.prepare(`\n      DELETE FROM work_order_photos\n      WHERE work_order_id = ?\n    `).run(workOrderId)\n\n    db.prepare(`\n      DELETE FROM work_order_logs\n      WHERE work_order_id = ?\n    `).run(workOrderId)\n\n    db.prepare(`\n      DELETE FROM work_order_items\n      WHERE work_order_id = ?\n    `).run(workOrderId)\n\n    db.prepare(`\n      DELETE FROM work_orders\n      WHERE id = ?\n    `).run(workOrderId)\n\n    for (const fotograf of fotograflar) {\n      const filePath = String(fotograf.file_path || '')\n      if (!filePath) continue\n\n      try {\n        if (fsSync.existsSync(filePath)) {\n          fsSync.unlinkSync(filePath)\n        }\n      } catch (e) {\n        console.warn('[Photos] İş emri silinirken fotoğraf dosyası silinemedi:', filePath, e)\n      }\n    }\n\n    return { success: true }\n  })\n\n  try {\n    return transaction()\n  } catch (error) {\n    console.error('İş emri silme hatası:', error)\n    return { success: false, error: getErrorMessage(error) }\n  }\n})\n";

text = text.slice(0, start) + replacement + '\n' + text.slice(end);

fs.writeFileSync(mainPath, text, 'utf8');

console.log('');
console.log('TAMAM: İş emri silme hatası düzeltildi.');
console.log('Eski main yedeği: electron/main.is-emri-silme-oncesi.ts');
console.log('');
