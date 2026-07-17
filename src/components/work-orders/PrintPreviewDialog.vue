<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  seciliIsEmri: {
    type: Object,
    default: () => null
  },
  kalemler: {
    type: Array,
    default: () => []
  },
  showPaymentSummary: {
    type: Boolean,
    default: true
  },
  odemeOzeti: {
    type: Object,
    default: () => ({
      toplam_tahsilat: 0,
      kalan_borc: 0,
      odeme_durumu: 'Bilinmiyor'
    })
  }
})

const emit = defineEmits(['update:visible', 'error', 'warning'])

const show = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// Helper Formatters
const tlFormatla = (deger) => {
  return `${Number(deger || 0).toLocaleString('tr-TR')} ₺`
}

const tarihFormatla = (tarih) => {
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

const guvenliMetin = (deger) => {
  return String(deger ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const ayariBooleanYap = (val, varsayilan = true) => {
  if (val === undefined || val === null) return varsayilan
  if (typeof val === 'boolean') return val
  const s = String(val).trim().toLowerCase()
  if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false
  if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true
  return Boolean(val)
}

const servisFisiYazdirGercek = async () => {
  let showPayment = true
  try {
    const sRes = await window.api?.ayarlariGetir?.()
    if (sRes?.settings && sRes.settings.show_payment_summary_on_receipt !== undefined) {
      showPayment = ayariBooleanYap(sRes.settings.show_payment_summary_on_receipt, true)
    }
  } catch (e) {
    console.error('Ayar getirilemedi', e)
  }

  if (!props.seciliIsEmri) {
    emit('warning', 'Yazdırılacak iş emri seçilemedi.')
    return
  }

  const isEmri = props.seciliIsEmri

  const firma = {
    unvan: 'Kâtip',
    altBaslik: 'Oto Servis Takip Sistemi',
    aciklama: 'Bakım, onarım ve servis takip fişi'
  }

  const kalemSatirlari = props.kalemler.map((kalem, index) => {
    const tip = kalem.type || '-'

    const aciklama = kalem.type === 'Parça'
      ? `${kalem.part_code || ''} ${kalem.part_name || kalem.description || ''}`.trim()
      : kalem.description || '-'

    return `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${guvenliMetin(tip)}</td>
        <td>${guvenliMetin(aciklama)}</td>
        <td class="right">${guvenliMetin(kalem.quantity || 0)}</td>
        <td class="right">${guvenliMetin(tlFormatla(kalem.unit_price))}</td>
        <td class="right strong">${guvenliMetin(tlFormatla(kalem.total_price))}</td>
      </tr>
    `
  }).join('')

  const toplamTutar = props.kalemler.reduce((toplam, kalem) => {
    return toplam + Number(kalem.total_price || 0)
  }, 0)

  const yazdirmaPenceresi = window.open('', '_blank')

  if (!yazdirmaPenceresi) {
    emit('error', 'Yazdırma penceresi açılamadı.')
    return
  }

  yazdirmaPenceresi.document.write(`
    <!doctype html>
    <html lang="tr">
      <head>
        <meta charset="UTF-8" />
        <title>Servis Fişi - İş Emri ${guvenliMetin(isEmri.id)}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #ffffff;
            font-size: 12.5px;
          }

          .page {
            max-width: 980px;
            margin: 0 auto;
          }

          .top-header {
            display: grid;
            grid-template-columns: 1.4fr 0.8fr;
            gap: 18px;
            align-items: stretch;
            border-bottom: 3px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 18px;
          }

          .company-box {
            display: flex;
            flex-direction: column;
            justify-content: center;
          }

          .company-name {
            font-size: 30px;
            font-weight: 900;
            letter-spacing: -0.5px;
            margin: 0;
            color: #111827;
          }

          .company-subtitle {
            margin-top: 5px;
            color: #374151;
            font-size: 14px;
            font-weight: 700;
          }

          .company-desc {
            margin-top: 8px;
            color: #6b7280;
            font-size: 12px;
          }

          .document-box {
            border: 1px solid #111827;
            border-radius: 8px;
            padding: 12px;
            text-align: right;
          }

          .document-title {
            font-size: 20px;
            font-weight: 900;
            margin-bottom: 8px;
            color: #111827;
          }

          .document-no {
            font-size: 15px;
            font-weight: 800;
            margin-bottom: 5px;
          }

          .muted {
            color: #6b7280;
          }

          .section {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            margin-bottom: 14px;
            overflow: hidden;
          }

          .section-title {
            background: #f3f4f6;
            border-bottom: 1px solid #d1d5db;
            padding: 8px 10px;
            font-weight: 900;
            font-size: 13px;
            color: #111827;
          }

          .section-body {
            padding: 10px;
          }

          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px 18px;
          }

          .info-row {
            display: grid;
            grid-template-columns: 125px 1fr;
            gap: 8px;
            align-items: start;
          }

          .label {
            color: #4b5563;
            font-weight: 700;
          }

          .value {
            color: #111827;
            font-weight: 600;
          }

          .description-box {
            min-height: 54px;
            line-height: 1.45;
            color: #111827;
            white-space: pre-wrap;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th {
            background: #f3f4f6;
            color: #111827;
            font-weight: 900;
            border: 1px solid #d1d5db;
            padding: 8px;
            text-align: left;
          }

          td {
            border: 1px solid #d1d5db;
            padding: 8px;
            vertical-align: top;
          }

          .center {
            text-align: center;
          }

          .right {
            text-align: right;
          }

          .strong {
            font-weight: 900;
          }

          .total-area {
            display: flex;
            justify-content: flex-end;
            margin-top: 12px;
          }

          .total-box {
            min-width: 280px;
            border: 2px solid #111827;
            border-radius: 8px;
            overflow: hidden;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 11px 12px;
            font-size: 15px;
            font-weight: 900;
            background: #f9fafb;
          }

          .warning-note {
            margin-top: 14px;
            border: 2px solid #f59e0b;
            background: #fffbeb;
            color: #92400e;
            padding: 10px 12px;
            border-radius: 8px;
            font-weight: 900;
            line-height: 1.45;
          }

          .footer-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 44px;
            margin-top: 54px;
          }

          .signature-box {
            border-top: 1px solid #111827;
            padding-top: 8px;
            text-align: center;
            font-weight: 800;
          }

          .signature-sub {
            margin-top: 4px;
            color: #6b7280;
            font-size: 11px;
            font-weight: 500;
          }

          .print-actions {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 16px;
          }

          .print-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border: none;
            border-radius: 999px;
            padding: 10px 18px;
            cursor: pointer;
            font-weight: 900;
            font-size: 13px;
            color: #ffffff;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
          }

          .print-btn:hover {
            background: linear-gradient(135deg, #1d4ed8, #1e40af);
          }

          .print-icon {
            font-size: 15px;
            line-height: 1;
          }

          @media print {
            body {
              padding: 0;
            }

            .page {
              max-width: none;
              margin: 0;
            }

            .print-actions {
              display: none;
            }

            .section {
              break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        <div class="page">
          <div class="print-actions">
            <button class="print-btn" onclick="window.print()">
              <span class="print-icon">🖨</span>
              <span>Yazdır</span>
            </button>
          </div>

          <div class="top-header">
            <div class="company-box">
              <h1 class="company-name">${guvenliMetin(firma.unvan)}</h1>
              <div class="company-subtitle">${guvenliMetin(firma.altBaslik)}</div>
              <div class="company-desc">${guvenliMetin(firma.aciklama)}</div>
            </div>

            <div class="document-box">
              <div class="document-title">SERVİS FİŞİ</div>
              <div class="document-no">İş Emri No: #${guvenliMetin(isEmri.id)}</div>
              <div class="muted">Fiş Tarihi: ${guvenliMetin(new Date().toLocaleString('tr-TR'))}</div>
              <div class="muted">Durum: ${guvenliMetin(isEmri.status || '-')}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Müşteri Bilgileri</div>

            <div class="section-body">
              <div class="info-grid">
                <div class="info-row">
                  <div class="label">Müşteri</div>
                  <div class="value">${guvenliMetin(isEmri.customer_name || '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Telefon</div>
                  <div class="value">${guvenliMetin(isEmri.customer_phone || '-')}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Araç ve İş Emri Bilgileri</div>

            <div class="section-body">
              <div class="info-grid">
                <div class="info-row">
                  <div class="label">Plaka</div>
                  <div class="value">${guvenliMetin(isEmri.plate || '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Marka / Model</div>
                  <div class="value">${guvenliMetin(`${isEmri.brand || '-'} / ${isEmri.model || '-'}`)}</div>
                </div>

                <div class="info-row">
                  <div class="label">Şase</div>
                  <div class="value">${guvenliMetin(isEmri.chassis || '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Kilometre</div>
                  <div class="value">${guvenliMetin(isEmri.mileage ? Number(isEmri.mileage).toLocaleString('tr-TR') + ' km' : '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Açılış Tarihi</div>
                  <div class="value">${guvenliMetin(tarihFormatla(isEmri.created_at))}</div>
                </div>

                <div class="info-row">
                  <div class="label">Kapanış Tarihi</div>
                  <div class="value">${guvenliMetin(tarihFormatla(isEmri.closed_at))}</div>
                </div>

                <div class="info-row">
                  <div class="label">Açan Usta</div>
                  <div class="value">${guvenliMetin(isEmri.opened_by_master_name || '-')}</div>
                </div>

                <div class="info-row">
                  <div class="label">Kapatan Usta</div>
                  <div class="value">${guvenliMetin(isEmri.closed_by_master_name || '-')}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Müşteri Şikayeti / Yapılacak İşlem</div>

            <div class="section-body">
              <div class="description-box">${guvenliMetin(isEmri.description || '-')}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Parça ve İşçilik Kalemleri</div>

            <div class="section-body">
              <table>
                <thead>
                  <tr>
                    <th style="width: 42px;" class="center">#</th>
                    <th style="width: 90px;">Tip</th>
                    <th>Açıklama</th>
                    <th style="width: 80px;" class="right">Miktar</th>
                    <th style="width: 120px;" class="right">Birim Fiyat</th>
                    <th style="width: 130px;" class="right">Toplam</th>
                  </tr>
                </thead>

                <tbody>
                  ${kalemSatirlari || `
                    <tr>
                      <td colspan="6" class="center">Bu iş emrine ait kalem bulunamadı.</td>
                    </tr>
                  `}
                </tbody>
              </table>

              <div class="total-area">
                <div class="total-box">
                  <div class="total-row">
                    <span>Genel Toplam</span>
                    <span>${guvenliMetin(tlFormatla(toplamTutar || isEmri.total_price))}</span>
                  </div>
${showPayment ? `
                  <div class="total-row" style="margin-top: 4px; font-size: 12px; color: #555;">
                    <span>Tahsil Edilen:</span>
                    <span>${guvenliMetin(tlFormatla(props.odemeOzeti.toplam_tahsilat))}</span>
                  </div>
                  <div class="total-row" style="font-size: 12px; color: #555;">
                    <span>Kalan Borç:</span>
                    <span>${guvenliMetin(tlFormatla(props.odemeOzeti.kalan_borc))}</span>
                  </div>
                  <div class="total-row" style="font-size: 12px; color: #555;">
                    <span>Ödeme Durumu:</span>
                    <span>${guvenliMetin(props.odemeOzeti.odeme_durumu)}</span>
                  </div>
` : ''}
                </div>
              </div>

              <div class="warning-note">
                Bu belge fatura değildir. E-fatura, e-arşiv fatura veya resmi mali belge yerine geçmez.
                Sadece servis takip ve bilgilendirme fişidir.
              </div>
            </div>
          </div>

          <div class="footer-grid">
            <div class="signature-box">
              Müşteri İmzası
              <div class="signature-sub">Ad Soyad / İmza</div>
            </div>

            <div class="signature-box">
              Servis Yetkilisi
              <div class="signature-sub">${guvenliMetin(isEmri.closed_by_master_name || isEmri.opened_by_master_name || '-')}</div>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
          window.onafterprint = function() {
            window.close();
          };
        <\/script>
      </body>
    </html>
  `)

  yazdirmaPenceresi.document.close()
}
</script>

<template>
  <Dialog
    v-model:visible="show"
    header="Servis Fişi Önizleme"
    :style="{ width: '850px' }"
    modal
  >
    <div class="print-preview-content">
      <div class="preview-sheet">
        <div class="top-header">
          <div class="company-box">
            <h1 class="company-name">Kâtip</h1>
            <div class="company-subtitle">Oto Servis Takip Sistemi</div>
            <div class="company-desc">Bakım, onarım ve servis takip fişi</div>
          </div>

          <div class="document-box">
            <div class="document-title">SERVİS FİŞİ</div>
            <div class="document-no">İş Emri No: #{{ seciliIsEmri?.id }}</div>
            <div class="muted">Fiş Tarihi: {{ new Date().toLocaleString('tr-TR') }}</div>
            <div class="muted">Durum: {{ seciliIsEmri?.status }}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Müşteri Bilgileri</div>
          <div class="section-body">
            <div class="info-grid">
              <div class="info-row">
                <div class="label">Müşteri</div>
                <div class="value">{{ seciliIsEmri?.customer_name || '-' }}</div>
              </div>
              <div class="info-row">
                <div class="label">Telefon</div>
                <div class="value">{{ seciliIsEmri?.customer_phone || '-' }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Araç ve İş Emri Bilgileri</div>
          <div class="section-body">
            <div class="info-grid">
              <div class="info-row">
                <div class="label">Plaka</div>
                <div class="value">{{ seciliIsEmri?.plate || '-' }}</div>
              </div>
              <div class="info-row">
                <div class="label">Marka / Model</div>
                <div class="value">{{ seciliIsEmri?.brand || '-' }} / {{ seciliIsEmri?.model || '-' }}</div>
              </div>
              <div class="info-row">
                <div class="label">Şase</div>
                <div class="value">{{ seciliIsEmri?.chassis || '-' }}</div>
              </div>
              <div class="info-row">
                <div class="label">Kilometre</div>
                <div class="value">{{ seciliIsEmri?.mileage ? Number(seciliIsEmri.mileage).toLocaleString('tr-TR') + ' km' : '-' }}</div>
              </div>
              <div class="info-row">
                <div class="label">Açılış Tarihi</div>
                <div class="value">{{ tarihFormatla(seciliIsEmri?.created_at) }}</div>
              </div>
              <div class="info-row">
                <div class="label">Kapanış Tarihi</div>
                <div class="value">{{ tarihFormatla(seciliIsEmri?.closed_at) }}</div>
              </div>
              <div class="info-row">
                <div class="label">Açan Usta</div>
                <div class="value">{{ seciliIsEmri?.opened_by_master_name || '-' }}</div>
              </div>
              <div class="info-row">
                <div class="label">Kapatan Usta</div>
                <div class="value">{{ seciliIsEmri?.closed_by_master_name || '-' }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Müşteri Şikayeti / Yapılacak İşlem</div>
          <div class="section-body">
            <div class="description-box">{{ seciliIsEmri?.description || '-' }}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Parça ve İşçilik Kalemleri</div>
          <div class="section-body">
            <table>
              <thead>
                <tr>
                  <th style="width: 42px;" class="center">#</th>
                  <th style="width: 90px;">Tip</th>
                  <th>Açıklama</th>
                  <th style="width: 80px;" class="right">Miktar</th>
                  <th style="width: 120px;" class="right">Birim Fiyat</th>
                  <th style="width: 130px;" class="right">Toplam</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(kalem, index) in kalemler" :key="kalem.id || index">
                  <td class="center">{{ index + 1 }}</td>
                  <td>{{ kalem.type || '-' }}</td>
                  <td>
                    {{ kalem.type === 'Parça' ? `${kalem.part_code || ''} ${kalem.part_name || kalem.description || ''}`.trim() : kalem.description || '-' }}
                  </td>
                  <td class="right">{{ kalem.quantity || 0 }}</td>
                  <td class="right">{{ tlFormatla(kalem.unit_price) }}</td>
                  <td class="right strong">{{ tlFormatla(kalem.total_price) }}</td>
                </tr>
                <tr v-if="kalemler.length === 0">
                  <td colspan="6" class="center">Bu iş emrine ait kalem bulunamadı.</td>
                </tr>
              </tbody>
            </table>

            <div class="total-area">
              <div class="total-box">
                <div class="total-row">
                  <span>Genel Toplam</span>
                  <span>{{ tlFormatla(kalemler.reduce((toplam, kalem) => toplam + Number(kalem.total_price || 0), 0) || seciliIsEmri?.total_price) }}</span>
                </div>
                <div class="total-row" style="margin-top: 4px; font-size: 12px; color: #555;" v-if="showPaymentSummary">
                  <span>Tahsil Edilen:</span>
                  <span>{{ tlFormatla(odemeOzeti.toplam_tahsilat) }}</span>
                </div>
                <div class="total-row" style="font-size: 12px; color: #555;" v-if="showPaymentSummary">
                  <span>Kalan Borç:</span>
                  <span>{{ tlFormatla(odemeOzeti.kalan_borc) }}</span>
                </div>
                <div class="total-row" style="font-size: 12px; color: #555;" v-if="showPaymentSummary">
                  <span>Ödeme Durumu:</span>
                  <span>{{ odemeOzeti.odeme_durumu }}</span>
                </div>
              </div>
            </div>

            <div class="warning-note">
              Bu belge fatura değildir. E-fatura, e-arşiv fatura veya resmi mali belge yerine geçmez.
              Sadece servis takip ve bilgilendirme fişidir.
            </div>
          </div>
        </div>

        <div class="footer-grid">
          <div class="signature-box">
            Müşteri İmzası
            <div class="signature-sub">Ad Soyad / İmza</div>
          </div>
          <div class="signature-box">
            Servis Yetkilisi
            <div class="signature-sub">{{ seciliIsEmri?.closed_by_master_name || seciliIsEmri?.opened_by_master_name || '-' }}</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        label="Yazdır"
        icon="pi pi-print"
        style="background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: bold; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);"
        @click="servisFisiYazdirGercek"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.print-preview-content {
  background-color: #1e293b;
  padding: 20px;
  border-radius: 6px;
  max-height: 70vh;
  overflow-y: auto;
}

:global(html[data-theme="light"]) .print-preview-content {
  background-color: #f1f5f9;
}

.preview-sheet {
  background-color: #ffffff;
  color: #111827;
  padding: 30px;
  border-radius: 4px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
  max-width: 800px;
  margin: 0 auto;
}

.preview-sheet .top-header {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr;
  gap: 18px;
  align-items: stretch;
  border-bottom: 3px solid #111827;
  padding-bottom: 16px;
  margin-bottom: 18px;
}

.preview-sheet .company-box {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.preview-sheet .company-name {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.5px;
  margin: 0;
  color: #111827;
}

.preview-sheet .company-subtitle {
  margin-top: 5px;
  color: #374151;
  font-size: 13px;
  font-weight: 700;
}

.preview-sheet .company-desc {
  margin-top: 8px;
  color: #6b7280;
  font-size: 11px;
}

.preview-sheet .document-box {
  border: 1px solid #111827;
  border-radius: 8px;
  padding: 12px;
  text-align: right;
}

.preview-sheet .document-title {
  font-size: 18px;
  font-weight: 900;
  margin-bottom: 8px;
  color: #111827;
}

.preview-sheet .document-no {
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 5px;
}

.preview-sheet .muted {
  color: #6b7280;
}

.preview-sheet .section {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  margin-bottom: 14px;
  overflow: hidden;
  background: #ffffff;
}

.preview-sheet .section-title {
  background: #f3f4f6;
  border-bottom: 1px solid #d1d5db;
  padding: 8px 10px;
  font-weight: 900;
  font-size: 13px;
  color: #111827;
}

.preview-sheet .section-body {
  padding: 10px;
}

.preview-sheet .info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 18px;
}

.preview-sheet .info-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
  align-items: start;
}

.preview-sheet .label {
  color: #4b5563;
  font-weight: 700;
}

.preview-sheet .value {
  color: #111827;
  font-weight: 600;
}

.preview-sheet .description-box {
  min-height: 54px;
  line-height: 1.45;
  color: #111827;
  white-space: pre-wrap;
}

.preview-sheet table {
  width: 100%;
  border-collapse: collapse;
}

.preview-sheet th {
  background: #f3f4f6;
  color: #111827;
  font-weight: 900;
  border: 1px solid #d1d5db;
  padding: 8px;
  text-align: left;
}

.preview-sheet td {
  border: 1px solid #d1d5db;
  padding: 8px;
  vertical-align: top;
  color: #111827;
}

.preview-sheet .center {
  text-align: center;
}

.preview-sheet .right {
  text-align: right;
}

.preview-sheet .strong {
  font-weight: 900;
}

.preview-sheet .total-area {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.preview-sheet .total-box {
  min-width: 280px;
  border: 2px solid #111827;
  border-radius: 8px;
  overflow: hidden;
}

.preview-sheet .total-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 12px;
  font-size: 14px;
  font-weight: 900;
  background: #f9fafb;
  color: #111827;
}

.preview-sheet .warning-note {
  margin-top: 14px;
  border: 2px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  padding: 10px 12px;
  border-radius: 8px;
  font-weight: 900;
  line-height: 1.45;
}

.preview-sheet .footer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 44px;
  margin-top: 40px;
}

.preview-sheet .signature-box {
  border-top: 1px solid #111827;
  padding-top: 8px;
  text-align: center;
  font-weight: 800;
  color: #111827;
}

.preview-sheet .signature-sub {
  margin-top: 4px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 500;
}
</style>
