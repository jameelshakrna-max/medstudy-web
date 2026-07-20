import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const PomodoroTimerContext = createContext(null)
const PomodoroSettingsContext = createContext(null)

const MODES = ['study', 'break', 'long']

// ══════════════════════════════════════════════════
//  VAPID PUBLIC KEY — REPLACE WITH YOUR OWN KEY
// ══════════════════════════════════════════════════

const PUSH_ENABLED = true
const VAPID_PUBLIC_KEY = 'BL1DR63woanpTniR80ObGZ3E2XeeSdmQoU1O8HKmVML6Lh40n58v05jg6cIkfCenkS8jkMyc81zX_fV-xdc1VHI'

// Convert base64 string to Uint8Array for push subscription
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// ══════════════════════════════════════════════════
//  SOUND SYSTEM
// ══════════════════════════════════════════════════

let audioCtx = null

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function unlockAudio() {
  try {
    const ctx = getAudioCtx()
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, 22050)
    src.connect(ctx.destination)
    src.start(0)
    src.stop(0)
  } catch (_) {}
}

function playChime() {
  try {
    const ctx = getAudioCtx()
    const now = ctx.currentTime
    const frequencies = [523.25, 659.25]

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * 0.15)
      gain.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.7)
    })

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + 0.4 + i * 0.15)
      gain.gain.linearRampToValueAtTime(0.15, now + 0.4 + i * 0.15 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4 + i * 0.15 + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + 0.4 + i * 0.15)
      osc.stop(now + 0.4 + i * 0.15 + 0.6)
    })
  } catch (e) {
    console.warn('Audio chime failed:', e)
  }
}

// ══════════════════════════════════════════════════
//  PUSH NOTIFICATION HELPERS
// ══════════════════════════════════════════════════

function pushLog(msg) {
  console.log('[Push]', msg)
}

// Show an instant local notification (no server round-trip)
async function showLocalNotification(mode) {
  try {
    const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
    const label = MODE_LABELS[mode] || 'Timer'
    const body = mode === 'study'
      ? 'Great work! Time for a break.'
      : 'Break is over. Ready to focus?'

    // Try service worker first (works on iOS PWA)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        pushLog('Showing local notification via SW')
        reg.showNotification(label + ' Complete', {
          body,
          tag: 'pomodoro-timer',
          icon: '/icon.svg',
          badge: '/icon.svg',
          requireInteraction: true,
          silent: false,
          vibrate: [200, 100, 200, 100, 200],
          data: {
            url: window.location.origin + '/pomodoro',
            mode
          }
        })
        return
      }
    }

    // Fallback: direct Notification API
    if (Notification.permission === 'granted') {
      pushLog('Showing local notification via Notification API')
      new Notification(label + ' Complete', {
        body,
        tag: 'pomodoro-timer',
        icon: '/icon.svg',
        badge: '/icon.svg'
      })
    } else {
      pushLog('Cannot show notification: permission=' + Notification.permission)
    }
  } catch (e) {
    pushLog('Local notification error: ' + e.message)
  }
}

// Subscribe to push and send subscription to server
async function subscribeToPush(userId) {
  if (!PUSH_ENABLED) return
  pushLog('subscribeToPush called for: ' + userId?.substring(0, 8) + '...')

  if (!('serviceWorker' in navigator)) {
    pushLog('ERROR: Service Worker not supported')
    return null
  }
  if (!('PushManager' in window)) {
    pushLog('ERROR: PushManager not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    pushLog('SW ready')

    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      pushLog('No subscription yet, requesting permission...')
      const permission = await Notification.requestPermission()
      pushLog('Permission result: ' + permission)

      if (permission !== 'granted') {
        pushLog('ERROR: Permission denied')
        return null
      }

      pushLog('Creating push subscription...')
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
      pushLog('Subscription created OK')

      navigator.serviceWorker.controller?.postMessage({
        type: 'SET_VAPID_KEY',
        vapidKey: VAPID_PUBLIC_KEY
      })
    } else {
      pushLog('Already subscribed')
    }

    // Save subscription to server — with JWT auth
    pushLog('Sending subscription to /api/push/subscribe...')
    const { data: { session } } = await supabase.auth.getSession()
    const subRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token
      },
      body: JSON.stringify({
        user_id: userId,
        subscription: subscription.toJSON()
      })
    })
    const subText = await subRes.text()
    try {
      const subData = JSON.parse(subText)
      pushLog('Subscribe API: ' + subRes.status + ' ' + JSON.stringify(subData))
    } catch (_) {
      pushLog('Subscribe API: ' + subRes.status + ' (non-JSON response): ' + subText.substring(0, 200))
    }

    return subscription
  } catch (err) {
    pushLog('ERROR: subscribeToPush failed: ' + err.message)
    return null
  }
}

