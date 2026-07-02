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
  background: #0f172a;
}

:global(*) {
  box-sizing: border-box;
}

.custom-titlebar {
  height: 38px;
  width: 100vw;
  flex-shrink: 0;
  background: #020617;
  border-bottom: 1px solid #1e293b;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #e5e7eb;
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
  color: #f8fafc;
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
  color: #cbd5e1;
  font-size: 15px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.window-btn:hover {
  background: #1e293b;
  color: #ffffff;
}

.window-btn.close:hover {
  background: #dc2626;
  color: #ffffff;
}

.login-page {
  height: calc(100vh - 38px);
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 18px;
  padding: 28px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
}

.login-logo {
  text-align: center;
  margin-bottom: 26px;
}

.login-logo h1 {
  margin: 0;
  color: #ffffff;
  font-size: 30px;
}

.login-logo span {
  display: block;
  margin-top: 8px;
  color: #cbd5e1;
  font-size: 15px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.form-group label {
  color: #e5e7eb;
  font-weight: 600;
  font-size: 14px;
}

.login-error {
  background: #450a0a;
  border: 1px solid #ef4444;
  color: #fecaca;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}

.login-button {
  width: 100%;
  justify-content: center;
}

.brand-hero {
  margin: 14px 14px 22px;
  padding: 20px 14px 18px;
  border-radius: 18px;
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.20), transparent 45%),
    linear-gradient(180deg, #111827 0%, #0f172a 100%);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  text-align: center;
}

.brand-logo-frame {
  width: 86px;
  height: 86px;
  margin: 0 auto 14px;
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(14, 165, 233, 0.12)),
    #020617;
  border: 1px solid rgba(125, 211, 252, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 14px 30px rgba(14, 165, 233, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.brand-logo {
  width: 62px;
  height: 62px;
  object-fit: contain;
  display: block;
}

.brand-hero h1 {
  margin: 0;
  color: #ffffff;
  font-size: 27px;
  line-height: 1.08;
  font-weight: 900;
  letter-spacing: -0.6px;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
}

.brand-subtitle {
  display: inline-flex;
  margin-top: 11px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #bfdbfe;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.app-layout {
  height: calc(100vh - 38px);
  width: 100vw;
  overflow: hidden;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  background: #0f172a;
}

.app-sidebar {
  background: #020617;
  border-right: 1px solid #1e293b;
  padding: 18px;
  overflow: auto;
}

.app-content {
  height: 100%;
  overflow: auto;
  background: #0f172a;
  padding: 24px;
}

.sidebar-brand {
  margin: 0 0 18px;
  padding: 28px 16px;
  border-radius: 20px;
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.22), transparent 55%),
    linear-gradient(180deg, #0f172a 0%, #020617 100%);
  border: 1px solid rgba(148, 163, 184, 0.20);
  box-shadow:
    0 16px 34px rgba(0, 0, 0, 0.30),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  text-align: center;
}

.sidebar-system-title {
  min-height: 92px;
  padding: 18px 14px;
  border-radius: 18px;
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 58%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 1));
  border: 1px solid rgba(96, 165, 250, 0.28);
  box-shadow:
    0 14px 28px rgba(0, 0, 0, 0.30),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.sidebar-system-title span {
  color: #f8fafc;
  font-size: 25px;
  line-height: 1.08;
  font-weight: 900;
}

.active-master-box {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.active-master-box span {
  color: #94a3b8;
  font-size: 12px;
}

.active-master-box strong {
  color: #ffffff;
  font-size: 17px;
}

/* KOYU TEMA - MENÜ */
:global(.app-menu),
:global(.app-sidebar .p-menu) {
  background: transparent !important;
  border: none !important;
  color: #e5e7eb !important;
}

:global(.app-sidebar .p-menu-list) {
  background: transparent !important;
}

:global(.app-sidebar .p-menuitem-content),
:global(.app-sidebar .p-menu-item-content) {
  background: transparent !important;
  border-radius: 10px !important;
}

:global(.app-sidebar .p-menuitem-content:hover),
:global(.app-sidebar .p-menu-item-content:hover) {
  background: #1e293b !important;
}

:global(.app-sidebar .p-menuitem-link),
:global(.app-sidebar .p-menu-item-link) {
  background: transparent !important;
  color: #e5e7eb !important;
}

:global(.app-sidebar .p-menuitem-icon),
:global(.app-sidebar .p-menuitem-text),
:global(.app-sidebar .p-menu-item-icon),
:global(.app-sidebar .p-menu-item-label) {
  color: #e5e7eb !important;
}

/* ORTAK TABLE PANEL */
:global(.table-panel) {
  background: #1e293b;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #334155;
  outline: none;
  box-shadow: none;
}

/* AÇIK TEMA */
:global(html[data-theme="light"]),
:global(html[data-theme="light"] body),
:global(html[data-theme="light"] #app) {
  background: #f3f4f6 !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .custom-titlebar) {
  background: #ffffff !important;
  border-bottom: 1px solid #d1d5db !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .custom-titlebar-left),
:global(html[data-theme="light"] .window-btn) {
  color: #111827 !important;
}

:global(html[data-theme="light"] .window-btn:hover) {
  background: #e5e7eb !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .login-page),
:global(html[data-theme="light"] .app-layout),
:global(html[data-theme="light"] .app-content),
:global(html[data-theme="light"] .page),
:global(html[data-theme="light"] .dashboard-page),
:global(html[data-theme="light"] .settings-page),
:global(html[data-theme="light"] .servis-kabul-page) {
  background: #f3f4f6 !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .login-card),
:global(html[data-theme="light"] .app-sidebar),
:global(html[data-theme="light"] .active-master-box),
:global(html[data-theme="light"] .panel),
:global(html[data-theme="light"] .stat-card),
:global(html[data-theme="light"] .info-panel),
:global(html[data-theme="light"] .settings-card),
:global(html[data-theme="light"] .inline-kalem-panel),
:global(html[data-theme="light"] .inline-empty-panel),
:global(html[data-theme="light"] .history-card),
:global(html[data-theme="light"] .history-detail-grid div),
:global(html[data-theme="light"] .info-box),
:global(html[data-theme="light"] .path-box),
:global(html[data-theme="light"] .theme-box),
:global(html[data-theme="light"] .internal-profit-panel),
:global(html[data-theme="light"] .profit-card),
:global(html[data-theme="light"] .empty-message),
:global(html[data-theme="light"] .stock-empty-box),
:global(html[data-theme="light"] .table-panel) {
  background: #ffffff !important;
  border-color: #d1d5db !important;
  color: #111827 !important;
  box-shadow: none !important;
}

:global(html[data-theme="light"] .brand-hero) {
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 45%),
    linear-gradient(180deg, #ffffff 0%, #f3f4f6 100%) !important;
  border: 1px solid rgba(148, 163, 184, 0.3) !important;
  color: #111827 !important;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05) !important;
}

:global(html[data-theme="light"] .brand-logo-frame) {
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(14, 165, 233, 0.05)),
    #ffffff !important;
  border: 1px solid rgba(125, 211, 252, 0.5) !important;
  box-shadow: 0 8px 20px rgba(14, 165, 233, 0.1) !important;
}

:global(html[data-theme="light"] .sidebar-brand) {
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.12), transparent 55%),
    linear-gradient(180deg, #ffffff 0%, #f3f4f6 100%) !important;
  border: 1px solid rgba(148, 163, 184, 0.3) !important;
  color: #111827 !important;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05) !important;
}

:global(html[data-theme="light"] .sidebar-system-title) {
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.10), transparent 58%),
    linear-gradient(180deg, #ffffff 0%, #f9fafb 100%) !important;
  border: 1px solid rgba(96, 165, 250, 0.4) !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05) !important;
}

:global(html[data-theme="light"] .app-sidebar) {
  border-right: 1px solid #d1d5db !important;
}

/* AÇIK TEMA - MENÜ */
:global(html[data-theme="light"] .app-menu),
:global(html[data-theme="light"] .app-sidebar .p-menu),
:global(html[data-theme="light"] .app-sidebar .p-menu-list) {
  background: transparent !important;
  border: none !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .app-sidebar .p-menuitem-content),
:global(html[data-theme="light"] .app-sidebar .p-menu-item-content) {
  background: transparent !important;
  color: #111827 !important;
  border-radius: 10px !important;
}

:global(html[data-theme="light"] .app-sidebar .p-menuitem-content:hover),
:global(html[data-theme="light"] .app-sidebar .p-menu-item-content:hover) {
  background: #e5e7eb !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .app-sidebar .p-menuitem-link),
:global(html[data-theme="light"] .app-sidebar .p-menu-item-link) {
  background: transparent !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .app-sidebar .p-menuitem-icon),
:global(html[data-theme="light"] .app-sidebar .p-menuitem-text),
:global(html[data-theme="light"] .app-sidebar .p-menu-item-icon),
:global(html[data-theme="light"] .app-sidebar .p-menu-item-label) {
  color: #111827 !important;
}

:global(html[data-theme="light"] h1),
:global(html[data-theme="light"] h2),
:global(html[data-theme="light"] h3),
:global(html[data-theme="light"] strong),
:global(html[data-theme="light"] label),
:global(html[data-theme="light"] .page-title),
:global(html[data-theme="light"] .dashboard-header h1),
:global(html[data-theme="light"] .info-panel h2),
:global(html[data-theme="light"] .settings-card h2),
:global(html[data-theme="light"] .inline-kalem-header h3),
:global(html[data-theme="light"] .history-card-header h3),
:global(html[data-theme="light"] .profit-card strong) {
  color: #111827 !important;
}

:global(html[data-theme="light"] p),
:global(html[data-theme="light"] span),
:global(html[data-theme="light"] small),
:global(html[data-theme="light"] .muted),
:global(html[data-theme="light"] .page-subtitle),
:global(html[data-theme="light"] .dashboard-header p),
:global(html[data-theme="light"] .info-panel p),
:global(html[data-theme="light"] .inline-kalem-header p),
:global(html[data-theme="light"] .history-helper),
:global(html[data-theme="light"] .profit-card span),
:global(html[data-theme="light"] .profit-card small) {
  color: #374151 !important;
}

:global(html[data-theme="light"] .p-inputtext),
:global(html[data-theme="light"] input),
:global(html[data-theme="light"] textarea),
:global(html[data-theme="light"] .p-textarea),
:global(html[data-theme="light"] .p-dropdown),
:global(html[data-theme="light"] .p-select),
:global(html[data-theme="light"] .p-dropdown-label),
:global(html[data-theme="light"] .p-select-label),
:global(html[data-theme="light"] .p-dropdown-trigger),
:global(html[data-theme="light"] .p-select-dropdown) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #cbd5e1 !important;
}

:global(html[data-theme="light"] .p-dropdown-panel),
:global(html[data-theme="light"] .p-select-overlay),
:global(html[data-theme="light"] .p-dropdown-items),
:global(html[data-theme="light"] .p-select-list),
:global(html[data-theme="light"] .p-dropdown-item),
:global(html[data-theme="light"] .p-select-option) {
  background: #ffffff !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .p-dropdown-item:hover),
:global(html[data-theme="light"] .p-dropdown-item.p-highlight),
:global(html[data-theme="light"] .p-dropdown-item.p-focus),
:global(html[data-theme="light"] .p-select-option:hover),
:global(html[data-theme="light"] .p-select-option.p-select-option-selected),
:global(html[data-theme="light"] .p-select-option.p-focus) {
  background: #e5e7eb !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .p-dialog),
:global(html[data-theme="light"] .p-dialog-header),
:global(html[data-theme="light"] .p-dialog-content),
:global(html[data-theme="light"] .p-dialog-footer) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #d1d5db !important;
}

:global(html[data-theme="light"] .p-dialog-title),
:global(html[data-theme="light"] .p-dialog-header-icon),
:global(html[data-theme="light"] .p-dialog-header-close-icon) {
  color: #111827 !important;
}

:global(html[data-theme="light"] .p-datatable),
:global(html[data-theme="light"] .p-datatable-wrapper),
:global(html[data-theme="light"] .p-datatable-table),
:global(html[data-theme="light"] .p-datatable-thead > tr > th),
:global(html[data-theme="light"] .p-datatable-tbody > tr),
:global(html[data-theme="light"] .p-datatable-tbody > tr > td) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #e5e7eb !important;
}

:global(html[data-theme="light"] .p-datatable-tbody > tr:hover),
:global(html[data-theme="light"] .p-datatable-tbody > tr:hover > td) {
  background: #f1f5f9 !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .p-button.p-button-secondary),
:global(html[data-theme="light"] .p-button-secondary) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #cbd5e1 !important;
}

:global(html[data-theme="light"] .p-button.p-button-secondary:hover),
:global(html[data-theme="light"] .p-button-secondary:hover) {
  background: #e5e7eb !important;
  color: #111827 !important;
  border-color: #9ca3af !important;
}

:global(html[data-theme="light"] .brand-subtitle) {
  background: #e5e7eb !important;
  border-color: #cbd5e1 !important;
  color: #1f2937 !important;
}

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

:global(html[data-theme="light"] [style*="#020617"]),
:global(html[data-theme="light"] [style*="#0f172a"]),
:global(html[data-theme="light"] [style*="#111827"]),
:global(html[data-theme="light"] [style*="#1e293b"]),
:global(html[data-theme="light"] [style*="#1f2937"]),
:global(html[data-theme="light"] [style*="#1e1e1e"]) {
  background: #ffffff !important;
  border-color: #d1d5db !important;
  color: #111827 !important;
}

@media (max-width: 900px) {
  .app-layout {
    grid-template-columns: 230px minmax(0, 1fr);
  }

  .app-content {
    padding: 16px;
  }
}
</style>