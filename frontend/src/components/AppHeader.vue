<template>
  <header class="di-header">
    <div class="di-header-inner">
      <router-link to="/doc-intelligence/home" class="di-brand">
        <AppLogo :size="28" />
        <span>{{ auth.platformName || 'Doc Intelligence' }}</span>
      </router-link>

      <nav class="di-nav">
        <router-link to="/doc-intelligence/home">Documents</router-link>
        <router-link to="/doc-intelligence/dashboard">Dashboard</router-link>
        <router-link v-if="auth.isSystemManager" to="/doc-intelligence/provider-settings">Providers</router-link>
        <router-link to="/doc-intelligence/about">About</router-link>
      </nav>

      <div class="di-header-user">
        <span class="di-header-name">{{ auth.fullName || auth.user }}</span>
        <button class="di-btn secondary" @click="onLogout">Logout</button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'

const auth = useAuthStore()

function onLogout() {
  // auth.logout() navigates the browser away to Frappe's logout endpoint
  // itself (see api/frappe.js) — nothing further to do here.
  auth.logout()
}
</script>

<style scoped>
.di-header { background: var(--di-navy); color: #fff; }
.di-header-inner {
  max-width: 1100px; margin: 0 auto; padding: 0 16px;
  display: flex; align-items: center; gap: 24px; height: 56px;
}
.di-brand { display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; font-weight: 700; }
.di-nav { display: flex; gap: 18px; flex: 1; }
.di-nav a {
  color: rgba(255,255,255,.75); text-decoration: none; font-size: 14px; font-weight: 500;
  padding: 6px 0; border-bottom: 2px solid transparent;
}
.di-nav a:hover { color: #fff; }
.di-nav a.router-link-active { color: #fff; border-bottom-color: var(--di-blue); }
.di-header-user { display: flex; align-items: center; gap: 12px; }
.di-header-name { font-size: 13px; color: rgba(255,255,255,.75); }

@media (max-width: 720px) {
  .di-header-name { display: none; }
  .di-nav { gap: 12px; overflow-x: auto; }
}
</style>
