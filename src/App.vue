<script setup>
import Menu from 'primevue/menu'
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const router = useRouter()

const ustalar = ref([])
const seciliUstaId = ref(null)
const pin = ref('')
const girisHatasi = ref('')
const girisYukleniyor = ref(false)
const aktifUsta = ref(null)
const isAdminLogin = ref(false)
const toggleAdminLogin = () => {
  isAdminLogin.value = !isAdminLogin.value
  pin.value = ''
  girisHatasi.value = ''
}
const temaUygula = () => {
  const kayitliTema = localStorage.getItem('uygulamaTema') || 'dark'
  document.documentElement.setAttribute('data-theme', kayitliTema)
  document.documentElement.style.colorScheme = kayitliTema
  if (kayitliTema === 'dark') {
    document.documentElement.classList.add('p-dark')
  } else {
    document.documentElement.classList.remove('p-dark')
  }
}

const menuItems = ref([
  { label: 'Ana Panel', icon: 'pi pi-home', path: '/dashboard', command: () => router.push('/dashboard') },
  { label: 'Servis Kabul', icon: 'pi pi-bolt', path: '/service-reception', command: () => router.push('/service-reception') },
  { label: 'İş Emirleri', icon: 'pi pi-wrench', path: '/work-orders', command: () => router.push('/work-orders') },
  { label: 'Müşteriler', icon: 'pi pi-users', path: '/customers', command: () => router.push('/customers') },
  { label: 'Araçlar', icon: 'pi pi-car', path: '/vehicles', command: () => router.push('/vehicles') },
  { label: 'Parça / Stok', icon: 'pi pi-box', path: '/parts', command: () => router.push('/parts') },
  { label: 'Cari Hesap', icon: 'pi pi-wallet', path: '/current-accounts', command: () => router.push('/current-accounts') },
  { label: 'Genel Giderler', icon: 'pi pi-receipt', path: '/general-expenses', command: () => router.push('/general-expenses') },
  { label: 'İç Kâr Raporu', icon: 'pi pi-chart-line', path: '/profit-report', command: () => router.push('/profit-report') },
  { label: 'Ayarlar', icon: 'pi pi-cog', path: '/settings', command: () => router.push('/settings') }
])

const ustalariYukle = async () => {
  try {
    const res = await window.api.ustalariGetir()

    if (res?.success) {
      ustalar.value = Array.isArray(res.ustalar) ? res.ustalar : []

      if (ustalar.value.length > 0) {
        seciliUstaId.value = ustalar.value[0].id
      }
    } else {
      girisHatasi.value = res?.error || 'Ustalar yüklenemedi.'
    }
  } catch (error) {
    console.error('Ustalar yüklenemedi:', error)
    girisHatasi.value = 'Ustalar yüklenemedi.'
  }
}

const girisYap = async () => {
  girisHatasi.value = ''

  if (isAdminLogin.value) {
    if (!pin.value.trim()) {
      girisHatasi.value = 'Lütfen admin PIN girin.'
      return
    }
    if (pin.value.length !== 4) {
      girisHatasi.value = 'PIN 4 haneli olmalıdır.'
      return
    }

    girisYukleniyor.value = true
    try {
      const storedAdminPin = localStorage.getItem('uygulamaAdminPin') || '0000'
      if (pin.value === storedAdminPin) {
        const adminUser = { id: 'admin', name: 'Alican Kala', role: 'admin' }
        aktifUsta.value = adminUser
        localStorage.setItem('aktifUsta', JSON.stringify(adminUser))
        pin.value = ''
        router.push('/dashboard')
      } else {
        girisHatasi.value = 'Hatalı Admin PIN.'
      }
    } catch (e) {
      console.error('Admin giriş hatası:', e)
      girisHatasi.value = 'Giriş hatası.'
    } finally {
      girisYukleniyor.value = false
    }
    return
  }

  // Normal login
  if (!seciliUstaId.value) {
    girisHatasi.value = 'Lütfen usta seçin.'
    return
  }

  if (!pin.value.trim()) {
    girisHatasi.value = 'Lütfen PIN girin.'
    return
  }
  if (pin.value.length !== 4) {
    girisHatasi.value = 'PIN 4 haneli olmalıdır.'
    return
  }

  girisYukleniyor.value = true

  try {
    const res = await window.api.ustaGirisYap({
      master_id: seciliUstaId.value,
      pin: pin.value
    })

    if (!res?.success) {
      girisHatasi.value = res?.error || 'Giriş yapılamadı.'
      return
    }

    aktifUsta.value = res.usta
    localStorage.setItem('aktifUsta', JSON.stringify(res.usta))

    pin.value = ''
    router.push('/dashboard')
  } catch (error) {
    console.error('Usta giriş hatası:', error)
    girisHatasi.value = 'Giriş yapılamadı.'
  } finally {
    girisYukleniyor.value = false
  }
}

