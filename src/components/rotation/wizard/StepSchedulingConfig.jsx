import styles from '../PlanCreationForm.module.css'

const SCHEDULING_MODES = [
  { value: 'efficient', label: 'Efficient', desc: 'Study then UWorld, fill remaining capacity' },
  { value: 'focused', label: 'Focused', desc: 'Complete each topic fully before moving on' },
]

const UNLOCK_RULES = [
  { value: 'next_available_day', label: 'Next Available Day', desc: 'UWorld unlocks the day after learning completes' },
  { value: 'same_day_if_capacity', label: 'Same Day if Capacity', desc: 'UWorld can start same day if time allows' },
]

export default function StepSchedulingConfig({ form, onFormChange }) {
  return (
    <div className={styles.stepContent}>
      <p className={styles.label}>Scheduling Mode</p>
      <div className={styles.radioGroup}>
        {SCHEDULING_MODES.map(m => (
          <label key={m.value} className={`${styles.radioCard} ${form.schedulingMode === m.value ? styles.radioCardActive : ''}`}>
            <input type="radio" name="schedulingMode" value={m.value}
              checked={form.schedulingMode === m.value}
              onChange={() => onFormChange({ schedulingMode: m.value })}
              className={styles.radioInput} />
            <span className={styles.radioLabel}>{m.label}</span>
            <span className={styles.hint}>{m.desc}</span>
          </label>
        ))}
      </div>

      <p className={styles.label}>Question Unlock Rule</p>
      <div className={styles.radioGroup}>
        {UNLOCK_RULES.map(r => (
          <label key={r.value} className={`${styles.radioCard} ${form.questionStartRule === r.value ? styles.radioCardActive : ''}`}>
            <input type="radio" name="questionStartRule" value={r.value}
              checked={form.questionStartRule === r.value}
              onChange={() => onFormChange({ questionStartRule: r.value })}
              className={styles.radioInput} />
            <span className={styles.radioLabel}>{r.label}</span>
            <span className={styles.hint}>{r.desc}</span>
          </label>
        ))}
      </div>

      <div className={styles.formField}>
        <label htmlFor="wiz-buffer" className={styles.label}>Planning Buffer (%)</label>
        <input id="wiz-buffer" type="number" min="0" max="100" value={form.bufferPercentage}
          onChange={e => onFormChange({ bufferPercentage: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
          className={styles.input} />
      </div>

      <div className={styles.formField}>
        <label htmlFor="wiz-max-active" className={styles.label}>Maximum Active Topics</label>
        <input id="wiz-max-active" type="number" min="1" value={form.maximumActiveTopics}
          onChange={e => onFormChange({ maximumActiveTopics: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className={styles.input} />
      </div>

      <p className={styles.hint}>Due flashcard reviews will be incorporated through daily recalculation when FSRS integration is connected.</p>
    </div>
  )
}
