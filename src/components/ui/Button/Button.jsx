import { forwardRef } from 'react'
import styles from './Button.module.css'

const Button = forwardRef(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  ...props
}, ref) {
  const classes = [
    styles.btn,
    styles[variant] || styles.primary,
    styles[size] || styles.md,
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={ref}
      className={classes}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  )
})

export default Button
