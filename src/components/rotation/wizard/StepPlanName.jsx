import styles from '../PlanCreationForm.module.css'

export default function StepPlanName({ form, onFormChange, errors }) {
  return (
    <div className={styles.stepContent}>
      <div className={styles.formField}>
        <label htmlFor="wiz-plan-name" className={styles.label}>Plan Name</label>
        <input
          id="wiz-plan-name"
          type="text"
          value={form.planName}
          onChange={(e) => onFormChange({ planName: e.target.value })}
          className={styles.input}
          maxLength={100}
          placeholder="e.g. Cardiology — August 2026"
          aria-required="true"
        />
        <p className={styles.hint}>A short, memorable name for this rotation plan.</p>
      </div>

      {errors?.length > 0 && (
        <div className={styles.errorSummary} role="alert">
          {errors.map((err, i) => <p key={i} className={styles.errorText}>{err}</p>)}
        </div>
      )}
    </div>
  )
}
