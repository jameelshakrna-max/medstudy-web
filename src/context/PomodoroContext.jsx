import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const PomodoroContext = createContext(null)

const MODES = ['study', 'break', 'long']

// ══════════════════════════════════════════════════
//  SOUND SYSTEM — Web Audio API + Notification API
//  Works when: same tab, another tab, another app,
//  or mobile PWA in background
// ══════════════════════════════════════════════════

let audioCtx = null  // persistent across the session

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  // Resume if suspended (browsers auto-suspend after inactivity)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// Unlock AudioContext on first user gesture (required by all browsers)
function unlockAudio() {
  try {
    const ctx = getAudioCtx()
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, 22050)
    src.connect(ctx.destination)
    src.start(0)
    src.stop(0)
  } catch (_) { /* ignore */ }
}

// Play a pleasant chime sound (no external file needed — synthesized)
function playChime() {
  try {
    const ctx = getAudioCtx()
    const now = ctx.currentTime

    // Two-tone chime: C5 → E5 with soft fade
    const frequencies = [523.25, 659.25] // C5, E5

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

    // Second chime (echo, quieter)
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

// Show system notification (works when tab is hidden, PWA in background, etc.)
function notifyTimerEnd(mode) {
  const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
  const label = MODE_LABELS[mode] || 'Timer'
  const body = mode === 'study'
    ? 'Great work! Time for a break.'
    : 'Break is over. Ready to focus?'

  // Try Notification API
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(`⏰ ${label} Complete`, {
          body,
          icon: '/favicon.ico',
          tag: 'pomodoro-timer',
          requireInteraction: true,  // stays until user dismisses
          silent: false              // play system sound
        })
      } catch (_) { /* ServiceWorker notification fallback below */ }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          try {
            new Notification(`⏰ ${label} Complete`, {
              body,
              icon: '/favicon.ico',
              tag: 'pomodoro-timer',
              requireInteraction: true,
              silent: false
            })
          } catch (_) { /* ignore */ }
        }
      })
    }
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

  // ── Refs for precise timing ──
  const rafRef = useRef(null)
  const endTimeRef = useRef(null)
  const lastTickRef = useRef(null)
  const totalRef = useRef(25 * 60)
  const modeRef = useRef('study')
  const doneRef = useRef(0)
  const runningRef = useRef(false)
  const completingRef = useRef(false)

  // Keep refs in sync
  useEffect(() => { totalRef.current = totalSec }, [totalSec])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { doneRef.current = done }, [done])
  useEffect(() => { runningRef.current = running }, [running])

  // ── Unlock audio + request notification permission on mount ──
  useEffect(() => {
    // Unlock AudioContext on first user interaction
    const onGesture = () => {
      unlockAudio()
      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }
    document.addEventListener('click', onGesture, { once: true })
    document.addEventListener('touchstart', onGesture, { once: true })
    document.addEventListener('keydown', onGesture, { once: true })
    return () => {
      document.removeEventListener('click', onGesture)
      document.removeEventListener('touchstart', onGesture)
      document.removeEventListener('keydown', onGesture)
    }
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
    endTimeRef.current = null
    lastTickRef.current = null

    setRunning(false)
    setSeconds(0)

    const currentMode = modeRef.current
    const currentDone = doneRef.current + 1
    setDone(currentDone)

    // 🔔 Play chime + notification
    playChime()
    notifyTimerEnd(currentMode)

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

  // ── Start / stop the rAF loop ──
  useEffect(() => {
    if (!running) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    if (!sessionStart) setSessionStart(Date.now())

    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + seconds * 1000
    }
    lastTickRef.current = null

    // Unlock audio when starting timer (user gesture context)
    unlockAudio()

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility change: instant sync + catch completions that happened while away ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!runningRef.current || !endTimeRef.current) return

      const remainingMs = endTimeRef.current - Date.now()
      if (remainingMs <= 0) {
        // Timer completed while we were away — handleComplete plays chime + notification
        handleComplete()
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
      // Unlock audio on play (user gesture)
      unlockAudio()
    } else {
      const remaining = endTimeRef.current
        ? Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        : seconds
      setSeconds(remaining)
      endTimeRef.current = null
      lastTickRef.current = null
      setRunning(false)
    }
  }, [seconds, getDuration])

  const skipTimer = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
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
