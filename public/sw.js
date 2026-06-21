// ══════════════════════════════════════════════════
//  Service Worker for MedStudy OS
//  - Precaches app shell for instant repeat visits
//  - Background notifications via Web Push
//  - Handles push events from server
//  - Handles notification clicks
// ══════════════════════════════════════════════════

const CACHE = 'medstudy-v2'
const STATIC_ASSETS = [
  '/',
  '/icon.svg',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/manifest.json',
]

// Install — cache app shell + activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate — claim clients + delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  event.waitUntil(self.clients.claim())
})

// Fetch — stale-while-revalidate for navigation, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API calls → network only
  if (url.pathname.startsWith('/api/')) return

  // Supabase calls → network only
  if (url.hostname.includes('supabase.co')) return

  // Static assets with hash in URL (built by Vite) → cache-first (immutable)
  if (url.pathname.startsWith('/assets/') && url.pathname.match(/-[A-Za-z0-9]{8}\./)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    )
    return
  }

  // Navigation → stale-while-revalidate
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return res
        })
        return cached || fetched
      })
    )
    return
  }

  // Everything else (fonts, icons, etc.) → stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
        return res
      })
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

// ── Messages from app ──
self.addEventListener('message', (event) => {
  const { type, vapidKey } = event.data
  if (type === 'SET_VAPID_KEY') {
    self.vapidKey = vapidKey
  }
})
