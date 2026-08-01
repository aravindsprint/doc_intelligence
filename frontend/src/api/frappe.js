// ── CSRF ──────────────────────────────────────────────────────────────────
let _csrf = ''

function getCookieValue(name) {
  return document.cookie
    .split('; ')
    .find(r => r.startsWith(name + '='))
    ?.split('=')[1] || ''
}

export async function ensureCSRF() {
  // 1. Already cached
  if (_csrf) return _csrf
  // 2. Injected by Jinja (production — see www/doc-intelligence.html)
  if (window.csrf_token) { _csrf = window.csrf_token; return _csrf }
  // 3. Cookie fallback
  const cookie = getCookieValue('csrftoken') || getCookieValue('X-Frappe-CSRF-Token')
  if (cookie) { _csrf = cookie; return _csrf }
  // 4. Fetch from the whitelisted helper (dev proxy / first load with no cookie yet)
  try {
    const r = await fetch('/api/method/doc_intelligence.doc_intelligence.api.get_csrf_token', { credentials: 'include' })
    if (r.ok) {
      const d = await r.json()
      const token = d?.message?.csrf_token
      if (token) { _csrf = token; window.csrf_token = token }
      else console.warn('ensureCSRF: get_csrf_token returned no token (no session/sid cookie?)')
    } else {
      console.warn('ensureCSRF: get_csrf_token HTTP', r.status)
    }
  } catch (e) {
    console.warn('ensureCSRF: get_csrf_token failed', e)
  }
  return _csrf
}

export function resetCSRF() {
  _csrf = ''
  window.csrf_token = ''
}

export async function initCSRF() {
  window.__FRAPPE_SESSION__ = {
    user: decodeURIComponent(getCookieValue('user_id') || '') || 'Guest',
    base_url: ''
  }
  await ensureCSRF()
  window.__FRAPPE_SESSION__.csrf_token = _csrf
}

export function isLoggedIn() {
  const user = window.__FRAPPE_SESSION__?.user
  return !!user && user !== 'Guest'
}

