import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const PomodoroContext = createContext({})

export function PomodoroProvider({ children }) {
  const [mode, setMode] = useState('study')
  const [running, setRunning] = useState(false)
  const [total, setTotal] = useState(25 * 60)
  const [done, setDone] = useState(0)
  const [focusMins, setFocusMins] = useState(0)
  const [studyMin, setStudyMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [longMin, setLongMin] = useState(15)
  const [startedAt, setStartedAt] = useState(null)
  const [startedRemaining, setStartedRemaining] = useState(null)
  const [log, setLog] = useState([])
  const [form, setForm] = useState({ label: '', topic: '', notes: '' })

  const intervalRef = useRef(null)
  const totalRef = useRef(total)
  const startedAtRef = useRef(startedAt)
  const startedRemainingRef = useRef(startedRemaining)

  // Keep refs in sync
  useEffect(() => { totalRef.current = total }, [total])
  useEffect(() => { startedAtRef.current = startedAt }, [startedAt])
  useEffect(() => { startedRemainingRef.current = startedRemaining }, [startedRemaining])

  // Calculate remaining based on wall-clock time (always accurate)
  const getRemaining = useCallback(() => {
    if (!running || !startedAt) return totalRef.current
    const elapsed = Math.floor((Date.now() - startedAt) / 1000)
    return Math.max(0, startedRemainingRef.current - elapsed)
  }, [running, startedAt])

  // The displayed remaining — updates every second
  const [displayRemaining, setDisplayRemaining] = useState(total)

  // Tick interval — runs globally, not tied to any page
  useEffect(() => {
    if (running) {
      // Update immediately
      setDisplayRemaining(getRemaining())
      intervalRef.current = setInterval(() => {
        const r = getRemaining()
        setDisplayRemaining(r)
        if (r <= 0) {
          setRunning(false)
          setStartedAt(null)
          setStartedRemaining(null)
          if (mode === 'study') {
            setDone(d => d + 1)
            setFocusMins(m => m + totalRef.current / 60)
            playChime()
          }
        }
      }, 200) // check every 200ms for accuracy
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, getRemaining, mode])

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ;[[523, 0], [659, .15], [784, .3]].forEach(([f, t]) => {
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination); o.frequency.value = f; o.type = 'sine'
        g.gain.setValueAtTime(.28, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + t + .35)
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .4)
      })
    } catch (e) { }
  }

  function getTotal(m) {
    return (m === 'study' ? studyMin : m === 'break' ? breakMin : longMin) * 60
  }

  function switchMode(m) {
    setRunning(false)
    setStartedAt(null)
    setStartedRemaining(null)
    setMode(m)
    const t = getTotal(m)
    setTotal(t)
    setDisplayRemaining(t)
  }

  function startTimer() {
    const remaining = displayRemaining
    setStartedAt(Date.now())
    setStartedRemaining(remaining)
    setRunning(true)
  }

  function pauseTimer() {
    const currentRemaining = getRemaining()
    setDisplayRemaining(currentRemaining)
    setRunning(false)
    setStartedAt(null)
    setStartedRemaining(null)
  }

  function togglePlay() {
    if (running) pauseTimer()
    else startTimer()
  }

  function resetTimer() {
    setRunning(false)
    setStartedAt(null)
    setStartedRemaining(null)
    setDisplayRemaining(total)
  }

  function skipTimer() {
    setRunning(false)
    setStartedAt(null)
    setStartedRemaining(null)
    if (mode === 'study') {
      setDone(d => d + 1)
      setFocusMins(m => m + studyMin)
      playChime()
    } else {
      switchMode('study')
    }
  }

  function setTimerSettings(study, brk, lng) {
    setStudyMin(study)
    setBreakMin(brk)
    setLongMin(lng)
    if (!running) {
      const t = (mode === 'study' ? study : mode === 'break' ? brk : lng) * 60
      setTotal(t)
      setDisplayRemaining(t)
    }
  }

  return (
    <PomodoroContext.Provider value={{
      mode, running, total, displayRemaining,
      done, focusMins,
      studyMin, breakMin, longMin,
      log, form, setForm, setLog,
      switchMode, togglePlay, resetTimer, skipTimer,
      setTimerSettings, startTimer, pauseTimer,
    }}>
      {children}
    </PomodoroContext.Provider>
  )
}

export const usePomodoro = () => useContext(PomodoroContext)
