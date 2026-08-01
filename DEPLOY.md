# Deploying the Doc Intelligence SPA

This package converts `doc_intelligence` from Desk-Pages-only to a classic
Frappe custom app + decoupled Vue 3 SPA.

## What changed

**Structural fixes** (the zip had accidental duplication from a prior copy):
- Removed a stray, dead `hooks.py` that sat at the repo root next to
  `pyproject.toml` — Frappe never imports it (only `doc_intelligence/hooks.py`
  is real), but it was stale and out of sync with the live one.
- Removed duplicate `fixtures/`, `public/`, and `templates/` folders that had
  been copied into the module folder (`doc_intelligence/doc_intelligence/`)
  on top of the canonical ones at the package root — byte-identical, so
  purely redundant.
- **Fixed a real bug**: `llm_engine.py` existed in two places with *different*
  content. The copy actually imported by `api/__init__.py` (at
  `doc_intelligence/doc_intelligence/llm_engine.py`) was the *older* one —
  it read Password-type settings fields with plain `getattr()` instead of
  `settings.get_password()`, and had a broken self-import for
  `di_tenant.get_tenant_claude_key` (wrong number of path segments). The
  *newer* copy one level down (with vision/OCR support and the correct
  `get_password()` calls) was never actually reachable from the API. The
  newer version has been promoted to the path that's actually imported;
  the stale duplicate is gone.

**New SPA layer:**
- `frontend/` — Vue 3 + Vite + Pinia + Vue Router + Dexie, built and served as
  a decoupled single-page app.
- `doc_intelligence/www/doc-intelligence.html` + `doc_intelligence.py` —
  serves the SPA at `/doc-intelligence`, guards guests, injects the CSRF
  token.
- Two new whitelisted endpoints in `api/__init__.py`: `get_csrf_token` and
  `get_session_info` (roles, System Manager flag) — the SPA calls these on
  boot.
- `hooks.py`: added the `/doc-intelligence/<path:app_path>` website route
  rule, restored the `fixtures` export (Workspace/Report/Page), pointed
  `add_to_apps_screen` at the new route.

**Pages built:** Login, Documents (list + upload), Document Detail
(view / Ask AI / Compare / AI-assisted ERPNext record creation), Dashboard
(stats, provider health), Provider Settings (System Manager only), About.

**Left as-is, on purpose:** the old Desk Pages (`di-dashboard`,
`di-provider-settings`) still work. Nothing was deleted from them — the SPA
is additive so you can compare the two before retiring the Desk Pages.

## 1. On your machine — install and build

```bash
cd doc_intelligence/frontend
npm install
npm run build          # outputs to ../doc_intelligence/public/doc_intelligence_app/
cd ..
git init && git add -A && git commit -m "Convert to Frappe app + decoupled Vue SPA"
git push origin main
```

For local dev against your live bench instead of a rebuild-per-change loop:

```bash
cd frontend
DI_DEV_BACKEND=https://your-site.example npm run dev   # http://localhost:3000
```

## 2. On the production server — pull and deploy

```bash
cd ~/frappe-bench                          # adjust to your actual bench path
git -C apps/doc_intelligence pull

bench build --app doc_intelligence         # rebuilds frontend/public/doc_intelligence_app
bench --site your-site.example migrate
bench restart
```

## 3. Verify

1. Open `your-site.example/doc-intelligence` — should redirect to
   `/doc-intelligence/login` if you're logged out, or straight to
   `/doc-intelligence/home` if you're already logged in.
2. Upload a document, confirm it reaches `Ready` status and Ask/Compare work.
3. As a System Manager, open `/doc-intelligence/provider-settings` and run
   **Test All Providers** — this exercises the `llm_engine.py` fix above,
   so it's worth confirming providers you've configured actually report
   `pass` now.

## 4. Clear the stale service worker (once, before testing)

This app is a PWA with a service worker — one installed *before* this
deploy will keep serving old cached assets.

1. Open the site in Chrome → DevTools → **Application** → **Service
   Workers** → **Unregister**
2. Same tab → **Storage** → **Clear site data**
3. Hard refresh: `Ctrl+Shift+R` (`Cmd+Shift+R` on Mac)

`main.js` auto-unregisters old service workers on load, so most users just
need a normal hard refresh.
