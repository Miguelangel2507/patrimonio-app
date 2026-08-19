// Kill switch: this app no longer uses a service worker. A previously-installed
// SW on a device can stay resident across launches serving stale cached files,
// which was masking real fixes from ever reaching the phone. This version wipes
// all caches, unregisters itself, and forces any open tabs to reload straight
// from the network.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((client) => client.navigate(client.url)))
  );
});
