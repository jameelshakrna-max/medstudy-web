import { useState, useCallback } from 'react'
import ActionDialog from './ActionDialog'
import styles from './ActionDialog.module.css'

export default function SkipConfirmDialog({ open, task, onClose, onSubmit }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit()
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to skip. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [onSubmit, onClose])

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title="Skip Task"
      actions={
        <>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className={`${styles.submitBtn} ${styles.danger}`}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Skipping...' : 'Skip Task'}
          </button>
        </>
      }
    >
      {task?.topicTitle && <div className={styles.topicName}>{task.topicTitle}</div>}
      <p className={styles.fieldHint}>
        Skipping this task will mark it as done. If future tasks depend on this
        one, the schedule may be recalculated.
      </p>
      {error && <div className={styles.fieldError}>{error}</div>}
    </ActionDialog>
  )
}
