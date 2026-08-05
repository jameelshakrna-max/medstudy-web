import { useState, useCallback } from 'react'
import ActionDialog from './ActionDialog'
import styles from './ActionDialog.module.css'

const QUESTION_TYPES = new Set(['uworld_questions', 'incorrect_review'])

export default function PartialDialog({ open, task, onClose, onSubmit }) {
  const isPercentage = !QUESTION_TYPES.has(task?.taskType)
  const needsIncorrect = task?.taskType === 'uworld_questions'

  const [percentage, setPercentage] = useState('')
  const [completedCount, setCompletedCount] = useState('')
  const [incorrectCount, setIncorrectCount] = useState('')
  const [minutes, setMinutes] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const remaining = Math.max(0, (task?.targetCount || 0) - (task?.completedCount || 0))
  const willFinish = !isPercentage && task?.targetCount > 0 && parseInt(completedCount, 10) === remaining
  const countVal = parseInt(completedCount, 10)
  const pctVal = parseInt(percentage, 10)
  const showCountRecap = !isPercentage && countVal > 0
  const showPctRecap = isPercentage && pctVal > 0

  const handleSubmit = useCallback(async () => {
    if (submitting) return

    const payload = {}

    if (isPercentage) {
      const pct = parseInt(percentage, 10)
      if (isNaN(pct) || pct < 1 || pct > 99) {
        setError('Enter a percentage between 1 and 99.')
        return
      }
      payload.completedPercentage = pct
    } else {
      const cc = parseInt(completedCount, 10)
      if (isNaN(cc) || cc < 1) {
        setError('Enter at least 1 completed question.')
        return
      }
      if (task?.targetCount > 0 && cc > remaining) {
        setError('Cannot exceed the remaining questions for this task.')
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
      setError(err?.message || 'Failed to save. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [submitting, isPercentage, needsIncorrect, remaining, task?.targetCount, percentage, completedCount, incorrectCount, minutes, onSubmit, onClose])

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title="Mark as Partial"
      actions={
        <>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className={`${styles.submitBtn} ${styles.primary}`}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : (willFinish ? 'Complete' : 'Save Partial')}
          </button>
        </>
      }
    >
      {task?.topicTitle && <div className={styles.topicName}>{task.topicTitle}</div>}

      {isPercentage ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Completion percentage (1–99)
            <input
              type="number"
              className={styles.fieldInput}
              value={percentage}
              onChange={(e) => { setPercentage(e.target.value); setError(null) }}
              placeholder="Required"
              min="1"
              max="99"
              disabled={submitting}
            />
          </label>
        </div>
      ) : (
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
                min="1"
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

      <div className={styles.recap}>
        {showCountRecap && (
          <>
            <p>Recording: {countVal} of {task?.targetCount} questions</p>
            <p>Remaining after this: {Math.max(0, (task?.targetCount || 0) - countVal)} questions</p>
          </>
        )}
        {showPctRecap && (
          <>
            <p>Recording: {pctVal}%</p>
            <p>Remaining after this: {Math.max(0, 100 - pctVal)}%</p>
          </>
        )}
        <p>Your completed progress will remain in history.</p>
        <p>The remaining questions will be rescheduled after recalculation.</p>
      </div>

      {error && <div className={styles.fieldError}>{error}</div>}
    </ActionDialog>
  )
}
