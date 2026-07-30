import styles from '../PlanCreationForm.module.css'

export default function StepConfirm({ form, preview, overloadAccepted, onOverloadChange }) {
  const feasible = preview?.feasibility?.feasible

  return (
    <div className={styles.stepContent}>
      <div className={styles.summarySection}>
        <h4 className={styles.label}>Plan Summary</h4>
        <p className={styles.hint}>Source: {form.sourceId}</p>
        <p className={styles.hint}>Rotation: {form.rotationId}</p>
        <p className={styles.hint}>Dates: {form.startDate} to {form.endDate}</p>
        {form.examDate && <p className={styles.hint}>Exam: {form.examDate}</p>}
        <p className={styles.hint}>Study Style: {form.studyStyle}</p>
        <p className={styles.hint}>Scheduling: {form.schedulingMode}</p>
        <p className={styles.hint}>Topics: {form.topics.length}</p>
        <p className={styles.hint}>Buffer: {form.bufferPercentage}%</p>
        <p className={styles.hint}>Max Active Topics: {form.maximumActiveTopics}</p>
      </div>

      {!feasible && (
        <div className={styles.overloadSection}>
          <p className={styles.warningText}>
            This plan exceeds available capacity. Some work cannot fit before the end date.
          </p>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={overloadAccepted}
              onChange={e => onOverloadChange(e.target.checked)}
            />
            I understand that some work cannot fit before the end date. Create this as an overloaded draft.
          </label>
        </div>
      )}
    </div>
  )
}
