import styles from './EmptyState.module.css'

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`${styles.empty} ${className}`}>
      {Icon && (
        <div className={styles.iconWrap} aria-hidden="true">
          <Icon size={28} strokeWidth={1.5} />
        </div>
      )}
      {title && <h3 className={styles.title}>{title}</h3>}
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
