import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '@/api/frappe'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(null)
  const health = ref([])
  const testResults = ref(null)
  const loading = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const error = ref('')

  async function fetchSettings() {
    loading.value = true
    error.value = ''
    try {
      settings.value = await api.getProviderSettings()
      return settings.value
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchHealth() {
    health.value = await api.getProviderHealthStats()
    return health.value
  }

  async function save(patch) {
    saving.value = true
    error.value = ''
    try {
      await api.saveProviderSettings({ ...settings.value, ...patch })
      await fetchSettings()
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      saving.value = false
    }
  }

  async function testAll() {
    testing.value = true
    try {
      testResults.value = await api.testProviders()
      return testResults.value
    } finally {
      testing.value = false
    }
  }

  return { settings, health, testResults, loading, saving, testing, error, fetchSettings, fetchHealth, save, testAll }
})
