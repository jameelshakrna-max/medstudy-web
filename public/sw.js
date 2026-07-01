// ══════════════════════════════════════════════════
//  Service Worker for MedStudy OS
//  - Precaches app shell for instant repeat visits
//  - Precaches app JS/CSS assets for fast first load
//  - Background notifications via Web Push
//  - Handles push events from server
//  - Handles notification clicks
// ══════════════════════════════════════════════════

const CACHE = 'medstudy-v5'
const STATIC_ASSETS = [
  '/icon.svg',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('message', (event) => {
  const { type, vapidKey, assets } = event.data

  if (type === 'SET_VAPID_KEY') {
    self.vapidKey = vapidKey
  }

  if (type === 'PRECACHE_ASSETS' && Array.isArray(assets)) {
    event.waitUntil(
      caches.open(CACHE).then((cache) => {
        cache.addAll(assets).catch(() => {})
      })
    )
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (url.pathname.startsWith('/api/')) return
  if (url.hostname.includes('supabase.co')) return
  if (url.pathname.startsWith('/@')) return
  if (url.pathname.startsWith('/src/')) return
  if (url.pathname === '/@react-refresh') return

  // Hashed assets — cache-first (immutable after deploy)
  if (url.pathname.startsWith('/assets/') && url.pathname.match(/-[A-Za-z0-9]{8}\./)) {
    event.respondWith(
      caches.open(CACHE)
        .then((cache) => cache.match(request))
        .then((cached) => cached || fetch(request))
        .catch(() => fetch(request))
    )
    return
  }

  // Navigation — network-first (always serve fresh HTML, cache for offline)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        return res
      }).catch(() => caches.match(request))
    )
    return
  }

  // Everything else — stale-while-revalidate
  event.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(request))
      .then((cached) => {
        const fetched = fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
          return res
        }).catch(() => {})
        return cached || fetched
      })
  )
})

// ── Push event: receives push from server, shows notification ──
self.addEventListener('push', (event) => {
  let data = {}

  if (event.data) {
    try {
      data = event.data.json()
    } catch (e) {
      data = { title: 'MedStudy OS', body: 'Timer update' }
    }
  }

  const title = data.title || '⏰ Timer Complete'
  const options = {
    body: data.body || 'Your Pomodoro timer has ended.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'pomodoro-timer',
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: data.url || (self.location.origin + '/pomodoro'),
      mode: data.mode || 'study'
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ── Notification click: bring app to focus ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || self.location.origin + '/pomodoro'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})

// ── Push subscription change: inform server ──
self.addEventListener('pushsubscriptionchange', (event) => {
  // When subscription changes (e.g. expires), re-subscribe
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.vapidKey
    }).then((subscription) => {
      // Tell the app about the new subscription
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach(client => {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            subscription: subscription.toJSON()
          })
        })
      })
    })
  )
})


