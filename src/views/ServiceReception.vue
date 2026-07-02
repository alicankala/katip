<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'

const router = useRouter()
const toast = useToast()

const musteriler = ref([])
const araclar = ref([])
const kaydediliyor = ref(false)
const aktifUsta = ref(null)
const bulunanArac = ref(null)

const form = reactive({
  musteriAd: '',
  musteriTel: '',
  plaka: '',
  marka: '',
  model: '',
  yil: '',
  sase: '',
  km: '',
  sikayet: ''
})

const verileriYukle = async () => {
  musteriler.value = await window.api.musterileriGetir()
  araclar.value = await window.api.araclariGetir()
  plakaKontrolEt()
}

const formuTemizle = () => {
  Object.assign(form, {
    musteriAd: '',
    musteriTel: '',
    plaka: '',
    marka: '',
    model: '',
    yil: '',
    sase: '',
    km: '',
    sikayet: ''
  })

  bulunanArac.value = null
}

const telefonTemizle = (telefon) => {
  return String(telefon || '').replace(/\s+/g, '').trim()
}

const plakaTemizle = (plaka) => {
  return String(plaka || '').trim().toUpperCase().replace(/\s+/g, '')
}

const mevcutMusteriBul = () => {
  const tel = telefonTemizle(form.musteriTel)
  const ad = String(form.musteriAd || '').trim().toLowerCase()

  if (tel) {
    const telIleBulunan = musteriler.value.find(m =>
      telefonTemizle(m.phone) === tel
    )

    if (telIleBulunan) return telIleBulunan
  }

  if (ad) {
    return musteriler.value.find(m =>
      String(m.name || '').trim().toLowerCase() === ad
    )
  }

  return null
}

const mevcutAracBul = () => {
  const plaka = plakaTemizle(form.plaka)

  return araclar.value.find(a =>
    plakaTemizle(a.plate) === plaka
  )
}

const plakaKontrolEt = () => {
  const plaka = plakaTemizle(form.plaka)

  if (!plaka) {
    bulunanArac.value = null
    return
  }

  const mevcutArac = mevcutAracBul()

  if (!mevcutArac) {
    bulunanArac.value = null
    return
  }

  bulunanArac.value = mevcutArac

  form.musteriAd = mevcutArac.customer_name || ''
  form.musteriTel = mevcutArac.customer_phone || ''
  form.plaka = mevcutArac.plate || form.plaka
  form.marka = mevcutArac.brand || ''
  form.model = mevcutArac.model || ''
  form.yil = mevcutArac.year || ''
  form.sase = mevcutArac.chassis || ''
  form.km = mevcutArac.mileage || ''
}

watch(
  () => form.plaka,
  () => {
    plakaKontrolEt()
  }
)

const serviseAl = async () => {
  const aktifUstaBilgisi =
    aktifUsta.value || JSON.parse(localStorage.getItem('aktifUsta') || 'null')

  if (!aktifUstaBilgisi?.id) {
    toast.add({
      severity: 'warn',
      summary: 'Usta Girişi Gerekli',
      detail: 'İş emri açmak için önce usta girişi yapılmalıdır.',
      life: 3000
    })
    return
  }

  if (!form.musteriAd || !form.plaka) {
    toast.add({
      severity: 'warn',
      summary: 'Eksik Bilgi',
      detail: 'Müşteri adı ve plaka zorunludur.',
      life: 3000
    })
    return
  }

  kaydediliyor.value = true

  try {
    await verileriYukle()

    const mevcutArac = mevcutAracBul()
    let vehicleId = mevcutArac?.id || null

    if (!vehicleId) {
      let customerId = null
      const mevcutMusteri = mevcutMusteriBul()

      if (mevcutMusteri) {
        customerId = mevcutMusteri.id
      } else {
        const musteriRes = await window.api.musteriEkle({
          name: form.musteriAd,
          phone: form.musteriTel,
          note: 'Servis kabulden oluşturuldu'
        })

        if (!musteriRes?.success) {
          throw new Error(musteriRes?.error || 'Müşteri oluşturulamadı.')
        }

        customerId = musteriRes.id
      }

const aracRes = await window.api.aracEkle({
  customer_id: customerId,
  plate: plakaTemizle(form.plaka),
  brand: form.marka,
  model: form.model,
  year: form.yil || null,
  mileage: form.km || null,
  chassis: form.sase
})

      if (!aracRes?.success) {
        throw new Error(aracRes?.error || 'Araç oluşturulamadı.')
      }

      vehicleId = aracRes.id
    }

const isEmriRes = await window.api.isEmriEkle({
  vehicle_id: vehicleId,
  description: form.sikayet,
  mileage: form.km,
  total_price: 0,
  status: 'Açık',
  active_master_id: aktifUstaBilgisi.id
})

    if (!isEmriRes?.success) {
      throw new Error(isEmriRes?.error || 'İş emri oluşturulamadı.')
    }

    toast.add({
      severity: 'success',
      summary: 'Servis Kabul Oluşturuldu',
      detail: 'Araç servise alındı ve iş emri açıldı.',
      life: 2500
    })

    formuTemizle()
    await verileriYukle()

    router.push('/work-orders')
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Servis Kabul Hatası',
      detail: error instanceof Error ? error.message : String(error),
      life: 5000
    })
  } finally {
    kaydediliyor.value = false
  }
}

onMounted(() => {
  aktifUsta.value = JSON.parse(localStorage.getItem('aktifUsta') || 'null')
  verileriYukle()
})
</script>

<template>
  <div class="page servis-kabul-page">
    <div class="page-header">
      <div>
<h1 class="page-title">Servis Kabul</h1>

<p class="page-subtitle">
  Müşteri geldiğinde müşteri, araç ve şikâyet bilgilerini tek ekrandan girip iş emri açın.
