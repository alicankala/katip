import http from 'node:http'
import os from 'node:os'
import db from './database.js'

// Data migration for existing mobile work orders and items
try {
  db.prepare("UPDATE work_orders SET status = 'Açık' WHERE status = 'Acik'").run()
  db.prepare("UPDATE work_orders SET status = 'Tamamlandı' WHERE status = 'Tamamlandi'").run()
  db.prepare("UPDATE work_orders SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL").run()
  
  db.prepare("UPDATE work_order_items SET type = 'İşçilik' WHERE type = 'Iscilik'").run()
  db.prepare("UPDATE work_order_items SET type = 'Parça' WHERE type = 'Parca'").run()
  
  db.prepare("UPDATE stock_movements SET type = 'Çıkış' WHERE type = 'Cikis'").run()
  db.prepare("UPDATE stock_movements SET type = 'Giriş' WHERE type = 'Giris'").run()
} catch (e) {
  console.error('[PhoneServer] Existing work orders migration error:', e)
}

let server: http.Server | null = null
let currentPort = 4317
let isRunning = false

export interface LocalAddress {
  name: string
  address: string
  isPriority: boolean
}

export function getLocalIPAddresses(): LocalAddress[] {
  const interfaces = os.networkInterfaces()
  const addresses: LocalAddress[] = []

  const priorityKeywords = ['wi-fi', 'wlan', 'ethernet', 'kablosuz', 'yerel', 'en', 'eth', 'lan']
  const ignoreKeywords = ['virtual', 'vbox', 'vmware', 'wsl', 'hyper-v', 'loopback', 'pseudo', 'host-only', 'vpn', 'vboxnet', 'teredo', 'npcap']

  for (const name in interfaces) {
    const list = interfaces[name]
    if (!list) continue

    const nameLower = name.toLowerCase()
    const shouldIgnore = ignoreKeywords.some(keyword => nameLower.includes(keyword))

    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        if (shouldIgnore) continue

        const isPriority = priorityKeywords.some(keyword => nameLower.includes(keyword))
        addresses.push({
          name: name,
          address: iface.address,
          isPriority: isPriority
        })
      }
    }
  }

  addresses.sort((a, b) => {
    if (a.isPriority && !b.isPriority) return -1
    if (!a.isPriority && b.isPriority) return 1
    return a.name.localeCompare(b.name)
  })

  return addresses
}

export function getLocalIPAddress(): string {
  const list = getLocalIPAddresses()
  return list.length > 0 ? list[0].address : '127.0.0.1'
}

export function isServerRunning(): boolean {
  return isRunning
}

export function getCurrentPort(): number {
  return currentPort
}

export function stopPhoneServer(): Promise<boolean> {
  return new Promise((resolve) => {
    if (server) {
      server.close((err) => {
        if (err) {
          console.error('[PhoneServer] Stop error:', err)
        }
        server = null
        isRunning = false
        resolve(true)
      })
    } else {
      resolve(true)
    }
  })
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DATABASE HELPERS FOR WORK ORDERS & STOCKS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function isEmriToplaminiGuncelle(workOrderId: number | string): void {
  const toplam = db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) AS toplam
    FROM work_order_items
    WHERE work_order_id = ?
  `).get(Number(workOrderId)) as any

  db.prepare(`
    UPDATE work_orders
    SET total_price = ?
    WHERE id = ?
  `).run(Number(toplam?.toplam || 0), Number(workOrderId))
}

function stokHareketiKaydet(veri: {
  partId: number
  workOrderId?: number | null
  type: string
  quantity: number
  oldStock: number
  newStock: number
  masterId?: number | null
  note?: string
}): void {
  db.prepare(`
    INSERT INTO stock_movements (
      part_id,
      work_order_id,
      type,
      quantity,
      old_stock,
      new_stock,
      master_id,
      note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(veri.partId),
    veri.workOrderId ?? null,
    veri.type,
    Number(veri.quantity) || 0,
    Number(veri.oldStock) || 0,
    Number(veri.newStock) || 0,
    veri.masterId ?? null,
    veri.note ?? null
  )
}

