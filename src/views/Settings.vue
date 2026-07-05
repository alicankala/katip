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
const sonYedekTarihi = ref(localStorage.getItem('sonYedekTarihi') || 'Yapılmadı')

const telefonErisimi = ref({
  running: false,
  port: 4317,
  ip: '',
  ips: []
})
const telefonYukleniyor = ref(false)

const telefonDurumunuGuncelle = async () => {
  if (window.api?.telefonErisimiDurumGetir) {
    const res = await window.api.telefonErisimiDurumGetir()
    if (res?.success) {
      telefonErisimi.value.running = res.running
      telefonErisimi.value.port = res.port
      telefonErisimi.value.ip = res.ip
      telefonErisimi.value.ips = res.ips || []
    }
  }
}

const telefonErisimiBaslat = async () => {
  if (!window.api?.telefonErisimiBaslat) return
  
  telefonYukleniyor.value = true
  try {
    const res = await window.api.telefonErisimiBaslat(Number(telefonErisimi.value.port))
    if (res?.success) {
      telefonErisimi.value.running = true
      telefonErisimi.value.port = res.port
      telefonErisimi.value.ip = res.ip
      telefonErisimi.value.ips = res.ips || []
    } else {
      alert('Telefon erişimi başlatılamadı: ' + (res?.error || 'Bilinmeyen hata'))
    }
  } catch (error) {
    console.error('Telefon erişimi başlatma hatası:', error)
    alert('Bir hata oluştu.')
  } finally {
    telefonYukleniyor.value = false
  }
}

const telefonErisimiDurdur = async () => {
  if (!window.api?.telefonErisimiDurdur) return

  telefonYukleniyor.value = true
  try {
    const res = await window.api.telefonErisimiDurdur()
    if (res?.success) {
      telefonErisimi.value.running = false
    } else {
      alert('Telefon erişimi durdurulamadı.')
    }
  } catch (error) {
    console.error('Telefon erişimi durdurma hatası:', error)
  } finally {
    telefonYukleniyor.value = false
  }
}

const temaDegistir = () => {
  tema.value = tema.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('uygulamaTema', tema.value)
  document.documentElement.setAttribute('data-theme', tema.value)
  document.documentElement.style.colorScheme = tema.value
  if (tema.value === 'dark') {
    document.documentElement.classList.add('p-dark')
  } else {
    document.documentElement.classList.remove('p-dark')
  }
}

const pinForm = reactive({
  eskiPin: '',
  yeniPin: '',
  yeniPinTekrar: ''
})

