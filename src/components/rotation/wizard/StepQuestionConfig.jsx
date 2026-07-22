import styles from '../PlanCreationForm.module.css'

export default function StepQuestionConfig({ form, onFormChange }) {
  function update(field, value) {
    onFormChange({ [field]: value })
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.formField}>
        <label htmlFor="wiz-pref-qpd" className={styles.label}>Preferred Questions Per Day</label>
        <input id="wiz-pref-qpd" type="number" min="0" value={form.preferredQuestionsPerDay}
          onChange={e => update('preferredQuestionsPerDay', parseInt(e.target.value, 10) || 0)}
          className={styles.input} />
      </div>

      <div className={styles.formField}>
        <label htmlFor="wiz-min-qps" className={styles.label}>Minimum Questions Per Session</label>
        <input id="wiz-min-qps" type="number" min="1" value={form.minimumQuestionsPerSession}
          onChange={e => update('minimumQuestionsPerSession', Math.max(1, parseInt(e.target.value, 10) || 1))}
          className={styles.input} />
      </div>

      <div className={styles.formField}>
        <label htmlFor="wiz-max-qpd" className={styles.label}>Maximum Questions Per Day</label>
        <input id="wiz-max-qpd" type="number" min="0" value={form.maximumQuestionsPerDay}
          onChange={e => update('maximumQuestionsPerDay', parseInt(e.target.value, 10) || 0)}
          className={styles.input} />
      </div>

      <div className={styles.formField}>
        <label htmlFor="wiz-avg-mpq" className={styles.label}>Average Minutes Per Question</label>
        <input id="wiz-avg-mpq" type="number" min="0.5" step="0.5" value={form.averageMinutesPerQuestion}
          onChange={e => update('averageMinutesPerQuestion', parseFloat(e.target.value) || 1.5)}
          className={styles.input} />
      </div>
    </div>
  )
}