// Schedule a server-side push notification for when timer ends
async function schedulePushNotification(userId, endTime, mode) {
  if (!PUSH_ENABLED) return
  pushLog('Scheduling push for ' + mode + ' at ' + new Date(endTime).toLocaleTimeString())

  const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
  const label = MODE_LABELS[mode] || 'Timer'
  const duration_ms = Math.max(0, endTime - Date.now())

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/push/schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token
      },
      body: JSON.stringify({
        type: 'timer_complete',
        title: label + ' Complete',
        body: mode === 'study'
          ? 'Great work! Time for a break.'
          : 'Break is over. Ready to focus?',
        url: '/pomodoro',
        duration_ms
      })
    })
    const resText = await res.text()
    try {
      const data = JSON.parse(resText)
      pushLog('Schedule API: ' + res.status + ' ' + JSON.stringify(data))
    } catch (_) {
      pushLog('Schedule API: ' + res.status + ' (non-JSON response): ' + resText.substring(0, 200))
    }
  } catch (err) {
    pushLog('ERROR: Schedule failed: ' + err.message)
  }
}

// Cancel scheduled push notification (called on pause, skip, reset, manual finish)
async function cancelPushNotification() {
  if (!PUSH_ENABLED) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/push/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ type: 'timer_complete' })
    })
    pushLog('Cancelled scheduled push')
  } catch (err) {
    pushLog('Cancel push error: ' + err.message)
  }
}

// ══════════════════════════════════════════════════
//  CONTEXT PROVIDER
// ══════════════════════════════════════════════════

