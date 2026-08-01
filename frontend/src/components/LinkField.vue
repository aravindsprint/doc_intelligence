<template>
  <div class="di-linkfield" ref="rootEl">
    <input
      v-model="text"
      class="di-input"
      :placeholder="placeholder"
      @input="onInput"
      @focus="onFocus"
      autocomplete="off"
    />
    <div v-if="open" class="di-linkfield-dropdown">
      <div v-if="loading" class="di-linkfield-loading">Searching…</div>
      <template v-else>
        <div
          v-for="r in results"
          :key="r.value"
          class="di-linkfield-item"
          @mousedown.prevent="select(r)"
        >
          <div class="di-linkfield-item-value">{{ r.value }}</div>
          <div v-if="r.description" class="di-linkfield-item-desc">{{ r.description }}</div>
        </div>
        <div v-if="!results.length" class="di-linkfield-empty">
          No existing {{ doctype }} matches{{ text ? ` for "${text}"` : '' }} — will create new
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { searchLink } from '@/api/frappe'

const props = defineProps({
  modelValue: { type: String, default: '' },
  doctype: { type: String, required: true },
  placeholder: { type: String, default: '' },
  filters: { type: Array, default: null }
})
const emit = defineEmits(['update:modelValue', 'select'])

const text = ref(props.modelValue || '')
const results = ref([])
const loading = ref(false)
const open = ref(false)
const rootEl = ref(null)
let debounceTimer = null

watch(() => props.modelValue, (v) => { if (v !== text.value) text.value = v || '' })

function onInput() {
  emit('update:modelValue', text.value)
  open.value = true
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => runSearch(), 250)
}

function onFocus() {
  open.value = true
  if (!results.value.length) runSearch()
}

async function runSearch() {
  loading.value = true
  try {
    results.value = await searchLink(props.doctype, text.value, props.filters)
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

function select(r) {
  text.value = r.value
  emit('update:modelValue', r.value)
  emit('select', r)
  open.value = false
}

function onClickOutside(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<style scoped>
.di-linkfield { position: relative; }
.di-linkfield-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 40;
  background: #fff; border: 1px solid var(--di-border); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15,23,42,.12); max-height: 240px; overflow-y: auto;
}
.di-linkfield-item { padding: 8px 12px; cursor: pointer; }
.di-linkfield-item:hover { background: #f3f4f6; }
.di-linkfield-item-value { font-size: 13px; font-weight: 600; color: var(--di-text); }
.di-linkfield-item-desc { font-size: 11px; color: var(--di-muted); margin-top: 1px; }
.di-linkfield-loading, .di-linkfield-empty { padding: 8px 12px; font-size: 12px; color: var(--di-muted); }
</style>
