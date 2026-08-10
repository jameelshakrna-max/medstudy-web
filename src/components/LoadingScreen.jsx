import { BrandLogo } from './ui'
import styles from './LoadingScreen.module.css'

export default function LoadingScreen({ message, fullPage = true }) {
  return (
    <div className={`${styles.loader} ${fullPage ? styles.fullPage : styles.inline}`}>
      <div className={styles.pulse}>
        <div className={styles.ring} />
        <BrandLogo variant="symbol" size={44} className={styles.icon} />
      </div>
      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      {message && <p className={styles.message}>{message}</p>}
    </div>
  )
}
