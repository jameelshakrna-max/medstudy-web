import { getLearningMinutesForStyle } from './buildPlanRequest'
import styles from '../PlanCreationForm.module.css'

const STUDY_STYLES = [
  { key: 'focused', label: 'Focused' },
  { key: 'active', label: 'Active' },
  { key: 'detailed_notes', label: 'Detailed Notes' },
]

export default function StepSourceSummary({ form, topics }) {
  const totals = STUDY_STYLES.map(({ key, label }) => ({
    key,
    label,
    minutes: topics.reduce((sum, t) => sum + getLearningMinutesForStyle(t, key), 0),
  }))

  return (
    <div className={styles.stepContent}>
      <p className={styles.hint}>Source: {form.sourceId}</p>
      <p className={styles.hint}>Rotation: {form.rotationId}</p>
      <p className={styles.hint}>{topics.length} topics</p>
      <div className={styles.summarySection}>
        <h4 className={styles.label}>Total Learning Work</h4>
        {totals.map(t => (
          <p key={t.key} className={styles.summaryRow}>
            {t.label}: {t.minutes} minutes ({Math.round(t.minutes / 60 * 10) / 10} hrs)
          </p>
        ))}
      </div>
      <p className={styles.hint}>Select your study style in the next step.</p>
    </div>
  )
}