const pinInputDuzenle = (event) => {
  pin.value = String(event.target.value || '').replace(/\D/g, '').slice(0, 4)
}

const pencereKucult = async () => {
  await window.api.pencereKucult()
}

const pencereBuyutKucult = async () => {
  await window.api.pencereBuyutKucult()
}

const pencereKapat = async () => {
  await window.api.pencereKapat()
}

const cikisYap = () => {
  aktifUsta.value = null
  localStorage.removeItem('aktifUsta')
  pin.value = ''
  router.push('/dashboard')
}
const disaridanCikisYap = () => {
  cikisYap()
}
const showPhoneAccessModal = ref(false)
const togglePhoneAccessModal = () => {
  showPhoneAccessModal.value = !showPhoneAccessModal.value
}
const kopyalaAdres = async (text: string) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const input = document.createElement('input')
      input.value = text
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
  } catch (err) {
    console.error('Kopyalama hatasi:', err)
  }
}
const telefonErisimi = ref({
  running: false,
  port: 4317,
  ip: '',
  ips: []
})

const telefonErisimiDurumGetir = async () => {
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
  }
}

const telefonErisimiDurdur = async () => {
  if (!window.api?.telefonErisimiDurdur) return
  try {
    const res = await window.api.telefonErisimiDurdur()
    if (res?.success) {
      telefonErisimi.value.running = false
    } else {
      alert('Telefon erişimi durdurulamadı.')
    }
  } catch (error) {
    console.error('Telefon erişimi durdurma hatası:', error)
  }
}

onMounted(() => {
  temaUygula()
  localStorage.removeItem('aktifUsta')
  ustalariYukle()
  telefonErisimiDurumGetir()
  window.addEventListener('usta-cikis-yapildi', disaridanCikisYap)
})

onUnmounted(() => {
  window.removeEventListener('usta-cikis-yapildi', disaridanCikisYap)
})
</script>

