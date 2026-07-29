import db from '../database.js'
import { getActiveMasterSession } from '../session.js'
import { verifyAdminPin } from './settingsController.js'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

const TARIH_FORMATI = /^\d{4}-\d{2}-\d{2}$/

// Yerel (Türkiye) gününü döner. new Date().toISOString() UTC olduğu için gece
// 00:00-03:00 arasında bir önceki günü verir; tarih üretirken hep bu kullanılmalı.
export function bugununTarihi(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function tarihDogrula(tarih: any): string {
  const t = String(tarih || '').trim()
  if (!t) return bugununTarihi()
  if (!TARIH_FORMATI.test(t)) {
    throw new Error('Geçersiz tarih formatı. (YYYY-AA-GG bekleniyor)')
  }
  return t
}

// 'Nakit', 'Kart', 'Kredi Kartı', 'Havale / EFT', 'EFT/Havale' gibi serbest
// yöntem metinlerini 4 sabit gruba indirger.
type YontemGrubu = 'nakit' | 'kart' | 'havale' | 'diger'

function odemeYontemiGrubu(method: any): YontemGrubu {
  const m = String(method || '').toLocaleLowerCase('tr-TR')
  if (m.includes('nakit')) return 'nakit'
  if (m.includes('kart')) return 'kart'
  if (m.includes('havale') || m.includes('eft')) return 'havale'
  return 'diger'
}

function bosYontemToplamlari(): Record<YontemGrubu, number> {
  return { nakit: 0, kart: 0, havale: 0, diger: 0 }
}

// Seçilen günün tüm para giriş/çıkış hareketlerini ve iş emri sayılarını toplar.
// Hem özet ekranı hem de kapanış kaydının snapshot'ı bu fonksiyondan beslenir,
// böylece ekranda görülen ile kaydedilen tutarlar her zaman aynıdır.
export function gunSonuVerisiHesapla(tarih: string) {
  // 1) İş emri tahsilatları (iptal edilmemiş)
  const isEmriTahsilatlari = db.prepare(`
    SELECT
      p.id,
      p.amount,
      p.payment_method,
      p.note,
      p.created_at,
      p.work_order_id,
      v.plate AS vehicle_plate,
      c.name AS customer_name,
      m.name AS received_by_name
    FROM work_order_payments p
    LEFT JOIN work_orders w ON w.id = p.work_order_id
    LEFT JOIN vehicles v ON v.id = w.vehicle_id
    LEFT JOIN customers c ON c.id = v.customer_id
    LEFT JOIN masters m ON m.id = p.received_by
    WHERE p.payment_date = ? AND IFNULL(p.is_cancelled, 0) = 0
    ORDER BY p.id ASC
  `).all(tarih) as any[]

  // 2) Cari tahsilatlar: 'Alacak' yönlü cariden alınan ödeme = para girişi
  const cariTahsilatlari = db.prepare(`
    SELECT p.id, p.amount, p.payment_method, p.description, ca.name AS account_name
    FROM account_payments p
    JOIN current_accounts ca ON ca.id = p.current_account_id
    WHERE p.date = ? AND IFNULL(ca.direction, 'Borç') = 'Alacak'
    ORDER BY p.id ASC
  `).all(tarih) as any[]

  // 3) Cari ödemeler: 'Borç' yönlü cariye (tedarikçi) yapılan ödeme = para çıkışı
  const cariOdemeleri = db.prepare(`
    SELECT p.id, p.amount, p.payment_method, p.description, ca.name AS account_name
    FROM account_payments p
    JOIN current_accounts ca ON ca.id = p.current_account_id
    WHERE p.date = ? AND IFNULL(ca.direction, 'Borç') = 'Borç'
    ORDER BY p.id ASC
  `).all(tarih) as any[]

  // 4) O gün ödenen işletme giderleri = para çıkışı
  const odenenGiderler = db.prepare(`
    SELECT id, expense_type, company_name, amount, payment_method, note
    FROM general_expenses
    WHERE payment_date = ? AND status = 'Ödendi'
    ORDER BY id ASC
  `).all(tarih) as any[]

  // 5) İş emri sayıları (created_at/closed_at UTC saklanır, 'localtime' ile güne çevrilir)
  const acilanIsEmri = (db.prepare(`
    SELECT COUNT(*) AS c FROM work_orders WHERE DATE(created_at, 'localtime') = ?
  `).get(tarih) as any)?.c || 0

  const kapananIsEmri = (db.prepare(`
    SELECT COUNT(*) AS c FROM work_orders
    WHERE closed_at IS NOT NULL AND DATE(closed_at, 'localtime') = ?
  `).get(tarih) as any)?.c || 0

  const acikIsEmri = (db.prepare(`
    SELECT COUNT(*) AS c FROM work_orders WHERE status = 'Açık'
  `).get() as any)?.c || 0

  const yontemTahsilat = bosYontemToplamlari()
  const yontemCikis = bosYontemToplamlari()

  const tahsilatlar = [
    ...isEmriTahsilatlari.map((p) => ({
      kaynak: 'İş Emri',
      aciklama: [p.vehicle_plate, p.customer_name].filter(Boolean).join(' - ') || `İş Emri #${p.work_order_id}`,
      detay: p.note || '',
      alan: p.received_by_name || '',
      yontem: String(p.payment_method || 'Nakit'),
      tutar: Number(p.amount) || 0,
      created_at: p.created_at || null
    })),
    ...cariTahsilatlari.map((p) => ({
      kaynak: 'Cari',
      aciklama: p.account_name || 'Cari Hesap',
      detay: p.description || '',
      alan: '',
      yontem: String(p.payment_method || 'Nakit'),
      tutar: Number(p.amount) || 0,
      created_at: null
    }))
  ]

  const cikislar = [
    ...odenenGiderler.map((g) => ({
      kaynak: 'Gider',
      aciklama: [g.expense_type, g.company_name].filter(Boolean).join(' - '),
      detay: g.note || '',
      yontem: String(g.payment_method || 'Diğer'),
      tutar: Number(g.amount) || 0
    })),
    ...cariOdemeleri.map((p) => ({
      kaynak: 'Tedarikçi Ödemesi',
      aciklama: p.account_name || 'Cari Hesap',
      detay: p.description || '',
      yontem: String(p.payment_method || 'Nakit'),
      tutar: Number(p.amount) || 0
    }))
  ]

  for (const t of tahsilatlar) {
    yontemTahsilat[odemeYontemiGrubu(t.yontem)] += t.tutar
  }
  for (const c of cikislar) {
    yontemCikis[odemeYontemiGrubu(c.yontem)] += c.tutar
  }

  const toplamTahsilat = tahsilatlar.reduce((acc, t) => acc + t.tutar, 0)
  const toplamCikis = cikislar.reduce((acc, c) => acc + c.tutar, 0)

  return {
    tarih,
    tahsilatlar,
    cikislar,
    toplamTahsilat,
    toplamCikis,
    yontemTahsilat,
    yontemCikis,
    // Gün içi nakit hareketi: kasada fiziksel olarak birikmesi beklenen tutar
    beklenenNakit: yontemTahsilat.nakit - yontemCikis.nakit,
    isEmri: {
      acilan: Number(acilanIsEmri),
      kapanan: Number(kapananIsEmri),
      acikToplam: Number(acikIsEmri)
    }
  }
}

// Kapatılmış bir güne geriye dönük para hareketi (ödeme ekleme/iptal/silme)
// yapılmasını engellemek için ortak kontrol. Tarih geçersiz/boşsa ses çıkarmaz;
// gün kapatılmışsa anlaşılır bir hata fırlatır.
export function kapaliGunKontrol(tarih: any): void {
  const t = String(tarih || '').trim()
  if (!TARIH_FORMATI.test(t)) return
  if (kapanisKaydiGetir(t)) {
    const [y, a, g] = t.split('-')
    throw new Error(
      `${g}.${a}.${y} günü için gün sonu kapanışı yapılmış. ` +
      'Bu güne ait para hareketi eklemek veya değiştirmek için önce Gün Sonu ekranından günü yeniden açın.'
    )
  }
}

// Uygulama kapanırken hatırlatma gerekip gerekmediğini söyler: bugün kapanış
// yapılmamışsa VE gün içinde en az bir hareket olduysa true döner. Boş günlerde
// (hiç tahsilat/çıkış/iş emri yoksa) kullanıcıyı rahatsız etmemek için false döner.
export function gunSonuHatirlatmaGerekliMi(): boolean {
  try {
    const bugun = bugununTarihi()
    if (kapanisKaydiGetir(bugun)) return false

    const ozet = gunSonuVerisiHesapla(bugun)
    return (
      ozet.toplamTahsilat > 0 ||
      ozet.toplamCikis > 0 ||
      ozet.isEmri.acilan > 0 ||
      ozet.isEmri.kapanan > 0
    )
  } catch (error) {
    console.error('Gün sonu hatırlatma kontrolü hatası:', error)
    return false
  }
}

function kapanisKaydiGetir(tarih: string) {
  return db.prepare(`
    SELECT dc.*, m.name AS master_name
    FROM daily_closings dc
    LEFT JOIN masters m ON m.id = dc.closed_by_master_id
    WHERE dc.closing_date = ?
  `).get(tarih) || null
}

export function registerClosingHandlers(kanalEkle: (kanal: string, fonksiyon: (...args: any[]) => any) => void) {
  // 1. Gün Sonu Özeti Getir (rapor + varsa o günün kapanış kaydı)
  kanalEkle('gun-sonu-ozeti-getir', (_event, tarih: any) => {
    try {
      const gecerliTarih = tarihDogrula(tarih)
      const ozet = gunSonuVerisiHesapla(gecerliTarih)
      const kapanis = kapanisKaydiGetir(gecerliTarih)
      return { success: true, ozet, kapanis }
    } catch (error) {
      console.error('Gün sonu özeti getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 2. Günü Kapat (snapshot server tarafında yeniden hesaplanarak kaydedilir)
  kanalEkle('gun-sonu-kapat', (_event, veri: any) => {
    try {
      const gecerliTarih = tarihDogrula(veri?.closing_date)

      if (gecerliTarih > bugununTarihi()) {
        throw new Error('Gelecek bir tarih için kapanış yapılamaz.')
      }

      const mevcut = kapanisKaydiGetir(gecerliTarih)
      if (mevcut) {
        throw new Error('Bu gün için zaten kapanış yapılmış.')
      }

      const sayilanNakitHam = veri?.counted_cash
      const sayilanNakit = sayilanNakitHam === null || sayilanNakitHam === undefined || sayilanNakitHam === ''
        ? null
        : Number(sayilanNakitHam)

      if (sayilanNakit !== null && (!Number.isFinite(sayilanNakit) || sayilanNakit < 0)) {
        throw new Error('Sayılan nakit tutarı geçersiz.')
      }

      const not = String(veri?.note || '').trim()
      const ozet = gunSonuVerisiHesapla(gecerliTarih)

      const nakitFarki = sayilanNakit === null ? null : sayilanNakit - ozet.beklenenNakit

      if (nakitFarki !== null && Math.abs(nakitFarki) > 0.009 && !not) {
        throw new Error('Kasa farkı var. Lütfen farkın nedenini not alanına yazın.')
      }

      // Kapatan kimliği main process oturumundan alınır (client'a güvenilmez)
      const session = getActiveMasterSession()
      let closedByMasterId: number | null = null
      let closedByName = 'Bilinmiyor'
      if (session === 'admin') {
        closedByName = 'Admin / Destek'
      } else if (typeof session === 'number' && Number.isFinite(session) && session > 0) {
        closedByMasterId = session
        const master = db.prepare('SELECT name FROM masters WHERE id = ?').get(session) as any
        if (master?.name) closedByName = String(master.name)
      }

      const info = db.prepare(`
        INSERT INTO daily_closings (
          closing_date, total_collected, cash_total, card_total, transfer_total, other_total,
          total_out, expected_cash, counted_cash, cash_difference,
          opened_wo_count, closed_wo_count, open_wo_count,
          note, closed_by_master_id, closed_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        gecerliTarih,
        ozet.toplamTahsilat,
        ozet.yontemTahsilat.nakit,
        ozet.yontemTahsilat.kart,
        ozet.yontemTahsilat.havale,
        ozet.yontemTahsilat.diger,
        ozet.toplamCikis,
        ozet.beklenenNakit,
        sayilanNakit,
        nakitFarki,
        ozet.isEmri.acilan,
        ozet.isEmri.kapanan,
        ozet.isEmri.acikToplam,
        not || null,
        closedByMasterId,
        closedByName
      )

      return { success: true, id: info.lastInsertRowid, kapanis: kapanisKaydiGetir(gecerliTarih) }
    } catch (error) {
      console.error('Gün sonu kapatma hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 3. Günü Yeniden Aç (sadece Admin PIN ile; kapanış kaydı silinir, gün tekrar kapatılabilir)
  kanalEkle('gun-sonu-kapanis-ac', (_event, veri: any) => {
    try {
      const gecerliTarih = tarihDogrula(veri?.closing_date)
      const neden = String(veri?.reason || '').trim()

      if (!neden) {
        throw new Error('Günü yeniden açma nedeni yazılmalıdır.')
      }

      if (!verifyAdminPin(veri?.admin_pin)) {
        return { success: false, error: 'Hatalı Admin PIN.' }
      }

      const mevcut = kapanisKaydiGetir(gecerliTarih) as any
      if (!mevcut) {
        throw new Error('Bu gün için kapanış kaydı bulunamadı.')
      }

      // Açan kimliği main process oturumundan alınır (client'a güvenilmez)
      const session = getActiveMasterSession()
      let reopenedByMasterId: number | null = null
      let reopenedByName = 'Bilinmiyor'
      if (session === 'admin') {
        reopenedByName = 'Admin / Destek'
      } else if (typeof session === 'number' && Number.isFinite(session) && session > 0) {
        reopenedByMasterId = session
        const master = db.prepare('SELECT name FROM masters WHERE id = ?').get(session) as any
        if (master?.name) reopenedByName = String(master.name)
      }

      db.prepare(`
        INSERT INTO daily_closing_reopen_logs (
          closing_date, reason, reopened_by_master_id, reopened_by_name,
          total_collected, counted_cash, cash_difference
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        gecerliTarih,
        neden,
        reopenedByMasterId,
        reopenedByName,
        mevcut.total_collected,
        mevcut.counted_cash,
        mevcut.cash_difference
      )

      db.prepare('DELETE FROM daily_closings WHERE closing_date = ?').run(gecerliTarih)

      // Kalıcı loga iz bırak (electron-log console çıktısını dosyaya da yazar)
      console.log(
        `[GünSonu] ${gecerliTarih} kapanışı yeniden açıldı. Açan: ${reopenedByName}. Neden: ${neden}.`,
        `Silinen kayıt: toplam=${mevcut.total_collected}, sayılan=${mevcut.counted_cash}, fark=${mevcut.cash_difference}, kapatan=${mevcut.closed_by_name}.`
      )

      return { success: true }
    } catch (error) {
      console.error('Gün sonu yeniden açma hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 3b. Günü Yeniden Açma Geçmişi
  kanalEkle('gun-sonu-yeniden-acma-loglari-getir', (_event, limit: any) => {
    try {
      const kayitLimiti = Math.min(Math.max(Number(limit) || 60, 1), 365)
      const loglar = db.prepare(`
        SELECT rl.*, m.name AS master_name
        FROM daily_closing_reopen_logs rl
        LEFT JOIN masters m ON m.id = rl.reopened_by_master_id
        ORDER BY rl.created_at DESC
        LIMIT ?
      `).all(kayitLimiti)
      return { success: true, loglar }
    } catch (error) {
      console.error('Gün sonu yeniden açma logları getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 4. Kapanış Geçmişi
  kanalEkle('gun-sonu-kapanislari-getir', (_event, limit: any) => {
    try {
      const kayitLimiti = Math.min(Math.max(Number(limit) || 60, 1), 365)
      const kapanislar = db.prepare(`
        SELECT dc.*, m.name AS master_name
        FROM daily_closings dc
        LEFT JOIN masters m ON m.id = dc.closed_by_master_id
        ORDER BY dc.closing_date DESC
        LIMIT ?
      `).all(kayitLimiti)
      return { success: true, kapanislar }
    } catch (error) {
      console.error('Kapanış geçmişi getirme hatası:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
