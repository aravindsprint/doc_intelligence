import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Set this to your bench site's URL before running `npm run dev`.
const DEV_BACKEND = process.env.DI_DEV_BACKEND || 'https://erp.pranera.in'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/assets/doc_intelligence/doc_intelligence_app/',

  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },

  server: {
    port: 3000,
    // Dev-server only — vite build never reads this (production is served
    // from the same origin as the Frappe site). Needed so `npm run dev`
    // (localhost:3000) can reach the live backend; without it every
    // /api/* call 404s against Vite's own dev server and returns HTML
    // instead of JSON.
    proxy: command === 'serve' ? {
      '/api': {
        target: DEV_BACKEND,
        changeOrigin: true,
        secure: false,
        ws: true,
        cookieDomainRewrite: 'localhost',
        headers: {
          'Origin': DEV_BACKEND,
          'Referer': DEV_BACKEND
        },
        // Frappe marks its session cookie (sid) as Secure when the backend
        // is HTTPS. Vite's dev server itself is plain HTTP (localhost:3000),
        // and browsers silently refuse to store any Secure cookie over a
        // non-HTTPS connection — no error, no warning, it just never lands.
        // cookieDomainRewrite only touches Domain=, not Secure, so login
        // would appear to succeed while the session cookie never persists.
        // Strip Secure (dev only) so the cookie sticks.
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('expect')
          })
          proxy.on('proxyRes', (proxyRes) => {
            const setCookie = proxyRes.headers['set-cookie']
            if (setCookie) {
              proxyRes.headers['set-cookie'] = setCookie.map(c =>
                c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
              )
            }
          })
        }
      },
      '/assets': { target: DEV_BACKEND, changeOrigin: true, secure: false },
      '/files':  { target: DEV_BACKEND, changeOrigin: true, secure: false }
    } : undefined
  },

  build: {
    // ../doc_intelligence/doc_intelligence/public/doc_intelligence_app
    // (repo/doc_intelligence(pkg)/public/doc_intelligence_app)
    outDir: path.resolve(__dirname, '../doc_intelligence/public/doc_intelligence_app'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'index.css'
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },

  plugins: [
    vue(),
    VitePWA({
      base: '/assets/doc_intelligence/doc_intelligence_app/',
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Serve the cached SPA shell for in-app navigations when offline.
        // Excludes /api and /files (network-required) and every online-only
        // report/admin page — only the server-rendered /doc-intelligence
        // page (www/doc_intelligence.py) injects window.csrf_token, and the
        // cached static index.html never has it, which would silently break
        // every POST call if those routes fell back to the cached shell.
        navigateFallback: '/assets/doc_intelligence/doc_intelligence_app/index.html',
        navigateFallbackDenylist: [
          /^\/api/, /^\/files/, /^\/app/,
          /^\/doc-intelligence\/provider-settings/,
          /^\/doc-intelligence\/tenant/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'doc-intelligence-api-get',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Doc Intelligence',
        short_name: 'DocIntel',
        theme_color: '#1a2744',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/doc-intelligence',
        scope: '/doc-intelligence',
        icons: [
          { src: '/assets/doc_intelligence/doc_intelligence_app/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/assets/doc_intelligence/doc_intelligence_app/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/assets/doc_intelligence/doc_intelligence_app/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/assets/doc_intelligence/doc_intelligence_app/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
}))
