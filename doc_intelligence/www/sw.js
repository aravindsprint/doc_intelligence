/* Doc Intelligence — fallback shell service worker.
   Superseded at build time by vite-plugin-pwa's generated
   public/doc_intelligence_app/sw.js (registered via registerSW.js in
   doc-intelligence.html). This copy only matters if the app is ever
   loaded before the first `npm run build`. */
const CACHE_NAME = "doc-intelligence-v1";

const SHELL = [
  "/doc-intelligence",
  "/assets/doc_intelligence/css/doc_intelligence.css",
  "/assets/doc_intelligence/js/doc_intelligence.js",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.allSettled(SHELL.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
