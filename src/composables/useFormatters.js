// Uygulama genelinde para ve tarih gösterimini tek noktadan yönetir.
// Öncesinde 11 farklı dosyada birbirinden az farklı tlFormatla/tarihFormatla
// kopyaları vardı (örn. "1.234,56 ₺" ile "1.234 ₺" karışık kullanılıyordu);
// aynı tutar ekrana göre farklı görünüyordu.
export function useFormatters() {
  const tlFormatla = (deger) => {
    return Number(deger || 0).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' ₺'
  }

  // Sadece tarih (YYYY-MM-DD) alanları için — expense_date, payment_date gibi saat içermeyen değerler
  const tarihFormatla = (tarih) => {
    if (!tarih) return '-'
    try {
      const parts = String(tarih).split('-')
      if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`
      }
      return new Date(tarih).toLocaleDateString('tr-TR')
    } catch (e) {
      return tarih
    }
  }

  // created_at gibi SQLite UTC datetime alanları için (saat dahil).
  // SQLite CURRENT_TIMESTAMP UTC kaydettiği için sonuna Z ekleyip yerel saate çeviriyoruz.
  const tarihSaatFormatla = (tarih) => {
    if (!tarih) return '-'
    const utcTarih = String(tarih).includes('T')
      ? String(tarih)
      : String(tarih).replace(' ', 'T') + 'Z'

    return new Date(utcTarih).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return { tlFormatla, tarihFormatla, tarihSaatFormatla }
}
