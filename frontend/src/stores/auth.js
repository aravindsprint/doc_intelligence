import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSessionInfo, ensureCSRF, resetCSRF, login as apiLogin, logout as apiLogout } from '@/api/frappe'

export const useAuthStore = defineStore('auth', () => {
  const user = ref('')
  const fullName = ref('')
  const roles = ref([])
  const isSystemManager = ref(false)
  const platformName = ref('Doc Intelligence')
  const supportEmail = ref('')

  const loading = ref(false)
  const error = ref('')
  const loaded = ref(false)

  const isLoggedIn = computed(() => !!user.value && user.value !== 'Guest')

  // Called once on app boot (after a real session exists) and again right
  // after login, since login() forces a hard navigation that re-runs this
  // from scratch anyway.
  async function loadSession() {
    loading.value = true
    error.value = ''
    try {
      await ensureCSRF()
      const info = await getSessionInfo()
      user.value = info.user
      fullName.value = info.full_name
      roles.value = info.roles || []
      isSystemManager.value = !!info.is_system_manager
      platformName.value = info.platform_name || 'Doc Intelligence'
      supportEmail.value = info.support_email || ''
      loaded.value = true
      return true
    } catch (err) {
      // Guest / no session — not a real error, just means "not logged in"
      user.value = 'Guest'
      loaded.value = true
      return false
    } finally {
      loading.value = false
    }
  }

  async function login(email, password) {
    loading.value = true
    error.value = ''
    try {
      await apiLogin(email, password)
      return true
    } catch (err) {
      error.value = err.message || 'Login failed'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await apiLogout()
    user.value = 'Guest'
    fullName.value = ''
    roles.value = []
    isSystemManager.value = false
    loaded.value = false
  }

  return {
    user, fullName, roles, isSystemManager, platformName, supportEmail,
    loading, error, loaded, isLoggedIn,
    loadSession, login, logout
  }
})