<template>
  <Toast />
  <ConfirmDialog />

  <div class="custom-titlebar">
    <div class="custom-titlebar-left">
      <img
        src="/icon.ico"
        alt="Kâtip"
        class="custom-titlebar-icon"
      />
      <span class="custom-titlebar-title">Kâtip</span>
      <span class="custom-titlebar-separator">|</span>
      <span class="custom-titlebar-subtitle">Servis Takip Sistemi</span>
    </div>

    <div class="custom-titlebar-actions">
      <button
        type="button"
        class="window-btn"
        @click.stop="pencereKucult"
      >
        —
      </button>

      <button
        type="button"
        class="window-btn"
        @click.stop="pencereBuyutKucult"
      >
        □
      </button>

      <button
        type="button"
        class="window-btn close"
        @click.stop="pencereKapat"
      >
        ×
      </button>
    </div>
  </div>

  <div
    v-if="!aktifUsta"
    class="login-page"
  >
    <div class="login-card">
      <div class="login-logo">
        <div class="brand-hero">
          <div class="brand-logo-frame">
            <img
              src="/icon.ico"
              alt="Kâtip"
              class="brand-logo"
            />
          </div>

          <h1>Kâtip</h1>

          <div class="brand-subtitle">
            {{ isAdminLogin ? 'Destek ve Bakım' : 'Servis Takip Sistemi' }}
          </div>
        </div>
      </div>

      <div class="login-form">
        <!-- Normal Usta Giriş Alanı -->
        <div v-if="!isAdminLogin" class="form-group">
          <label>Usta Seçin</label>
          <Dropdown
            v-model="seciliUstaId"
            :options="ustalar"
            optionLabel="name"
            optionValue="id"
            placeholder="Usta seçin"
            style="width: 100%;"
          />
        </div>

        <!-- Admin Başlık Göstergesi -->
        <div v-else class="form-group admin-login-indicator">
          <i class="pi pi-shield"></i>
          <span>Sistem Destek Girişi</span>
        </div>

        <!-- PIN Giriş Alanı (Ortak) -->
        <div class="form-group">
          <label>{{ isAdminLogin ? 'Admin PIN' : 'PIN' }}</label>
          <InputText
            v-model="pin"
            type="password"
            maxlength="4"
            inputmode="numeric"
            placeholder="PIN girin"
            style="width: 100%;"
            @input="pinInputDuzenle"
            @keyup.enter="girisYap"
          />
        </div>

        <div
          v-if="girisHatasi"
          class="login-error"
        >
          {{ girisHatasi }}
        </div>

        <Button
          :label="isAdminLogin ? 'Destek Girişi Yap' : 'Giriş Yap'"
          icon="pi pi-sign-in"
          :loading="girisYukleniyor"
          class="login-button"
          @click="girisYap"
        />

        <!-- Giriş Tipi Değiştirme Linki -->
        <div class="login-toggle-wrapper">
          <a href="#" @click.prevent="toggleAdminLogin" class="login-toggle-link">
            {{ isAdminLogin ? 'Normal Girişe Dön' : 'Destek Girişi' }}
          </a>
          <span class="login-toggle-separator">|</span>
          <a href="#" @click.prevent="togglePhoneAccessModal" class="login-toggle-link">
            Telefon Erişimi
          </a>
        </div>
      </div>
    </div>

    <!-- Telefon Erişimi Modalı -->
    <div v-if="showPhoneAccessModal" class="phone-modal-overlay" @click.self="showPhoneAccessModal = false">
      <div class="phone-modal-content">
        <div class="phone-card-header">
          <i class="pi pi-mobile phone-icon"></i>
          <h3>Telefon Erişimi</h3>
          <span class="status-badge" :class="{ 'status-active': telefonErisimi.running }">
            {{ telefonErisimi.running ? 'Açık' : 'Kapalı' }}
          </span>
        </div>
        
        <div class="phone-card-body">
          <div v-if="telefonErisimi.running" class="phone-address-box">
            <span class="address-label">Bağlantı Adresi:</span>
            <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
              <code class="address-value" style="flex: 1;">http://{{ telefonErisimi.ip }}:{{ telefonErisimi.port }}</code>
              <button 
                class="phone-btn btn-refresh" 
                style="width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;"
                @click="kopyalaAdres('http://' + telefonErisimi.ip + ':' + telefonErisimi.port)"
                title="Adresi Kopyala"
              >
                <i class="pi pi-copy"></i>
              </button>
            </div>
          </div>
          <div v-else class="phone-info-text">
            Telefon bağlantısı için servisi başlatın.
          </div>
        </div>
        
        <div class="phone-card-actions">
          <button 
            v-if="!telefonErisimi.running"
            class="phone-btn btn-start" 
            @click="telefonErisimiBaslat"
          >
            <i class="pi pi-play"></i> Başlat
          </button>
          <button 
            v-else
            class="phone-btn btn-stop" 
            @click="telefonErisimiDurdur"
          >
            <i class="pi pi-stop"></i> Durdur
          </button>
          <button class="phone-btn btn-refresh" @click="telefonErisimiDurumGetir" title="Yenile">
            <i class="pi pi-refresh"></i>
          </button>
          <button class="phone-btn btn-close" @click="showPhoneAccessModal = false">
            Kapat
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else
    class="app-layout"
  >
    <aside class="app-sidebar">
      <!-- Active Master -->
      <div class="active-master-box" :class="{ 'admin-mode-box': aktifUsta?.role === 'admin' }">
        <div class="master-avatar" :class="{ 'admin-avatar': aktifUsta?.role === 'admin' }">
          {{ aktifUsta?.name?.charAt(0)?.toUpperCase() }}
        </div>
        <div class="master-info">
          <span class="master-label">{{ aktifUsta?.role === 'admin' ? 'Destek Modu' : 'Aktif Usta' }}</span>
          <strong class="master-name">{{ aktifUsta?.name }}</strong>
        </div>
        <button class="master-logout-btn" @click="cikisYap" title="Çıkış Yap">
          <i class="pi pi-sign-out"></i>
        </button>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <div class="nav-group">
          <div class="nav-group-label">Operasyon</div>
          <a
            v-for="item in menuItems.slice(0, 3)"
            :key="item.label"
            class="nav-item"
            :class="{ active: $route.path === item.path }"
            @click.prevent="item.command()"
            href="#"
          >
            <i :class="item.icon" class="nav-icon"></i>
            <span>{{ item.label }}</span>
          </a>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Kayıtlar</div>
          <a
            v-for="item in menuItems.slice(3, 6)"
            :key="item.label"
            class="nav-item"
            :class="{ active: $route.path === item.path }"
            @click.prevent="item.command()"
            href="#"
          >
            <i :class="item.icon" class="nav-icon"></i>
            <span>{{ item.label }}</span>
          </a>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Finans &amp; Raporlar</div>
          <a
            v-for="item in menuItems.slice(6, 9)"
            :key="item.label"
            class="nav-item"
            :class="{ active: $route.path === item.path }"
            @click.prevent="item.command()"
            href="#"
          >
            <i :class="item.icon" class="nav-icon"></i>
            <span>{{ item.label }}</span>
          </a>
        </div>

        <div class="nav-group nav-group-bottom">
          <a
            class="nav-item"
            :class="{ active: $route.path === menuItems[9].path }"
            @click.prevent="menuItems[9].command()"
            href="#"
          >
            <i :class="menuItems[9].icon" class="nav-icon"></i>
            <span>{{ menuItems[9].label }}</span>
          </a>
        </div>
      </nav>
    </aside>

    <main class="app-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

