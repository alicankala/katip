<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { yardimBolumleri } from '../data/helpContent.js'

const route = useRoute()

const aramaMetni = ref('')
const aktifBolumId = ref(yardimBolumleri[0].id)
const acikKonular = ref({})

const normalize = (metin) =>
  String(metin || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[iı]/g, 'i')

const aramaAktif = computed(() => normalize(aramaMetni.value).trim().length >= 2)

// Arama yapılırken bölüm ayrımı kaldırılır, eşleşen tüm konular listelenir.
const gosterilenBolumler = computed(() => {
  if (!aramaAktif.value) {
    return yardimBolumleri.filter((b) => b.id === aktifBolumId.value)
  }

  const aranan = normalize(aramaMetni.value).trim()

  return yardimBolumleri
    .map((bolum) => ({
      ...bolum,
      konular: bolum.konular.filter((konu) => {
        const havuz = normalize(
          [konu.baslik, konu.ozet, konu.ipucu || '', ...konu.adimlar].join(' ')
        )
        return havuz.includes(aranan)
      })
    }))
    .filter((bolum) => bolum.konular.length > 0)
})

const sonucSayisi = computed(() =>
  gosterilenBolumler.value.reduce((toplam, bolum) => toplam + bolum.konular.length, 0)
)

const konuAcik = (konuId) => !!acikKonular.value[konuId]

const konuAcKapa = (konuId) => {
  acikKonular.value = { ...acikKonular.value, [konuId]: !acikKonular.value[konuId] }
}

const bolumSec = (bolumId) => {
  aramaMetni.value = ''
  aktifBolumId.value = bolumId
  document.querySelector('.help-content')?.scrollTo({ top: 0, behavior: 'smooth' })
}

const tumunuAc = () => {
  const yeni = {}
  for (const bolum of gosterilenBolumler.value) {
    for (const konu of bolum.konular) yeni[konu.id] = true
  }
  acikKonular.value = { ...acikKonular.value, ...yeni }
}

const tumunuKapat = () => {
  acikKonular.value = {}
}

const kurulumSihirbaziniAc = () => {
  window.dispatchEvent(new CustomEvent('kurulum-sihirbazi-ac'))
}

