// Bump this on every deploy — forces old cached entries to be purged on activate.
const CACHE_VERSION = 'patrimonio-v4';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
];
const ICONS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll([...APP_SHELL, ...ICONS])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App shell (html/css/js/manifest): network-first. A standalone iOS PWA can stay
// suspended in the app switcher for a long time without ever re-running this fetch
// handler, so favoring the network whenever it's reachable is what actually gets a
// deployed fix onto the device — the cache is strictly a fallback for offline use,
// not the primary source once there's connectivity again.
// Icons: cache-first, since they never change between deploys.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  const isIcon = ICONS.some((p) => event.request.url.endsWith(p.replace('./', '/')));
  if (isIcon) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }
  event.respondWith(
    fetch(event.request).then((res) => {
      if (res && res.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, res.clone()));
      return res;
    }).catch(() => caches.match(event.request))
  );
});
