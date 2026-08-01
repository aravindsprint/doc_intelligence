<template>
  <div>
    <div class="di-page-head">
      <h1>Documents</h1>
      <button class="di-btn primary" @click="showUpload = true">+ Upload Document</button>
    </div>

    <div class="di-filters">
      <select v-model="statusFilter" class="di-select" @change="reload">
        <option value="">All statuses</option>
        <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
      </select>
      <select v-model="typeFilter" class="di-select" @change="reload">
        <option value="">All types</option>
        <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>

    <div v-if="selectedIds.length" class="di-selection-bar">
      <span>{{ selectedIds.length }} selected</span>
      <div class="di-selection-actions">
        <button class="di-btn secondary" @click="clearSelection">Clear</button>
        <button class="di-btn danger" :disabled="deleting" @click="confirmBulkDelete">
          {{ deleting ? 'Deleting…' : (confirmingBulkDelete ? 'Click again to confirm' : `Delete ${selectedIds.length}`) }}
        </button>
      </div>
    </div>

    <div v-if="store.error" class="di-error">{{ store.error }}</div>

    <div v-if="store.loading && !store.documents.length" class="di-empty">Loading…</div>

    <div v-else-if="!store.documents.length" class="di-empty">
      No documents yet. Upload one to get started.
    </div>

    <div v-else class="di-doc-grid">
      <router-link
        v-for="doc in store.documents"
        :key="doc.name"
        :to="`/doc-intelligence/documents/${encodeURIComponent(doc.name)}`"
        class="di-doc-card di-card"
        :class="{ selected: selectedIds.includes(doc.name) }"
      >
        <div
          class="di-doc-checkbox"
          :class="{ checked: selectedIds.includes(doc.name) }"
          @click.stop.prevent="toggleSelected(doc.name)"
        >
          <svg v-if="selectedIds.includes(doc.name)" viewBox="0 0 16 16" class="di-doc-checkbox-tick">
            <path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="di-doc-card-top">
          <span class="di-badge" :class="doc.status.toLowerCase()">{{ doc.status }}</span>
          <span class="di-doc-type">{{ doc.document_type }}</span>
        </div>
        <div class="di-doc-title">{{ doc.title }}</div>
        <div class="di-doc-meta">
          <span v-if="doc.provider_used">via {{ doc.provider_used }}</span>
          <span v-if="doc.token_count">{{ doc.token_count }} tokens</span>
        </div>
      </router-link>
    </div>

    <UploadDialog v-if="showUpload" @close="showUpload = false" @uploaded="onUploaded" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useDocumentsStore } from '@/stores/documents'
import * as api from '@/api/frappe'
import UploadDialog from './UploadDialog.vue'

const store = useDocumentsStore()
const statusFilter = ref('')
const typeFilter = ref('')
const showUpload = ref(false)

const statuses = ['Pending', 'Processing', 'Ready', 'Failed']
const types = ['Entities', 'Transactions']

const selectedIds = ref([])
const deleting = ref(false)
const confirmingBulkDelete = ref(false)
let confirmResetTimer = null

function toggleSelected(name) {
  const i = selectedIds.value.indexOf(name)
  if (i === -1) selectedIds.value.push(name)
  else selectedIds.value.splice(i, 1)
}

function clearSelection() {
  selectedIds.value = []
  confirmingBulkDelete.value = false
}

function confirmBulkDelete() {
  if (!confirmingBulkDelete.value) {
    confirmingBulkDelete.value = true
    confirmResetTimer = setTimeout(() => { confirmingBulkDelete.value = false }, 4000)
    return
  }
  clearTimeout(confirmResetTimer)
  deleting.value = true
  api.bulkDeleteDocuments(selectedIds.value)
    .then(result => {
      deleting.value = false
      confirmingBulkDelete.value = false
      selectedIds.value = []
      if (result?.skipped?.length) {
        alert(`${result.deleted.length} deleted. ${result.skipped.length} skipped:\n` +
          result.skipped.map(s => `${s.name}: ${s.reason}`).join('\n'))
      }
      reload()
    })
    .catch(err => {
      deleting.value = false
      confirmingBulkDelete.value = false
      alert(err.message || 'Could not delete the selected documents.')
    })
}

function reload() {
  store.fetchDocuments({ status: statusFilter.value || null, document_type: typeFilter.value || null })
}

function onUploaded() {
  showUpload.value = false
  reload()
}

onMounted(reload)
</script>

<style scoped>
.di-page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.di-page-head h1 { font-size: 22px; margin: 0; color: var(--di-navy); }
.di-filters { display: flex; gap: 10px; margin-bottom: 18px; max-width: 420px; }

.di-selection-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--di-navy); color: #fff; border-radius: 8px;
  padding: 10px 16px; margin-bottom: 14px; font-size: 14px;
}
.di-selection-actions { display: flex; gap: 10px; }

.di-doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.di-doc-card { text-decoration: none; color: inherit; display: block; position: relative; transition: border-color .15s; }
.di-doc-card:hover { border-color: var(--di-blue); }
.di-doc-card.selected { border-color: var(--di-blue); box-shadow: 0 0 0 1px var(--di-blue); }
.di-doc-checkbox {
  position: absolute; top: 10px; right: 10px; width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  border: 2px solid var(--di-border); border-radius: 4px; background: #fff;
  z-index: 2; transition: background .12s, border-color .12s;
}
.di-doc-checkbox:hover { border-color: var(--di-blue); }
.di-doc-checkbox.checked { background: var(--di-blue); border-color: var(--di-blue); }
.di-doc-checkbox-tick { width: 13px; height: 13px; color: #fff; }
.di-doc-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-right: 26px; }
.di-doc-type { font-size: 12px; color: var(--di-muted); }
.di-doc-title {
  font-weight: 600; margin-bottom: 8px;
  overflow-wrap: break-word; word-break: break-word; white-space: normal;
}
.di-doc-meta { display: flex; gap: 10px; font-size: 12px; color: var(--di-muted); }
</style>
