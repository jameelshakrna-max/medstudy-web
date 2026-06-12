// ══════════════════════════════════════════════════
//  Service Worker for MedStudy OS
//  Handles notifications when the app is in background
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

// Handle messages from the main app
self.addEventListener('message', (event) => {
  const { type, endTime, mode } = event.data

  if (type === 'START_TIMER') {
    // Store the end time so we can check it
    self.timerEndTime = endTime
    self.timerMode = mode

    // Calculate delay until timer ends
    const delay = endTime - Date.now()

    if (delay > 0) {
      // Clear any existing timeout
      if (self.timerTimeout) clearTimeout(self.timerTimeout)

      // Set a timeout to fire when the timer ends
      // Browsers allow setTimeout in Service Workers for this purpose
      self.timerTimeout = setTimeout(() => {
        const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
        const label = MODE_LABELS[self.timerMode] || 'Timer'
        const body = self.timerMode === 'study'
          ? 'Great work! Time for a break.'
          : 'Break is over. Ready to focus?'

        self.registration.showNotification(`⏰ ${label} Complete`, {
          body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          tag: 'pomodoro-timer',
          requireInteraction: true,
          silent: false,
          vibrate: [200, 100, 200, 100, 200],
          data: { url: self.location.origin + '/pomodoro' }
        })

        self.timerEndTime = null
      }, delay)
    }
  }

  if (type === 'CANCEL_TIMER') {
    if (self.timerTimeout) {
      clearTimeout(self.timerTimeout)
      self.timerTimeout = null
    }
    self.timerEndTime = null
  }
})

// Handle notification click — bring the app to focus
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || self.location.origin
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url)
    })
  )
})
