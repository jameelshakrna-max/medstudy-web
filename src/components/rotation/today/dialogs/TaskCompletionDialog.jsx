import { useState, useCallback } from 'react'
import ActionDialog from './ActionDialog'
import styles from './ActionDialog.module.css'

const QUESTION_TYPES = new Set(['uworld_questions', 'incorrect_review'])

export default function TaskCompletionDialog({ open, task, onClose, onSubmit }) {
  const isQuestion = QUESTION_TYPES.has(task?.taskType)
  const needsIncorrect = task?.taskType === 'uworld_questions'

  const [minutes, setMinutes] = useState('')
  const [completedCount, setCompletedCount] = useState('')
  const [incorrectCount, setIncorrectCount] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    const payload = {}

    if (isQuestion) {
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
      setError(err?.message || 'Failed to complete. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [isQuestion, needsIncorrect, completedCount, incorrectCount, minutes, onSubmit, onClose])

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title="Mark as Complete"
      actions={
        <>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className={`${styles.submitBtn} ${styles.success}`}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Complete'}
          </button>
        </>
      }
    >
      {task?.topicTitle && <div className={styles.topicName}>{task.topicTitle}</div>}

      {isQuestion && (
        <>
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
        </>
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
