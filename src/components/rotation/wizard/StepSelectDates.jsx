import { useMemo } from 'react'
import styles from '../PlanCreationForm.module.css'

export default function StepSelectDates({ form, onFormChange, errors }) {
  const dayCount = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0
    const start = new Date(form.startDate)
    const end = new Date(form.endDate)
    const diff = end.getTime() - start.getTime()
    if (diff < 0) return 0
    return Math.round(diff / (1000 * 60 * 60 * 24)) + 1
  }, [form.startDate, form.endDate])

  return (
    <div className={styles.stepContent}>
      <div className={styles.formField}>
        <label htmlFor="wiz-start-date" className={styles.label}>Start Date</label>
        <input
          id="wiz-start-date"
          type="date"
          value={form.startDate}
          onChange={(e) => onFormChange({ startDate: e.target.value })}
          className={styles.input}
          aria-required="true"
        />
      </div>

      <div className={styles.formField}>
        <label htmlFor="wiz-end-date" className={styles.label}>End Date</label>
        <input
          id="wiz-end-date"
          type="date"
          value={form.endDate}
          onChange={(e) => onFormChange({ endDate: e.target.value })}
          className={styles.input}
          min={form.startDate || undefined}
          aria-required="true"
        />
      </div>

      <div className={styles.formField}>
        <label htmlFor="wiz-exam-date" className={styles.label}>
          Exam Date <span className={styles.hint}>(optional)</span>
        </label>
        <input
          id="wiz-exam-date"
          type="date"
          value={form.examDate}
          onChange={(e) => onFormChange({ examDate: e.target.value })}
          className={styles.input}
          min={form.endDate || undefined}
        />
      </div>

      {dayCount > 0 && <p className={styles.hint}>{dayCount} days total</p>}
    </div>
  )
}
