import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '@/api/frappe'
import { db } from '@/db'

export const useDocumentsStore = defineStore('documents', () => {
  const documents = ref([])
  const total = ref(0)
  const stats = ref(null)
  const loading = ref(false)
  const error = ref('')

  async function fetchDocuments({ status = null, document_type = null, search = null, limit = 20, offset = 0 } = {}) {
    loading.value = true
    error.value = ''
    try {
      const res = await api.listDocuments({ status, document_type, search, limit, offset })
      documents.value = res.data || []
      total.value = res.total || 0
      // Cache for offline viewing (best-effort — never blocks the UI on failure)
      db.documents.bulkPut(documents.value).catch(() => {})
      return res
    } catch (err) {
      error.value = err.message
      // Offline / request failed — fall back to the last cached list
      const cached = await db.documents.toArray().catch(() => [])
      if (cached.length) {
        documents.value = cached
        total.value = cached.length
      }
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    stats.value = await api.getDocumentStats()
    return stats.value
  }

  async function upload(title, document_type, file) {
    const uploaded = await api.uploadFile(file)
    return api.uploadDocument(title, document_type, uploaded.file_url)
  }

  return { documents, total, stats, loading, error, fetchDocuments, fetchStats, upload }
})