const adminPinForm = reactive({
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

const adminPinDegistir = () => {
  adminPinForm.eskiPin = pinTemizle(adminPinForm.eskiPin)
  adminPinForm.yeniPin = pinTemizle(adminPinForm.yeniPin)
  adminPinForm.yeniPinTekrar = pinTemizle(adminPinForm.yeniPinTekrar)

  const currentAdminPin = localStorage.getItem('uygulamaAdminPin') || '0000'

  if (adminPinForm.eskiPin !== currentAdminPin) {
    alert('Eski Admin PIN hatalı.')
    return
  }

  if (adminPinForm.yeniPin.length !== 4) {
    alert('Yeni PIN 4 haneli olmalıdır.')
    return
  }

  if (adminPinForm.yeniPin !== adminPinForm.yeniPinTekrar) {
    alert('Yeni PIN tekrarı aynı değil.')
    return
  }

  localStorage.setItem('uygulamaAdminPin', adminPinForm.yeniPin)
  alert(
    'Admin PIN başarıyla değiştirildi.\n\n' +
    'Güvenlik için uygulama şimdi kapanacak.\n' +
    'Lütfen uygulamayı tekrar açıp yeni PIN ile giriş yapın.'
  )

  Object.assign(adminPinForm, {
    eskiPin: '',
    yeniPin: '',
    yeniPinTekrar: ''
  })

  localStorage.removeItem('aktifUsta')

  if (window.api?.pencereKapat) {
    window.api.pencereKapat()
  } else {
    window.close()
  }
}

const pinDegistir = async () => {
  pinForm.eskiPin = pinTemizle(pinForm.eskiPin)
  pinForm.yeniPin = pinTemizle(pinForm.yeniPin)
  pinForm.yeniPinTekrar = pinTemizle(pinForm.yeniPinTekrar)

  if (aktifUsta.value?.id === 'admin') {
    alert('Destek/Admin PIN kodu bu arayüzden değiştirilemez.')
    return
  }

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
      localStorage.setItem('sonYedekTarihi', new Date().toLocaleString('tr-TR'))
      sonYedekTarihi.value = localStorage.getItem('sonYedekTarihi') || 'Yapılmadı'
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
  if (tema.value === 'dark') {
    document.documentElement.classList.add('p-dark')
  } else {
    document.documentElement.classList.remove('p-dark')
  }

  aktifUsta.value = JSON.parse(localStorage.getItem('aktifUsta') || 'null')
  veritabaniBilgileriniGetir()
  telefonDurumunuGuncelle()
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
      <!-- 1. GENEL BİLGİLER (Visible to Everyone) -->
      <div class="panel settings-card">
        <div class="settings-card-icon">
          <i class="pi pi-info-circle"></i>
        </div>

        <div>
          <h2>Genel Bilgiler</h2>

          <div class="info-box">
            <strong>Uygulama:</strong> Kâtip<br />
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

          <!-- Bilgi Mesajı (Normal Usta/Personel Görebilir) -->
          <div v-if="aktifUsta?.role !== 'admin'" class="normal-user-note">
            <i class="pi pi-shield"></i>
            <span>Teknik bakım ve yedekleme araçları destek kullanıcısına özeldir.</span>
          </div>
        </div>
      </div>

      <!-- 2. PIN DEĞİŞTİR (Normal Usta/Personel Görebilir) -->
      <div v-if="aktifUsta?.role !== 'admin'" class="panel settings-card">
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

      <!-- Admin PIN Değiştir (Sadece Admin Görebilir) -->
      <div v-if="aktifUsta?.role === 'admin'" class="panel settings-card">
        <div class="settings-card-icon">
          <i class="pi pi-key"></i>
        </div>

        <div style="width: 100%;">
          <h2>Admin PIN Değiştir</h2>

          <div class="info-box" style="margin-bottom: 14px; background: rgba(245, 158, 11, 0.03); border-color: rgba(245, 158, 11, 0.2);">
            <strong style="color: #f59e0b;">Aktif Destek Yetkilisi:</strong>
            Alican Kala
          </div>

          <div class="pin-form">
            <div class="form-group">
              <label>Eski Admin PIN</label>
              <InputText
                v-model="adminPinForm.eskiPin"
                type="password"
                maxlength="4"
                placeholder="4 haneli"
                @input="adminPinForm.eskiPin = pinTemizle(adminPinForm.eskiPin)"
              />
            </div>

            <div class="form-group">
              <label>Yeni Admin PIN</label>
              <InputText
                v-model="adminPinForm.yeniPin"
                type="password"
                maxlength="4"
                placeholder="4 haneli"
                @input="adminPinForm.yeniPin = pinTemizle(adminPinForm.yeniPin)"
              />
            </div>

            <div class="form-group">
              <label>Yeni Admin PIN Tekrar</label>
              <InputText
                v-model="adminPinForm.yeniPinTekrar"
                type="password"
                maxlength="4"
                placeholder="4 haneli"
                @input="adminPinForm.yeniPinTekrar = pinTemizle(adminPinForm.yeniPinTekrar)"
              />
            </div>

            <Button
              label="Admin PIN Değiştir"
              icon="pi pi-key"
              severity="warning"
              @click="adminPinDegistir"
            />
          </div>
        </div>
      </div>



      <!-- 3. YEDEKLEME VE SİSTEM (Sadece Admin Görebilir) -->
      <div v-if="aktifUsta?.role === 'admin'" class="panel settings-card">
        <div class="settings-card-icon">
          <i class="pi pi-database"></i>
        </div>

        <div style="width: 100%;">
          <h2>Yedekleme ve Sistem</h2>
          <p style="margin: 0 0 16px; color: var(--text-secondary); font-size: 13.5px;">
            Veritabanı dosyalarını yedekleyebilir, geri yükleyebilir ve konumlarını inceleyebilirsiniz.
          </p>

          <div class="settings-actions" style="margin-bottom: 18px;">
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

          <div class="path-grid">
            <div class="path-box" style="margin-top: 0;">
              <strong>Veritabanı Yolu:</strong>
              <span>{{ veritabaniBilgileri.dbPath || 'Yükleniyor...' }}</span>
            </div>

            <div class="path-box" style="margin-top: 0;">
              <strong>Yedek Klasörü:</strong>
              <span>{{ veritabaniBilgileri.backupDir || 'Yükleniyor...' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. DESTEK & BAKIM PANELİ (Sadece Admin Görebilir) -->
      <div v-if="aktifUsta?.role === 'admin'" class="panel settings-card admin-support-card">
        <div class="settings-card-icon admin-support-icon">
          <i class="pi pi-shield"></i>
        </div>

        <div style="width: 100%;">
          <h2>Destek &amp; Bakım Paneli</h2>
          <p style="margin: 0 0 14px; color: var(--text-secondary); font-size: 13.5px;">
            Sistem durumu, aktif oturum yetkisi ve son işlemler teşhis ekranı.
          </p>

          <div class="admin-panel-grid">
            <div class="admin-info-group">
              <h4><i class="pi pi-info-circle"></i> Sistem Durumu</h4>
              <div class="status-indicator-row">
                <span class="status-indicator-label">Aktif Kullanıcı:</span>
                <span class="status-indicator-value">Alican Kala</span>
              </div>
              <div class="status-indicator-row">
                <span class="status-indicator-label">Uygulama Modu:</span>
                <span class="status-indicator-value text-amber">Destek Modu</span>
              </div>
              <div class="status-indicator-row">
                <span class="status-indicator-label">Veritabanı Bağlantısı:</span>
                <span class="status-indicator-value text-green">
                  <span class="status-dot dot-green"></span> Aktif
                </span>
              </div>
              <div class="status-indicator-row">
                <span class="status-indicator-label">Uygulama Durumu:</span>
                <span class="status-indicator-value text-green">
                  <span class="status-dot dot-green"></span> Çalışıyor
                </span>
              </div>
            </div>

            <div class="admin-info-group">
              <h4><i class="pi pi-clock"></i> Zaman &amp; Yetki</h4>
              <div class="status-indicator-row">
                <span class="status-indicator-label">Son Yedekleme:</span>
                <span class="status-indicator-value text-amber">{{ sonYedekTarihi }}</span>
              </div>
              <div class="status-indicator-row">
                <span class="status-indicator-label">Oturum Tipi:</span>
                <span class="status-indicator-value">Sanal Destek Yetkisi</span>
              </div>
              <div class="status-indicator-row">
                <span class="status-indicator-label">Uzaktan Bağlantı:</span>
                <span class="status-indicator-value">Kullanıma Hazır (Dış Araçlar)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hakkında Bölümü -->
    <div class="settings-about-footer">
      <h3>Kâtip</h3>
      <p>Oto Servis Takip Sistemi</p>
      <span>Alican Kala tarafından hazırlanmıştır.</span>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  color: var(--text-primary);
  min-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
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
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.settings-card-icon i {
  font-size: 24px;
  color: var(--accent-color);
}

.settings-card h2 {
  margin: 0 0 8px;
  color: var(--text-title);
  font-size: 21px;
}

.settings-card p {
  margin: 0 0 16px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.info-box {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
}
.path-box {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  color: var(--text-secondary);
  margin-top: 12px;
  line-height: 1.6;
}

.path-box strong {
  display: block;
  color: var(--text-title);
  margin-bottom: 6px;
}

.path-box span {
  display: block;
  word-break: break-all;
  font-family: Consolas, Monaco, monospace;
  font-size: 14px;
  color: var(--accent-color);
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
  color: var(--text-secondary);
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
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  color: var(--text-secondary);
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.theme-box strong {
  display: block;
  color: var(--text-title);
  margin-bottom: 4px;
}

.theme-box span {
  display: block;
  color: var(--text-muted);
  font-size: 14px;
}

.settings-about-footer {
  margin-top: auto;
  padding-top: 36px;
  border-top: 1px dashed var(--border-color-soft);
  text-align: center;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.6;
}

.settings-about-footer h3 {
  margin: 0 0 4px;
  color: var(--text-secondary);
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.settings-about-footer p {
  margin: 0 0 2px;
  font-weight: 500;
}

.settings-about-footer span {
  font-size: 11.5px;
  opacity: 0.85;
}

/* ── Destek & Bakım Paneli ─────────────────────── */
.admin-support-card {
  border-left: 4px solid #f59e0b !important;
  background: rgba(245, 158, 11, 0.01) !important;
}

.admin-support-icon i {
  color: #f59e0b !important;
}

.admin-panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 14px;
}

.admin-info-group h4 {
  margin: 0 0 10px;
  color: var(--text-title);
  font-size: 13.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-indicator-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color-soft);
  font-size: 13px;
}
.status-indicator-row:last-child {
  border-bottom: none;
}

.status-indicator-label {
  color: var(--text-muted);
}

.status-indicator-value {
  font-weight: 600;
}

.text-amber {
  color: #f59e0b;
}

.text-green {
  color: #10b981;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  position: relative;
}

.dot-green {
  background-color: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.dot-amber {
  background-color: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}

.path-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.normal-user-note {
  background: var(--bg-active-box);
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  padding: 12px 14px;
  color: var(--text-muted);
  margin-top: 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  line-height: 1.4;
}

.normal-user-note i {
  color: var(--accent-color);
  font-size: 16px;
}
</style>