import FormSelect from '../../ui/Select.jsx'
import styles from '../PlanCreationForm.module.css'

export default function StepSelectRotation({ form, onSourceChange, onRotationChange, sources, sourcesLoading, rotations, rotationsLoading, errors }) {
  const sourceOptions = sources.map(s => ({ value: s.id, label: `${s.title} (${s.edition})` }))
  const rotationOptions = rotations.map(r => ({ value: r.id, label: `${r.displayLabel} (${r.topicCount} topics)` }))

  return (
    <div className={styles.stepContent}>
      <label className={styles.label}>Learning Source</label>
      <FormSelect
        value={form.sourceId}
        onChange={onSourceChange}
        options={sourceOptions}
        placeholder={sourcesLoading ? 'Loading sources...' : 'Select a source'}
        disabled={sourcesLoading}
      />
      {sourcesLoading && <span className={styles.hint}>Loading sources...</span>}

      <label className={styles.label}>Rotation</label>
      <FormSelect
        value={form.rotationId}
        onChange={onRotationChange}
        options={rotationOptions}
        placeholder={rotationsLoading ? 'Loading rotations...' : !form.sourceId ? 'Select a source first' : 'Select a rotation'}
        disabled={!form.sourceId || rotationsLoading}
      />
      {rotationsLoading && <span className={styles.hint}>Loading rotations...</span>}

      {errors?.length > 0 && (
        <div className={styles.errorSummary} role="alert">
          {errors.map((err, i) => <p key={i} className={styles.errorText}>{err}</p>)}
        </div>
      )}
    </div>
  )
}
