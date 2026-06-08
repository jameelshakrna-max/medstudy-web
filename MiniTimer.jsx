import { useNavigate, useLocation } from 'react-router-dom'
import { usePomodoro } from '../context/PomodoroContext'
import styles from './MiniTimer.module.css'

export default function MiniTimer() {
  const {
    mode, running, displayRemaining,
    done, togglePlay, resetTimer,
  } = usePomodoro()
  const navigate = useNavigate()
  const location = useLocation()

  const mm = String(Math.floor(displayRemaining / 60)).padStart(2, '0')
  const ss = String(displayRemaining % 60).padStart(2, '0')

  // Don't show mini timer on the pomodoro page itself
  if (location.pathname === '/pomodoro') return null

  return (
    <div className={styles.miniTimer}>
      <div className={`${styles.miniDot} ${styles[mode]} ${running ? styles.running : ''}`} />

      <div className={styles.miniInfo}>
        <span className={styles.miniLabel}>
          {mode === 'study' ? '🎯 Focus' : mode === 'break' ? '☕ Break' : '🌿 Long Break'}
          {running && ' · running'}
        </span>
        <span className={`${styles.miniTime} ${styles[mode]}`}>{mm}:{ss}</span>
      </div>

      <span className={styles.miniCount}>🍅 {done}</span>

      <div className={styles.miniControls}>
        <button className={styles.miniBtn} onClick={resetTimer} title="Reset">↺</button>
        <button className={`${styles.miniPlayBtn} ${styles[mode]}`} onClick={togglePlay} title={running ? 'Pause' : 'Play'}>
          {running ? '⏸' : '▶'}
        </button>
        <button className={styles.miniBtn} onClick={() => navigate('/pomodoro')} title="Open Pomodoro">🍅</button>
      </div>
    </div>
  )
}
