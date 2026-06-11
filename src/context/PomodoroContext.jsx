import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const PomodoroContext = createContext();

export function PomodoroProvider({ children }) {
  const [studyMin, setStudyMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [longMin, setLongMin] = useState(15);
  const [mode, setMode] = useState('study');
  const [running, setRunning] = useState(false);
  const [displayRemaining, setDisplayRemaining] = useState(25 * 60);
  const [total, setTotal] = useState(25 * 60);
  const [done, setDone] = useState(0);
  const [focusMins, setFocusMins] = useState(0);
  const [log, setLog] = useState([]);
  const [form, setForm] = useState({ label: '', topic: '', notes: '' });
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [sessionPomodoros, setSessionPomodoros] = useState(0);
  const [sessionStart, setSessionStart] = useState(new Date());
  const intervalRef = useRef(null);

  function getSeconds(m) { return m * 60; }

  function applyMode(m) {
    const mins = m === 'study' ? studyMin : m === 'break' ? breakMin : longMin;
    const secs = getSeconds(mins);
    setMode(m);
    setDisplayRemaining(secs);
    setTotal(secs);
    setRunning(false);
  }

  const switchMode = useCallback((m) => { applyMode(m); }, [studyMin, breakMin, longMin]);
  const togglePlay = useCallback(() => { setRunning(r => !r); }, []);
  const resetTimer = useCallback(() => { applyMode(mode); }, [mode, studyMin, breakMin, longMin]);

  const skipTimer = useCallback(() => {
    if (mode === 'study') {
      setDone(d => d + 1);
      setFocusMins(f => f + studyMin);
      setSessionPomodoros(p => p + 1);
      const next = done % 4 === 3 ? 'long' : 'break';
      setTimeout(() => applyMode(next), 0);
    } else {
      setTimeout(() => applyMode('study'), 0);
    }
  }, [mode, done, studyMin]);

  const setTimerSettings = useCallback((s, b, l) => {
    setStudyMin(s); setBreakMin(b); setLongMin(l);
    const mins = mode === 'study' ? s : mode === 'break' ? b : l;
    const secs = getSeconds(mins);
    setDisplayRemaining(secs); setTotal(secs);
  }, [mode]);

  const resetSession = useCallback(() => {
    setSessionPomodoros(0);
    setSessionStart(new Date());
    setDone(0);
    setFocusMins(0);
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setDisplayRemaining(prev => {
          if (prev <= 1) {
            setRunning(false);
            if (mode === 'study') {
              setDone(d => d + 1);
              setFocusMins(f => f + studyMin);
              setSessionPomodoros(p => p + 1);
              const next = done % 4 === 3 ? 'long' : 'break';
              setTimeout(() => applyMode(next), 0);
            } else {
              setTimeout(() => applyMode('study'), 0);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, mode, studyMin, done]);

  return (
    <PomodoroContext.Provider value={{
      mode, running, displayRemaining, total,
      done, focusMins, sessionPomodoros, sessionStart,
      studyMin, breakMin, longMin,
      log, form, setForm, setLog,
      selectedTopic, setSelectedTopic,
      switchMode, togglePlay, resetTimer, skipTimer, setTimerSettings, resetSession,
    }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro() {
  const context = useContext(PomodoroContext);
  if (!context) throw new Error('usePomodoro must be used within a PomodoroProvider');
  return context;
}

