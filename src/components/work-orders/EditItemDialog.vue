<script setup>
import { computed, watch, reactive } from 'vue'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  form: {
    type: Object,
    required: true
  },
  parcalarListesi: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'save'])

const show = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const kalemDuzenleForm = reactive({
  id: null,
  type: 'Parça',
  part_id: null,
  description: '',
  quantity: 1,
  unit_price: 0
})

const kalemTipleri = ['Parça', 'İşçilik']

// Synchronize local form with props
watch(
  () => props.form,
  (newForm) => {
    if (newForm) {
      Object.assign(kalemDuzenleForm, {
        id: newForm.id,
        type: newForm.type || 'Parça',
        part_id: newForm.type === 'Parça' ? newForm.part_id : null,
        description: newForm.description || '',
        quantity: newForm.quantity || 1,
        unit_price: newForm.unit_price || 0
      })
    }
  },
  { deep: true, immediate: true }
)

const kalemDuzenleParcaSecildi = (partId) => {
  const parca = props.parcalarListesi.find((p) => p.id === partId)
  if (parca) {
    kalemDuzenleForm.description = parca.name
    kalemDuzenleForm.unit_price = parca.sell_price || 0
  }
}

const handleSave = () => {
  emit('save', { ...kalemDuzenleForm })
}
</script>

<template>
  <Dialog
    v-model:visible="show"
    header="Kalem Düzenle"
    :style="{ width: '720px' }"
    modal
  >
    <div style="display: flex; flex-direction: column; gap: 15px; padding-top: 10px;">
      <div class="form-group">
        <label>Tip</label>
        <Dropdown
          v-model="kalemDuzenleForm.type"
          :options="kalemTipleri"
          style="width: 100%"
          @change="Object.assign(kalemDuzenleForm, { part_id: null, description: '', quantity: 1, unit_price: 0 })"
        />
      </div>

      <div
        v-if="kalemDuzenleForm.type === 'Parça'"
        class="form-group"
      >
        <label>Parça Seç</label>
        <Dropdown
          v-model="kalemDuzenleForm.part_id"
          :options="parcalarListesi"
          optionLabel="name"
          optionValue="id"
          filter
          placeholder="Parça ara..."
          style="width: 100%"
          @change="kalemDuzenleParcaSecildi($event.value)"
        >
          <template #option="slotProps">
            <div>
              <strong>{{ slotProps.option.code }}</strong>
              - {{ slotProps.option.name }}
              <span style="color: #aaa;"> | Stok: {{ slotProps.option.stock }}</span>
            </div>
          </template>
        </Dropdown>
      </div>

      <div class="form-group">
        <label>{{ kalemDuzenleForm.type === 'Parça' ? 'Açıklama / Parça Adı' : 'İşçilik Açıklaması *' }}</label>
        <InputText
          v-model="kalemDuzenleForm.description"
          :placeholder="kalemDuzenleForm.type === 'Parça' ? 'Katalog dışı ise buraya yazın (Örn: 5W-30 Motor Yağı)' : 'Örn: Yağ bakım işçiliği'"
          style="width: 100%"
        />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label>Miktar</label>
          <InputText
            type="number"
            v-model="kalemDuzenleForm.quantity"
            style="width: 100%"
          />
        </div>

        <div class="form-group">
          <label>Birim Fiyat</label>
          <InputText
            type="number"
            v-model="kalemDuzenleForm.unit_price"
            style="width: 100%"
          />
        </div>
      </div>

      <div
        style="background: var(--bg-active-box); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; color: var(--text-secondary);"
      >
        Parça miktarı veya parça seçimi değişirse stok hareketi otomatik güncellenir.
      </div>
    </div>

    <template #footer>
      <Button
        label="İptal"
        icon="pi pi-times"
        text
        @click="show = false"
      />

      <Button
        label="Güncelle"
        icon="pi pi-check"
        severity="success"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}
</style>
