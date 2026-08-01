<template>
  <div class="di-app">
    <AppHeader v-if="showHeader" />
    <main class="di-main" :class="{ 'di-main-full-bleed': isLoginRoute }">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { isLoggedIn } from '@/api/frappe'

const route = useRoute()
const auth = useAuthStore()

const isLoginRoute = computed(() => route.path === '/doc-intelligence/login')
const showHeader = computed(() => !isLoginRoute.value)

onMounted(async () => {
  if (isLoggedIn() && !auth.loaded) {
    await auth.loadSession()
  }
})
</script>

<style>
:root {
  --di-navy: #1a2744;
  --di-blue: #2563eb;
  --di-bg: #f7f8fa;
  --di-card: #ffffff;
  --di-border: #e5e7eb;
  --di-text: #1f2937;
  --di-muted: #6b7280;
  --di-green: #22c55e;
  --di-amber: #f59e0b;
  --di-red: #ef4444;
}

* { box-sizing: border-box; }

html, body, #app { height: 100%; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--di-bg);
  color: var(--di-text);
}

.di-app { min-height: 100%; display: flex; flex-direction: column; }
.di-main { flex: 1; max-width: 1100px; width: 100%; margin: 0 auto; padding: 24px 16px 64px; }
.di-main-full-bleed { max-width: none; margin: 0; padding: 0; }

.di-card {
  background: var(--di-card);
  border: 1px solid var(--di-border);
  border-radius: 12px;
  padding: 18px;
}

.di-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 16px; border-radius: 8px; font-weight: 600; font-size: 14px;
  border: none; cursor: pointer; transition: opacity .15s;
}
.di-btn:disabled { opacity: .5; cursor: not-allowed; }
.di-btn.primary { background: var(--di-blue); color: #fff; }
.di-btn.secondary { background: #f3f4f6; color: #374151; }
.di-btn.danger { background: var(--di-red); color: #fff; }
.di-btn:not(:disabled):hover { opacity: .88; }

.di-input, .di-select, .di-textarea {
  width: 100%; padding: 9px 12px; border: 1px solid var(--di-border);
  border-radius: 8px; font-size: 14px; font-family: inherit; background: #fff; color: var(--di-text);
}
.di-textarea { resize: vertical; }

.di-label { font-size: 12px; font-weight: 600; color: var(--di-muted); margin-bottom: 4px; display: block; }

.di-badge {
  display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;
  background: #e5e7eb; color: #374151; text-transform: uppercase; letter-spacing: .03em;
}
.di-badge.ready, .di-badge.active, .di-badge.pass { background: #dcfce7; color: #166534; }
.di-badge.processing, .di-badge.trial { background: #dbeafe; color: #1e40af; }
.di-badge.pending { background: #fef9c3; color: #854d0e; }
.di-badge.failed, .di-badge.fail { background: #fee2e2; color: #991b1b; }

.di-error {
  background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;
  border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}

.di-empty { text-align: center; padding: 48px 16px; color: var(--di-muted); }
</style>
