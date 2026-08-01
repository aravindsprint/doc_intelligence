<template>
  <div class="di-modal-backdrop" @click.self="$emit('close')">
    <div class="di-modal di-card">
      <h2>Upload Document</h2>

      <div v-if="error" class="di-error">{{ error }}</div>

      <!-- Single-file mode: title + type apply to the one file -->
      <template v-if="mode !== 'batch'">
        <label class="di-label">Title</label>
        <input v-model="title" class="di-input" placeholder="e.g. Vendor Agreement — Acme Ltd" />

        <label class="di-label" style="margin-top:12px">Document type</label>
        <select v-model="documentType" class="di-select">
          <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
        </select>
      </template>

      <!-- Batch mode: type applies to all files, each keeps its own filename as title -->
      <template v-else>
        <label class="di-label">Document type (applies to all {{ batchFiles.length }} files)</label>
        <select v-model="documentType" class="di-select">
          <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
        </select>
      </template>

      <label class="di-label" style="margin-top:12px">File</label>

      <!-- Nothing chosen yet: initial choices -->
      <div v-if="!file && !batchFiles.length && !capturedPhotos.length" class="di-file-choices">
        <label class="di-btn secondary di-file-choice">
          📁 Choose File(s)
          <input type="file" accept="*/*" multiple @change="onFilesChosen" class="di-hidden-input" />
        </label>
        <button type="button" class="di-btn secondary di-file-choice" @click="captureNextPhoto">
          📷 Take Photo
        </button>
      </div>

      <!-- Multi-photo capture in progress -->
      <div v-if="capturedPhotos.length" class="di-capture-area">
        <p class="di-hint">{{ capturedPhotos.length }} photo{{ capturedPhotos.length > 1 ? 's' : '' }} captured — add more pages, or combine into one document.</p>
        <div class="di-photo-strip">
          <div v-for="(ph, i) in capturedPhotos" :key="i" class="di-photo-thumb-wrap">
            <img :src="ph.previewUrl" class="di-photo-thumb" />
            <span class="di-photo-num">{{ i + 1 }}</span>
            <button type="button" class="di-photo-remove" @click="removePhoto(i)">✕</button>
          </div>
        </div>
        <div class="di-capture-actions">
          <button type="button" class="di-btn secondary" @click="captureNextPhoto">➕ Add Another Photo</button>
          <button type="button" class="di-btn primary" :disabled="combining" @click="combinePhotosToPdf">
            {{ combining ? 'Combining…' : `Use ${capturedPhotos.length} Photo${capturedPhotos.length > 1 ? 's' : ''} as Document` }}
          </button>
        </div>
        <button type="button" class="di-btn secondary di-cancel-capture" @click="clearCapturedPhotos">Cancel</button>
      </div>

      <!-- Single file chosen/combined -->
      <div v-else-if="file" class="di-file-preview">
        <img v-if="previewUrl" :src="previewUrl" class="di-file-thumb" />
        <div v-else class="di-file-thumb di-file-thumb-generic">📄</div>
        <div class="di-file-preview-info">
          <div class="di-file-preview-name">{{ file.name }}</div>
          <button type="button" class="di-btn secondary di-file-remove" @click="clearFile">Remove</button>
        </div>
      </div>

      <!-- Multiple existing files chosen (batch mode) -->
      <div v-else-if="batchFiles.length" class="di-batch-list">
        <div v-for="(f, i) in batchFiles" :key="i" class="di-batch-item">
          <span class="di-batch-name">📄 {{ f.name }}</span>
          <button type="button" class="di-batch-remove" @click="removeBatchFile(i)">✕</button>
        </div>
        <button type="button" class="di-btn secondary di-clear-batch" @click="clearBatch">Clear all</button>
      </div>

      <div class="di-modal-actions">
        <button class="di-btn secondary" @click="$emit('close')">Cancel</button>
        <button
          v-if="mode !== 'batch'"
          class="di-btn primary"
          :disabled="!canSubmitSingle || uploading || capturedPhotos.length"
          @click="submitSingle"
        >
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </button>
        <button
          v-else
          class="di-btn primary"
          :disabled="uploading"
          @click="submitBatch"
        >
          {{ uploading ? `Uploading ${batchProgress}/${batchFiles.length}…` : `Upload ${batchFiles.length} Files` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useDocumentsStore } from '@/stores/documents'
import { jsPDF } from 'jspdf'

const emit = defineEmits(['close', 'uploaded'])
const store = useDocumentsStore()

const types = ['Entities', 'Transactions']

const title = ref('')
const documentType = ref('Entities')
const uploading = ref(false)
const error = ref('')

// Single-file state
const file = ref(null)
const previewUrl = ref('')

// Batch (multiple pre-existing files) state
const batchFiles = ref([])
const batchProgress = ref(0)

// Multi-photo capture state
const capturedPhotos = ref([]) // [{ blob, previewUrl }]
const combining = ref(false)

const mode = computed(() => (batchFiles.value.length > 1 ? 'batch' : 'single'))
const canSubmitSingle = computed(() => !!title.value && !!file.value)

function setFile(f) {
  file.value = f
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = f && f.type && f.type.startsWith('image/') ? URL.createObjectURL(f) : ''
  if (!title.value && f) title.value = f.name.replace(/\.[^.]+$/, '')
}

function clearFile() {
  setFile(null)
}

function onFilesChosen(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (!files.length) return

  if (files.length === 1) {
    setFile(files[0])
  } else {
    batchFiles.value = files
  }
}

function removeBatchFile(i) {
  batchFiles.value.splice(i, 1)
  if (batchFiles.value.length === 1) {
    // Drop back to single-file mode
    const only = batchFiles.value[0]
    batchFiles.value = []
    setFile(only)
  }
}

function clearBatch() {
  batchFiles.value = []
}

// --- Multi-photo camera capture (native capture input, works over plain HTTP) ---
function captureNextPhoto() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.capture = 'environment'
  input.style.display = 'none'
  input.addEventListener('change', () => {
    const f = input.files && input.files[0]
    if (f) {
      capturedPhotos.value.push({ blob: f, previewUrl: URL.createObjectURL(f) })
    }
    input.remove()
  })
  document.body.appendChild(input)
  input.click()
}

