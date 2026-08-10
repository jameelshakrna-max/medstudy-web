import { useId } from 'react'
import Input from './Input'
import styles from './Input.module.css'

export default function Field({
  label,
  hint,
  error,
  required,
  id: idProp,
  className = '',
  inputProps = {},
  children,
}) {
  const generatedId = useId()
  const id = idProp || generatedId
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className={`${styles.field} ${className}`}>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
          {required && <span className={styles.required} aria-hidden="true"> *</span>}
        </label>
      )}
      {children ? (
        children
      ) : (
        <Input
          id={id}
          invalid={!!error}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          {...inputProps}
        />
      )}
      {hint && !error && (
        <p className={styles.hint} id={hintId}>{hint}</p>
      )}
      {error && (
        <p className={styles.error} id={errorId} role="alert">{error}</p>
      )}
    </div>
  )
}
