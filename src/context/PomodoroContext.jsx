import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const PomodoroContext = createContext(null)

const MODES = ['study', 'break', 'long']

// ══════════════════════════════════════════════════
//  VAPID PUBLIC KEY (from server — safe to expose)
//  ⚠️ REPLACE THIS with YOUR key from running:
//     npx web-push generate-vapid-keys
//  Then also set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY
//  in Vercel environment variables.
// ══════════════════════════════════════════════════

const VAPID_PUBLIC_KEY = 'BPQiOPQCyl12r7GPgMcEMznoWTExFrX5cMMUE5UxFL-tZ4oiREo5ogD84_mv6xgWFUnp5vgGr2ySSSr2MheXWgU'

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

// Detect iOS PWA
function isIOSPWA() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    window.navigator.standalone === true
  )
}

// Detect iOS Safari (not PWA yet)
function isIOSSafari() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.navigator.standalone &&
    !window.MSStream
  )
}

// Subscribe to push and send subscription to server
async function subscribeToPush(userId) {
  if (!('serviceWorker' in navigator)) return null
  if (!('PushManager' in window)) return null

  try {
    const registration = await navigator.serviceWorker.ready

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      // iOS 16.4+ requires notification permission to be requested
      // from within a user gesture. The caller should ensure this
      // is called from a click/touch handler.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        console.warn('Notification permission denied')
        return null
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })

      // Send VAPID key to SW for pushsubscriptionchange
      navigator.serviceWorker.controller?.postMessage({
        type: 'SET_VAPID_KEY',
        vapidKey: VAPID_PUBLIC_KEY
      })
    }

    // Save subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        subscription: subscription.toJSON()
      })
    })

    return subscription
  } catch (err) {
    console.warn('Push subscription failed:', err)
    return null
  }
}