</p>

<p
  v-if="aktifUsta"
  class="active-master-text"
>
  Aktif Usta: <strong>{{ aktifUsta.name }}</strong>
</p>
      </div>
    </div>

    <div class="reception-layout">
      <div class="panel reception-panel">
        <h2>Müşteri Bilgileri</h2>

        <div class="form-row">
          <div class="form-group">
            <label>Müşteri Ad Soyad *</label>
            <InputText
              v-model="form.musteriAd"
              placeholder="Örn: Ahmet Yılmaz"
              autofocus
            />
          </div>

          <div class="form-group">
            <label>Telefon</label>
            <InputText
              v-model="form.musteriTel"
              placeholder="Örn: 0555 123 45 67"
            />
          </div>
        </div>

        <h2>Araç Bilgileri</h2>

        <div class="form-row">
          <div class="form-group">
            <label>Plaka *</label>
<InputText
  v-model="form.plaka"
  placeholder="Örn: 34 ABC 123"
  @blur="plakaKontrolEt"
/>
<div
  v-if="bulunanArac"
  class="existing-vehicle-box"
>
  <strong>Kayıtlı araç bulundu.</strong>
  <span>
    {{ bulunanArac.customer_name || '-' }}
    -
    {{ bulunanArac.brand || '-' }} {{ bulunanArac.model || '' }}
  </span>
</div>
          </div>

          <div class="form-group">
            <label>Marka</label>
            <InputText
              v-model="form.marka"
              placeholder="Örn: Ford"
            />
          </div>
        </div>

<div class="form-row">
  <div class="form-group">
    <label>Model</label>
    <InputText
      v-model="form.model"
      placeholder="Örn: Focus"
    />
  </div>

  <div class="form-group">
    <label>Model Yılı</label>
    <InputText
      v-model="form.yil"
      type="number"
      placeholder="Örn: 2016"
    />
  </div>
</div>

<div class="form-row">
  <div class="form-group">
    <label>Şase Numarası</label>
    <InputText
      v-model="form.sase"
      placeholder="Örn: VF1xxxxxxxxxxxxx"
    />
  </div>

  <div class="form-group">
    <label>Kilometre</label>
    <InputText
      v-model="form.km"
      type="number"
      placeholder="Örn: 185000"
    />
  </div>
</div>


        <h2>Servis Bilgileri</h2>

        <div class="form-group">
          <label>Müşteri Şikayeti / Yapılacak İşlem</label>
          <Textarea
            v-model="form.sikayet"
            rows="5"
            placeholder="Örn: Araçtan ses geliyor, yağ bakımı yapılacak..."
          />
        </div>

        <div class="actions">
          <Button
            label="Temizle"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            :disabled="kaydediliyor"
            @click="formuTemizle"
          />

          <Button
            label="Servise Al ve İş Emri Aç"
            icon="pi pi-check"
            severity="success"
            :loading="kaydediliyor"
            @click="serviseAl"
          />
        </div>
      </div>

      <div class="panel help-panel">
        <h2>Nasıl çalışır?</h2>

        <p>
          Plaka daha önce kayıtlıysa sistem mevcut aracı kullanır ve doğrudan yeni iş emri açar.
        </p>

        <p>
          Plaka kayıtlı değilse önce müşteri ve araç kaydı oluşturulur, ardından iş emri açılır.
        </p>

        <p>
          Telefon doluysa aynı telefona sahip müşteri bulunmaya çalışılır.
        </p>

        <div class="hint-box">
          <strong>Zorunlu alanlar:</strong>
          <br />
          Müşteri adı ve plaka.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.servis-kabul-page {
  color: #e5e7eb;
}

.reception-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  align-items: start;
}

.reception-panel h2,
.help-panel h2 {
  margin: 0 0 16px;
  color: #f9fafb;
  font-size: 20px;
}

.reception-panel h2:not(:first-child) {
  margin-top: 28px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.form-group label {
  color: #cbd5e1;
  font-size: 14px;
  font-weight: 600;
}

.form-group :deep(input),
.form-group :deep(textarea) {
  width: 100%;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.help-panel p {
  color: #cbd5e1;
  line-height: 1.5;
  margin: 0 0 14px;
}

.hint-box {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 14px;
  color: #e5e7eb;
  margin-top: 20px;
}
:global(html[data-theme="light"] .servis-kabul-page) {
  background: #f3f4f6 !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .servis-kabul-page .panel) {
  background: #ffffff !important;
  border-color: #d1d5db !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .reception-panel h2),
:global(html[data-theme="light"] .help-panel h2) {
  color: #111827 !important;
}

:global(html[data-theme="light"] .help-panel p),
:global(html[data-theme="light"] .active-master-text),
:global(html[data-theme="light"] .form-group label) {
  color: #374151 !important;
}

:global(html[data-theme="light"] .active-master-text strong) {
  color: #111827 !important;
}

:global(html[data-theme="light"] .hint-box) {
  background: #f8fafc !important;
  border-color: #cbd5e1 !important;
  color: #111827 !important;
}

:global(html[data-theme="light"] .hint-box strong) {
  color: #111827 !important;
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

@media (max-width: 1100px) {
  .reception-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
.active-master-text {
  margin: 8px 0 0;
  color: #cbd5e1;
  font-size: 14.5px;
}

.active-master-text strong {
  color: #ffffff;
}
.existing-vehicle-box {
  background: #052e16;
  border: 1px solid #22c55e;
  color: #bbf7d0;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}

.existing-vehicle-box strong {
  color: #ffffff;
  font-size: 14px;
}

.existing-vehicle-box span {
  color: #bbf7d0;
  font-size: 14px;
}
</style>