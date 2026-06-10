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

const defaultContext = {
  timeLeft: 25 * 60,
  setTimeLeft: () => {},
  isRunning: false,
  setIsRunning: () => {},
  mode: 'work',
  setMode: () => {},
};

export function usePomodoro() {
  return useContext(PomodoroContext) || defaultContext;
}