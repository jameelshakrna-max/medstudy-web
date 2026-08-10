import styles from './Badge.module.css'

const Badge = function Badge({
  tone = 'neutral',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  const classes = [
    styles.badge,
    styles[tone] || styles.neutral,
    styles[size] || styles.md,
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  )
}

export default Badge
