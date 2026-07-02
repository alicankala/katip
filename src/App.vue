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
  { label: 'Ana Panel', icon: 'pi pi-home', command: () => router.push('/dashboard') },
  { label: 'Servis Kabul', icon: 'pi pi-bolt', command: () => router.push('/service-reception') },
  { label: 'İş Emirleri', icon: 'pi pi-wrench', command: () => router.push('/work-orders') },
  { label: 'Müşteriler', icon: 'pi pi-users', command: () => router.push('/customers') },
  { label: 'Araçlar', icon: 'pi pi-car', command: () => router.push('/vehicles') },
  { label: 'Parça / Stok', icon: 'pi pi-box', command: () => router.push('/parts') },
  { label: 'Cari Hesap', icon: 'pi pi-wallet', command: () => router.push('/current-accounts') },
  { label: 'İç Kâr Raporu', icon: 'pi pi-chart-line', command: () => router.push('/profit-report') },
  { label: 'Ayarlar', icon: 'pi pi-cog', command: () => router.push('/settings') }
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
<div class="sidebar-brand">
  <div class="sidebar-system-title">
    <span>Servis Takip</span>
    <span>Sistemi</span>
  </div>
</div>

      <div class="active-master-box">
        <span>Aktif Usta</span>
        <strong>{{ aktifUsta.name }}</strong>

        <Button
          label="Çıkış"
          icon="pi pi-sign-out"
          size="small"
          severity="secondary"
          outlined
          @click="cikisYap"
        />
      </div>

      <Menu
        :model="menuItems"
        class="app-menu"
      />
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

.custom-titlebar {
  height: 38px;
  width: 100vw;
  flex-shrink: 0;
  background: var(--bg-sidebar);
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
  gap: 9px;
  padding-left: 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-title);
}

.custom-titlebar-icon {
  width: 20px;
  height: 20px;
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
  width: 46px;
  height: 38px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.15s, color 0.15s;
}

.window-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-title);
}

.window-btn.close:hover {
  background: #dc2626;
  color: #ffffff;
}

.login-page {
  height: calc(100vh - 38px);
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
  border-radius: 16px;
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
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 13px;
}

.login-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid #ef4444;
  color: #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
}

.login-button {
  width: 100%;
  justify-content: center;
  font-weight: 600;
}

.brand-hero {
  padding: 24px 16px;
  border-radius: 12px;
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  text-align: center;
}

.brand-logo-frame {
  width: 80px;
  height: 80px;
  margin: 0 auto 16px;
  border-radius: 20px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}

.brand-logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
  display: block;
}

.brand-hero h1 {
  margin: 0;
  color: var(--text-title);
  font-size: 24px;
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
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.app-layout {
  height: calc(100vh - 38px);
  width: 100vw;
  overflow: hidden;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  background: var(--bg-primary);
}

.app-sidebar {
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.app-content {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-primary);
  padding: 24px;
}

.sidebar-brand {
  margin-bottom: 8px;
  text-align: center;
}

.sidebar-system-title {
  padding: 16px 12px;
  border-radius: 12px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}

.sidebar-system-title span {
  color: var(--text-title);
  font-size: 20px;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.active-master-box {
  background: var(--bg-active-box);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.active-master-box span {
  color: var(--text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.active-master-box strong {
  color: var(--text-title);
  font-size: 15px;
  font-weight: 700;
}

/* MENU / SIDEBAR OVERRIDES */
:global(.app-menu),
:global(.app-sidebar .p-menu) {
  background: transparent !important;
  border: none !important;
  color: var(--text-primary) !important;
  padding: 0 !important;
}

:global(.app-sidebar .p-menu-list) {
  background: transparent !important;
  padding: 0 !important;
}

:global(.app-sidebar .p-menuitem-content),
:global(.app-sidebar .p-menu-item-content) {
  background: transparent !important;
  border-radius: 8px !important;
  transition: all 0.15s ease !important;
}

:global(.app-sidebar .p-menuitem-content:hover),
:global(.app-sidebar .p-menu-item-content:hover) {
  background: var(--bg-card-hover) !important;
}

:global(.app-sidebar .p-menuitem-link),
:global(.app-sidebar .p-menu-item-link) {
  background: transparent !important;
  color: var(--text-secondary) !important;
  padding: 10px 12px !important;
}

:global(.app-sidebar .p-menuitem-link:hover),
:global(.app-sidebar .p-menu-item-link:hover) {
  color: var(--text-title) !important;
}

:global(.app-sidebar .p-menuitem-icon),
:global(.app-sidebar .p-menu-item-icon) {
  color: var(--text-muted) !important;
  margin-right: 10px !important;
  font-size: 14px !important;
}

:global(.app-sidebar .p-menuitem-content:hover .p-menuitem-icon) {
  color: var(--accent-color) !important;
}

:global(.app-sidebar .p-menuitem-text),
:global(.app-sidebar .p-menu-item-label) {
  color: var(--text-secondary) !important;
  font-size: 14px !important;
  font-weight: 500 !important;
}

:global(.app-sidebar .p-menuitem-content:hover .p-menuitem-text) {
  color: var(--text-title) !important;
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