// ── Core fetch helpers ────────────────────────────────────────────────────
export async function call(method, args = {}) {
  const token = await ensureCSRF()
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(args)) {
    if (v === null || v === undefined) continue // omit — let the Python default apply instead of sending the string "null"
    body.append(k, typeof v === 'object' ? JSON.stringify(v) : v)
  }
  const res = await fetch(`/api/method/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Frappe-CSRF-Token': token
    },
    body: body.toString(),
    credentials: 'include'
  })
  const data = await res.json()
  if (!res.ok || data.exc) throw new Error(extractServerError(data, res.statusText))
  return data
}

function extractServerError(data, fallback = 'Request failed') {
  try {
    const msgs = JSON.parse(data._server_messages || '[]')
    if (msgs.length) {
      const last = JSON.parse(msgs[msgs.length - 1])
      const text = String(last.message || last).replace(/<[^>]+>/g, '').trim()
      if (text) return text
    }
  } catch { /* fall through */ }
  if (data.exception) {
    const parts = String(data.exception).split(':')
    return (parts.length > 1 ? parts.slice(1).join(':') : parts[0]).trim()
  }
  if (data.exc) {
    try {
      const tb = JSON.parse(data.exc)
      const lines = String(tb[0] || '').trim().split('\n')
      return lines[lines.length - 1].trim()
    } catch { /* fall through */ }
  }
  return fallback
}

export async function getList(doctype, { filters = [], fields = ['name'], limit = 200, orderBy } = {}) {
  const params = new URLSearchParams({
    filters: JSON.stringify(filters),
    fields: JSON.stringify(fields),
    limit_page_length: limit,
    ...(orderBy ? { order_by: orderBy } : {})
  })
  const res = await fetch(`/api/resource/${encodeURIComponent(doctype)}?${params}`, { credentials: 'include' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.exc || res.statusText)
  return data.data || []
}

export async function uploadFile(file) {
  const token = await ensureCSRF()
  const form = new FormData()
  form.append('file', file)
  form.append('is_private', '1')
  const res = await fetch('/api/method/upload_file', {
    method: 'POST',
    headers: { 'X-Frappe-CSRF-Token': token },
    body: form,
    credentials: 'include'
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.exc || res.statusText)
  return data.message
}

// ── Auth ──────────────────────────────────────────────────────────────────
export async function login(email, password) {
  const res = await fetch('/api/method/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ usr: email, pwd: password }).toString(),
    credentials: 'include'
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.message !== 'Logged In') {
    let msg = 'Incorrect email or password'
    try {
      const msgs = JSON.parse(data._server_messages || '[]')
      if (msgs.length) msg = JSON.parse(msgs[msgs.length - 1]).message || msg
    } catch { /* keep default */ }
    throw new Error(msg)
  }
  return true
}

export async function logout() {
  // /api/method/logout via GET genuinely destroys the session server-side
  // (confirmed: it returns full_name: "Guest" once it succeeds) — but it
  // doesn't actually honor a ?redirect-to= param, it just returns raw
  // JSON. So we call it ourselves via fetch (a plain GET, unlike the POST
  // that was hitting an unexplained 417 on this server) and then navigate
  // to our own login page once it's confirmed done — a real full-page
  // load, so the next page re-checks frappe.session.user fresh from the
  // server's actual (now-invalidated) session cookie.
  try {
    await fetch('/api/method/logout', { credentials: 'include' })
  } catch { /* proceed to navigate regardless — worst case the login page's own router guard re-checks session state */ }
  window.location.href = '/doc-intelligence/login'
}

// ── Doc Intelligence API (apps/doc_intelligence/.../api/__init__.py) ──────
const APP = 'doc_intelligence.doc_intelligence.api'

export const getSessionInfo = () => call(`${APP}.get_session_info`).then(r => r.message)

export const listDocuments = (opts = {}) => call(`${APP}.list_documents`, opts).then(r => r.message)
export const getDocument   = (doc_name) => call(`${APP}.get_document`, { doc_name }).then(r => r.message)
export const deleteDocument = (doc_name) => call(`${APP}.delete_document`, { doc_name }).then(r => r.message)
export const bulkDeleteDocuments = (doc_names) => call(`${APP}.bulk_delete_documents`, { doc_names }).then(r => r.message)
export const uploadDocument = (title, document_type, file_url) =>
  call(`${APP}.upload_document`, { title, document_type, file_url }).then(r => r.message)
export const askDocument = (doc_name, question) =>
  call(`${APP}.ask_document`, { doc_name, question }).then(r => r.message)
export const compareDocuments = (doc_name_a, doc_name_b, aspect) =>
  call(`${APP}.compare_documents`, { doc_name_a, doc_name_b, aspect }).then(r => r.message)

export const getDocumentStats = () => call(`${APP}.get_document_stats`).then(r => r.message)
export const getProviderHealthStats = () => call(`${APP}.get_provider_health_stats`).then(r => r.message)

export const getProviderSettings = () => call(`${APP}.get_provider_settings`).then(r => r.message)
export const saveProviderSettings = (settings) => call(`${APP}.save_provider_settings`, { settings }).then(r => r.message)
export const testProviders = () => call(`${APP}.test_providers`).then(r => r.message)

export const createPurchaseInvoice   = (doc_name) => call(`${APP}.create_purchase_invoice`, { doc_name }).then(r => r.message)
export const createPurchaseInvoiceDoc = (payload) => call(`${APP}.create_purchase_invoice_doc`, payload).then(r => r.message)

export const extractEntity = (doc_name, entity_type) =>
  call(`${APP}.extract_entity`, { doc_name, entity_type }).then(r => r.message)
export const createEntityDoc = (entity_type, values) =>
  call(`${APP}.create_entity_doc`, { entity_type, values }).then(r => r.message)

export const extractTransaction = (doc_name, txn_type) =>
  call(`${APP}.extract_transaction`, { doc_name, txn_type }).then(r => r.message)
export const createTransactionDoc = (txn_type, header, items, confirm_duplicate = 0) =>
  call(`${APP}.create_transaction_doc`, { txn_type, header, items, confirm_duplicate }).then(r => r.message)

// ── Link field search (Supplier/Customer/etc autocomplete) ────────────────
export async function searchLink(doctype, txt = '', filters = null) {
  const data = await call('frappe.desk.search.search_link', {
    doctype, txt, page_length: 20,
    ...(filters ? { filters: JSON.stringify(filters) } : {})
  })
  return data.results || []
}
