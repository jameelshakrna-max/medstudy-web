import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const PomodoroContext = createContext(null)
const MODES = ['study','break','long']

export function PomodoroProvider({ children }) {
  const [mode, setMode] = useState('study')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [focusMins, setFocusMins] = useState(25)
  const [shortMins, setShortMins] = useState(5)
  const [longMins, setLongMins] = useState(15)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [sessionPomodoros, setSessionPomodoros] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)
  const [seconds, setSeconds] = useState(focusMins * 60)
  const [totalSec, setTotalSec] = useState(focusMins * 60)
  const intervalRef = useRef(null)

  const displayRemaining = seconds

  useEffect(() => {
    const m = { study: focusMins, break: shortMins, long: longMins }[mode]
    if (!running) { setSeconds(m * 60); setTotalSec(m * 60) }
  }, [mode, focusMins, shortMins, longMins])

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current); setRunning(false); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running])

  useEffect(() => {
    if (seconds === 0 && !running) {
      setDone(d => d + 1)
      if (mode === 'study') setSessionPomodoros(p => p + 1)
    }
  }, [seconds, running])

  const togglePlay = useCallback(() => {
    if (!running && seconds === 0) {
      const m = { study: focusMins, break: shortMins, long: longMins }[mode]
      setSeconds(m * 60); setTotalSec(m * 60)
    }
    setRunning(r => !r)
  }, [running, seconds, mode, focusMins, shortMins, longMins])

  const skipTimer = useCallback(() => {
    setRunning(false)
    const idx = MODES.indexOf(mode)
    setMode(MODES[(idx + 1) % MODES.length])
  }, [mode])

  const resetTimer = useCallback(() => {
    setRunning(false)
    const m = { study: focusMins, break: shortMins, long: longMins }[mode]
    setSeconds(m * 60); setTotalSec(m * 60)
  }, [mode, focusMins, shortMins, longMins])

  const resetSession = useCallback(() => {
    setSessionPomodoros(0); setSessionStart(null); setDone(0); setSelectedTopic(null)
  }, [])

  return (
    <PomodoroContext.Provider value={{
      mode, setMode, running, setRunning, done, setDone,
      focusMins, setFocusMins, shortMins, setShortMins, longMins, setLongMins,
      selectedTopic, setSelectedTopic, sessionPomodoros, setSessionPomodoros,
      sessionStart, setSessionStart, resetSession,
      displayRemaining, totalSec, togglePlay, skipTimer, resetTimer
    }}>
      {children}
    </PomodoroContext.Provider>
  )
}

export function usePomodoro() {
  const ctx = useContext(PomodoroContext)
  if (!ctx) throw new Error('usePomodoro must be used within PomodoroProvider')
  return ctx
}
