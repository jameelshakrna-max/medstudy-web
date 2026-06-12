// ══════════════════════════════════════════════════
//  Service Worker for MedStudy OS
//  - Background notifications via Web Push
//  - Handles push events from server
//  - Handles notification clicks
// ══════════════════════════════════════════════════

const CACHE_NAME = 'medstudy-v1'

// Install — skip waiting so SW activates immediately
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Activate — claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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
