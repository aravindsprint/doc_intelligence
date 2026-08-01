<template>
  <div class="di-login-wrap">
    <div class="di-login-card di-card">
      <div class="di-login-logo"><AppLogo :size="48" /></div>
      <h1>Doc Intelligence</h1>
      <p class="di-login-sub">Sign in to analyze and act on your documents.</p>

      <div v-if="error" class="di-error">{{ error }}</div>

      <form @submit.prevent="onSubmit">
        <label class="di-label">Email</label>
        <input v-model="email" type="email" class="di-input" required autofocus />

        <label class="di-label" style="margin-top:12px">Password</label>
        <div class="di-password-wrap">
          <input v-model="password" :type="showPassword ? 'text' : 'password'" class="di-input" required />
          <button
            type="button"
            class="di-password-toggle"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            @click="showPassword = !showPassword"
          >
            <svg v-if="!showPassword" viewBox="0 0 24 24" width="18" height="18">
              <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18">
              <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <button class="di-btn primary" type="submit" :disabled="loading" style="width:100%;margin-top:18px;justify-content:center">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { initCSRF } from '@/api/frappe'
import AppLogo from '@/components/AppLogo.vue'

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

const auth = useAuthStore()
const router = useRouter()

async function onSubmit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(email.value, password.value)
    // Full navigation (not router.push) so main.js re-runs against the now-
    // valid session cookie — matches pranera_knit's login flow, since
    // reusing the SPA's in-memory state right after login has proven
    // unreliable while a hard reload works every time.
    window.location.href = '/doc-intelligence/home'
  } catch (err) {
    error.value = err.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.di-login-wrap {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: var(--di-navy);
}
.di-login-card { width: 100%; max-width: 380px; text-align: center; }
.di-login-logo { display: flex; justify-content: center; margin-bottom: 12px; }
h1 { font-size: 20px; margin: 0 0 4px; color: var(--di-navy); }
.di-login-sub { color: var(--di-muted); font-size: 13px; margin: 0 0 20px; }
form { text-align: left; }
.di-password-wrap { position: relative; }
.di-password-wrap .di-input { padding-right: 40px; }
.di-password-toggle {
  position: absolute; top: 50%; right: 10px; transform: translateY(-50%);
  background: none; border: none; padding: 4px; cursor: pointer;
  color: var(--di-muted); display: flex; align-items: center; justify-content: center;
}
.di-password-toggle:hover { color: var(--di-text); }
</style>
