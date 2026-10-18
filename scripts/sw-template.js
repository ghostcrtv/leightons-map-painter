/* Leighton's Map Painter — offline support (service worker). Generated at build time. */
const VERSION = '__VERSION__';
const CORE = __CORE__;
const CACHE = `lmp-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lmp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  // The page and the map data: try the network first (to get updates), fall back to the saved copy.
  const networkFirst = req.mode === 'navigate' || path.endsWith('.html') || path.endsWith('/') || /\/data\/[^/]+\.json$/.test(path);
  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? new URL('./', self.location).href : req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req.mode === 'navigate' ? new URL('./', self.location).href : req, { ignoreSearch: true }).then((r) => r || caches.match(req, { ignoreSearch: true }))),
    );
    return;
  }
  // Everything else (code, flags, icons, fonts) never changes under the same name: saved copy first.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
