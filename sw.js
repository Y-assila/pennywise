const CACHE = "pennywise-v16";
const ASSETS = ["app.html", "index.html", "app.js", "report.js", "features.js", "accounts.js", "upcoming.js", "i18n.js", "i18n-landing.js", "styles.css", "design.css", "public.css", "icons.js", "icon.svg", "icon-192.png", "icon-512.png", "manifest.webmanifest", "fonts/inter-Regular.woff2", "fonts/inter-Medium.woff2", "fonts/inter-SemiBold.woff2", "fonts/inter-Bold.woff2", "fonts/inter-ExtraBold.woff2", "fonts/noto-arabic-Regular.woff2", "fonts/noto-arabic-Bold.woff2"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  // Network first so updates arrive; fall back to cache when offline.
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request, { ignoreSearch: true })));
});
