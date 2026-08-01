import Dexie from 'dexie'

// Lightweight offline cache — just enough to let the document list render
// (read-only) if the SPA is reloaded with no network. Uploads, Ask/Compare,
// and admin actions are all online-only by design (see vite.config.js
// navigateFallbackDenylist for the pages that never fall back to cache).
export const db = new Dexie('doc_intelligence_cache')

db.version(1).stores({
  documents: 'name, status, document_type, creation'
})