export function PomodoroProvider({ children }) {
  const [focusMins, setFocusMins] = useState(25)
  const [shortMins, setShortMins] = useState(5)
  const [longMins, setLongMins] = useState(15)

  const [mode, setMode] = useState('study')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [seconds, setSeconds] = useState(25 * 60)
  const [totalSec, setTotalSec] = useState(25 * 60)

  const [selectedTopic, setSelectedTopic] = useState(null)
  const [sessionPomodoros, setSessionPomodoros] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionLog, setSessionLog] = useState([])
  const [activeStudySeconds, setActiveStudySeconds] = useState(0)

  // ── Forest tree state ──
  const [selectedTree, setSelectedTree] = useState('oak')
  const [treeStatus, setTreeStatus] = useState('IDLE') // IDLE | RUNNING | SUCCESS | FAILED

  // ── Session tree ID (locked at Plant press, survives navigation/remount) ──
  const [sessionTreeId, setSessionTreeId] = useState(null)

  // ── Session outcome ──
  const [completed, setCompleted] = useState(false)
  const [failed, setFailed] = useState(false)

  // ── Focus mode state ──
  const [focusMode, setFocusMode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Derived session phase ──
  const sessionPhase = useMemo(() => {
    if (running) return 'running'
    if (!running && seconds < totalSec && seconds > 0) return 'paused'
    return 'setup'
  }, [running, seconds, totalSec])

  const sessionOutcome = completed ? 'completed' : failed ? 'failed' : null
  const isSetup = sessionPhase === 'setup' && !sessionOutcome
  const isActive = (sessionPhase === 'running' || sessionPhase === 'paused') && !sessionOutcome

  // ── Persist timer state to localStorage ──
  const saveTimerState = useCallback((overrides = {}) => {
    try {
      const state = {
        mode, running, seconds, totalSec,
        selectedTopic, sessionPomodoros, activeStudySeconds,
        treeStatus, selectedTree, sessionTreeId, completed, failed,
        savedAt: Date.now(),
        ...overrides,
      }
      localStorage.setItem('pomodoro_state', JSON.stringify(state))
    } catch (_) {}
  }, [mode, running, seconds, totalSec, selectedTopic, sessionPomodoros, activeStudySeconds, treeStatus, selectedTree, sessionTreeId, completed, failed])

  // ── Recover timer state on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pomodoro_state')
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved?.savedAt) return

      // Only recover if saved within last 2 hours
      const age = Date.now() - saved.savedAt
      if (age > 2 * 60 * 60 * 1000) {
        localStorage.removeItem('pomodoro_state')
        return
      }

      if (saved.mode && ['study', 'break', 'long'].includes(saved.mode)) setMode(saved.mode)
      if (saved.selectedTopic) setSelectedTopic(saved.selectedTopic)
      if (saved.sessionPomodoros) setSessionPomodoros(saved.sessionPomodoros)
      if (saved.activeStudySeconds) setActiveStudySeconds(saved.activeStudySeconds)
      if (saved.selectedTree) setSelectedTree(saved.selectedTree)
      if (saved.sessionTreeId) setSessionTreeId(saved.sessionTreeId)
      if (saved.completed) setCompleted(true)
      if (saved.failed) setFailed(true)

      // If timer was running, calculate remaining time
      if (saved.running && saved.seconds > 0) {
        const elapsed = Math.floor(age / 1000)
        const remaining = Math.max(0, saved.seconds - elapsed)
        if (remaining > 0) {
          setSeconds(remaining)
          setTotalSec(saved.totalSec || saved.seconds)
          setTreeStatus('RUNNING')
          // Don't auto-resume — let user decide
        } else {
          // Timer expired while away
          setSeconds(0)
          setTotalSec(saved.totalSec || 25 * 60)
        }
      } else if (saved.seconds !== undefined) {
        setSeconds(saved.seconds)
        setTotalSec(saved.totalSec || 25 * 60)
      }
    } catch (_) {}
    recoveryDoneRef.current = true
  }, []) // Run once on mount

  // ── Auto-save on state changes (debounced) ──
  useEffect(() => {
    const timeout = setTimeout(() => saveTimerState(), 1000)
    return () => clearTimeout(timeout)
  }, [mode, running, selectedTopic, sessionPomodoros, treeStatus, selectedTree, sessionTreeId, completed, failed, saveTimerState])

  // ── Periodic save for timer values (every 5s while running) ──
  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      try {
        const state = {
          mode, running: true,
          seconds, totalSec, activeStudySeconds,
          selectedTopic, sessionPomodoros,
          treeStatus, selectedTree, sessionTreeId, completed, failed,
          savedAt: Date.now(),
        }
        localStorage.setItem('pomodoro_state', JSON.stringify(state))
      } catch (_) {}
    }, 5000)
    return () => clearInterval(interval)
  }, [mode, running, seconds, totalSec, activeStudySeconds, selectedTopic, sessionPomodoros, treeStatus, selectedTree, sessionTreeId, completed, failed])

  const rafRef = useRef(null)
  const endTimeRef = useRef(null)
  const lastTickRef = useRef(null)
  const modeRef = useRef('study')
  const doneRef = useRef(0)
  const runningRef = useRef(false)
  const completingRef = useRef(false)
  const bgTimeoutRef = useRef(null)
  const bgChimedRef = useRef(false)
  const pushSubscribedRef = useRef(false)
  const swReadyRef = useRef(false)
  const recoveryDoneRef = useRef(false)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { doneRef.current = done }, [done])
  useEffect(() => { runningRef.current = running }, [running])

  // ── Send VAPID key to SW (registered by vite-plugin-pwa) ──
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.ready.then(async (reg) => {
      pushLog('SW ready, sending VAPID key...')
      swReadyRef.current = true

      if (reg.active) {
        reg.active.postMessage({ type: 'SET_VAPID_KEY', vapidKey: VAPID_PUBLIC_KEY })
      }

      // On iOS, we MUST subscribe to push during a user gesture
      const onGesture = async () => {
        if (pushSubscribedRef.current) return
        pushSubscribedRef.current = true
        pushLog('User gesture detected, checking auth...')

        try {
          const { data: { user } } = await supabase.auth.getUser()

          if (user) {
            pushLog('User logged in: ' + user.id.substring(0, 8) + '...')
            await subscribeToPush(user.id)
          } else {
            pushLog('ERROR: No user logged in! Cannot subscribe.')
            pushSubscribedRef.current = false
          }
        } catch (e) {
          pushLog('ERROR: Auth check failed: ' + e.message)
          pushSubscribedRef.current = false
        }

        document.removeEventListener('click', onGesture)
        document.removeEventListener('touchstart', onGesture)
        document.removeEventListener('keydown', onGesture)
      }

      document.addEventListener('click', onGesture, { once: false })
      document.addEventListener('touchstart', onGesture, { once: false })
      document.addEventListener('keydown', onGesture, { once: false })
    }).catch((err) => {
      pushLog('ERROR: SW ready failed: ' + err.message)
    })

    const unlock = () => {
      unlockAudio()
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('keydown', unlock)
    }
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('touchstart', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
  }, [])

  const getDuration = useCallback((m) => {
    return { study: focusMins, break: shortMins, long: longMins }[m] * 60
  }, [focusMins, shortMins, longMins])

  useEffect(() => {
    if (!recoveryDoneRef.current) return
    const dur = getDuration(mode)
    setSeconds(dur)
    setTotalSec(dur)
  }, [mode, focusMins, shortMins, longMins, getDuration])

  const DURATION_LIMITS = {
    study: { min: 5, max: 120 },
    break: { min: 1, max: 30 },
    long: { min: 5, max: 60 },
  }

  const setModeDuration = useCallback((targetMode, minutes) => {
    if (sessionPhase !== 'setup') return
    const { min, max } = DURATION_LIMITS[targetMode]
    const safe = Math.max(min, Math.min(max, minutes))
    if (targetMode === 'study') setFocusMins(safe)
    else if (targetMode === 'break') setShortMins(safe)
    else setLongMins(safe)
  }, [sessionPhase])

  const handleComplete = useCallback(() => {
    if (completingRef.current) return
    completingRef.current = true

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null

    setRunning(false)
    setSeconds(0)
    setTreeStatus('IDLE')

    const currentMode = modeRef.current
    const currentDone = doneRef.current + 1
    const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }

    if (currentMode === 'study') {
      setCompleted(true)
      setTreeStatus('SUCCESS')
      setTimeout(() => setTreeStatus('IDLE'), 3000)

      if (!bgChimedRef.current) {
        const soundEnabled = localStorage.getItem('medstudy-sound-enabled') !== 'false'
        if (soundEnabled) playChime()
        showLocalNotification(currentMode)
      }
      bgChimedRef.current = false
      cancelPushNotification()

      setSessionPomodoros(p => p + 1)
    } else {
      bgChimedRef.current = false
      cancelPushNotification()
      advanceToNextMode()
    }

    setDone(currentDone)
    setSessionLog(l => [{
      type: currentMode,
      label: MODE_LABELS[currentMode],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, ...l].slice(0, 10))

    setTimeout(() => { completingRef.current = false }, 100)
  }, [advanceToNextMode])

  const handleBackgroundComplete = useCallback(() => {
    bgChimedRef.current = true
    playChime()
  }, [])

  const startBackgroundTimer = useCallback(() => {
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    if (!endTimeRef.current) return
    const delay = endTimeRef.current - Date.now()
    if (delay > 0) {
      bgTimeoutRef.current = setTimeout(() => {
        bgTimeoutRef.current = null
        handleBackgroundComplete()
      }, delay)
    }
  }, [handleBackgroundComplete])

  const tick = useCallback(() => {
    if (!endTimeRef.current) return
    const now = Date.now()
    const remainingMs = endTimeRef.current - now
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
    if (remainingMs <= 0) { handleComplete(); return }
    if (remainingSec !== lastTickRef.current) {
      lastTickRef.current = remainingSec
      setSeconds(remainingSec)
      if (modeRef.current === 'study') {
        setActiveStudySeconds(s => s + 1)
      }
    }
    if (runningRef.current) { rafRef.current = requestAnimationFrame(tick) }
  }, [handleComplete])

  // ── Start / stop timer ──
  useEffect(() => {
    if (!running) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
      return
    }

    if (!sessionStart) setSessionStart(Date.now())
    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + seconds * 1000
    }
    lastTickRef.current = null

    rafRef.current = requestAnimationFrame(tick)
    startBackgroundTimer()
    unlockAudio()

    // ── Schedule server-side push notification ──
    ;(async () => {
      try {
        pushLog('Timer started, checking auth for push schedule...')
        const { data: { user } } = await supabase.auth.getUser()
        if (user && endTimeRef.current) {
          pushLog('Scheduling push for user: ' + user.id.substring(0, 8) + '...')
          await schedulePushNotification(user.id, endTimeRef.current, modeRef.current)
        } else {
          pushLog('ERROR: No user or no endTime — push NOT scheduled')
        }
      } catch (e) {
        pushLog('ERROR: Schedule push failed: ' + e.message)
      }
    })()

    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility change ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!runningRef.current || !endTimeRef.current) return
      const remainingMs = endTimeRef.current - Date.now()
      if (remainingMs <= 0) {
        if (!completingRef.current) {
          handleComplete()
        }
        return
      }
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
      lastTickRef.current = remainingSec
      setSeconds(remainingSec)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [handleComplete, tick])

  // ── Actions ──
  const togglePlay = useCallback(() => {
    if (!runningRef.current) {
      if (seconds <= 0) {
        const dur = getDuration(modeRef.current)
        setSeconds(dur)
        setTotalSec(dur)
        endTimeRef.current = Date.now() + dur * 1000
      } else {
        endTimeRef.current = Date.now() + seconds * 1000
      }
      completingRef.current = false
      setRunning(true)
      setTreeStatus('RUNNING')
      unlockAudio()

      // ── iOS: Re-subscribe on play if needed ──
      ;(async () => {
        try {
          if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
          const registration = await navigator.serviceWorker.ready
          const existingSub = await registration.pushManager.getSubscription()
          if (!existingSub) {
            pushLog('No subscription on play, re-subscribing...')
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              await subscribeToPush(user.id)
            } else {
              pushLog('ERROR: No user — cannot re-subscribe')
            }
          }
        } catch (e) {
          pushLog('ERROR: Re-subscribe failed: ' + e.message)
        }
      })()
    } else {
      const remaining = endTimeRef.current
        ? Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        : seconds
      setSeconds(remaining)
      endTimeRef.current = null
      lastTickRef.current = null
      if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
      setRunning(false)
      cancelPushNotification()
    }
  }, [seconds, getDuration])

  const skipTimer = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null
    completingRef.current = false
    setRunning(false)
    setCompleted(false)
    setFailed(false)
    cancelPushNotification()
    const idx = MODES.indexOf(modeRef.current)
    const next = MODES[(idx + 1) % MODES.length]
    const dur = { study: focusMins, break: shortMins, long: longMins }[next] * 60
    setMode(next)
    setSeconds(dur)
    setTotalSec(dur)
  }, [focusMins, shortMins, longMins])

  const finishTimer = useCallback(() => {
    if (completingRef.current) return
    completingRef.current = true

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null
    cancelPushNotification()

    const currentMode = modeRef.current

    setRunning(false)
    setSeconds(0)

    if (currentMode === 'study') {
      setFailed(true)
      setTreeStatus('FAILED')
      setTimeout(() => setTreeStatus('IDLE'), 2000)
    } else {
      advanceToNextMode()
    }

    setDone(doneRef.current + 1)

    const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
    setSessionLog(l => [{
      type: currentMode,
      label: MODE_LABELS[currentMode],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, ...l].slice(0, 10))

    setTimeout(() => { completingRef.current = false }, 100)
  }, [advanceToNextMode])

  const resetTimer = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null
    completingRef.current = false
    setRunning(false)
    setCompleted(false)
    setFailed(false)
    cancelPushNotification()
    setTreeStatus('IDLE')
    const dur = getDuration(modeRef.current)
    setSeconds(dur)
    setTotalSec(dur)
  }, [getDuration])

  const resetSession = useCallback(() => {
    try { localStorage.removeItem('pomodoro_state') } catch (_) {}
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null
    completingRef.current = false
    setRunning(false)
    setCompleted(false)
    setFailed(false)
    setDone(0)
    setSessionPomodoros(0)
    setActiveStudySeconds(0)
    setSessionStart(null)
    setSessionLog([])
    setMode('study')
    setTreeStatus('IDLE')
    setSessionTreeId(null)
    const dur = focusMins * 60
    setSeconds(dur)
    setTotalSec(dur)
  }, [focusMins])

  const advanceToNextMode = useCallback(() => {
    setCompleted(false)
    setFailed(false)
    setTreeStatus('IDLE')
    const idx = MODES.indexOf(modeRef.current)
    const next = MODES[(idx + 1) % MODES.length]
    const dur = { study: focusMins, break: shortMins, long: longMins }[next] * 60
    setMode(next)
    setSeconds(dur)
    setTotalSec(dur)
  }, [focusMins, shortMins, longMins])

  // ── Focus mode + fullscreen ──
  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => {
      const next = !prev
      if (next && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      } else if (!next && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
      return next
    })
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (_) {}
  }, [])

  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement
      setIsFullscreen(fs)
      // Auto-exit focus mode when user exits fullscreen (e.g. Escape key)
      if (!fs) setFocusMode(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const displayRemaining = (() => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })()

  const progress = totalSec > 0 ? (totalSec - seconds) / totalSec : 0

  const timerValue = useMemo(() => ({
    mode, setMode,
    running, setRunning,
    done, setDone,
    seconds, totalSec,
    displayRemaining,
    progress,
    togglePlay, skipTimer, finishTimer, resetTimer, resetSession,
    cancelPushNotification,
    treeStatus, setTreeStatus,
    focusMode, isFullscreen, toggleFocusMode, toggleFullscreen,
    sessionPhase, sessionOutcome, isSetup, isActive,
    setModeDuration, advanceToNextMode,
    sessionTreeId, setSessionTreeId,
  }), [
    mode, running, done, seconds, totalSec,
    displayRemaining, progress,
    togglePlay, skipTimer, finishTimer, resetTimer, resetSession,
    treeStatus,
    focusMode, isFullscreen, toggleFocusMode, toggleFullscreen,
    sessionPhase, sessionOutcome, isSetup, isActive,
    setModeDuration, advanceToNextMode,
    sessionTreeId,
  ])

  const settingsValue = useMemo(() => ({
    focusMins, setFocusMins,
    shortMins, setShortMins,
    longMins, setLongMins,
    selectedTopic, setSelectedTopic,
    sessionPomodoros, setSessionPomodoros,
    sessionStart, setSessionStart,
    sessionLog, setSessionLog,
    activeStudySeconds, setActiveStudySeconds,
    selectedTree, setSelectedTree,
  }), [
    focusMins, shortMins, longMins,
    selectedTopic,
    sessionPomodoros, sessionStart, sessionLog, activeStudySeconds,
    selectedTree,
  ])

  return (
    <PomodoroTimerContext.Provider value={timerValue}>
      <PomodoroSettingsContext.Provider value={settingsValue}>
        {children}
      </PomodoroSettingsContext.Provider>
    </PomodoroTimerContext.Provider>
  )
}

export function usePomodoro() {
  const ctx = useContext(PomodoroTimerContext)
  if (!ctx) throw new Error('usePomodoro must be used inside PomodoroProvider')
  return ctx
}

export function usePomodoroSettings() {
  const ctx = useContext(PomodoroSettingsContext)
  if (!ctx) throw new Error('usePomodoroSettings must be used inside PomodoroProvider')
  return ctx
}


