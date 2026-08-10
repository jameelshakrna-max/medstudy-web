import { forwardRef } from 'react'
import styles from './Input.module.css'

const Input = forwardRef(function Input({
  size = 'md',
  invalid = false,
  className = '',
  ...props
}, ref) {
  const classes = [
    styles.input,
    styles[size] || styles.md,
    invalid ? styles.invalid : '',
    className,
  ].filter(Boolean).join(' ')

  return <input ref={ref} className={classes} aria-invalid={invalid || undefined} {...props} />
})

export default Input
export { default as Field } from './Field'