// Schedule a server-side push notification for when timer ends
async function schedulePushNotification(userId, endTime, mode) {
  try {
    await fetch('/api/push/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, end_time: endTime, mode })
    })
  } catch (err) {
    console.warn('Schedule push failed:', err)
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

  const rafRef = useRef(null)
  const endTimeRef = useRef(null)
  const lastTickRef = useRef(null)
  const totalRef = useRef(25 * 60)
  const modeRef = useRef('study')
  const doneRef = useRef(0)
  const runningRef = useRef(false)
  const completingRef = useRef(false)
  const bgTimeoutRef = useRef(null)
  const bgChimedRef = useRef(false)
  const pushSubscribedRef = useRef(false)
  const swReadyRef = useRef(false)

  useEffect(() => { totalRef.current = totalSec }, [totalSec])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { doneRef.current = done }, [done])
  useEffect(() => { runningRef.current = running }, [running])

  // ── Register SW + set up push subscription on user gesture ──
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(async (reg) => {
        console.log('SW registered:', reg.scope)
        swReadyRef.current = true

        // Wait for SW to be active
        if (reg.active) {
          reg.active.postMessage({ type: 'SET_VAPID_KEY', vapidKey: VAPID_PUBLIC_KEY })
        } else {
          reg.addEventListener('activate', () => {
            reg.active?.postMessage({ type: 'SET_VAPID_KEY', vapidKey: VAPID_PUBLIC_KEY })
          })
        }

        // On iOS, we MUST subscribe to push during a user gesture.
        // This is the key fix: we listen for the FIRST user interaction
        // (click/touch/keydown) and subscribe then.
        const onGesture = async () => {
          if (pushSubscribedRef.current) return
          pushSubscribedRef.current = true

          try {
            // Dynamically import supabase to get the current user
            const { supabase } = await import('../lib/supabase')
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              await subscribeToPush(user.id)
            }
          } catch (e) {
            console.warn('Auto push subscribe failed:', e)
          }

          document.removeEventListener('click', onGesture)
          document.removeEventListener('touchstart', onGesture)
          document.removeEventListener('keydown', onGesture)
        }

        document.addEventListener('click', onGesture, { once: false })
        document.addEventListener('touchstart', onGesture, { once: false })
        document.addEventListener('keydown', onGesture, { once: false })
      }).catch((err) => {
        console.warn('SW registration failed:', err)
      })
    }

    // Unlock audio on first user gesture
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
    if (running) return
    const dur = getDuration(mode)
    setSeconds(dur)
    setTotalSec(dur)
    totalRef.current = dur
  }, [mode, focusMins, shortMins, longMins, running, getDuration])

  const handleComplete = useCallback(() => {
    if (completingRef.current) return
    completingRef.current = true

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null

    setRunning(false)
    setSeconds(0)

    if (!bgChimedRef.current) {
      playChime()
    }
    bgChimedRef.current = false

    const currentMode = modeRef.current
    const currentDone = doneRef.current + 1
    setDone(currentDone)

    const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
    setSessionLog(l => [{
      type: currentMode,
      label: MODE_LABELS[currentMode],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, ...l].slice(0, 10))

    if (currentMode === 'study') {
      setSessionPomodoros(p => p + 1)
      const nextMode = currentDone % 4 === 0 ? 'long' : 'break'
      const nextDur = { study: focusMins, break: shortMins, long: longMins }[nextMode] * 60
      setMode(nextMode)
      setSeconds(nextDur)
      setTotalSec(nextDur)
      totalRef.current = nextDur
    } else {
      const nextDur = focusMins * 60
      setMode('study')
      setSeconds(nextDur)
      setTotalSec(nextDur)
      totalRef.current = nextDur
    }

    setTimeout(() => { completingRef.current = false }, 100)
  }, [focusMins, shortMins, longMins])

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
    // This is the key iOS fix: even if iOS suspends our JS,
    // the server will send the push at the right time.
    ;(async () => {
      try {
        const { supabase } = await import('../lib/supabase')
        const { data: { user } } = await supabase.auth.getUser()
        if (user && endTimeRef.current) {
          await schedulePushNotification(user.id, endTimeRef.current, modeRef.current)
        }
      } catch (e) {
        console.warn('Schedule push failed:', e)
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
        if (!completingRef.current) handleComplete()
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
        totalRef.current = dur
        endTimeRef.current = Date.now() + dur * 1000
      } else {
        endTimeRef.current = Date.now() + seconds * 1000
      }
      completingRef.current = false
      setRunning(true)
      unlockAudio()

      // ── iOS: Re-subscribe on play if needed ──
      // iOS can revoke push subscriptions. Re-confirm on each play.
      ;(async () => {
        try {
          if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
          const registration = await navigator.serviceWorker.ready
          const existingSub = await registration.pushManager.getSubscription()
          if (!existingSub) {
            const { supabase } = await import('../lib/supabase')
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              await subscribeToPush(user.id)
            }
          }
        } catch (e) {
          console.warn('Re-subscribe check failed:', e)
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
    }
  }, [seconds, getDuration])

  const skipTimer = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null
    completingRef.current = false
    setRunning(false)
    const idx = MODES.indexOf(modeRef.current)
    const next = MODES[(idx + 1) % MODES.length]
    const dur = { study: focusMins, break: shortMins, long: longMins }[next] * 60
    setMode(next)
    setSeconds(dur)
    setTotalSec(dur)
    totalRef.current = dur
  }, [focusMins, shortMins, longMins])

  const resetTimer = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null
    completingRef.current = false
    setRunning(false)
    const dur = getDuration(modeRef.current)
    setSeconds(dur)
    setTotalSec(dur)
    totalRef.current = dur
  }, [getDuration])

  const resetSession = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null
    completingRef.current = false
    setRunning(false)
    setDone(0)
    setSessionPomodoros(0)
    setSessionStart(null)
    setSessionLog([])
    setMode('study')
    const dur = focusMins * 60
    setSeconds(dur)
    setTotalSec(dur)
    totalRef.current = dur
  }, [focusMins])

  const displayRemaining = (() => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })()

  const progress = totalSec > 0 ? (totalSec - seconds) / totalSec : 0

  const value = {
    mode, setMode,
    running, setRunning,
    done, setDone,
    seconds, totalSec,
    focusMins, setFocusMins,
    shortMins, setShortMins,
    longMins, setLongMins,
    selectedTopic, setSelectedTopic,
    sessionPomodoros, setSessionPomodoros,
    sessionStart, setSessionStart,
    sessionLog, setSessionLog,
    resetSession,
    displayRemaining,
    progress,
    togglePlay,
    skipTimer,
    resetTimer,
  }

  return (
    <PomodoroContext.Provider value={value}>
      {children}
    </PomodoroContext.Provider>
  )
}

export function usePomodoro() {
  const ctx = useContext(PomodoroContext)
  if (!ctx) throw new Error('usePomodoro must be used inside PomodoroProvider')
  return ctx
}
