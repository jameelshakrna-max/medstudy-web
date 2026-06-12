import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const PomodoroContext = createContext(null)

const MODES = ['study', 'break', 'long']

// ══════════════════════════════════════════════════
//  SOUND SYSTEM — Web Audio API
// ══════════════════════════════════════════════════

let audioCtx = null

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
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
//  SERVICE WORKER — Send timer events for background
// ══════════════════════════════════════════════════

function getSWRegistration() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller
  }
  return null
}

function swStartTimer(endTime, mode) {
  const sw = getSWRegistration()
  if (sw) {
    sw.postMessage({ type: 'START_TIMER', endTime, mode })
  }
}

function swCancelTimer() {
  const sw = getSWRegistration()
  if (sw) {
    sw.postMessage({ type: 'CANCEL_TIMER' })
  }
}

// ══════════════════════════════════════════════════
//  CONTEXT PROVIDER
// ══════════════════════════════════════════════════

export function PomodoroProvider({ children }) {
  // ── Settings ──
  const [focusMins, setFocusMins] = useState(25)
  const [shortMins, setShortMins] = useState(5)
  const [longMins, setLongMins] = useState(15)

  // ── Timer state ──
  const [mode, setMode] = useState('study')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [seconds, setSeconds] = useState(25 * 60)
  const [totalSec, setTotalSec] = useState(25 * 60)

  // ── Session tracking ──
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [sessionPomodoros, setSessionPomodoros] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionLog, setSessionLog] = useState([])

  // ── Refs ──
  const rafRef = useRef(null)
  const endTimeRef = useRef(null)
  const lastTickRef = useRef(null)
  const totalRef = useRef(25 * 60)
  const modeRef = useRef('study')
  const doneRef = useRef(0)
  const runningRef = useRef(false)
  const completingRef = useRef(false)

  // ── Background timer refs ──
  const bgTimeoutRef = useRef(null)        // setTimeout that fires at endTime
  const bgChimedRef = useRef(false)        // prevent double chime

  // Keep refs in sync
  useEffect(() => { totalRef.current = totalSec }, [totalSec])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { doneRef.current = done }, [done])
  useEffect(() => { runningRef.current = running }, [running])

  // ── Unlock audio + request notification + register SW on mount ──
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('SW registered:', reg.scope)
      }).catch((err) => {
        console.warn('SW registration failed:', err)
      })
    }

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      // Defer until user gesture
      const onGesture = () => {
        Notification.requestPermission()
        document.removeEventListener('click', onGesture)
        document.removeEventListener('touchstart', onGesture)
        document.removeEventListener('keydown', onGesture)
      }
      document.addEventListener('click', onGesture, { once: true })
      document.addEventListener('touchstart', onGesture, { once: true })
      document.addEventListener('keydown', onGesture, { once: true })
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

  // ── Duration for a mode ──
  const getDuration = useCallback((m) => {
    return { study: focusMins, break: shortMins, long: longMins }[m] * 60
  }, [focusMins, shortMins, longMins])

  // ── Reset seconds when mode/durations change (only when NOT running) ──
  useEffect(() => {
    if (running) return
    const dur = getDuration(mode)
    setSeconds(dur)
    setTotalSec(dur)
    totalRef.current = dur
  }, [mode, focusMins, shortMins, longMins, running, getDuration])

  // ── Handle timer completion ──
  const handleComplete = useCallback(() => {
    if (completingRef.current) return
    completingRef.current = true

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    endTimeRef.current = null
    lastTickRef.current = null

    setRunning(false)
    setSeconds(0)

    // 🔔 Play chime (only if we haven't already chimed from background)
    if (!bgChimedRef.current) {
      playChime()
    }
    bgChimedRef.current = false

    // Cancel SW timer
    swCancelTimer()

    const currentMode = modeRef.current
    const currentDone = doneRef.current + 1
    setDone(currentDone)

    // Log entry
    const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
    setSessionLog(l => [{
      type: currentMode,
      label: MODE_LABELS[currentMode],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, ...l].slice(0, 10))

    // Auto-switch mode
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

  // ── Background timer completion (fires from setTimeout) ──
  const handleBackgroundComplete = useCallback(() => {
    bgChimedRef.current = true  // prevent double chime when rAF catches up
    playChime()

    // Also show a main-thread notification as backup
    // (the SW notification is the primary one for background/PWA)
    const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
    const label = MODE_LABELS[modeRef.current] || 'Timer'
    const body = modeRef.current === 'study'
      ? 'Great work! Time for a break.'
      : 'Break is over. Ready to focus?'
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`⏰ ${label} Complete`, {
          body,
          icon: '/icon.svg',
          tag: 'pomodoro-timer-main',
          requireInteraction: true,
          silent: false
        })
      } catch (_) {}
    }
  }, [])

  // ── Start background setTimeout timer ──
  const startBackgroundTimer = useCallback(() => {
    // Clear any existing
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

  // ── Core tick ──
  const tick = useCallback(() => {
    if (!endTimeRef.current) return

    const now = Date.now()
    const remainingMs = endTimeRef.current - now
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))

    if (remainingMs <= 0) {
      handleComplete()
      return
    }

    if (remainingSec !== lastTickRef.current) {
      lastTickRef.current = remainingSec
      setSeconds(remainingSec)
    }

    if (runningRef.current) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [handleComplete])

  // ── Start / stop the rAF loop + background timer ──
  useEffect(() => {
    if (!running) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
      swCancelTimer()
      return
    }

    if (!sessionStart) setSessionStart(Date.now())

    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + seconds * 1000
    }
    lastTickRef.current = null

    // Start rAF for visible display
    rafRef.current = requestAnimationFrame(tick)

    // Start background setTimeout (fires even in background tabs!)
    startBackgroundTimer()

    // Tell Service Worker about the timer (for PWA background)
    swStartTimer(endTimeRef.current, modeRef.current)

    unlockAudio()

    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility change: sync display on return ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!runningRef.current || !endTimeRef.current) return

      const remainingMs = endTimeRef.current - Date.now()
      if (remainingMs <= 0) {
        // Timer completed while we were away
        if (!completingRef.current) {
          handleComplete()
        }
        return
      }

      // Update display immediately
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
      lastTickRef.current = remainingSec
      setSeconds(remainingSec)

      // Restart rAF loop
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
    } else {
      const remaining = endTimeRef.current
        ? Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        : seconds
      setSeconds(remaining)
      endTimeRef.current = null
      lastTickRef.current = null
      if (bgTimeoutRef.current) { clearTimeout(bgTimeoutRef.current); bgTimeoutRef.current = null }
      swCancelTimer()
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
    swCancelTimer()
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
    swCancelTimer()
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
    swCancelTimer()
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

  // ── Derived ──
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
