import { Pause, Play, Timer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePomodoro } from '../../context/PomodoroContext'
import styles from './ForestSessionStrip.module.css'

export default function ForestSessionStrip() {
  const navigate = useNavigate()
  const {
    mode, running, sessionPhase, displayRemaining,
    togglePlay, focusMode, exitFocusMode,
  } = usePomodoro()

  if (sessionPhase !== 'running' && sessionPhase !== 'paused') return null

  const modeLabel = mode === 'study' ? 'Focus' : mode === 'break' ? 'Short Break' : 'Long Break'

  return (
    <div className={styles.strip}>
      <span className={styles.mode}>{modeLabel}</span>
      <span className={styles.time}>{displayRemaining}</span>
      <button
        type="button"
        className={styles.btn}
        aria-label={running ? 'Pause timer' : 'Resume timer'}
        onClick={togglePlay}
      >
        {running ? <Pause size={16} /> : <Play size={16} />}
        {running ? 'Pause' : 'Resume'}
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={() => navigate('/focus?view=timer')}
      >
        <Timer size={16} />
        Return to Timer
      </button>
      {focusMode && (
        <button
          type="button"
          className={styles.btn}
          onClick={exitFocusMode}
        >
          Exit Focus Mode
        </button>
      )}
    </div>
  )
}
