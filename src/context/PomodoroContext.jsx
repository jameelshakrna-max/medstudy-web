import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const PomodoroContext = createContext(null)

const MODES = ['study', 'break', 'long']

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
  const rafRef = useRef(null)            // requestAnimationFrame ID
  const endTimeRef = useRef(null)         // absolute timestamp when timer = 0
  const lastTickRef = useRef(null)        // last second we rendered (avoid redundant setSeconds)
  const totalRef = useRef(25 * 60)        // mirrors totalSec
  const modeRef = useRef('study')
  const doneRef = useRef(0)
  const runningRef = useRef(false)        // mirror of running for callbacks
  const completingRef = useRef(false)     // guard against double completion

  // Keep refs in sync
  useEffect(() => { totalRef.current = totalSec }, [totalSec])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { doneRef.current = done }, [done])
  useEffect(() => { runningRef.current = running }, [running])

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
    // Guard: prevent double-fire
    if (completingRef.current) return
    completingRef.current = true

    clearInterval(rafRef.current)
    rafRef.current = null
    endTimeRef.current = null
    lastTickRef.current = null

    setRunning(false)
    setSeconds(0)

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

    // Reset guard after state settles
    setTimeout(() => { completingRef.current = false }, 100)
  }, [focusMins, shortMins, longMins])

  // ── Core tick: calculates from Date.now() vs endTimeRef ──
  const tick = useCallback(() => {
    if (!endTimeRef.current) return

    const now = Date.now()
    const remainingMs = endTimeRef.current - now
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))

    // Timer completed?
    if (remainingMs <= 0) {
      handleComplete()
      return
    }

    // Only update React state when the second changes (avoid wasted renders)
    if (remainingSec !== lastTickRef.current) {
      lastTickRef.current = remainingSec
      setSeconds(remainingSec)
    }

    // Keep looping with rAF while visible
    if (runningRef.current) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [handleComplete])

  // ── Start / stop the rAF loop based on running state ──
  useEffect(() => {
    if (!running) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    if (!sessionStart) setSessionStart(Date.now())

    // Set endTime if not already set (fresh start)
    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + seconds * 1000
    }
    lastTickRef.current = null

    // Start rAF loop
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility change: instant sync when tab/app becomes visible ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!runningRef.current || !endTimeRef.current) return

      // Check if timer completed while away
      const remainingMs = endTimeRef.current - Date.now()
      if (remainingMs <= 0) {
        handleComplete()
        return
      }

      // Update display immediately with correct time
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
      lastTickRef.current = remainingSec
      setSeconds(remainingSec)

      // Restart rAF loop
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }

    document.addEventListener('visibilitychange', onVisible)
    // Also handle iOS PWA resume (pageshow fires when PWA comes back)
    window.addEventListener('pageshow', onVisible)
    // Handle focus event as fallback
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
      // Starting or resuming
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
    } else {
      // Pausing — calculate real remaining from clock
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

  // ── Derived: display string ──
  const displayRemaining = (() => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })()

  // ── Derived: progress (0 → 1) ──
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
