import styles from '../PlanCreationForm.module.css'

const STYLES = [
  { value: 'focused', label: 'Focused', desc: 'Skim & highlight high-yield content only' },
  { value: 'active', label: 'Active', desc: 'Read, recall, and engage with material' },
  { value: 'detailed_notes', label: 'Detailed Notes', desc: 'In-depth note-taking and review' },
]

export default function StepStudyStyle({ form, onFormChange }) {
  return (
    <div className={styles.stepContent}>
      <p className={styles.label}>How do you want to study?</p>
      <div className={styles.radioGroup}>
        {STYLES.map(s => (
          <label
            key={s.value}
            className={`${styles.radioCard} ${form.studyStyle === s.value ? styles.radioCardActive : ''}`}
          >
            <input
              type="radio"
              name="studyStyle"
              value={s.value}
              checked={form.studyStyle === s.value}
              onChange={() => onFormChange({ studyStyle: s.value })}
              className={styles.radioInput}
            />
            <span className={styles.radioLabel}>{s.label}</span>
            <span className={styles.hint}>{s.desc}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
