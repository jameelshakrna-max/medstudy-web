import { useState, useCallback } from 'react'
import ActionDialog from './ActionDialog'
import styles from './ActionDialog.module.css'

export default function RecordQuestionsDialog({ open, task, onClose, onSubmit }) {
  const needsIncorrect = task?.taskType === 'uworld_questions'

  const [completedCount, setCompletedCount] = useState('')
  const [incorrectCount, setIncorrectCount] = useState('')
  const [minutes, setMinutes] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    const payload = {}

    const cc = parseInt(completedCount, 10)
    if (isNaN(cc) || cc < 0) {
      setError('Completed count is required.')
      return
    }
    payload.completedCount = cc

    if (needsIncorrect) {
      const ic = parseInt(incorrectCount, 10)
      if (isNaN(ic) || ic < 0) {
        setError('Incorrect count is required.')
        return
      }
      payload.incorrectCount = ic
    }

    const mins = parseInt(minutes, 10)
    if (!isNaN(mins) && mins >= 0) {
      payload.actualMinutes = mins
    }

    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(payload)
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to save. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [needsIncorrect, completedCount, incorrectCount, minutes, onSubmit, onClose])

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title="Log Questions"
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
          Questions completed
          <input
            type="number"
            className={styles.fieldInput}
            value={completedCount}
            onChange={(e) => { setCompletedCount(e.target.value); setError(null) }}
            placeholder="Required"
            min="0"
            disabled={submitting}
          />
        </label>
      </div>

      {needsIncorrect && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Incorrect answers
            <input
              type="number"
              className={styles.fieldInput}
              value={incorrectCount}
              onChange={(e) => { setIncorrectCount(e.target.value); setError(null) }}
              placeholder="Required"
              min="0"
              disabled={submitting}
            />
          </label>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          Actual time (minutes)
          <input
            type="number"
            className={styles.fieldInput}
            value={minutes}
            onChange={(e) => { setMinutes(e.target.value); setError(null) }}
            placeholder="Optional"
            min="0"
            disabled={submitting}
          />
        </label>
      </div>

      {error && <div className={styles.fieldError}>{error}</div>}
    </ActionDialog>
  )
}
