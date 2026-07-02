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
onMounted(() => {
  temaUygula()
  localStorage.removeItem('aktifUsta')
  ustalariYukle()
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
        alt="Özgehan Otomotiv"
        class="custom-titlebar-icon"
      />
      <span>Özgehan Otomotiv</span>
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
        alt="Özgehan Otomotiv"
        class="brand-logo"
      />
    </div>

    <h1>Özgehan Otomotiv</h1>

    <div class="brand-subtitle">
      Servis Takip Sistemi
    </div>
  </div>
</div>

      <div class="login-form">
        <div class="form-group">
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

        <div class="form-group">
          <label>PIN</label>
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
          label="Giriş Yap"
          icon="pi pi-sign-in"
          :loading="girisYukleniyor"
          class="login-button"
          @click="girisYap"
        />
      </div>
    </div>
  </div>

  <div
    v-else
    class="app-layout"
  >
    <aside class="app-sidebar">
      <!-- Brand Header -->
      <div class="sidebar-brand">
        <div class="sidebar-logo-row">
          <img src="/icon.ico" alt="" class="sidebar-logo-img" />
          <div class="sidebar-brand-text">
            <span class="sidebar-brand-name">Özgehan Otomotiv</span>
            <span class="sidebar-brand-sub">Servis Takip Sistemi</span>
          </div>
        </div>
      </div>

      <!-- Active Master -->
      <div class="active-master-box">
        <div class="master-avatar">{{ aktifUsta.name?.charAt(0)?.toUpperCase() }}</div>
        <div class="master-info">
          <span class="master-label">Aktif Usta</span>
          <strong class="master-name">{{ aktifUsta.name }}</strong>
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
  height: 36px;
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
  gap: 8px;
  padding-left: 14px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-title);
  letter-spacing: 0.01em;
}

.custom-titlebar-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
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
  height: 36px;
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
  height: calc(100vh - 36px);
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
}

.login-logo {
  text-align: center;
  margin-bottom: 24px;
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
}

.brand-hero {
  padding: 22px 16px;
  border-radius: 10px;
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  text-align: center;
}

.brand-logo-frame {
  width: 76px;
  height: 76px;
  margin: 0 auto 14px;
  border-radius: 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-logo {
  width: 52px;
  height: 52px;
  object-fit: contain;
  display: block;
}

.brand-hero h1 {
  margin: 0;
  color: var(--text-title);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.brand-subtitle {
  display: inline-flex;
  margin-top: 10px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ── App Layout ──────────────────────────────────── */
.app-layout {
  height: calc(100vh - 36px);
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

/* ── Sidebar Brand ───────────────────────────────── */
.sidebar-brand {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-logo-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-logo-img {
  width: 34px;
  height: 34px;
  object-fit: contain;
  border-radius: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  padding: 4px;
  flex-shrink: 0;
}

.sidebar-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.sidebar-brand-name {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-title);
  letter-spacing: -0.01em;
}

.sidebar-brand-sub {
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 500;
  margin-top: 1px;
}

/* ── Active Master Box ───────────────────────────── */
.active-master-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(45, 125, 210, 0.05);
}

.master-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-color);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 800;
  flex-shrink: 0;
  letter-spacing: 0;
}

.master-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.master-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 600;
}

.master-name {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-title);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.master-logout-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
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
  padding: 10px 8px 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  margin-bottom: 1px;
}

.nav-item:hover {
  background: var(--bg-card-hover);
  color: var(--text-title);
}

.nav-item.active {
  background: rgba(45, 125, 210, 0.12);
  color: #5ba4f5;
  font-weight: 600;
  border-left: 3px solid var(--accent-color);
  padding-left: 7px;
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
:global(html[data-theme="light"] .sidebar-brand) {
  border-bottom-color: var(--border-color);
}
:global(html[data-theme="light"] .active-master-box) {
  background: rgba(37, 99, 235, 0.04);
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
</style>