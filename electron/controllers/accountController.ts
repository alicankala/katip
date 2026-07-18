import db from '../database.js'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerAccountHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
  // 1. Cari Hesaplar - Getir
  kanalEkle('cari-hesaplari-getir', () => {
    try {
      const accounts = db.prepare(`
        SELECT
          ca.*,
          COALESCE((SELECT SUM(amount) FROM account_transactions WHERE current_account_id = ca.id), 0) AS total_debt,
          COALESCE((SELECT SUM(amount) FROM account_payments WHERE current_account_id = ca.id), 0) AS total_paid,
          (COALESCE((SELECT SUM(amount) FROM account_transactions WHERE current_account_id = ca.id), 0) -
           COALESCE((SELECT SUM(amount) FROM account_payments WHERE current_account_id = ca.id), 0)) AS remaining_debt
        FROM current_accounts ca
        WHERE IFNULL(ca.is_active, 1) = 1
        ORDER BY ca.name ASC
      `).all()
      return { success: true, accounts }
    } catch (error) {
      console.error('Cari hesapları getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 2. Cari Hesap - Ekle
  kanalEkle('cari-hesap-ekle', (_event, hesap: any) => {
    try {
      const name = String(hesap.name || '').trim()
      const type = String(hesap.type || '').trim()
      const phone = String(hesap.phone || '').trim()
      const note = String(hesap.note || '').trim()

      const direction = String(hesap.direction || 'Borç').trim()

      if (!name) {
        throw new Error('Cari hesap adı boş bırakılamaz.')
      }
      if (!type) {
        throw new Error('Cari hesap tipi seçilmelidir.')
      }

      const stmt = db.prepare(`
        INSERT INTO current_accounts (name, type, phone, note, direction, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `)
      const info = stmt.run(name, type, phone, note, direction)
      return { success: true, id: info.lastInsertRowid }
    } catch (error) {
      console.error('Cari hesap ekleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 3. Cari Hesap - Güncelle
  kanalEkle('cari-hesap-guncelle', (_event, hesap: any) => {
    try {
      const id = Number(hesap.id)
      const name = String(hesap.name || '').trim()
      const type = String(hesap.type || '').trim()
      const phone = String(hesap.phone || '').trim()
      const note = String(hesap.note || '').trim()
      const direction = String(hesap.direction || 'Borç').trim()

      if (!id) {
        throw new Error('Güncellenecek cari hesap bulunamadı.')
      }
      if (!name) {
        throw new Error('Cari hesap adı boş bırakılamaz.')
      }
      if (!type) {
        throw new Error('Cari hesap tipi seçilmelidir.')
      }

      db.prepare(`
        UPDATE current_accounts
        SET name = ?, type = ?, phone = ?, note = ?, direction = ?
        WHERE id = ?
      `).run(name, type, phone, note, direction, id)
      return { success: true }
    } catch (error) {
      console.error('Cari hesap güncelleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 4. Cari Hesap - Sil (Pasife Al)
  kanalEkle('cari-hesap-sil', (_event, id: number) => {
    try {
      const accountId = Number(id)
      if (!accountId) {
        throw new Error('Silinecek cari hesap bulunamadı.')
      }

      db.prepare(`
        UPDATE current_accounts
        SET is_active = 0
        WHERE id = ?
      `).run(accountId)
      return { success: true }
    } catch (error) {
      console.error('Cari hesap silme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 5. Cari İşlemleri Getir
  kanalEkle('cari-islemleri-getir', (_event, currentAccountId: number) => {
    try {
      const accountId = Number(currentAccountId)
      if (!accountId) {
        throw new Error('Cari hesap bilgisi geçersiz.')
      }

      const transactions = db.prepare(`
        SELECT
          t.*,
          v.plate AS vehicle_plate,
          v.brand AS vehicle_brand,
          v.model AS vehicle_model
        FROM account_transactions t
        LEFT JOIN vehicles v ON t.vehicle_id = v.id
        WHERE t.current_account_id = ?
        ORDER BY t.date DESC, t.id DESC
      `).all(accountId)
      return { success: true, transactions }
    } catch (error) {
      console.error('Cari işlemleri getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 6. Cari İşlem Ekle
  kanalEkle('cari-islem-ekle', (_event, islem: any) => {
    try {
      const current_account_id = Number(islem.current_account_id)
      const date = String(islem.date || '').trim()
      const transaction_type = String(islem.transaction_type || '').trim()
      const description = String(islem.description || '').trim()
      const amount = Number(islem.amount) || 0
      const vehicle_id = islem.vehicle_id ? Number(islem.vehicle_id) : null
      const work_order_id = islem.work_order_id ? Number(islem.work_order_id) : null
      const note = String(islem.note || '').trim()

      if (!current_account_id) {
        throw new Error('İşlem için cari hesap seçilmelidir.')
      }
      if (!date) {
        throw new Error('Tarih alanı boş bırakılamaz.')
      }
      if (!transaction_type) {
        throw new Error('İşlem tipi seçilmelidir.')
      }
      if (amount <= 0) {
        throw new Error('İşlem tutarı sıfırdan büyük olmalıdır.')
      }

      const stmt = db.prepare(`
        INSERT INTO account_transactions (
          current_account_id, date, transaction_type, description, amount, vehicle_id, work_order_id, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(current_account_id, date, transaction_type, description, amount, vehicle_id, work_order_id, note)
      return { success: true, id: info.lastInsertRowid }
    } catch (error) {
      console.error('Cari işlem ekleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 7. Cari İşlem Sil
  kanalEkle('cari-islem-sil', (_event, id: number) => {
    try {
      const transactionId = Number(id)
      if (!transactionId) {
        throw new Error('Silinecek işlem bulunamadı.')
      }

      db.prepare(`
        DELETE FROM account_transactions
        WHERE id = ?
      `).run(transactionId)
      return { success: true }
    } catch (error) {
      console.error('Cari işlem silme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 8. Cari Ödemeleri Getir
  kanalEkle('cari-odemeleri-getir', (_event, currentAccountId: number) => {
    try {
      const accountId = Number(currentAccountId)
      if (!accountId) {
        throw new Error('Cari hesap bilgisi geçersiz.')
      }

      const payments = db.prepare(`
        SELECT
          p.*,
          t.description AS transaction_description
        FROM account_payments p
        LEFT JOIN account_transactions t ON p.transaction_id = t.id
        WHERE p.current_account_id = ?
        ORDER BY p.date DESC, p.id DESC
      `).all(accountId)
      return { success: true, payments }
    } catch (error) {
      console.error('Cari ödemeleri getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 9. Cari Ödeme Ekle
  kanalEkle('cari-odeme-ekle', (_event, odeme: any) => {
    try {
      const current_account_id = Number(odeme.current_account_id)
      const transaction_id = odeme.transaction_id ? Number(odeme.transaction_id) : null
      const date = String(odeme.date || '').trim()
      const amount = Number(odeme.amount) || 0
      const payment_method = String(odeme.payment_method || '').trim()
      const description = String(odeme.description || '').trim()

      if (!current_account_id) {
        throw new Error('Ödeme için cari hesap seçilmelidir.')
      }
      if (!date) {
        throw new Error('Tarih alanı boş bırakılamaz.')
      }
      if (amount <= 0) {
        throw new Error('Ödeme tutarı sıfırdan büyük olmalıdır.')
      }
      if (!payment_method) {
        throw new Error('Ödeme yöntemi seçilmelidir.')
      }

      const stmt = db.prepare(`
        INSERT INTO account_payments (
          current_account_id, transaction_id, date, amount, payment_method, description
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(current_account_id, transaction_id, date, amount, payment_method, description)
      return { success: true, id: info.lastInsertRowid }
    } catch (error) {
      console.error('Cari ödeme ekleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 10. Cari Ödeme Sil
  kanalEkle('cari-odeme-sil', (_event, id: number) => {
    try {
      const paymentId = Number(id)
      if (!paymentId) {
        throw new Error('Silinecek ödeme kaydı bulunamadı.')
      }

      db.prepare(`
        DELETE FROM account_payments
        WHERE id = ?
      `).run(paymentId)
      return { success: true }
    } catch (error) {
      console.error('Cari ödeme silme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 11. Genel Giderler - Getir
  kanalEkle('giderleri-getir', () => {
    try {
      const giderler = db.prepare(`
        SELECT * FROM general_expenses
        ORDER BY expense_date DESC, id DESC
      `).all()
      return { success: true, giderler }
    } catch (error) {
      console.error('Giderleri getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 12. Genel Gider - Ekle
  kanalEkle('gider-ekle', (_event, gider: any) => {
    try {
      const { expense_type, company_name, period, expense_date, due_date, amount, status, payment_date, payment_method, note } = gider

      if (!expense_type || !String(expense_type).trim()) {
        throw new Error('Gider türü boş bırakılamaz.')
      }
      if (!expense_date || !String(expense_date).trim()) {
        throw new Error('Gider tarihi boş bırakılamaz.')
      }

      db.prepare(`
        INSERT INTO general_expenses (
          expense_type, company_name, period, expense_date, due_date, amount, status, payment_date, payment_method, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(expense_type).trim(),
        company_name ? String(company_name).trim() : null,
        period ? String(period).trim() : null,
        String(expense_date).trim(),
        due_date ? String(due_date).trim() : null,
        Number(amount) || 0,
        status || 'Ödenmedi',
        payment_date ? String(payment_date).trim() : null,
        payment_method ? String(payment_method).trim() : null,
        note ? String(note).trim() : null
      )
      return { success: true }
    } catch (error) {
      console.error('Gider ekleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 13. Genel Gider - Güncelle
  kanalEkle('gider-guncelle', (_event, gider: any) => {
    try {
      const { id, expense_type, company_name, period, expense_date, due_date, amount, status, payment_date, payment_method, note } = gider

      if (!id) {
        throw new Error('Güncellenecek gider kaydı bulunamadı.')
      }
      if (!expense_type || !String(expense_type).trim()) {
        throw new Error('Gider türü boş bırakılamaz.')
      }
      if (!expense_date || !String(expense_date).trim()) {
        throw new Error('Gider tarihi boş bırakılamaz.')
      }

      db.prepare(`
        UPDATE general_expenses
        SET expense_type = ?,
            company_name = ?,
            period = ?,
            expense_date = ?,
            due_date = ?,
            amount = ?,
            status = ?,
            payment_date = ?,
            payment_method = ?,
            note = ?
        WHERE id = ?
      `).run(
        String(expense_type).trim(),
        company_name ? String(company_name).trim() : null,
        period ? String(period).trim() : null,
        String(expense_date).trim(),
        due_date ? String(due_date).trim() : null,
        Number(amount) || 0,
        status || 'Ödenmedi',
        payment_date ? String(payment_date).trim() : null,
        payment_method ? String(payment_method).trim() : null,
        note ? String(note).trim() : null,
        Number(id)
      )
      return { success: true }
    } catch (error) {
      console.error('Gider güncelleme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 14. Genel Gider - Sil
  kanalEkle('gider-sil', (_event, id: number) => {
    try {
      const expenseId = Number(id)
      if (!expenseId) {
        throw new Error('Silinecek gider kaydı bulunamadı.')
      }

      db.prepare(`
        DELETE FROM general_expenses
        WHERE id = ?
      `).run(expenseId)
      return { success: true }
    } catch (error) {
      console.error('Gider silme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
