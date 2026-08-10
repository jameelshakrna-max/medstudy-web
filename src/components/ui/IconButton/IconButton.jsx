import { forwardRef } from 'react'
import styles from './IconButton.module.css'

const IconButton = forwardRef(function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
  ...props
}, ref) {
  const classes = [
    styles.iconBtn,
    styles[variant] || styles.ghost,
    styles[size] || styles.md,
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-label={label}
      title={props.title || label}
      {...props}
    >
      {children}
    </button>
  )
})

export default IconButton