:global(*) {
  box-sizing: border-box;
}

/* ── Titlebar ─────────────────────────────────────── */
.custom-titlebar {
  height: 52px;
  width: 100vw;
  flex-shrink: 0;
  background: var(--bg-active-box);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-primary);
  user-select: none;
  -webkit-app-region: drag;
}

.custom-titlebar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 16px;
  color: var(--text-title);
  letter-spacing: -0.01em;
}

.custom-titlebar-separator {
  color: var(--border-color);
  font-weight: 300;
  user-select: none;
}

.custom-titlebar-subtitle {
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.custom-titlebar-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  padding: 3px;
  border: 1px solid var(--border-color-soft);
}

.custom-titlebar-title {
  font-size: 17px;
  font-weight: 800;
}

.custom-titlebar-actions {
  height: 100%;
  display: flex;
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 20;
}

.custom-titlebar-actions * {
  -webkit-app-region: no-drag;
}

.window-btn {
  width: 44px;
  height: 52px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.12s, color 0.12s;
}
.window-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-title);
}
.window-btn.close:hover {
  background: #dc2626;
  color: #ffffff;
}

/* ── Login Page ──────────────────────────────────── */
.login-page {
  height: calc(100vh - 52px);
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* ── Phone Modal Overlay ─────────────────────────── */
.phone-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.phone-modal-content {
  width: 100%;
  max-width: 360px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.phone-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.phone-icon {
  font-size: 16px;
  color: var(--accent-color);
  background: rgba(45, 125, 210, 0.1);
  padding: 6px;
  border-radius: 6px;
}

.phone-card-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-title);
  flex: 1;
}

.status-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #fb923c;
  text-transform: uppercase;
}

.status-badge.status-active {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.phone-card-body {
  font-size: 12.5px;
  min-height: 36px;
  display: flex;
  align-items: center;
}

.phone-address-box {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.address-label {
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 600;
}

.address-value {
  display: block;
  font-family: monospace;
  font-size: 12.5px;
  color: #34d399;
  background: rgba(16, 185, 129, 0.05);
  border: 1px dashed rgba(16, 185, 129, 0.2);
  padding: 4px 8px;
  border-radius: 6px;
  word-break: break-all;
  user-select: all;
}

.phone-info-text {
  color: var(--text-muted);
  font-style: italic;
}

.phone-card-actions {
  display: flex;
  gap: 8px;
}

.phone-btn {
  height: 32px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.btn-start {
  flex: 1;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: #4ade80;
}
.btn-start:hover {
  background: rgba(34, 197, 94, 0.2);
}

.btn-stop {
  flex: 1;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
}
.btn-stop:hover {
  background: rgba(239, 68, 68, 0.2);
}

.btn-refresh {
  width: 32px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-refresh:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-title);
}

.btn-close {
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-title);
}

.login-toggle-separator {
  color: var(--text-muted);
  font-size: 12px;
  margin: 0 8px;
  user-select: none;
}

.login-card {
  width: 100%;
  max-width: 390px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 36px 32px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.login-logo {
  text-align: center;
  margin-bottom: 28px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 14px;
}

.login-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 14px;
}

.login-button {
  width: 100%;
  justify-content: center;
  font-weight: 600;
  height: 42px;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-color-hover)) !important;
  border: none !important;
  box-shadow: 0 4px 12px rgba(45, 125, 210, 0.2);
  transition: all 0.2s ease;
}
.login-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(45, 125, 210, 0.3);
}

.brand-hero {
  padding: 8px 0 16px;
  text-align: center;
}

