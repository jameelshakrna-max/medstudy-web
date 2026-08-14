import { Pause, Play, Check, EyeOff, Eye } from 'lucide-react'
import { createPortal } from 'react-dom'
import useMediaQuery from '../../hooks/useMediaQuery'
import { usePomodoro, usePomodoroSettings } from '../../context/PomodoroContext'
import styles from './FocusControlBar.module.css'

export default function FocusControlBar({ onFinish }) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const {
    mode, running, sessionPhase, sessionOutcome, isActive, focusMode,
    togglePlay, toggleFocusMode,
  } = usePomodoro()
  const { sessionPomodoros } = usePomodoroSettings()

  const showActionBar = isMobile && isActive && !sessionOutcome && !focusMode
  const showFocusStrip = focusMode

  if (!showActionBar && !showFocusStrip) return null

  return createPortal(
    <div className={styles.root}>
      {showFocusStrip ? (
        <div className={styles.focusStrip}>
          <button
            type="button"
            className={styles.secondaryBtn}
            aria-label="Exit focus mode"
            onClick={toggleFocusMode}
          >
            <EyeOff size={16} />
            Exit Focus Mode
          </button>
          {isActive && !sessionOutcome && (
            <button
              type="button"
              className={styles.primaryBtn}
              aria-label={running ? 'Pause timer' : 'Resume timer'}
              onClick={togglePlay}
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
              {running ? 'Pause' : 'Resume'}
            </button>
          )}
        </div>
      ) : (
        <div className={styles.actionBar}>
          {sessionPhase === 'running' && (
            <button
              type="button"
              className={styles.primaryBtn}
              aria-label="Pause timer"
              onClick={togglePlay}
            >
              <Pause size={18} />
              Pause
            </button>
          )}
          {sessionPhase === 'paused' && (
            <button
              type="button"
              className={styles.primaryBtn}
              aria-label="Resume timer"
              onClick={togglePlay}
            >
              <Play size={18} />
              Resume
            </button>
          )}
          {mode === 'study' && isActive && !sessionOutcome && sessionPomodoros > 0 && (
            <button
              type="button"
              className={styles.finishBtn}
              aria-label="Finish session"
              onClick={onFinish}
            >
              <Check size={18} />
              Finish
            </button>
          )}
          <button
            type="button"
            className={styles.focusBtn}
            aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
            aria-pressed={focusMode}
            onClick={toggleFocusMode}
          >
            {focusMode ? <EyeOff size={18} /> : <Eye size={18} />}
            {focusMode ? 'Exit Focus' : 'Focus Mode'}
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
