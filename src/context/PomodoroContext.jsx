import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const PomodoroContext = createContext(null)

const MODES = ['study', 'break', 'long']

export function PomodoroProvider({ children }) {
  // ── Settings ──
  const [focusMins, setFocusMins] = useState(25)
  const [shortMins, setShortMins] = useState(5)
  const [longMins, setLongMins] = useState(15)

  // ── Timer state (centralized — lives even when Pomodoro page unmounts) ──
  const [mode, setMode] = useState('study')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)               // completed pomodoros in session
  const [seconds, setSeconds] = useState(25 * 60)    // remaining seconds
  const [totalSec, setTotalSec] = useState(25 * 60)  // total for current mode

  // ── Session tracking ──
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [sessionPomodoros, setSessionPomodoros] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionLog, setSessionLog] = useState([])

  const intervalRef = useRef(null)

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
  }, [mode, focusMins, shortMins, longMins, running, getDuration])

  // ── Centralized timer tick ──
  useEffect(() => {
    if (!running) {
      clearInterval(intervalRef.current)
      return
    }
    if (!sessionStart) setSessionStart(Date.now())

    intervalRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          setRunning(false)
          setDone(d => d + 1)

          // Log entry
          const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
          setSessionLog(l => [{
            type: mode,
            label: MODE_LABELS[mode],
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }, ...l].slice(0, 10))

          // Auto-switch mode
          if (mode === 'study') {
            setSessionPomodoros(p => p + 1)
            const nextMode = (done + 1) % 4 === 0 ? 'long' : 'break'
            setTimeout(() => {
              setMode(nextMode)
              const dur = { study: focusMins, break: shortMins, long: longMins }[nextMode] * 60
              setSeconds(dur)
              setTotalSec(dur)
            }, 500)
          } else {
            setTimeout(() => {
              setMode('study')
              const dur = focusMins * 60
              setSeconds(dur)
              setTotalSec(dur)
            }, 500)
          }

          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(intervalRef.current)
  }, [running, mode, done, focusMins, shortMins, longMins, sessionStart])

  // ── Actions ──
  const togglePlay = useCallback(() => {
    if (!running && seconds === 0) {
      const dur = getDuration(mode)
      setSeconds(dur)
      setTotalSec(dur)
    }
    setRunning(r => !r)
  }, [running, seconds, mode, getDuration])

  const skipTimer = useCallback(() => {
    setRunning(false)
    clearInterval(intervalRef.current)
    const idx = MODES.indexOf(mode)
    const next = MODES[(idx + 1) % MODES.length]
    setMode(next)
    const dur = { study: focusMins, break: shortMins, long: longMins }[next] * 60
    setSeconds(dur)
    setTotalSec(dur)
  }, [mode, focusMins, shortMins, longMins])

  const resetTimer = useCallback(() => {
    setRunning(false)
    clearInterval(intervalRef.current)
    const dur = getDuration(mode)
    setSeconds(dur)
    setTotalSec(dur)
  }, [mode, getDuration])

  const resetSession = useCallback(() => {
    setRunning(false)
    clearInterval(intervalRef.current)
    setDone(0)
    setSessionPomodoros(0)
    setSessionStart(null)
    setSessionLog([])
    setMode('study')
    const dur = focusMins * 60
    setSeconds(dur)
    setTotalSec(dur)
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
