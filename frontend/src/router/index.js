import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '@/api/frappe'
import { useAuthStore } from '@/stores/auth'

// ── Eager (offline-critical) ────────────────────────────────────────────
import HomePage  from '@/pages/home/HomePage.vue'
import LoginPage from '@/pages/login/LoginPage.vue'

const routes = [
  { path: '/', redirect: '/doc-intelligence/home' },
  { path: '/doc-intelligence', redirect: '/doc-intelligence/home' },

  { path: '/doc-intelligence/login', component: LoginPage },

  { path: '/doc-intelligence/home', component: HomePage },
  { path: '/doc-intelligence/documents/:name', component: () => import('@/pages/document-detail/DocumentDetailPage.vue'), props: true },

  // ── Online-only (lazy) ──
  { path: '/doc-intelligence/dashboard', component: () => import('@/pages/dashboard/DashboardPage.vue') },
  { path: '/doc-intelligence/about', component: () => import('@/pages/about/AboutPage.vue') },
  {
    path: '/doc-intelligence/provider-settings',
    component: () => import('@/pages/provider-settings/ProviderSettingsPage.vue'),
    meta: { requiresSystemManager: true }
  },
  { path: '/doc-intelligence/no-access', component: () => import('@/pages/NoAccessPage.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Anyone without a real (non-Guest) Frappe session gets bounced to the
// login page instead of being allowed to sit on a page that will just fail
// its API calls with 403s. A logged-in user is bounced away from /login.
// System-Manager-only pages additionally require the auth store to have
// loaded and confirmed the role, otherwise they're sent to /no-access.
router.beforeEach(async (to) => {
  if (to.path === '/doc-intelligence/login') {
    return isLoggedIn() ? '/doc-intelligence/home' : true
  }
  if (!isLoggedIn()) {
    return '/doc-intelligence/login'
  }
  if (to.meta?.requiresSystemManager) {
    const auth = useAuthStore()
    if (!auth.loaded) await auth.loadSession()
    if (!auth.isSystemManager) return '/doc-intelligence/no-access'
  }
  return true
})

export default router
