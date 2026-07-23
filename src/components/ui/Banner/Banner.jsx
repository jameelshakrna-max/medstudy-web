import { X } from 'lucide-react'
import styles from './Banner.module.css'

export function Banner({ variant = 'info', onDismiss, children, className = '' }) {
  return (
    <div
      role="status"
      className={`${styles.banner} ${styles[variant] || styles.info} ${className}`}
    >
      <div className={styles.content}>{children}</div>
      {onDismiss && (
        <button
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function BannerAction({ onClick, children }) {
  return (
    <button className={styles.action} onClick={onClick}>
      {children}
    </button>
  )
}