// Transactional helper to insert Customer -> Vehicle -> Work Order
const createServiceReceptionTransaction = (data: any) => db.transaction((dataInner: any) => {
  const { plate, name, phone, brand, model, year, mileage, description, master_id } = dataInner
  const cleanPlate = String(plate || '').toUpperCase().replace(/\s+/g, '')
  
  let vehicle = db.prepare("SELECT * FROM vehicles WHERE UPPER(REPLACE(plate, ' ', '')) = ?").get(cleanPlate) as any
  let vehicleId = null

  if (vehicle) {
    vehicleId = vehicle.id
    if (mileage) {
      db.prepare("UPDATE vehicles SET mileage = ? WHERE id = ?").run(Number(mileage), vehicleId)
    }
  } else {
    // 1. Create customer
    const resCust = db.prepare("INSERT INTO customers (name, phone) VALUES (?, ?)").run(
      String(name || '').trim(),
      String(phone || '').trim()
    )
    const customerId = resCust.lastInsertRowid

    // 2. Create vehicle
    const resVeh = db.prepare(`
      INSERT INTO vehicles (customer_id, plate, brand, model, year, mileage)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      cleanPlate,
      String(brand || '').trim(),
      String(model || '').trim(),
      year ? Number(year) : null,
      mileage ? Number(mileage) : null
    )
    vehicleId = resVeh.lastInsertRowid
  }

  // 3. Create work order
  const resWo = db.prepare(`
    INSERT INTO work_orders (
      vehicle_id,
      description,
      mileage,
      total_price,
      status,
      opened_by_master_id
    )
    VALUES (?, ?, ?, 0, 'Açık', ?)
  `).run(
    vehicleId,
    String(description || '').trim(),
    mileage ? Number(mileage) : null,
    Number(master_id)
  )

  return resWo.lastInsertRowid
})(data)

// Transactional helper to insert labor into work order
const addLaborTransaction = (data: any) => db.transaction((dataInner: any) => {
  const { work_order_id, description, quantity, unit_price } = dataInner
  const qty = Number(quantity)
  const price = Number(unit_price)
  const totalPrice = qty * price

  db.prepare(`
    INSERT INTO work_order_items 
    (work_order_id, type, part_id, description, quantity, unit_price, total_price)
    VALUES (?, 'İşçilik', NULL, ?, ?, ?, ?)
  `).run(
    Number(work_order_id),
    String(description || '').trim(),
    qty,
    price,
    totalPrice
  )

  isEmriToplaminiGuncelle(work_order_id)
  return true
})(data)

// Transactional helper to insert part item and log stock movements
const addPartTransaction = (data: any) => db.transaction((dataInner: any) => {
  const { work_order_id, part_id, description, quantity, unit_price, master_id } = dataInner
  const qty = Number(quantity)
  const sellPrice = Number(unit_price)
  const totalPrice = qty * sellPrice

  const part = db.prepare("SELECT * FROM parts WHERE id = ?").get(Number(part_id)) as any
  if (!part) {
    throw new Error('Parca bulunamadi.')
  }

  // 1. Insert item
  db.prepare(`
    INSERT INTO work_order_items 
    (work_order_id, type, part_id, description, quantity, unit_price, total_price)
    VALUES (?, 'Parça', ?, ?, ?, ?, ?)
  `).run(
    Number(work_order_id),
    Number(part_id),
    String(description || '').trim(),
    qty,
    sellPrice,
    totalPrice
  )

  // 2. Decrement stock
  const oldStock = Number(part.stock || 0)
  const newStock = oldStock - qty
  db.prepare("UPDATE parts SET stock = ? WHERE id = ?").run(newStock, Number(part_id))

  // 3. Log movement
  stokHareketiKaydet({
    partId: Number(part_id),
    workOrderId: Number(work_order_id),
    type: 'Çıkış',
    quantity: qty,
    oldStock,
    newStock,
    masterId: Number(master_id),
    note: 'Is emrinde kullanildi (Mobil)'
  })

  // 4. Update work order totals
  isEmriToplaminiGuncelle(work_order_id)
  return true
})(data)

// Transactional helper to delete item and restore stock counts
const deleteItemTransaction = (data: any) => db.transaction((dataInner: any) => {
  const { item_id, master_id } = dataInner
  
  const kalem = db.prepare("SELECT * FROM work_order_items WHERE id = ?").get(Number(item_id)) as any
  if (!kalem) {
    throw new Error("Kalem bulunamadi.")
  }

  const workOrderId = Number(kalem.work_order_id)

  if ((kalem.type === 'Parça' || kalem.type === 'Parca') && kalem.part_id) {
    const part = db.prepare('SELECT stock FROM parts WHERE id = ?').get(Number(kalem.part_id)) as any
    const eskiStok = Number(part?.stock || 0)
    const miktar = Number(kalem.quantity || 0)
    const yeniStok = eskiStok + miktar

    db.prepare(`
      UPDATE parts
      SET stock = ?
      WHERE id = ?
    `).run(yeniStok, Number(kalem.part_id))

    stokHareketiKaydet({
      partId: Number(kalem.part_id),
      workOrderId,
      type: 'Giriş',
      quantity: miktar,
      oldStock: eskiStok,
      newStock: yeniStok,
      masterId: Number(master_id),
      note: 'Is emri kalemi silindigi icin stok geri eklendi (Mobil)'
    })
  }

  db.prepare("DELETE FROM work_order_items WHERE id = ?").run(Number(item_id))
  isEmriToplaminiGuncelle(workOrderId)
  return true
})(data)


export function startPhoneServer(requestedPort: number): Promise<{ success: boolean; port?: number; ip?: string; error?: string }> {
  return new Promise(async (resolve) => {
    if (isRunning) {
      await stopPhoneServer()
    }
    const mobileMasters = db.prepare(`
      SELECT id, name
      FROM masters
      WHERE IFNULL(is_active, 1) = 1
        AND name NOT LIKE '%Admin%'
        AND name NOT LIKE '%Destek%'
      ORDER BY id ASC
    `).all() as Array<{ id: number; name: string }>

    const masterOptionsHtml = mobileMasters.length
      ? '<option value="" disabled selected>Lutfen Seciniz</option>' +
        mobileMasters
          .map((m) => '<option value="' + m.id + '">' + String(m.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</option>')
          .join('')
      : '<option value="">Usta listesi alinamadi</option>'
    const htmlContent = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Katip Mobil</title>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <!-- PrimeIcons -->
  <link href="https://unpkg.com/primeicons/primeicons.css" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-card: #1e293b;
      --bg-active: #334155;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --success: #34d399;
      --warning: #fb923c;
      --border: #334155;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Outfit', sans-serif;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      padding: 16px;
      font-size: 15px;
      line-height: 1.5;
    }

    /* Screen layout */
    .screen {
      display: none;
      animation: fadeIn 0.2s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Login Screen */
    .login-container {
      max-width: 360px;
      width: 100%;
      min-height: calc(100vh - 32px);
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 20px 0;
      text-align: center;
    }
    .logo-frame {
      width: 80px;
      height: 80px;
      margin-bottom: 20px;
      border-radius: 20px;
      background: linear-gradient(135deg, var(--bg-card), var(--bg-active));
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3), 0 0 20px rgba(56, 189, 248, 0.15);
    }
    .logo-frame i {
      font-size: 40px;
      color: var(--accent);
    }
    .login-container h1 {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 4px;
      background: linear-gradient(to right, #ffffff, var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .login-subtitle {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 30px;
    }
    .card {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      text-align: left;
      width: 100%;
      box-sizing: border-box;
    }
    .form-group {
      margin-bottom: 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group label {
      font-weight: 600;
      font-size: 13.5px;
      color: var(--text-secondary);
    }
    select, input {
      width: 100%;
      height: 48px;
      padding: 0 14px;
      border-radius: 10px;
      background-color: var(--bg-primary);
      border: 1px solid var(--border);
      color: var(--text-primary);
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    select:focus, input:focus {
      border-color: var(--accent);
    }
    .btn {
      width: 100%;
      height: 48px;
      border-radius: 10px;
      border: none;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background-color 0.2s, transform 0.1s;
    }
    .btn:active {
      transform: scale(0.98);
    }
    .btn-primary {
      background-color: var(--accent);
      color: #000;
    }
    .btn-primary:hover {
      background-color: var(--accent-hover);
    }
    .btn-secondary {
      background-color: var(--bg-active);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .error-msg {
      background-color: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #fca5a5;
      padding: 10px;
      border-radius: 8px;
      font-size: 13.5px;
      margin-bottom: 16px;
      display: none;
    }

    /* Dashboard & Inner Screens Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .header-user {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: var(--bg-active);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      border: 1px solid var(--border);
    }
    .logout-btn {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background-color: var(--bg-card);
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .logout-btn:active {
      background-color: var(--bg-active);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    @media (min-width: 560px) {
      .stats-grid {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    .stat-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }
    .stat-card-main {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .stat-card-info {
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .stat-label {
      font-size: 11px;
      color: var(--text-secondary);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .stat-val {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.1;
    }
    .stat-icon {
      font-size: 18px;
      opacity: 0.8;
      padding: 4px;
    }
    .stat-sub {
      font-size: 10.5px;
      color: var(--text-muted);
      border-top: 1px dashed var(--border);
      padding-top: 6px;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    /* Card Accent Colors */
    .stat-card.accent-blue {
      border-left: 3px solid #38bdf8;
    }
    .stat-card.accent-blue .stat-icon { color: #38bdf8; }
    
    .stat-card.accent-green {
      border-left: 3px solid #34d399;
    }
    .stat-card.accent-green .stat-icon { color: #34d399; }
    
    .stat-card.accent-amber {
      border-left: 3px solid #fb923c;
    }
    .stat-card.accent-amber .stat-icon { color: #fb923c; }
    
    .stat-card.accent-purple {
      border-left: 3px solid #c084fc;
    }
    .stat-card.accent-purple .stat-icon { color: #c084fc; }

    /* Search bar with left icon */
    .search-container {
      position: relative;
      margin-bottom: 16px;
    }
    .search-container i {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-secondary);
      pointer-events: none;
    }
    .search-container input {
      padding-left: 36px;
    }

    /* List layout */
    .section-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 12px;
      color: var(--text-primary);
    }
    
    .list-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .list-item {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: background-color 0.2s;
    }
    
    .list-item:active {
      background-color: var(--bg-active);
    }
    
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .plate-badge {
      background-color: #f1f5f9;
      color: #0f172a;
      font-family: 'Courier New', Courier, monospace;
      font-weight: 800;
      font-size: 13px;
      padding: 2px 6px 2px 10px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #1d4ed8;
      letter-spacing: 0.08em;
      display: inline-block;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    }
    
    .item-price {
      font-weight: 700;
      color: var(--accent);
      font-size: 16px;
    }
    
    .item-info {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .item-desc {
      font-size: 14px;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .badge-status {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }
    
    .badge-status.acik {
      background-color: rgba(56, 189, 248, 0.1);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    
    .badge-status.tamamlandi {
      background-color: rgba(16, 185, 129, 0.1);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    /* Detail View Styles */
    .detail-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 16px;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: var(--text-secondary);
    }
    .detail-value {
      font-weight: 600;
      text-align: right;
    }
    
    .items-panel {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .item-row {
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 13.5px;
    }
    .item-row:last-child {
      border-bottom: none;
    }
    .item-row-header {
      display: flex;
      justify-content: space-between;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .item-row-sub {
      display: flex;
      justify-content: space-between;
      color: var(--text-secondary);
      font-size: 12px;
    }

    /* Part Results List */
    .part-select-card {
      background-color: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .part-select-card:active {
      background-color: var(--bg-active);
    }

    /* Modal Backdrop */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
      box-sizing: border-box;
      animation: fadeIn 0.2s ease-out;
    }
    
    /* Modal Content Container */
    .modal-content {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      width: 100%;
      max-width: 500px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      animation: slideUp 0.25s ease-out;
      overflow: hidden;
    }
    
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .modal-header h3 {
      font-size: 16.5px;
      font-weight: 700;
      margin: 0;
      color: var(--text-primary);
    }
    .modal-close-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 24px;
      cursor: pointer;
      line-height: 1;
      padding: 0 4px;
      transition: color 0.15s;
    }
    .modal-close-btn:hover {
      color: var(--text-primary);
    }
    .modal-body {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    }

    /* Result Card Styles */
    .result-card {
      background-color: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .result-card:active {
      transform: scale(0.98);
      border-color: var(--accent);
    }
    .result-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .result-plate {
      background-color: var(--accent);
      color: #000;
      font-weight: 800;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }
    .result-date {
      font-size: 11px;
      color: var(--accent);
      font-weight: 600;
    }
    .result-info-row {
      display: flex;
      justify-content: space-between;
      font-size: 12.5px;
      margin-bottom: 4px;
      line-height: 1.3;
    }
    .result-info-row:last-child {
      margin-bottom: 0;
    }
    .result-info-label {
      color: var(--text-secondary);
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .result-info-label i {
      font-size: 11px;
    }
    .result-info-value {
      color: var(--text-primary);
      font-weight: 600;
      text-align: right;
    }

    /* Visit Card Styles */
    .visit-card {
      background-color: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .visit-card:active {
      border-color: var(--accent);
    }
    .visit-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .visit-total {
      font-weight: 700;
      color: var(--accent);
      font-size: 13px;
    }
    .visit-complaint {
      font-size: 11.5px;
      color: var(--text-secondary);
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <!-- SCREEN 1: LOGIN -->
  <div id="screen-login" class="screen" style="display: block;">
    <div class="login-container">
      <div class="logo-frame">
        <i class="pi pi-car"></i>
      </div>
      <h1>Katip Mobil</h1>
      <div class="login-subtitle">Oto Servis Takip Sistemi</div>
      
      <div class="card">
        <div id="login-error" class="error-msg"></div>
        <div class="form-group">
          <label>Usta Secin</label>
          <select id="login-master">${masterOptionsHtml}</select>
        </div>
        <div class="form-group" style="margin-bottom: 24px;">
          <label>PIN Kodu</label>
          <input id="login-pin" type="password" pattern="[0-9]*" inputmode="numeric" maxlength="4" placeholder="4 haneli PIN girin">
        </div>
        <button id="login-btn" class="btn btn-primary">
          Giris Yap
        </button>
      </div>
    </div>
  </div>

  <!-- SCREEN 2: DASHBOARD -->
  <div id="screen-dashboard" class="screen">
    <div class="header">
      <div class="header-user">
        <div class="avatar"><i class="pi pi-user"></i></div>
        <div>
          <div style="font-size: 11px; color: var(--text-secondary);">Hos Geldiniz</div>
          <strong id="user-display-name">Usta Adi</strong>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="refresh-dashboard-btn" class="logout-btn" style="background: rgba(255, 255, 255, 0.05); color: var(--text-secondary);" title="Yenile">
          <i class="pi pi-refresh"></i>
        </button>
        <button id="logout-btn" class="logout-btn" title="Cikis Yap">
          <i class="pi pi-sign-out"></i>
        </button>
      </div>
    </div>

    <!-- Prominent Buttons -->
    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
      <button id="new-reception-btn" class="btn btn-primary" style="width: 100%; height: 50px; background-color: var(--accent); color: #000; margin: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; gap: 8px; border-radius: 12px; border: none; cursor: pointer;">
        <i class="pi pi-plus-circle" style="font-size: 17px;"></i> Yeni Servis Kabul
      </button>
      
      <div id="customer-history-btn" style="background-color: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: background-color 0.15s ease;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 14px; color: var(--text-primary);">
          <span><i class="pi pi-search" style="color: var(--accent); margin-right: 6px; font-size: 13px;"></i> Musteri Gecmisi Sorgula</span>
          <i class="pi pi-chevron-right" style="font-size: 11px; color: var(--text-secondary);"></i>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
          Plaka, musteri adi veya telefon no ile gecmis servis kayitlarini arayin.
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <!-- Acik Is Emri Card -->
      <div class="stat-card accent-blue">
        <div class="stat-card-main">
          <div class="stat-card-info">
            <span class="stat-label">Acik Is Emri</span>
            <span id="stat-open" class="stat-val">0</span>
          </div>
          <i class="pi pi-wrench stat-icon"></i>
        </div>
        <div id="stat-open-sub" class="stat-sub">Tamamlanan: -</div>
      </div>

      <!-- Kayitli Musteri Card -->
      <div class="stat-card accent-green">
        <div class="stat-card-main">
          <div class="stat-card-info">
            <span class="stat-label">Kayitli Musteri</span>
            <span id="stat-customers" class="stat-val">0</span>
          </div>
          <i class="pi pi-users stat-icon"></i>
        </div>
        <div id="stat-customers-sub" class="stat-sub">Toplam: -</div>
      </div>

      <!-- Servisteki Arac Card -->
      <div class="stat-card accent-amber">
        <div class="stat-card-main">
          <div class="stat-card-info">
            <span class="stat-label">Servisteki Arac</span>
            <span id="stat-vehicles" class="stat-val">0</span>
          </div>
          <i class="pi pi-car stat-icon"></i>
        </div>
        <div id="stat-vehicles-sub" class="stat-sub">Tamamlanan: -</div>
      </div>

      <!-- Aktif Parca Karti Card -->
      <div class="stat-card accent-purple">
        <div class="stat-card-main">
          <div class="stat-card-info">
            <span class="stat-label">Aktif Parca Karti</span>
            <span id="stat-parts" class="stat-val">0</span>
          </div>
          <i class="pi pi-box stat-icon"></i>
        </div>
        <div id="stat-parts-sub" class="stat-sub">Kritik: -  Biten: -</div>
      </div>
    </div>

    <!-- Tabs Selector -->
    <div class="tabs-container" style="display: flex; background-color: var(--bg-card); border-radius: 10px; padding: 4px; margin-bottom: 16px; border: 1px solid var(--border);">
      <button id="tab-open" class="tab-btn active" style="flex: 1; height: 36px; border: none; border-radius: 8px; font-weight: 600; font-size: 13.5px; cursor: pointer; transition: all 0.15s ease; background: var(--bg-active); color: var(--accent);">
        Acik Isler
      </button>
      <button id="tab-completed" class="tab-btn" style="flex: 1; height: 36px; border: none; border-radius: 8px; font-weight: 600; font-size: 13.5px; cursor: pointer; transition: all 0.15s ease; background: transparent; color: var(--text-secondary);">
        Tamamlananlar
      </button>
    </div>

    <!-- Live Search -->
    <div class="search-container">
      <i class="pi pi-search"></i>
      <input id="search-input" type="text" placeholder="Plaka, musteri veya islem ara...">
    </div>

    <div class="section-title"><span id="list-title-lbl">Acik Is Emirleri</span> (<span id="open-count-lbl">0</span>)</div>
    <div id="orders-list" class="list-container">
      <!-- Loaded dynamically -->
    </div>
  </div>

  <!-- SCREEN 3: DETAILS -->
  <div id="screen-details" class="screen">
    <div class="header" style="border-bottom: none; margin-bottom: 10px;">
      <h2 style="font-size: 18px; font-weight: 700;">Is Emri Detayi</h2>
      <button id="detail-back-btn" class="btn btn-secondary" style="width: auto; height: 32px; padding: 0 12px; font-size: 13px;">
        <i class="pi pi-arrow-left"></i> Geri Don
      </button>
    </div>

    <!-- General Info Card -->
    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">Plaka</span>
        <span class="detail-value"><span id="det-plate" class="plate-badge">-</span></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Musteri</span>
        <span id="det-customer" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Telefon</span>
        <span id="det-phone" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Arac</span>
        <span id="det-vehicle" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Acan Usta</span>
        <span id="det-master" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Acilis Tarihi</span>
        <span id="det-date" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Kapatan Usta</span>
        <span id="det-closed-master" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Kapanis Tarihi</span>
        <span id="det-closed-date" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Is Emri Durumu</span>
        <span class="detail-value"><span id="det-status" class="badge-status acik">Acik</span></span>
      </div>
      <div class="detail-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
        <span class="detail-label">Sikayet / Is Aciklamasi</span>
        <span id="det-desc" style="font-weight: 500; font-size: 13.5px; color: var(--text-primary); text-align: left; padding: 4px 0;">-</span>
      </div>
    </div>

    <!-- Items/Parts Panel -->
    <div class="section-title">Yapilan Isler &amp; Parcalar</div>
    <div class="items-panel">
      <div id="det-items-list">
        <!-- Loaded dynamically -->
      </div>
      
      <!-- Totals & Actions -->
      <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 12px; margin-top: 12px; font-weight: 700; font-size: 16px; margin-bottom: 14px;">
        <span>Toplam Tutar:</span>
        <span id="det-total" class="color-accent">0.00 TL</span>
      </div>

      <div id="detail-actions-wrapper" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; gap: 10px;">
          <button id="add-labor-btn" class="btn btn-secondary" style="flex: 1; height: 42px; font-size: 14px; background-color: var(--bg-active);">
            <i class="pi pi-briefcase"></i> Iscilik Ekle
          </button>
          <button id="add-part-btn" class="btn btn-secondary" style="flex: 1; height: 42px; font-size: 14px; background-color: var(--bg-active);">
            <i class="pi pi-cog"></i> Parca Ekle
          </button>
        </div>
        <button id="complete-order-btn" class="btn btn-primary" style="width: 100%; height: 42px; font-size: 14px; background-color: var(--success); color: #000; border: none; font-weight: 600;">
          <i class="pi pi-check-circle"></i> Isi Tamamla
        </button>
      </div>
    </div>
  </div>

  <!-- SCREEN 4: NEW RECEPTION -->
  <div id="screen-new-reception" class="screen">
    <div class="header" style="border-bottom: none; margin-bottom: 10px;">
      <h2 style="font-size: 18px; font-weight: 700;">Yeni Servis Kabul</h2>
      <button id="reception-back-btn" class="btn btn-secondary" style="width: auto; height: 32px; padding: 0 12px; font-size: 13px;">
        <i class="pi pi-arrow-left"></i> Vazgec
      </button>
    </div>

    <div class="card">
      <div id="reception-error" class="error-msg"></div>
      <div id="rec-found-banner" style="display: none; background-color: rgba(52, 211, 153, 0.1); border: 1px solid rgba(52, 211, 153, 0.25); color: #a7f3d0; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 16px;"></div>

      <form id="reception-form" onsubmit="return false;">
        <div class="form-group">
          <label>Arac Plakasi *</label>
          <input id="rec-plate" type="text" placeholder="Orn: 34ABC123" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Musteri Adi *</label>
            <input id="rec-name" type="text" placeholder="Ad Soyad" required>
          </div>
          <div class="form-group">
            <label>Telefon *</label>
            <input id="rec-phone" type="tel" placeholder="05XXXXXXXXX" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Marka</label>
            <input id="rec-brand" type="text" placeholder="Orn: Ford">
          </div>
          <div class="form-group">
            <label>Model</label>
            <input id="rec-model" type="text" placeholder="Orn: Focus">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Yil</label>
            <input id="rec-year" type="number" placeholder="Orn: 2018">
          </div>
          <div class="form-group">
            <label>Arac KM</label>
            <input id="rec-mileage" type="number" placeholder="Orn: 120000">
          </div>
        </div>

        <div class="form-group">
          <label>Sikayet / Yapilacak Islem *</label>
          <textarea id="rec-desc" placeholder="Sikayet veya yapilacak islemleri buraya yazin..." style="width: 100%; min-height: 80px; padding: 12px; border-radius: 10px; background-color: var(--bg-primary); border: 1px solid var(--border); color: var(--text-primary); font-size: 15px; outline: none; transition: border-color 0.2s;" required></textarea>
        </div>

        <button id="reception-save-btn" class="btn btn-primary" style="margin-top: 10px;">
          <i class="pi pi-save"></i> Servis Kabulunu Kaydet
        </button>
      </form>
    </div>
  </div>

  <!-- SCREEN 5: ADD LABOR -->
  <div id="screen-add-labor" class="screen">
    <div class="header" style="border-bottom: none; margin-bottom: 10px;">
      <h2 style="font-size: 18px; font-weight: 700;">Iscilik Ekle</h2>
      <button id="labor-back-btn" class="btn btn-secondary" style="width: auto; height: 32px; padding: 0 12px; font-size: 13px;">
        <i class="pi pi-arrow-left"></i> Geri Don
      </button>
    </div>

    <div class="card">
      <div id="labor-error" class="error-msg"></div>
      <form id="labor-form" onsubmit="return false;">
        <div class="form-group">
          <label>Yapilan Islem Aciklamasi *</label>
          <input id="labor-desc" type="text" placeholder="Orn: On Fren Balatasi Degisim Isciligi" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Miktar / Saat *</label>
            <input id="labor-qty" type="number" step="0.5" value="1" required>
          </div>
          <div class="form-group">
            <label>Birim Fiyat (TL) *</label>
            <input id="labor-price" type="number" step="0.01" placeholder="0.00" required>
          </div>
        </div>

        <div style="margin-top: 14px; margin-bottom: 18px; font-size: 15px; font-weight: 600;">
          Hesaplanan Toplam Tutar: <span id="labor-total-preview" class="color-accent">0.00 TL</span>
        </div>

        <button id="labor-save-btn" class="btn btn-primary">
          <i class="pi pi-save"></i> Isciligi Ekle
        </button>
      </form>
    </div>
  </div>

  <!-- SCREEN 6: ADD PART -->
  <div id="screen-add-part" class="screen">
    <div class="header" style="border-bottom: none; margin-bottom: 10px;">
      <h2 style="font-size: 18px; font-weight: 700;">Parca Ekle</h2>
      <button id="part-back-btn" class="btn btn-secondary" style="width: auto; height: 32px; padding: 0 12px; font-size: 13px;">
        <i class="pi pi-arrow-left"></i> Geri Don
      </button>
    </div>

    <!-- Live Search Part Wrapper -->
    <div style="position: relative; margin-bottom: 16px;">
      <div class="search-container" style="margin-bottom: 0;">
        <i class="pi pi-search"></i>
        <input id="part-search-input" type="text" placeholder="Kod, parca adi veya marka ara..." autocomplete="off">
      </div>

      <!-- Results list as absolute dropdown -->
      <div id="parts-search-results" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); margin-top: 6px;">
        <div style="text-align: center; color: var(--text-secondary); padding: 12px; font-size: 13px;">Arama yapmak icin yazin...</div>
      </div>
    </div>

    <!-- Sub form shown when part is selected -->
    <div id="selected-part-info" class="card" style="display: none;">
      <div id="part-error" class="error-msg"></div>
      
      <div style="margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
        <span style="font-size: 12px; color: var(--text-secondary); display: block;">Secilen Parca</span>
        <strong id="part-selected-name" style="font-size: 15px; color: var(--accent);">Parca Ismi</strong>
        <span style="font-size: 12px; color: var(--text-muted); display: block; margin-top: 2px;">
          Mevcut Stok: <span id="part-selected-stock" style="font-weight: 600;">0 Adet</span>
        </span>
      </div>

      <form id="part-form" onsubmit="return false;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Miktar *</label>
            <input id="part-qty" type="number" step="1" value="1" required>
          </div>
          <div class="form-group">
            <label>Birim Satis Fiyati (TL) *</label>
            <input id="part-price" type="number" step="0.01" required>
          </div>
        </div>

        <div style="margin-top: 14px; margin-bottom: 18px; font-size: 15px; font-weight: 600;">
          Hesaplanan Toplam Tutar: <span id="part-total-preview" class="color-accent">0.00 TL</span>
        </div>

        <button id="part-save-btn" class="btn btn-primary">
          <i class="pi pi-save"></i> Parcayi Ekle
        </button>
      </form>
    </div>
  </div>

  <!-- SCREEN: CUSTOMER HISTORY -->
  <div id="screen-customer-history" class="screen" style="display: none;">
    <div class="header" style="border-bottom: none; margin-bottom: 10px;">
      <h2 style="font-size: 18px; font-weight: 700;">Musteri Gecmisi Ara</h2>
      <button id="history-back-btn" class="btn btn-secondary" style="width: auto; height: 32px; padding: 0 12px; font-size: 13px;">
        <i class="pi pi-arrow-left"></i> Geri Don
      </button>
    </div>

    <div class="search-container" style="margin-bottom: 16px;">
      <i class="pi pi-search"></i>
      <input id="history-search-input" type="text" placeholder="Plaka, musteri veya telefon...">
    </div>

    <div id="history-loading" style="display: none; text-align: center; padding: 20px; color: var(--text-secondary);">
      Yukleniyor...
    </div>

    <div id="history-results" class="list-container">
      <!-- Search results loaded dynamically -->
    </div>
  </div>

  <!-- SCREEN: CUSTOMER HISTORY DETAIL -->
  <div id="screen-history-detail" class="screen" style="display: none;">
    <div class="header" style="border-bottom: none; margin-bottom: 10px;">
      <h2 style="font-size: 18px; font-weight: 700;">Gecmis Detayi</h2>
      <button id="history-detail-back-btn" class="btn btn-secondary" style="width: auto; height: 32px; padding: 0 12px; font-size: 13px;">
        <i class="pi pi-arrow-left"></i> Geri Don
      </button>
    </div>

    <div class="section-title">Musteri &amp; Arac Bilgileri</div>
    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">Musteri Adi</span>
        <span id="hist-customer-name" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Telefon</span>
        <span id="hist-customer-phone" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Plaka</span>
        <span class="detail-value"><span id="hist-plate" class="plate-badge">-</span></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Arac Marka / Model</span>
        <span id="hist-vehicle" class="detail-value">-</span>
      </div>
    </div>

    <div class="section-title">Servis Ziyaretleri</div>
    <div id="history-work-orders-list" class="list-container">
      <!-- Visited work orders list -->
    </div>
  </div>

  <!-- SCREEN: HISTORY WORK ORDER DETAIL (READ ONLY) -->
  <div id="screen-history-wo-detail" class="screen" style="display: none;">
    <div class="header" style="border-bottom: none; margin-bottom: 10px;">
      <h2 style="font-size: 18px; font-weight: 700;">Servis Detayi</h2>
      <button id="history-wo-back-btn" class="btn btn-secondary" style="width: auto; height: 32px; padding: 0 12px; font-size: 13px;">
        <i class="pi pi-arrow-left"></i> Geri Don
      </button>
    </div>

    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">Acilis Tarihi</span>
        <span id="hist-wo-date" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Kapanis Tarihi</span>
        <span id="hist-wo-closed-date" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Durum</span>
        <span class="detail-value"><span id="hist-wo-status" class="badge-status">-</span></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Acan Usta</span>
        <span id="hist-wo-opened-master" class="detail-value">-</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Kapatan Usta</span>
        <span id="hist-wo-closed-master" class="detail-value">-</span>
      </div>
      <div class="detail-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
        <span class="detail-label">Sikayet / Aciklama</span>
        <span id="hist-wo-complaint" style="font-weight: 500; font-size: 13.5px; color: var(--text-primary); text-align: left; padding: 4px 0;">-</span>
      </div>
    </div>

    <div class="section-title">Yapilan Isler &amp; Kullanilan Parcalar</div>
    <div id="history-wo-items-container" class="list-container" style="background: var(--bg-card); padding: 12px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 12px;">
      <!-- Labor & Parts -->
    </div>

    <div class="detail-card" style="padding: 12px;">
      <div class="detail-row" style="border: none;">
        <span class="detail-label" style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Toplam Tutar</span>
        <span id="hist-wo-total" class="detail-value" style="font-size: 16px; font-weight: 700; color: var(--accent);">-</span>
      </div>
    </div>
  </div>

  <script>
    let activeUser = null;
    let workOrders = [];
    let selectedPart = null;
    let currentTab = 'open';
    
    let historyResults = [];
    let selectedVehicle = null;

    const screens = {
      login: document.getElementById('screen-login'),
      dashboard: document.getElementById('screen-dashboard'),
      details: document.getElementById('screen-details'),
      reception: document.getElementById('screen-new-reception'),
      addLabor: document.getElementById('screen-add-labor'),
      addPart: document.getElementById('screen-add-part'),
      customerHistory: document.getElementById('screen-customer-history'),
      historyDetail: document.getElementById('screen-history-detail'),
      historyWoDetail: document.getElementById('screen-history-wo-detail')
    };

    function showScreen(screenKey) {
      Object.keys(screens).forEach(key => {
        screens[key].style.display = key === screenKey ? 'block' : 'none';
      });
      window.scrollTo(0, 0);
    }

    function tlFormat(val) {
      return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val || 0);
    }
    
    function dateFormat(dateStr) {
      if (!dateStr) return '-';
      try {
        const cleanStr = String(dateStr).trim();
        const utcTarih = cleanStr.includes('T')
          ? cleanStr
          : cleanStr.replace(' ', 'T') + 'Z';
        
        const d = new Date(utcTarih);
        if (isNaN(d.getTime())) {
          return dateStr;
        }
        
        return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return dateStr;
      }
    }

window.addEventListener('DOMContentLoaded', () => {
  // Clear any hashes to force landing on the main screen
  if (window.location.hash) {
    try {
      history.replaceState('', document.title, window.location.pathname + window.location.search);
    } catch (e) {
      window.location.hash = '';
    }
  }

  // Clear all localStorage keys completely to reset any session
  try {
    localStorage.clear();
  } catch (e) {}

  // Clear sessionStorage
  try {
    sessionStorage.clear();
  } catch (e) {}

  // Reset input fields
  try {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.tagName === 'SELECT') {
        input.selectedIndex = 0;
      } else {
        input.value = '';
      }
    });
  } catch (e) {}

  // Reset active user state variable
  activeUser = null;

  loadMasters();
  showScreen('login');
});

// Force screen reset on back-forward cache page navigation
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    activeUser = null;
    loadMasters();
    showScreen('login');
  }
});

async function loadMasters() {
  try {
    const res = await fetch('/api/masters?t=' + Date.now(), {
      cache: 'no-store'
    });

    const data = await res.json();

    const masters = Array.isArray(data)
      ? data
      : Array.isArray(data.masters)
        ? data.masters
        : [];

    const select = document.getElementById('login-master');

    if (!masters.length) {
      select.innerHTML = '<option value="">Usta listesi alinamadi.</option>';
      return;
    }

    let html = '<option value="" disabled selected>Lutfen Seciniz</option>';
    html += masters
      .map(m => '<option value="' + m.id + '">' + m.name + '</option>')
      .join('');

    select.innerHTML = html;
  } catch (e) {
    console.error('Ustalar yuklenemedi:', e);
    const select = document.getElementById('login-master');
    if (select && select.options.length <= 1) {
      select.innerHTML = '<option value="">Usta listesi alinamadi.</option>';
    }
  }
}

    document.getElementById('login-btn').addEventListener('click', async () => {
      const masterId = document.getElementById('login-master').value;
      const pin = document.getElementById('login-pin').value;
      const errorDiv = document.getElementById('login-error');
      
      errorDiv.style.display = 'none';

      if (!pin || pin.length !== 4) {
        errorDiv.textContent = 'Lutfen 4 haneli PIN kodunuzu girin.';
        errorDiv.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ master_id: masterId, pin })
        });
        const result = await res.json();

        if (result.success) {
          activeUser = result.usta;
          localStorage.setItem('mobActiveUser', JSON.stringify(activeUser));
          document.getElementById('user-display-name').textContent = activeUser.name;
          document.getElementById('login-pin').value = '';
          showScreen('dashboard');
          loadDashboard();
        } else {
          errorDiv.textContent = result.error || 'Giris basarisiz.';
          errorDiv.style.display = 'block';
        }
      } catch (e) {
        errorDiv.textContent = 'Sunucuyla baglanti kurulamadi.';
        errorDiv.style.display = 'block';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      if (confirm('Cikis yapmak istediginize emin misiniz?')) {
        localStorage.removeItem('mobActiveUser');
        activeUser = null;
        currentTab = 'open';
        loadMasters();
        showScreen('login');
      }
    });

    document.getElementById('refresh-dashboard-btn').addEventListener('click', () => {
      loadDashboard();
    });

    document.getElementById('tab-open').addEventListener('click', () => {
      if (currentTab === 'open') return;
      currentTab = 'open';
      document.getElementById('search-input').value = '';
      loadTabOrders();
    });

    document.getElementById('tab-completed').addEventListener('click', () => {
      if (currentTab === 'completed') return;
      currentTab = 'completed';
      document.getElementById('search-input').value = '';
      loadTabOrders();
    });

    function updateTabVisuals() {
      const openBtn = document.getElementById('tab-open');
      const compBtn = document.getElementById('tab-completed');
      const lbl = document.getElementById('list-title-lbl');
      if (currentTab === 'open') {
        openBtn.className = 'tab-btn active';
        openBtn.style.background = 'var(--bg-active)';
        openBtn.style.color = 'var(--accent)';
        
        compBtn.className = 'tab-btn';
        compBtn.style.background = 'transparent';
        compBtn.style.color = 'var(--text-secondary)';
        
        if (lbl) lbl.textContent = 'Acik Is Emirleri';
      } else {
        compBtn.className = 'tab-btn active';
        compBtn.style.background = 'var(--bg-active)';
        compBtn.style.color = 'var(--accent)';
        
        openBtn.className = 'tab-btn';
        openBtn.style.background = 'transparent';
        openBtn.style.color = 'var(--text-secondary)';
        
        if (lbl) lbl.textContent = 'Tamamlanan Is Emirleri';
      }
    }

    async function loadDashboard() {
      try {
        const statsRes = await fetch('/api/dashboard');
        const stats = await statsRes.json();
        
        document.getElementById('stat-open').textContent = stats.acikIsEmri || 0;
        document.getElementById('stat-open-sub').textContent = 'Tamamlanan: ' + (stats.tamamlananIsEmri || 0);

        document.getElementById('stat-customers').textContent = stats.musteriAktif || 0;
        document.getElementById('stat-customers-sub').textContent = 'Toplam: ' + (stats.musteriToplam || 0);

        document.getElementById('stat-vehicles').textContent = stats.aracAktif || 0;
        document.getElementById('stat-vehicles-sub').textContent = 'Tamamlanan: ' + (stats.aracToplam || 0);

        document.getElementById('stat-parts').textContent = stats.toplamStok || 0;
        document.getElementById('stat-parts-sub').textContent = 'Kritik: ' + (stats.dusukStok || 0) + '  Biten: ' + (stats.bitenStok || 0);

        await loadTabOrders();
      } catch (e) {
        console.error('Yukleme hatasi:', e);
      }
    }

    async function loadTabOrders() {
      const container = document.getElementById('orders-list');
      if (container) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 14px;">Yukleniyor...</div>';
      }
      updateTabVisuals();
      try {
        const url = currentTab === 'open' ? '/api/work-orders' : '/api/work-orders/completed';
        const listRes = await fetch(url);
        workOrders = await listRes.json();
        renderWorkOrders(workOrders);
      } catch (e) {
        console.error('Is emirleri yukleme hatasi:', e);
        if (container) {
          container.innerHTML = '<div style="text-align: center; color: var(--warning); padding: 20px; font-size: 14px;">Liste yuklenemedi.</div>';
        }
      }
    }

    function renderWorkOrders(list) {
      const container = document.getElementById('orders-list');
      document.getElementById('open-count-lbl').textContent = list.length;

      if (list.length === 0) {
        const msg = currentTab === 'open' ? 'Acik is emri bulunamadi.' : 'Tamamlanan is emri bulunamadi.';
        container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 14px;">' + msg + '</div>';
        return;
      }

      container.innerHTML = list.map(item => {
        const badgeClass = (item.status === 'Açık' || item.status === 'Acik') ? 'acik' : 'tamamlandi';
        const badgeText = (item.status === 'Açık' || item.status === 'Acik') ? 'Acik' : 'Tamamlandi';
        return '<div class="list-item" onclick="viewDetails(' + item.id + ')">' +
          '<div class="item-header">' +
            '<span class="plate-badge">' + (item.plate || 'PLAKASIZ') + '</span>' +
            '<span class="item-price">' + tlFormat(item.total_price) + '</span>' +
          '</div>' +
          '<div class="item-desc">' + (item.description || 'Aciklama girilmemis.') + '</div>' +
          '<div class="item-info">' +
            '<i class="pi pi-user" style="font-size: 11px;"></i> ' + (item.customer_name || 'Musteri Belirtilmemis') + '<br>' +
            '<i class="pi pi-tag" style="font-size: 11px;"></i> ' + (item.brand || '') + ' ' + (item.model || '') +
          '</div>' +
          '<div class="item-header" style="margin-top: 4px;">' +
            '<span class="badge-status ' + badgeClass + '">' + badgeText + '</span>' +
            '<span style="font-size: 11px; color: var(--text-muted);">' + dateFormat(item.created_at) + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    document.getElementById('search-input').addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        renderWorkOrders(workOrders);
        return;
      }

      const filtered = workOrders.filter(w => 
        (w.plate || '').toLowerCase().includes(query) ||
        (w.customer_name || '').toLowerCase().includes(query) ||
        (w.customer_phone || '').toLowerCase().includes(query) ||
        (w.description || '').toLowerCase().includes(query) ||
        (w.brand || '').toLowerCase().includes(query) ||
        (w.model || '').toLowerCase().includes(query)
      );
      renderWorkOrders(filtered);
    });

    async function viewDetails(id) {
      try {
        const res = await fetch('/api/work-orders/' + id);
        const data = await res.json();
        
        if (!data.success) {
          alert('Is emri detaylari yuklenemedi.');
          return;
        }

        const wo = data.workOrder;
        const items = data.items || [];

        // Save order ID onto back button for reference
        document.getElementById('detail-back-btn').dataset.orderId = id;

        document.getElementById('det-plate').textContent = wo.plate || 'PLAKASIZ';
        document.getElementById('det-customer').textContent = wo.customer_name || 'Musteri Belirtilmemis';
        document.getElementById('det-phone').textContent = wo.customer_phone || '-';
        document.getElementById('det-vehicle').textContent = (wo.brand || '') + ' ' + (wo.model || '');
        document.getElementById('det-master').textContent = wo.master_name || '-';
        document.getElementById('det-date').textContent = dateFormat(wo.created_at);
        document.getElementById('det-closed-master').textContent = wo.closed_master_name || '-';
        document.getElementById('det-closed-date').textContent = wo.closed_at ? dateFormat(wo.closed_at) : 'Henüz kapanmadı';
        const statusText = wo.status === 'Açık' ? 'Acik' : (wo.status === 'Tamamlandı' ? 'Tamamlandi' : (wo.status || 'Acik'));
        const statusBadge = document.getElementById('det-status');
        statusBadge.textContent = statusText;
        if (wo.status === 'Açık' || wo.status === 'Acik') {
          statusBadge.className = 'badge-status acik';
          document.getElementById('detail-actions-wrapper').style.display = 'flex';
        } else {
          statusBadge.className = 'badge-status tamamlandi';
          document.getElementById('detail-actions-wrapper').style.display = 'none';
        }
        document.getElementById('det-desc').textContent = wo.description || 'Aciklama girilmemis.';
        document.getElementById('det-total').textContent = tlFormat(wo.total_price);

        const itemsList = document.getElementById('det-items-list');
        if (items.length === 0) {
          itemsList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 10px; font-size: 13px;">Yapilan islem / parca kaydi bulunmuyor.</div>';
        } else {
itemsList.innerHTML = items.map(item => {
  return '<div class="item-row">' +
    '<div class="item-row-header">' +
      '<span>' + (item.description || 'Isimsiz Kalem') + '</span>' +
      '<span class="color-accent">' + tlFormat(item.total_price) + '</span>' +
    '</div>' +
    '<div class="item-row-sub">' +
      '<span>' + (item.type === 'Parça' || item.type === 'Parca' ? 'Yedek Parca' : 'Iscilik') + '</span>' +
      '<span>' + item.quantity + ' ' + (item.type === 'Parça' || item.type === 'Parca' ? 'Adet' : 'Saat') + ' x ' + tlFormat(item.unit_price) + '</span>' +
    '</div>' +
  '</div>';
}).join('');
        }

        showScreen('details');
      } catch (e) {
        console.error('Detay yukleme hatasi:', e);
        alert('Sunucu hatasi.');
      }
    }

    // Work order item remover
    async function removeItemFromOrder(itemId, desc) {
      alert('Mobilde kalem silme simdilik kapali.');
    }

    document.getElementById('detail-back-btn').addEventListener('click', () => {
      showScreen('dashboard');
      loadDashboard();
    });

    document.getElementById('complete-order-btn').addEventListener('click', async () => {
      const curId = document.getElementById('detail-back-btn').dataset.orderId;
      if (!activeUser || !activeUser.id) {
        alert('Kapatacak usta bilgisi bulunamadi. Lutfen cikis yapip tekrar girin.');
        return;
      }
      const ustaName = activeUser.name || 'Bilinmeyen Usta';
      if (!confirm('Bu is emrini ' + ustaName + ' adina tamamlandi olarak kapatmak istiyor musunuz?')) {
        return;
      }
      try {
        const res = await fetch('/api/work-orders/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            work_order_id: curId,
            master_id: activeUser.id
          })
        });
        const result = await res.json();
        if (result.success) {
          showScreen('dashboard');
          loadDashboard();
        } else {
          alert(result.error || 'Is emri kapatilamadi.');
        }
      } catch (e) {
        alert('Sunucuyla baglanti kurulamadi.');
      }
    });

    // ─── CUSTOMER HISTORY FLOW ───
    document.getElementById('customer-history-btn').addEventListener('click', () => {
      document.getElementById('history-search-input').value = '';
      document.getElementById('history-results').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">Arama yapmak icin plaka, musteri adi veya telefon girin.</div>';
      showScreen('customerHistory');
    });

    document.getElementById('history-back-btn').addEventListener('click', () => {
      showScreen('dashboard');
    });

    let historySearchTimeout = null;
    document.getElementById('history-search-input').addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (historySearchTimeout) clearTimeout(historySearchTimeout);
      
      if (query.length < 2) {
        document.getElementById('history-results').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">Arama yapmak icin en az 2 karakter girin.</div>';
        return;
      }

      historySearchTimeout = setTimeout(async () => {
        document.getElementById('history-loading').style.display = 'block';
        try {
          const res = await fetch('/api/customer-history/search?query=' + encodeURIComponent(query));
          const data = await res.json();
          document.getElementById('history-loading').style.display = 'none';
          if (data.success) {
            historyResults = data.results || [];
            renderHistoryResults();
          } else {
            document.getElementById('history-results').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-danger);">Arama hatasi: ' + (data.error || 'Bilinmeyen hata') + '</div>';
          }
        } catch (err) {
          document.getElementById('history-loading').style.display = 'none';
          document.getElementById('history-results').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-danger);">Sunucu baglanti hatasi.</div>';
        }
      }, 300);
    });

    function renderHistoryResults() {
      const container = document.getElementById('history-results');
      if (historyResults.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">Sonuc bulunamadi.</div>';
        return;
      }

      container.innerHTML = historyResults.map((item, idx) => {
        const dateStr = item.last_visit_date ? dateFormat(item.last_visit_date) : 'Yok';
        return '<div class="order-card" onclick="viewHistoryDetail(' + idx + ')" style="cursor: pointer; margin-bottom: 10px;">' +
          '<div class="order-header">' +
            '<span class="plate-badge">' + (item.plate || 'PLAKASIZ') + '</span>' +
            '<span style="font-size: 12px; color: var(--text-secondary);">Son Islem: ' + dateStr + '</span>' +
          '</div>' +
          '<div class="order-meta" style="margin-top: 6px;">' +
            '<div><i class="pi pi-user"></i> <strong>' + (item.customer_name || '') + '</strong></div>' +
            '<div style="font-size: 12px; margin-top: 3px;"><i class="pi pi-phone"></i> ' + (item.customer_phone || '-') + '</div>' +
            '<div style="font-size: 12px; margin-top: 3px;"><i class="pi pi-car"></i> ' + (item.brand || '') + ' ' + (item.model || '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    window.viewHistoryDetail = function(idx) {
      const item = historyResults[idx];
      if (!item) return;
      selectedVehicle = item;
      
      document.getElementById('hist-customer-name').textContent = item.customer_name;
      document.getElementById('hist-customer-phone').textContent = item.customer_phone || '-';
      document.getElementById('hist-plate').textContent = item.plate;
      document.getElementById('hist-vehicle').textContent = (item.brand || '') + ' ' + (item.model || '');

      const woList = document.getElementById('history-work-orders-list');
      const workOrders = item.workOrders || [];
      if (workOrders.length === 0) {
        woList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">Bu arac icin gecmis is emri bulunamadi.</div>';
      } else {
        woList.innerHTML = workOrders.map((wo, wIdx) => {
          const statusClass = wo.status === 'Tamamlandı' ? 'badge-status tamamlandi' : 'badge-status acik';
          const statusText = wo.status === 'Tamamlandı' ? 'Tamamlandi' : 'Acik';
          return '<div class="order-card" onclick="viewHistoryWorkOrderDetail(' + wIdx + ')" style="cursor: pointer; margin-bottom: 10px;">' +
            '<div class="order-header">' +
              '<span class="status-badge ' + statusClass + '">' + statusText + '</span>' +
              '<span style="font-size: 12.5px; font-weight: 700; color: var(--accent);">' + tlFormat(wo.total_amount) + '</span>' +
            '</div>' +
            '<div class="order-meta" style="margin-top: 6px;">' +
              '<div><strong>Tarih:</strong> ' + dateFormat(wo.created_at) + '</div>' +
              '<div style="font-size: 12.5px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">' +
                '<strong>Sikayet:</strong> ' + (wo.complaint || '-') +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
      showScreen('historyDetail');
    };

    document.getElementById('history-detail-back-btn').addEventListener('click', () => {
      showScreen('customerHistory');
    });

    window.viewHistoryWorkOrderDetail = async function(wIdx) {
      if (!selectedVehicle) return;
      const wo = selectedVehicle.workOrders[wIdx];
      if (!wo) return;
      
      document.getElementById('hist-wo-date').textContent = dateFormat(wo.created_at);
      document.getElementById('hist-wo-closed-date').textContent = wo.closed_at ? dateFormat(wo.closed_at) : 'Henüz kapanmadı';
      const statusClass = wo.status === 'Tamamlandı' ? 'badge-status tamamlandi' : 'badge-status acik';
      const statusText = wo.status === 'Tamamlandı' ? 'Tamamlandi' : 'Acik';
      const statusSpan = document.getElementById('hist-wo-status');
      statusSpan.className = statusClass;
      statusSpan.textContent = statusText;
      
      document.getElementById('hist-wo-opened-master').textContent = wo.opened_by_master_name || '-';
      document.getElementById('hist-wo-closed-master').textContent = wo.closed_by_master_name || '-';
      document.getElementById('hist-wo-complaint').textContent = wo.complaint || '-';
      document.getElementById('hist-wo-total').textContent = tlFormat(wo.total_amount);

      const itemsContainer = document.getElementById('history-wo-items-container');
      itemsContainer.innerHTML = '<div style="text-align: center; padding: 10px; color: var(--text-secondary);">Yukleniyor...</div>';

      try {
        const res = await fetch('/api/work-orders/' + wo.work_order_id);
        const data = await res.json();
        if (data.success) {
          const items = data.items || [];
          if (items.length === 0) {
            itemsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary);">Bu is emrinde kayitli is/parca yok.</div>';
          } else {
            itemsContainer.innerHTML = items.map(it => {
              const isPart = !!it.part_id;
              const icon = isPart ? 'pi pi-cog' : 'pi pi-user';
              const label = isPart ? '[PARCA] ' + it.name : '[ISCILIK] ' + it.name;
              const qtyStr = isPart ? it.qty + ' adet' : '1 adet';
              return '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;">' +
                '<div style="display: flex; flex-direction: column; gap: 2px;">' +
                  '<span style="font-weight: 600; color: var(--text-primary);"><i class="' + icon + '" style="font-size: 11px;"></i> ' + label + '</span>' +
                  '<span style="font-size: 11px; color: var(--text-secondary);">' + qtyStr + ' x ' + tlFormat(it.price) + '</span>' +
                '</div>' +
                '<span style="font-weight: 700; color: var(--text-primary);">' + tlFormat(it.qty * it.price) + '</span>' +
              '</div>';
            }).join('');
          }
        } else {
          itemsContainer.innerHTML = '<div style="text-align: center; color: var(--text-danger);">Yukleme hatasi.</div>';
        }
      } catch (e) {
        itemsContainer.innerHTML = '<div style="text-align: center; color: var(--text-danger);">Baglanti hatasi.</div>';
      }

      showScreen('historyWoDetail');
    };

    document.getElementById('history-wo-back-btn').addEventListener('click', () => {
      showScreen('historyDetail');
    });

    // ─── NEW RECEPTION FLOW ───
    document.getElementById('new-reception-btn').addEventListener('click', () => {
      document.getElementById('reception-form').reset();
      document.getElementById('rec-found-banner').style.display = 'none';
      document.getElementById('reception-error').style.display = 'none';
      showScreen('reception');
    });

    document.getElementById('reception-back-btn').addEventListener('click', () => {
      showScreen('dashboard');
    });

    let plakaTimeout = null;
    document.getElementById('rec-plate').addEventListener('input', (e) => {
      let val = e.target.value.toUpperCase().replace(/\s+/g, '');
      e.target.value = val;

      if (plakaTimeout) clearTimeout(plakaTimeout);
      
      const infoBanner = document.getElementById('rec-found-banner');
      infoBanner.style.display = 'none';

      if (val.length < 4) return;

      plakaTimeout = setTimeout(async () => {
        try {
          const res = await fetch('/api/vehicles/search?plate=' + val);
          const data = await res.json();
          if (data.success && data.found) {
            const v = data.vehicle;
            document.getElementById('rec-name').value = v.customer_name || '';
            document.getElementById('rec-phone').value = v.customer_phone || '';
            document.getElementById('rec-brand').value = v.brand || '';
            document.getElementById('rec-model').value = v.model || '';
            document.getElementById('rec-year').value = v.year || '';
            document.getElementById('rec-mileage').value = v.mileage || '';
            
            infoBanner.textContent = 'Kayitli arac bulundu: ' + (v.brand || '') + ' ' + (v.model || '');
            infoBanner.style.display = 'block';
          }
        } catch (e) {
          console.error(e);
        }
      }, 400);
    });

    document.getElementById('reception-save-btn').addEventListener('click', async () => {
      const plate = document.getElementById('rec-plate').value.trim();
      const name = document.getElementById('rec-name').value.trim();
      const phone = document.getElementById('rec-phone').value.trim();
      const brand = document.getElementById('rec-brand').value.trim();
      const model = document.getElementById('rec-model').value.trim();
      const year = document.getElementById('rec-year').value.trim();
      const mileage = document.getElementById('rec-mileage').value.trim();
      const description = document.getElementById('rec-desc').value.trim();
      const errorDiv = document.getElementById('reception-error');

      errorDiv.style.display = 'none';

      if (!plate || !name || !phone || !description) {
        errorDiv.textContent = 'Lutfen yildizli (*) alanlari doldurun.';
        errorDiv.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/api/service-reception', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plate,
            name,
            phone,
            brand,
            model,
            year,
            mileage,
            description,
            master_id: activeUser.id
          })
        });
        const result = await res.json();

        if (result.success) {
          alert('Servis kabul kaydi basariyla olusturuldu.');
          showScreen('dashboard');
          loadDashboard();
        } else {
          errorDiv.textContent = result.error || 'Kayit olusturulamadi.';
          errorDiv.style.display = 'block';
        }
      } catch (e) {
        errorDiv.textContent = 'Sunucuyla baglanti kurulamadi.';
        errorDiv.style.display = 'block';
      }
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ ADD LABOR FLOW Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    document.getElementById('add-labor-btn').addEventListener('click', () => {
      document.getElementById('labor-form').reset();
      document.getElementById('labor-qty').value = 1;
      document.getElementById('labor-error').style.display = 'none';
      updateLaborTotal();
      showScreen('addLabor');
    });

    document.getElementById('labor-back-btn').addEventListener('click', () => {
      const curId = document.getElementById('detail-back-btn').dataset.orderId;
      viewDetails(curId);
    });

    function updateLaborTotal() {
      const qty = parseFloat(document.getElementById('labor-qty').value) || 0;
      const price = parseFloat(document.getElementById('labor-price').value) || 0;
      document.getElementById('labor-total-preview').textContent = tlFormat(qty * price);
    }

    document.getElementById('labor-qty').addEventListener('input', updateLaborTotal);
    document.getElementById('labor-price').addEventListener('input', updateLaborTotal);

    document.getElementById('labor-save-btn').addEventListener('click', async () => {
      const curId = document.getElementById('detail-back-btn').dataset.orderId;
      const desc = document.getElementById('labor-desc').value.trim();
      const qty = document.getElementById('labor-qty').value;
      const price = document.getElementById('labor-price').value;
      const errorDiv = document.getElementById('labor-error');

      errorDiv.style.display = 'none';

      if (!desc || !qty || !price) {
        errorDiv.textContent = 'Lutfen tum alanlari doldurun.';
        errorDiv.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/api/work-order-items/labor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            work_order_id: curId,
            description: desc,
            quantity: qty,
            unit_price: price,
            master_id: activeUser.id
          })
        });
        const result = await res.json();

        if (result.success) {
          viewDetails(curId);
        } else {
          errorDiv.textContent = result.error || 'Iscilik eklenemedi.';
          errorDiv.style.display = 'block';
        }
      } catch (e) {
        errorDiv.textContent = 'Sunucu baglanti hatasi.';
        errorDiv.style.display = 'block';
      }
    });

    // ─── ADD PART FLOW ───
    let searchedParts = [];
    document.getElementById('add-part-btn').addEventListener('click', () => {
      document.getElementById('part-search-input').value = '';
      const resultsDiv = document.getElementById('parts-search-results');
      resultsDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 12px; font-size: 13px;">Arama yapmak icin yazin...</div>';
      resultsDiv.style.display = 'none';
      document.getElementById('selected-part-info').style.display = 'none';
      document.getElementById('part-error').style.display = 'none';
      selectedPart = null;
      searchedParts = [];
      showScreen('addPart');
    });

    document.getElementById('part-back-btn').addEventListener('click', () => {
      const curId = document.getElementById('detail-back-btn').dataset.orderId;
      viewDetails(curId);
    });

    let partsTimeout = null;
    document.getElementById('part-search-input').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const resultsDiv = document.getElementById('parts-search-results');
      
      if (val.length < 2) {
        resultsDiv.style.display = 'none';
        searchedParts = [];
        return;
      }

      if (partsTimeout) clearTimeout(partsTimeout);

      partsTimeout = setTimeout(async () => {
        try {
          const res = await fetch('/api/parts/search?query=' + encodeURIComponent(val));
          const parts = await res.json();
          renderPartsSearchList(parts);
        } catch (e) {
          console.error(e);
        }
      }, 250);
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      const input = document.getElementById('part-search-input');
      const results = document.getElementById('parts-search-results');
      if (input && results) {
        if (!input.contains(e.target) && !results.contains(e.target)) {
          results.style.display = 'none';
        }
      }
    });

    function renderPartsSearchList(list) {
      const container = document.getElementById('parts-search-results');
      searchedParts = list;
      container.style.display = 'block';

      if (list.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 12px; font-size: 13.5px;">Parca bulunamadi.</div>';
        return;
      }

      container.innerHTML = list.slice(0, 6).map((part, index) => {
        let stockWarning = '';
        if (part.stock <= 0) {
          stockWarning = '<span style="font-size: 9px; font-weight: 700; color: #ef4444; background: rgba(239, 68, 68, 0.1); padding: 2px 5px; border-radius: 4px; margin-left: 6px;">Stokta Yok</span>';
        } else if (part.critical_stock_enabled !== 0 && part.stock <= (part.critical_stock || 5)) {
          stockWarning = '<span style="font-size: 9px; font-weight: 700; color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 2px 5px; border-radius: 4px; margin-left: 6px;">Kritik Stok</span>';
        }
        
        const brandText = part.brand ? '<span style="font-size: 10px; color: var(--text-muted); margin-left: 4px;">(' + part.brand + ')</span>' : '';

        return '<div class="part-select-card" onclick="selectPartForAddingByIndex(' + index + ')" style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px;">' +
          '<div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 13.5px; color: var(--text-primary); text-align: left;">' +
            '<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">' + (part.name || 'Isimsiz Parca') + brandText + '</span>' +
            '<span style="color: var(--accent); font-weight: 700;">' + tlFormat(part.sell_price) + '</span>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-secondary);">' +
            '<span>Kod: ' + (part.code || '-') + '</span>' +
            '<div style="display: flex; align-items: center;">' +
              '<span>Stok: <strong>' + part.stock + ' ' + (part.unit || 'Adet') + '</strong></span>' +
              stockWarning +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    window.selectPartForAddingByIndex = function(idx) {
      const part = searchedParts[idx];
      if (!part) return;
      selectedPart = part;
      
      document.getElementById('parts-search-results').style.display = 'none';
      document.getElementById('part-search-input').value = part.code ? part.code + ' - ' + part.name : part.name;
      
      document.getElementById('selected-part-info').style.display = 'block';
      document.getElementById('part-selected-name').textContent = part.name;
      document.getElementById('part-selected-stock').textContent = part.stock + ' ' + (part.unit || 'Adet');
      document.getElementById('part-qty').value = 1;
      document.getElementById('part-price').value = part.sell_price || 0;
      updatePartTotal();
      
      document.getElementById('selected-part-info').scrollIntoView({ behavior: 'smooth' });
    };

    function updatePartTotal() {
      const qty = parseFloat(document.getElementById('part-qty').value) || 0;
      const price = parseFloat(document.getElementById('part-price').value) || 0;
      document.getElementById('part-total-preview').textContent = tlFormat(qty * price);
    }

    document.getElementById('part-qty').addEventListener('input', updatePartTotal);
    document.getElementById('part-price').addEventListener('input', updatePartTotal);

    document.getElementById('part-save-btn').addEventListener('click', async () => {
      const curId = document.getElementById('detail-back-btn').dataset.orderId;
      const qty = document.getElementById('part-qty').value;
      const price = document.getElementById('part-price').value;
      const errorDiv = document.getElementById('part-error');

      errorDiv.style.display = 'none';

      if (!selectedPart) {
        errorDiv.textContent = 'Lutfen bir parca secin.';
        errorDiv.style.display = 'block';
        return;
      }

      if (!qty || !price) {
        errorDiv.textContent = 'Lutfen tum alanlari doldurun.';
        errorDiv.style.display = 'block';
        return;
      }

      if (parseFloat(qty) > selectedPart.stock) {
        if (!confirm('Girdiginiz miktar mevcut stoktan (' + selectedPart.stock + ') fazla. Yine de eklemek istiyor musunuz?')) {
          return;
        }
      }

      try {
        const res = await fetch('/api/work-order-items/part', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            work_order_id: curId,
            part_id: selectedPart.id,
            description: selectedPart.name,
            quantity: qty,
            unit_price: price,
            master_id: activeUser.id
          })
        });
        const result = await res.json();

        if (result.success) {
          viewDetails(curId);
        } else {
          errorDiv.textContent = result.error || 'Parca eklenemedi.';
          errorDiv.style.display = 'block';
        }
      } catch (e) {
        errorDiv.textContent = 'Sunucu baglanti hatasi.';
        errorDiv.style.display = 'block';
      }
    });
  </script>
</body>
</html>`

    const tryListen = (port: number) => {
      const tempServer = http.createServer((req, res) => {
        const url = req.url || '/'
        const parsedUrl = new URL(url, 'http://localhost')
        const pathName = parsedUrl.pathname

        // 1. Mobile HTML / Client Layout
        if (pathName === '/' || pathName === '/index.html') {
          res.writeHead(200, { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
          })
          res.end(htmlContent)
          return
        }

        // 2. API: Get Masters List
        if (pathName === '/api/masters') {
          try {
            const rows = db.prepare("SELECT id, name FROM masters WHERE IFNULL(is_active, 1) = 1 AND name NOT LIKE '%Admin%' AND name NOT LIKE '%Destek%' ORDER BY id ASC").all()
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ success: true, masters: rows }))
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message, masters: [] }))
          }
          return
        }

        // 3. API: Login verification
        if (pathName === '/api/login' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const { master_id, pin } = JSON.parse(body)
              const usta = db.prepare("SELECT id, name, pin FROM masters WHERE id = ? AND IFNULL(is_active, 1) = 1").get(master_id) as any
              if (usta && usta.pin === pin) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ success: true, usta: { id: usta.id, name: usta.name } }))
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ success: false, error: 'Hatali PIN veya kullanici.' }))
              }
            } catch (e: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Gecersiz veri' }))
            }
          })
          return
        }

        // 4. API: Dashboard statistics count
        if (pathName === '/api/dashboard') {
          try {
            const resMusteri = db.prepare(`
              SELECT
                (
                  SELECT COUNT(*)
                  FROM customers
                  WHERE IFNULL(is_active, 1) = 1
                ) AS toplam,
                (
                  SELECT COUNT(DISTINCT customers.id)
                  FROM work_orders
                  JOIN vehicles ON work_orders.vehicle_id = vehicles.id
                  JOIN customers ON vehicles.customer_id = customers.id
                  WHERE work_orders.status != 'Tamamlandı'
                    AND IFNULL(vehicles.is_active, 1) = 1
                    AND IFNULL(customers.is_active, 1) = 1
                ) AS aktif
            `).get() as any

            const resArac = db.prepare(`
              SELECT
                COUNT(DISTINCT CASE WHEN status != 'Tamamlandı' THEN vehicle_id END) AS aktif,
                COUNT(CASE WHEN status = 'Tamamlandı' THEN 1 END) AS toplam
              FROM work_orders
            `).get() as any

            const resIsEmri = db.prepare(`
              SELECT
                COUNT(CASE WHEN status != 'Tamamlandı' THEN 1 END) AS acik,
                COUNT(CASE WHEN status = 'Tamamlandı' THEN 1 END) AS tamamlanan
              FROM work_orders
            `).get() as any

            const resStok = db.prepare(`
              SELECT
                COUNT(*) AS aktif,
                COALESCE(SUM(CASE WHEN (IFNULL(critical_stock_enabled, 1) = 1 AND IFNULL(stock, 0) <= IFNULL(critical_stock, 5)) OR IFNULL(stock, 0) <= 0 THEN 1 ELSE 0 END), 0) AS dusuk,
                COALESCE(SUM(CASE WHEN IFNULL(stock, 0) <= 0 THEN 1 ELSE 0 END), 0) AS biten
              FROM parts
              WHERE IFNULL(is_active, 1) = 1
            `).get() as any

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({
              acikIsEmri: Number(resIsEmri?.acik || 0),
              tamamlananIsEmri: Number(resIsEmri?.tamamlanan || 0),
              musteriAktif: Number(resMusteri?.aktif || 0),
              musteriToplam: Number(resMusteri?.toplam || 0),
              aracAktif: Number(resArac?.aktif || 0),
              aracToplam: Number(resArac?.toplam || 0),
              toplamStok: Number(resStok?.aktif || 0),
              dusukStok: Number(resStok?.dusuk || 0),
              bitenStok: Number(resStok?.biten || 0)
            }))
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }
 
        // 5. API: Get Open Work Orders List
        if (pathName === '/api/work-orders') {
          try {
            const rows = db.prepare(`
              SELECT wo.*, 
                     c.name AS customer_name, 
                     c.phone AS customer_phone, 
                     v.plate, 
                     v.brand, 
                     v.model,
                     m.name AS master_name 
              FROM work_orders wo 
              LEFT JOIN vehicles v ON wo.vehicle_id = v.id 
              LEFT JOIN customers c ON v.customer_id = c.id 
              LEFT JOIN masters m ON wo.opened_by_master_id = m.id 
              WHERE wo.status = 'Açık' 
              ORDER BY wo.created_at DESC
            `).all()
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify(rows))
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }
 
        // 5.5 API: Get Completed Work Orders List (limited to last 100)
        if (pathName === '/api/work-orders/completed') {
          try {
            const rows = db.prepare(`
              SELECT wo.*, 
                     v.plate, 
                     v.brand, 
                     v.model,
                     c.name AS customer_name, 
                     c.phone AS customer_phone, 
                     m.name AS master_name 
              FROM work_orders wo 
              JOIN vehicles v ON wo.vehicle_id = v.id 
              JOIN customers c ON v.customer_id = c.id 
              LEFT JOIN masters m ON wo.opened_by_master_id = m.id 
              WHERE wo.status = 'Tamamlandı' 
              ORDER BY wo.id DESC
              LIMIT 100
            `).all()
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify(rows))
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }

        // 6. API: Get Work Order Detail and Items
        if (pathName.startsWith('/api/work-orders/') && pathName !== '/api/work-orders/complete' && pathName !== '/api/work-orders/completed') {
          try {
            const idStr = pathName.substring('/api/work-orders/'.length)
            const id = parseInt(idStr, 10)
            
            if (isNaN(id)) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Gecersiz ID' }))
              return
            }
 
            const workOrder = db.prepare(`
              SELECT wo.*, 
                     c.name AS customer_name, 
                     c.phone AS customer_phone, 
                     v.plate, 
                     v.brand, 
                     v.model,
                     opened_master.name AS master_name,
                     closed_master.name AS closed_master_name
              FROM work_orders wo 
              LEFT JOIN vehicles v ON wo.vehicle_id = v.id 
              LEFT JOIN customers c ON v.customer_id = c.id 
              LEFT JOIN masters opened_master ON wo.opened_by_master_id = opened_master.id 
              LEFT JOIN masters closed_master ON wo.closed_by_master_id = closed_master.id
              WHERE wo.id = ?
            `).get(id) as any
 
            if (!workOrder) {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Is emri bulunamadi' }))
              return
            }
 
            const items = db.prepare(`
              SELECT *, quantity AS qty, unit_price AS price
              FROM work_order_items 
              WHERE work_order_id = ?
              ORDER BY id ASC
            `).all(id)
 
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({
              success: true,
              workOrder,
              items
            }))
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }
 
        // API: Customer History Search
        if (pathName === '/api/customer-history/search') {
          try {
            const query = (parsedUrl.searchParams.get('query') || '').trim();
            if (!query) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: true, results: [] }))
              return
            }

            const searchVal = `%${query}%`
            const vehicles = db.prepare(`
              SELECT 
                v.id AS vehicle_id,
                v.plate,
                v.brand,
                v.model,
                c.id AS customer_id,
                c.name AS customer_name,
                c.phone AS customer_phone,
                (SELECT MAX(created_at) FROM work_orders WHERE vehicle_id = v.id) AS last_visit_date
              FROM vehicles v
              JOIN customers c ON v.customer_id = c.id
              WHERE v.plate LIKE ? OR c.name LIKE ? OR c.phone LIKE ?
              ORDER BY last_visit_date DESC
              LIMIT 50
            `).all(searchVal, searchVal, searchVal) as any[]

            const results = vehicles.map(vehicle => {
              const workOrders = db.prepare(`
                SELECT 
                  wo.id AS work_order_id,
                  wo.created_at,
                  wo.closed_at,
                  wo.status,
                  wo.description AS complaint,
                  opened_master.name AS opened_by_master_name,
                  closed_master.name AS closed_by_master_name,
                  (
                    SELECT SUM(total_price) 
                    FROM work_order_items 
                    WHERE work_order_id = wo.id
                  ) AS total_amount
                FROM work_orders wo
                LEFT JOIN masters opened_master ON wo.opened_by_master_id = opened_master.id
                LEFT JOIN masters closed_master ON wo.closed_by_master_id = closed_master.id
                WHERE wo.vehicle_id = ?
                ORDER BY wo.created_at DESC
              `).all(vehicle.vehicle_id) as any[]

              return {
                ...vehicle,
                workOrders
              }
            })

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ success: true, results }))
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }

        // 7. API: Live search vehicle by plate
        if (pathName === '/api/vehicles/search') {
          try {
            const searchPlate = (parsedUrl.searchParams.get('plate') || '').toUpperCase().replace(/\s+/g, '')
            
            if (!searchPlate) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Plaka belirtilmedi' }))
              return
            }
 
            const vehicle = db.prepare(`
              SELECT v.*, c.name AS customer_name, c.phone AS customer_phone 
              FROM vehicles v 
              LEFT JOIN customers c ON v.customer_id = c.id 
              WHERE UPPER(REPLACE(v.plate, ' ', '')) = ?
            `).get(searchPlate) as any
 
            if (vehicle) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: true, found: true, vehicle }))
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: true, found: false }))
            }
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }
 
        // 8. API: Create Service Reception
        if (pathName === '/api/service-reception' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              const newWorkOrderId = createServiceReceptionTransaction(data)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: true, id: newWorkOrderId }))
            } catch (err: any) {
              console.error('[PhoneServer] Create service reception error:', err)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: false, error: err.message || 'Kayit olusturulurken bir hata olustu.' }))
            }
          })
          return
        }
 
        // 9. API: Live search parts list
        if (pathName === '/api/parts/search') {
          try {
            const searchQuery = (parsedUrl.searchParams.get('query') || '').trim()
            
            let rows = []
            if (!searchQuery) {
              rows = db.prepare("SELECT * FROM parts WHERE IFNULL(is_active, 1) = 1 ORDER BY id DESC LIMIT 15").all()
            } else {
              const likeQuery = `%${searchQuery}%`
              rows = db.prepare(`
                SELECT * 
                FROM parts 
                WHERE IFNULL(is_active, 1) = 1 
                  AND (name LIKE ? OR code LIKE ? OR oem_code LIKE ? OR brand LIKE ?)
                LIMIT 20
              `).all(likeQuery, likeQuery, likeQuery, likeQuery)
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify(rows))
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }
 
        // 10. API: Add labor item
        if (pathName === '/api/work-order-items/labor' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              addLaborTransaction(data)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: true }))
            } catch (err: any) {
              console.error('[PhoneServer] Add labor error:', err)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: false, error: err.message || 'Iscilik eklenemedi.' }))
            }
          })
          return
        }
 
        // 11. API: Add part item and modify stock
        if (pathName === '/api/work-order-items/part' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              addPartTransaction(data)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: true }))
            } catch (err: any) {
              console.error('[PhoneServer] Add part error:', err)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: false, error: err.message || 'Parca eklenemedi.' }))
            }
          })
          return
        }
 
        // 12. API: Delete item and restore stock
        if (pathName === '/api/work-order-items/delete' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              deleteItemTransaction(data)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: true }))
            } catch (err: any) {
              console.error('[PhoneServer] Delete item error:', err)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: false, error: err.message || 'Kalem silinemedi.' }))
            }
          })
          return
        }

        // 13. API: Complete work order
        if (pathName === '/api/work-orders/complete' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              const { work_order_id, master_id } = data
              
              console.log('[PhoneServer] Complete request received - WorkOrderId:', work_order_id, 'MasterId:', master_id)

              if (!work_order_id) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, error: 'Is emri ID bilgisi bulunamadi.' }))
                return
              }

              if (!master_id) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ success: false, error: 'Kapatacak usta bilgisi bulunamadi.' }))
                return
              }

              const masterIdNum = Number(master_id)
              if (isNaN(masterIdNum) || masterIdNum <= 0) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ success: false, error: 'Kapatacak usta ID bilgisi gecersiz.' }))
                return
              }

              const masterExists = db.prepare("SELECT name FROM masters WHERE id = ?").get(masterIdNum) as any
              if (!masterExists) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ success: false, error: 'Kapatacak usta sistemde bulunamadi.' }))
                return
              }

              console.log('[PhoneServer] Kapatan Usta:', masterExists.name)

              db.prepare(`
                UPDATE work_orders
                SET 
                  status = 'Tamamlandı',
                  closed_at = CURRENT_TIMESTAMP,
                  closed_by_master_id = ?
                WHERE id = ? AND status = 'Açık'
              `).run(masterIdNum, Number(work_order_id))

              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: true }))
            } catch (err: any) {
              console.error('[PhoneServer] Complete work order error:', err)
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ success: false, error: err.message || 'Is emri kapatilamadi.' }))
            }
          })
          return
        }
 
        // Default 404
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Bulunamadi')
      })

      tempServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && port < requestedPort + 10) {
          console.log(`[PhoneServer] Port ${port} in use, trying ${port + 1}...`)
          tryListen(port + 1)
        } else {
          console.error('[PhoneServer] Server error:', err)
          resolve({ success: false, error: err.message || 'Port dinlenemedi.' })
        }
      })

      tempServer.listen(port, '0.0.0.0', () => {
        server = tempServer
        currentPort = port
        isRunning = true
        console.log(`[PhoneServer] Server running at http://${getLocalIPAddress()}:${port}`)
        resolve({
          success: true,
          port: port,
          ip: getLocalIPAddress()
        })
      })
    }

    tryListen(requestedPort)
  })
}



