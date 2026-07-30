import { useState, useCallback } from 'react'
import ActionDialog from './ActionDialog'
import styles from './ActionDialog.module.css'

export default function RecordTimeDialog({ open, task, onClose, onSubmit }) {
  const [minutes, setMinutes] = useState(String(task?.actualMinutes ?? ''))
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    const val = parseInt(minutes, 10)
    if (isNaN(val) || val < 0) {
      setError('Enter a non-negative number of minutes.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({ actualMinutes: val })
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to save. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [minutes, onSubmit, onClose])

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title="Log Time"
      description="Record study time performed outside of the Pomodoro timer."
      actions={
        <>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className={`${styles.submitBtn} ${styles.primary}`}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      {task?.topicTitle && <div className={styles.topicName}>{task.topicTitle}</div>}
      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          Total actual minutes spent
          <input
            type="number"
            className={styles.fieldInput}
            value={minutes}
            onChange={(e) => { setMinutes(e.target.value); setError(null) }}
            placeholder="0"
            min="0"
            disabled={submitting}
          />
        </label>
        <span className={styles.fieldHint}>This sets the absolute total, not an increment.</span>
      </div>
      {error && <div className={styles.fieldError}>{error}</div>}
    </ActionDialog>
  )
}
