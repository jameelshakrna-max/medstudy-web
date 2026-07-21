const LEGACY_CACHE_NAMES = [
  'medstudy-hashed-assets',
  'medstudy-general',
];

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all(
      LEGACY_CACHE_NAMES.map(cacheName => caches.delete(cacheName))
    )
  );
});