// Boş liste ekranlarındaki "Nasıl yapılır?" düğmeleri /help?konu=... adresine
// yönlendirir; ilgili konu açılıp ekrana kaydırılır.
const konuyaGit = async (konuId) => {
  if (!konuId) return

  const bolum = yardimBolumleri.find((b) => b.konular.some((k) => k.id === konuId))
  if (!bolum) return

  aramaMetni.value = ''
  aktifBolumId.value = bolum.id
  acikKonular.value = { ...acikKonular.value, [konuId]: true }

  await nextTick()
  document.getElementById(`konu-${konuId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

onMounted(() => konuyaGit(route.query.konu))
watch(() => route.query.konu, (yeni) => konuyaGit(yeni))
</script>

<template>
  <div class="help-page">
    <div class="help-header">
      <div>
        <h2>Yardım Merkezi</h2>
        <p class="help-subtitle">Kâtip'te bir işin nasıl yapıldığını buradan adım adım öğrenebilirsiniz.</p>
      </div>

      <div class="help-header-actions">
        <Button
          label="Kurulum Sihirbazı"
          icon="pi pi-compass"
          severity="secondary"
          outlined
          size="small"
          @click="kurulumSihirbaziniAc"
        />
      </div>
    </div>

    <div class="help-search-row">
      <span class="p-input-icon-left help-search">
        <i class="pi pi-search" />
        <InputText v-model="aramaMetni" placeholder="Ne yapmak istiyorsunuz? (örn. ödeme, yedek, telefon)" />
      </span>

      <div class="help-search-tools">
        <span v-if="aramaAktif" class="help-search-count">{{ sonucSayisi }} sonuç</span>
        <Button label="Tümünü Aç" icon="pi pi-angle-double-down" text size="small" @click="tumunuAc" />
        <Button label="Tümünü Kapat" icon="pi pi-angle-double-up" text size="small" @click="tumunuKapat" />
      </div>
    </div>

    <div class="help-body">
      <aside class="help-nav">
        <button
          v-for="bolum in yardimBolumleri"
          :key="bolum.id"
          type="button"
          class="help-nav-item"
          :class="{ active: !aramaAktif && aktifBolumId === bolum.id }"
          @click="bolumSec(bolum.id)"
        >
          <i :class="bolum.ikon"></i>
          <span>{{ bolum.baslik }}</span>
        </button>

        <div class="help-nav-note">
          <i class="pi pi-info-circle"></i>
          <span>Aradığınızı bulamazsanız yukarıdaki arama kutusunu kullanın.</span>
        </div>
      </aside>

      <div class="help-content">
        <div v-if="aramaAktif && sonucSayisi === 0" class="help-no-result">
          <i class="pi pi-search-minus"></i>
          <h3>Sonuç bulunamadı</h3>
          <p>"{{ aramaMetni }}" için bir konu yok. Daha kısa bir kelime deneyin (örn. "ödeme", "stok", "yedek").</p>
        </div>

        <section v-for="bolum in gosterilenBolumler" :key="bolum.id" class="help-section">
          <div v-if="aramaAktif" class="help-section-label">
            <i :class="bolum.ikon"></i>
            <span>{{ bolum.baslik }}</span>
          </div>

          <article
            v-for="konu in bolum.konular"
            :key="konu.id"
            :id="`konu-${konu.id}`"
            class="help-card"
            :class="{ open: konuAcik(konu.id) }"
          >
            <button type="button" class="help-card-head" @click="konuAcKapa(konu.id)">
              <div class="help-card-titles">
                <strong>{{ konu.baslik }}</strong>
                <span>{{ konu.ozet }}</span>
              </div>
              <i class="pi" :class="konuAcik(konu.id) ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
            </button>

            <div v-if="konuAcik(konu.id)" class="help-card-body">
              <ol class="help-steps">
                <li v-for="(adim, i) in konu.adimlar" :key="i">{{ adim }}</li>
              </ol>

              <div v-if="konu.ipucu" class="help-tip">
                <i class="pi pi-lightbulb"></i>
                <span>{{ konu.ipucu }}</span>
              </div>
            </div>
          </article>
        </section>
      </div>
    </div>

  </div>
</template>

<style scoped>
.help-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

.help-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.help-header h2 { margin: 0; }

.help-subtitle {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.help-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.help-search-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.help-search { width: min(460px, 100%); }
.help-search :deep(input) { width: 100%; }

.help-search-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.help-search-count {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-right: 6px;
}

.help-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.help-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.help-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--fs-sm);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.help-nav-item:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.help-nav-item.active {
  background: var(--bg-panel);
  border-color: var(--border-color);
  color: var(--text-title);
  font-weight: 600;
}

.help-nav-item i { font-size: 14px; }

.help-nav-note {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: var(--fs-xs);
  line-height: 1.5;
}

.help-content {
  overflow-y: auto;
  padding-right: 4px;
}

.help-section { margin-bottom: 18px; }

.help-section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px 2px;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.help-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.help-card.open { border-color: var(--accent-color); }

.help-card-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.help-card-head:hover { background: var(--bg-card-hover); }

.help-card-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.help-card-titles strong {
  color: var(--text-title);
  font-size: var(--fs-base);
  font-weight: 600;
}

.help-card-titles span {
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.help-card-head i { color: var(--text-muted); font-size: 13px; }

.help-card-body {
  padding: 0 16px 16px 16px;
  border-top: 1px solid var(--border-color-soft);
}

.help-steps {
  margin: 14px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.6;
}

.help-steps li::marker {
  color: var(--accent-color);
  font-weight: 700;
}

.help-tip {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--status-pending-bg);
  border: 1px solid rgba(245, 158, 11, 0.28);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.55;
}

.help-tip i { color: var(--status-pending); margin-top: 2px; }

.help-no-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  padding: 48px 20px;
  color: var(--text-muted);
}

.help-no-result i { font-size: 28px; margin-bottom: 8px; }
.help-no-result h3 { margin: 0; color: var(--text-title); font-size: var(--fs-md); }
.help-no-result p { margin: 0; font-size: var(--fs-sm); max-width: 380px; }

@media (max-width: 1100px) {
  .help-body { grid-template-columns: 1fr; }
  .help-nav { flex-direction: row; flex-wrap: wrap; }
}
</style>
