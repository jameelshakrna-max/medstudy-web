import { useEffect, useState } from 'react'
import { PartyPopper, X } from 'lucide-react'
import styles from './GoalCelebration.module.css'

export default function GoalCelebration({ goal, onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 400)
    }, 4000)
    return () => clearTimeout(timer)
  }, [goal, onDismiss])

  return (
    <div className={`${styles.toast} ${visible ? styles.visible : styles.hidden}`}>
      <div className={styles.inner}>
        <div className={styles.iconWrap}>
          <PartyPopper size={20} color="#0B1120" />
        </div>
        <div className={styles.body}>
          <div className={styles.heading}>Goal Complete!</div>
          <div className={styles.title}>{goal.title}</div>
          <div className={styles.meta}>{goal.pct}% achieved</div>
        </div>
        <button onClick={onDismiss} className={styles.dismissBtn}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