function removePhoto(i) {
  URL.revokeObjectURL(capturedPhotos.value[i].previewUrl)
  capturedPhotos.value.splice(i, 1)
}

function clearCapturedPhotos() {
  capturedPhotos.value.forEach(p => URL.revokeObjectURL(p.previewUrl))
  capturedPhotos.value = []
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

async function combinePhotosToPdf() {
  if (!capturedPhotos.value.length) return
  combining.value = true
  error.value = ''
  try {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()

    for (let i = 0; i < capturedPhotos.value.length; i++) {
      const dataUrl = await blobToDataURL(capturedPhotos.value[i].blob)
      const img = await loadImage(dataUrl)
      const scale = Math.min(pageW / img.width, pageH / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const x = (pageW - w) / 2
      const y = (pageH - h) / 2
      if (i > 0) pdf.addPage()
      pdf.addImage(dataUrl, 'JPEG', x, y, w, h)
    }

    const pdfBlob = pdf.output('blob')
    const pdfFile = new File([pdfBlob], `capture-${Date.now()}.pdf`, { type: 'application/pdf' })

    clearCapturedPhotos()
    setFile(pdfFile)
    if (!title.value) title.value = 'Captured Document'
  } catch (err) {
    error.value = 'Could not combine photos: ' + err.message
  } finally {
    combining.value = false
  }
}

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  capturedPhotos.value.forEach(p => URL.revokeObjectURL(p.previewUrl))
})

async function submitSingle() {
  uploading.value = true
  error.value = ''
  try {
    await store.upload(title.value, documentType.value, file.value)
    emit('uploaded')
  } catch (err) {
    error.value = err.message
  } finally {
    uploading.value = false
  }
}

async function submitBatch() {
  uploading.value = true
  error.value = ''
  batchProgress.value = 0
  try {
    for (const f of batchFiles.value) {
      const docTitle = f.name.replace(/\.[^.]+$/, '')
      await store.upload(docTitle, documentType.value, f)
      batchProgress.value++
    }
    emit('uploaded')
  } catch (err) {
    error.value = `Uploaded ${batchProgress.value}/${batchFiles.value.length}. Failed: ${err.message}`
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.di-modal-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,.5);
  display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px;
}
.di-modal { width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; }
.di-modal h2 { margin: 0 0 14px; font-size: 17px; color: var(--di-navy); }
.di-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

.di-hidden-input { display: none; }
.di-hint { font-size: 13px; color: #64748b; margin: 4px 0 10px; }

.di-file-choices {
  display: flex; gap: 10px; margin-top: 4px;
}
.di-file-choice {
  flex: 1; text-align: center; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}

.di-file-preview {
  display: flex; align-items: center; gap: 12px; margin-top: 4px;
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;
}
.di-file-thumb {
  width: 56px; height: 56px; object-fit: cover; border-radius: 6px; flex-shrink: 0;
  background: #f1f5f9;
}
.di-file-thumb-generic {
  display: flex; align-items: center; justify-content: center; font-size: 24px;
}
.di-file-preview-info { flex: 1; min-width: 0; }
.di-file-preview-name {
  font-size: 13px; color: var(--di-navy); word-break: break-all; margin-bottom: 6px;
}
.di-file-remove { padding: 4px 10px; font-size: 12px; }

.di-capture-area {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 4px;
}
.di-photo-strip {
  display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;
}
.di-photo-thumb-wrap { position: relative; }
.di-photo-thumb {
  width: 64px; height: 64px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0;
}
.di-photo-num {
  position: absolute; bottom: 2px; left: 2px; background: rgba(0,0,0,.65); color: #fff;
  font-size: 10px; padding: 1px 5px; border-radius: 4px;
}
.di-photo-remove {
  position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%;
  background: #dc2626; color: #fff; border: none; font-size: 11px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.di-capture-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.di-cancel-capture { margin-top: 10px; width: 100%; }

.di-batch-list {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-top: 4px;
  max-height: 220px; overflow-y: auto;
}
.di-batch-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 4px; border-bottom: 1px solid #f1f5f9; font-size: 13px;
}
.di-batch-item:last-of-type { border-bottom: none; }
.di-batch-name { word-break: break-all; }
.di-batch-remove {
  border: none; background: none; color: #dc2626; cursor: pointer; font-size: 13px; flex-shrink: 0; margin-left: 8px;
}
.di-clear-batch { margin-top: 8px; width: 100%; }
</style>
