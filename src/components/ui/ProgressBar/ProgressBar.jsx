import styles from './ProgressBar.module.css'

export default function ProgressBar({ value = 0, label, size = 'default', className = '' }) {
  const clamped = Math.min(1, Math.max(0, value))
  const percent = Math.round(clamped * 100)

  return (
    <div className={`${styles.wrapper} ${styles[size] || styles.default} ${className}`}>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `${percent}%`}
        className={styles.track}
      >
        <div
          className={styles.fill}
          style={{ width: `${percent}%` }}
        />
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  )
}
