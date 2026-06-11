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
  const [seconds, setSeconds] = useState(25 * 60)   // remaining seconds (derived from endTime)
  const [totalSec, setTotalSec] = useState(25 * 60) // total for current mode

  // ── Session tracking ──
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [sessionPomodoros, setSessionPomodoros] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionLog, setSessionLog] = useState([])

  // ── Refs for precise timing ──
  const intervalRef = useRef(null)
  const endTimeRef = useRef(null)    // absolute timestamp when timer reaches 0
  const totalRef = useRef(25 * 60)   // mirrors totalSec for progress calc
  const modeRef = useRef('study')    // latest mode for completion logic
  const doneRef = useRef(0)          // latest done count for auto-switch logic

  // Keep refs in sync with state
  useEffect(() => { totalRef.current = totalSec }, [totalSec])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { doneRef.current = done }, [done])

  // ── Duration for current mode ──
  const getDuration = useCallback((m) => {
    return { study: focusMins, break: shortMins, long: longMins }[m] * 60
  }, [focusMins, shortMins, longMins])

  // ── Reset seconds when mode or durations change (only when NOT running) ──
  useEffect(() => {
    if (running) return
    const dur = getDuration(mode)
    setSeconds(dur)
    setTotalSec(dur)
    totalRef.current = dur
  }, [mode, focusMins, shortMins, longMins, running, getDuration])

  // ── Handle timer completion (extracted to avoid stale closures) ──
  const handleComplete = useCallback(() => {
    setRunning(false)
    setSeconds(0)
    setDone(d => d + 1)

    const currentMode = modeRef.current
    const currentDone = doneRef.current

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
      const nextMode = (currentDone + 1) % 4 === 0 ? 'long' : 'break'
      setTimeout(() => {
        setMode(nextMode)
        const dur = { study: focusMins, break: shortMins, long: longMins }[nextMode] * 60
        setSeconds(dur)
        setTotalSec(dur)
        totalRef.current = dur
      }, 500)
    } else {
      setTimeout(() => {
        setMode('study')
        const dur = focusMins * 60
        setSeconds(dur)
        setTotalSec(dur)
        totalRef.current = dur
      }, 500)
    }
  }, [focusMins, shortMins, longMins])

  // ── Core tick: calculate remaining from absolute endTime ──
  const tick = useCallback(() => {
    const remaining = Math.round((endTimeRef.current - Date.now()) / 1000)
    if (remaining <= 0) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      handleComplete()
      return
    }
    setSeconds(remaining)
  }, [handleComplete])

  // ── Start / stop interval based on running state ──
  useEffect(() => {
    if (!running) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      return
    }
    if (!sessionStart) setSessionStart(Date.now())

    // Set absolute end time if not already set (resume case)
    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + seconds * 1000
    }

    // Tick every 250ms for smooth display (calculates from clock — no drift)
    intervalRef.current = setInterval(tick, 250)
    tick() // immediate first tick

    return () => {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── On tab visibility change: force immediate tick to sync display ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && running && endTimeRef.current) {
        tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [running, tick])

  // ── Actions ──
  const togglePlay = useCallback(() => {
    if (!running) {
      // Starting or resuming
      if (seconds <= 0) {
        // Timer was at 0 — reset first
        const dur = getDuration(mode)
        setSeconds(dur)
        setTotalSec(dur)
        totalRef.current = dur
        endTimeRef.current = Date.now() + dur * 1000
      } else {
        // Resume — set endTime based on remaining seconds
        endTimeRef.current = Date.now() + seconds * 1000
      }
      setRunning(true)
    } else {
      // Pausing — calculate remaining and store it (endTimeRef cleared on next resume)
      const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
      setSeconds(remaining)
      endTimeRef.current = null
      setRunning(false)
    }
  }, [running, seconds, mode, getDuration])

  const skipTimer = useCallback(() => {
    clearInterval(intervalRef.current)
    intervalRef.current = null
    endTimeRef.current = null
    setRunning(false)
    const idx = MODES.indexOf(mode)
    const next = MODES[(idx + 1) % MODES.length]
    setMode(next)
    const dur = { study: focusMins, break: shortMins, long: longMins }[next] * 60
    setSeconds(dur)
    setTotalSec(dur)
    totalRef.current = dur
  }, [mode, focusMins, shortMins, longMins])

  const resetTimer = useCallback(() => {
    clearInterval(intervalRef.current)
    intervalRef.current = null
    endTimeRef.current = null
    setRunning(false)
    const dur = getDuration(mode)
    setSeconds(dur)
    setTotalSec(dur)
    totalRef.current = dur
  }, [mode, getDuration])

  const resetSession = useCallback(() => {
    clearInterval(intervalRef.current)
    intervalRef.current = null
    endTimeRef.current = null
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
    // State
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
    // Derived
    displayRemaining,
    progress,
    // Actions
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