.brand-logo-frame {
  width: 110px;
  height: 110px;
  margin: 0 auto 18px;
  border-radius: 24px;
  background: linear-gradient(135deg, var(--bg-panel), var(--bg-active-box));
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.25), 0 0 25px rgba(45, 125, 210, 0.18);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.brand-logo-frame:hover {
  transform: scale(1.05);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.3), 0 0 30px rgba(45, 125, 210, 0.28);
}

.brand-logo {
  width: 76px;
  height: 76px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.2));
}

.brand-hero h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  background: linear-gradient(to right, #ffffff, #8fa5be);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-subtitle {
  display: inline-flex;
  margin-top: 8px;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(45, 125, 210, 0.1);
  border: 1px solid rgba(45, 125, 210, 0.25);
  color: #5ba4f5;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* ── App Layout ──────────────────────────────────── */
.app-layout {
  height: calc(100vh - 52px);
  width: 100vw;
  overflow: hidden;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  background: var(--bg-primary);
}

.app-sidebar {
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.app-content {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-primary);
  padding: 22px 24px;
}



/* ── Active Master Box ───────────────────────────── */
.active-master-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: transparent;
}

.admin-mode-box {
  border-bottom: 1px solid rgba(245, 158, 11, 0.3) !important;
  background: rgba(245, 158, 11, 0.02) !important;
}

.master-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-color);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: 0;
}

.admin-avatar {
  background: linear-gradient(135deg, #f59e0b, #d97706) !important;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.25);
}

.master-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0px;
  line-height: 1.25;
}

.master-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.master-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-title);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.master-logout-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.master-logout-btn:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

/* ── Sidebar Navigation ──────────────────────────── */
.sidebar-nav {
  flex: 1;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
}

.nav-group {
  margin-bottom: 4px;
}

.nav-group-bottom {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.nav-group-label {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 14px 12px 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  margin-bottom: 2px;
}

.nav-item:hover {
  background: var(--bg-card-hover);
  color: var(--text-title);
}

.nav-item.active {
  background: rgba(45, 125, 210, 0.1);
  color: #5ba4f5;
  font-weight: 600;
  border-left: 3px solid var(--accent-color);
  padding-left: 9px;
}

.nav-icon {
  font-size: 15px;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: color 0.12s;
}
.nav-item:hover .nav-icon,
.nav-item.active .nav-icon {
  color: var(--accent-color);
}

/* ── Light theme sidebar overrides ──────────────── */
:global(html[data-theme="light"] .app-sidebar) {
  background: #ffffff;
  border-right-color: var(--border-color);
}

:global(html[data-theme="light"] .active-master-box) {
  background: transparent;
  border-bottom-color: var(--border-color);
}
:global(html[data-theme="light"] .nav-item.active) {
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  border-left-color: #2563eb;
}
:global(html[data-theme="light"] .nav-item:hover) {
  background: #f1f5f9;
  color: #0f172a;
}
:global(html[data-theme="light"] .nav-group-bottom) {
  border-top-color: var(--border-color);
}

/* Specialized state components overrides for light mode */
:global(html[data-theme="light"] .low-stock-box) {
  background: #fff7ed !important;
  border-color: #fb923c !important;
  color: #9a3412 !important;
}

:global(html[data-theme="light"] .low-stock-box h3),
:global(html[data-theme="light"] .low-stock-box strong),
:global(html[data-theme="light"] .low-stock-box span),
:global(html[data-theme="light"] .low-stock-box em),
:global(html[data-theme="light"] .low-stock-box p) {
  color: #9a3412 !important;
}

:global(html[data-theme="light"] .existing-vehicle-box) {
  background: #f0fdf4 !important;
  border-color: #22c55e !important;
  color: #166534 !important;
}

:global(html[data-theme="light"] .existing-vehicle-box strong),
:global(html[data-theme="light"] .existing-vehicle-box span) {
  color: #166534 !important;
}

@media (max-width: 900px) {
  .app-layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .app-content {
    padding: 16px;
  }
}

.login-toggle-wrapper {
  text-align: center;
  margin-top: 8px;
}

.login-toggle-link {
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.15s ease;
}

.login-toggle-link:hover {
  color: var(--accent-color);
}

.admin-login-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(245, 158, 11, 0.05);
  border: 1px dashed rgba(245, 158, 11, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
  color: #f59e0b;
  font-size: 13.5px;
  font-weight: 600;
  margin-bottom: 4px;
}

.admin-login-indicator i {
  font-size: 15px;
}
</style>