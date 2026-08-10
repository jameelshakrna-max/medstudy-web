import styles from './StatTile.module.css'

export default function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'brand',
  className = '',
}) {
  return (
    <div className={`${styles.tile} ${className}`}>
      {Icon && (
        <div className={`${styles.iconWrap} ${styles[tone] || styles.brand}`} aria-hidden="true">
          <Icon size={18} strokeWidth={1.5} />
        </div>
      )}
      <div className={styles.body}>
        <span className={styles.value}>{value}</span>
        <span className={styles.label}>{label}</span>
        {sub && <span className={styles.sub}>{sub}</span>}
      </div>
    </div>
  )
}
