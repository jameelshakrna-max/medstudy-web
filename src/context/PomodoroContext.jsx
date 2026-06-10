import { createContext, useContext, useState } from 'react';

const PomodoroContext = createContext();

export function PomodoroProvider({ children }) {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('work');

  return (
    <PomodoroContext.Provider value={{ timeLeft, setTimeLeft, isRunning, setIsRunning, mode, setMode }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro() {
  const context = useContext(PomodoroContext);
  if (!context) {
    throw new Error('usePomodoro must be used within a PomodoroProvider');
  }
  return context;
}