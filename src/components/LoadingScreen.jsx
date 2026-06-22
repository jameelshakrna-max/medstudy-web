import styles from './LoadingScreen.module.css'

export default function LoadingScreen({ message, fullPage = true }) {
  return (
    <div className={`${styles.loader} ${fullPage ? styles.fullPage : styles.inline}`}>
      <div className={styles.pulse}>
        <div className={styles.ring} />
        <div className={styles.icon}>🏥</div>
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
