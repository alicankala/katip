<script setup>
import { ref, reactive, onMounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const yedekleniyor = ref(false)
const klasorAciliyor = ref(false)
const geriYukleniyor = ref(false)
const veritabaniBilgileri = ref({
  dbPath: '',
  backupDir: ''
})
const aktifUsta = ref(null)
const tema = ref(localStorage.getItem('uygulamaTema') || 'dark')

const temaDegistir = () => {
  tema.value = tema.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('uygulamaTema', tema.value)
  document.documentElement.setAttribute('data-theme', tema.value)
  document.documentElement.style.colorScheme = tema.value
}

const pinForm = reactive({
  eskiPin: '',
  yeniPin: '',
  yeniPinTekrar: ''
})

const yakinda = () => {
  alert('Bu özellik sonraki adımda eklenecek.')
}

const pinTemizle = (deger) => {
  return String(deger || '').replace(/\D/g, '').slice(0, 4)
}

const pinDegistir = async () => {
  pinForm.eskiPin = pinTemizle(pinForm.eskiPin)
  pinForm.yeniPin = pinTemizle(pinForm.yeniPin)
  pinForm.yeniPinTekrar = pinTemizle(pinForm.yeniPinTekrar)

  if (!aktifUsta.value?.id) {
    alert('Aktif usta bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.')
    return
  }

  if (pinForm.eskiPin.length !== 4) {
    alert('Eski PIN 4 haneli olmalıdır.')
    return
  }

  if (pinForm.yeniPin.length !== 4) {
    alert('Yeni PIN 4 haneli olmalıdır.')
    return
  }

  if (pinForm.yeniPin !== pinForm.yeniPinTekrar) {
    alert('Yeni PIN tekrarı aynı değil.')
    return
  }

  if (!window.api || !window.api.ustaPinDegistir) {
    alert('PIN değiştirme API bağlantısı bulunamadı.')
    return
  }

  const res = await window.api.ustaPinDegistir({
    master_id: aktifUsta.value.id,
    eski_pin: pinForm.eskiPin,
    yeni_pin: pinForm.yeniPin
  })

if (res?.success) {
  alert(
    'PIN başarıyla değiştirildi.\n\n' +
    'Güvenlik için uygulama şimdi kapanacak.\n' +
    'Lütfen uygulamayı tekrar açıp yeni PIN ile giriş yapın.'
  )

  Object.assign(pinForm, {
    eskiPin: '',
    yeniPin: '',
    yeniPinTekrar: ''
  })

  localStorage.removeItem('aktifUsta')

  if (window.api?.pencereKapat) {
    await window.api.pencereKapat()
  } else {
    window.close()
  }
} else {
  alert('PIN değiştirilemedi: ' + (res?.error || 'Bilinmeyen hata'))
}
}

const veritabaniYedekle = async () => {
  try {
    if (!window.api || !window.api.veritabaniYedekle) {
      alert('Yedekleme API bağlantısı bulunamadı.')
      return
    }

    yedekleniyor.value = true

    const res = await window.api.veritabaniYedekle()

    if (res && res.success) {
      alert(
        'Veritabanı başarıyla yedeklendi!\n\n' +
        'Yedek Yolu:\n' +
        res.path
      )
    } else {
      alert('Yedekleme başarısız: ' + (res?.error || 'Bilinmeyen hata'))
    }
  } catch (error) {
    alert('Yedekleme sırasında hata oluştu: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    yedekleniyor.value = false
  }
}

const yedekKlasorunuAc = async () => {
  try {
    console.log('[Ayarlar] Yedek klasörü aç butonuna basıldı')

    if (!window.api || !window.api.yedekKlasorunuAc) {
      alert('Yedek klasörü açma API bağlantısı bulunamadı.')
      return
    }

    klasorAciliyor.value = true

    const res = await window.api.yedekKlasorunuAc()

    console.log('[Ayarlar] Yedek klasörü açma sonucu:', res)

    if (!res?.success) {
      alert('Yedek klasörü açılamadı: ' + (res?.error || 'Bilinmeyen hata'))
    }
  } catch (error) {
    console.error('[Ayarlar] Yedek klasörü açma hatası:', error)
    alert('Yedek klasörü açılırken hata oluştu: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    klasorAciliyor.value = false
  }
}
const yedektenGeriYukle = async () => {
  const onay = confirm(
    'Yedekten geri yükleme yapılacak.\n\n' +
    'Mevcut verileriniz geri yükleme öncesinde otomatik yedeklenecek.\n' +
    'Seçtiğiniz yedek dosyası mevcut veritabanının yerine geçecek.\n\n' +
    'Devam etmek istiyor musunuz?'
  )

  if (!onay) return

  try {
    if (!window.api || !window.api.yedektenGeriYukle) {
      alert('Yedekten geri yükleme API bağlantısı bulunamadı.')
      return
    }

    geriYukleniyor.value = true

    const res = await window.api.yedektenGeriYukle()

    if (res?.cancelled) {
      return
    }

if (res?.success) {
  alert(
    'Yedek geri yüklendi.\n\n' +
    'Uygulama şimdi kapanacak.\n' +
    'Lütfen uygulamayı tekrar açın.'
  )
}
    else {
      alert('Yedekten geri yükleme başarısız: ' + (res?.error || 'Bilinmeyen hata'))
    }
  } catch (error) {
    alert('Yedekten geri yükleme sırasında hata oluştu: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    geriYukleniyor.value = false
  }
}
const veritabaniBilgileriniGetir = async () => {
  try {
    if (!window.api || !window.api.veritabaniBilgileriGetir) {
      return
    }

    const res = await window.api.veritabaniBilgileriGetir()

    if (res?.success) {
      veritabaniBilgileri.value = {
        dbPath: res.dbPath || '',
        backupDir: res.backupDir || ''
      }
    }
  } catch (error) {
    console.error('Veritabanı bilgileri alınamadı:', error)
  }
}

onMounted(() => {
  tema.value = localStorage.getItem('uygulamaTema') || 'dark'
  document.documentElement.setAttribute('data-theme', tema.value)
  document.documentElement.style.colorScheme = tema.value

  aktifUsta.value = JSON.parse(localStorage.getItem('aktifUsta') || 'null')
  veritabaniBilgileriniGetir()
})
</script>

<template>
  <div class="page settings-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Ayarlar</h1>
        <p class="page-subtitle">
          Veritabanı, yedekleme ve uygulama ayarlarını buradan yöneteceksiniz.
        </p>
      </div>
    </div>

    <div class="settings-grid">
      <div class="panel settings-card">
        <div class="settings-card-icon">
          <i class="pi pi-database"></i>
        </div>

        <div>
          <h2>Veritabanı ve Yedekleme</h2>

          <div class="settings-actions">
<Button
  label="Verileri Yedekle"
  icon="pi pi-download"
  severity="info"
  :loading="yedekleniyor"
  @click="veritabaniYedekle"
/>

<Button
  label="Yedek Klasörünü Aç"
  icon="pi pi-folder-open"
  severity="secondary"
  outlined
  :loading="klasorAciliyor"
  @click="yedekKlasorunuAc"
/>

<Button
  label="Yedekten Geri Yükle"
  icon="pi pi-upload"
  severity="warning"
  outlined
  :loading="geriYukleniyor"
  @click="yedektenGeriYukle"
/>
          </div>
        </div>
      </div>

      <div class="panel settings-card">
        <div class="settings-card-icon">
          <i class="pi pi-info-circle"></i>
        </div>

        <div>
          <h2>Uygulama Bilgileri</h2>


<div class="info-box">
  <strong>Uygulama:</strong> Özgehan Otomotiv<br />
  <strong>Tür:</strong> Servis Takip Sistemi<br />
  <strong>Not:</strong> Bu uygulama fatura kesmez.
</div>

<div class="theme-box">
  <div>
    <strong>Tema</strong>
    <span>
      Şu an:
      {{ tema === 'dark' ? 'Koyu Tema' : 'Açık Tema' }}
    </span>
  </div>

  <Button
    :label="tema === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'"
    :icon="tema === 'dark' ? 'pi pi-sun' : 'pi pi-moon'"
    severity="secondary"
    outlined
    @click="temaDegistir"
  />
</div>

<div class="path-box">
  <strong>Veritabanı Yolu:</strong>
  <span>{{ veritabaniBilgileri.dbPath || 'Yükleniyor...' }}</span>
</div>

<div class="path-box">
  <strong>Yedek Klasörü:</strong>
  <span>{{ veritabaniBilgileri.backupDir || 'Yükleniyor...' }}</span>
</div>
        </div>
      </div>

      <div class="panel settings-card">
        <div class="settings-card-icon">
          <i class="pi pi-key"></i>
        </div>

        <div style="width: 100%;">
          <h2>PIN Değiştir</h2>

          <div class="info-box" style="margin-bottom: 14px;">
            <strong>Aktif Usta:</strong>
            {{ aktifUsta?.name || 'Usta bilgisi bulunamadı' }}
          </div>

          <div class="pin-form">
            <div class="form-group">
              <label>Eski PIN</label>
              <InputText
                v-model="pinForm.eskiPin"
                type="password"
                maxlength="4"
                placeholder="4 haneli"
                @input="pinForm.eskiPin = pinTemizle(pinForm.eskiPin)"
              />
            </div>

            <div class="form-group">
              <label>Yeni PIN</label>
              <InputText
                v-model="pinForm.yeniPin"
                type="password"
                maxlength="4"
                placeholder="4 haneli"
                @input="pinForm.yeniPin = pinTemizle(pinForm.yeniPin)"
              />
            </div>

            <div class="form-group">
              <label>Yeni PIN Tekrar</label>
              <InputText
                v-model="pinForm.yeniPinTekrar"
                type="password"
                maxlength="4"
                placeholder="4 haneli"
                @input="pinForm.yeniPinTekrar = pinTemizle(pinForm.yeniPinTekrar)"
              />
            </div>

            <Button
              label="PIN Değiştir"
              icon="pi pi-key"
              severity="warning"
              @click="pinDegistir"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  color: #e5e7eb;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}

.settings-card {
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

.settings-card-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: #1e293b;
  border: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.settings-card-icon i {
  font-size: 24px;
  color: #38bdf8;
}

.settings-card h2 {
  margin: 0 0 8px;
  color: #f9fafb;
  font-size: 21px;
}

.settings-card p {
  margin: 0 0 16px;
  color: #cbd5e1;
  line-height: 1.5;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.info-box {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 14px;
  color: #cbd5e1;
  line-height: 1.7;
}
.path-box {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 14px;
  color: #cbd5e1;
  margin-top: 12px;
  line-height: 1.6;
}

.path-box strong {
  display: block;
  color: #f9fafb;
  margin-bottom: 6px;
}

.path-box span {
  display: block;
  word-break: break-all;
  font-family: Consolas, Monaco, monospace;
  font-size: 13px;
  color: #93c5fd;
}

.pin-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr)) auto;
  gap: 12px;
  align-items: end;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  color: #cbd5e1;
  font-size: 14px;
}


@media (max-width: 700px) {
  .settings-card {
    flex-direction: column;
  }

  .settings-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .pin-form {
    grid-template-columns: 1fr;
  }
}
.theme-box {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 14px;
  color: #cbd5e1;
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.theme-box strong {
  display: block;
  color: #f9fafb;
  margin-bottom: 4px;
}

.theme-box span {
  display: block;
  color: #94a3b8;
  font-size: 13px;
}

:global(html[data-theme="light"] .theme-box) {
  background: #ffffff !important;
  border-color: #d1d5db !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .theme-box strong) {
  color: #111827 !important;
}

:global(html[data-theme="light"] .theme-box span) {
  color: #374151 !important;
}
</style>