import { useState } from 'react'
import { X } from 'lucide-react'
import { GOAL_TYPE_OPTIONS, CATEGORY_OPTIONS, SUBJECT_OPTIONS, MODULE_OPTIONS } from '../data/goalTemplates'
import styles from './GoalForm.module.css'

const TYPE_NEEDS_DEADLINE = ['subject_avg', 'performance']
const TYPE_NEEDS_SUBJECT = ['subject_avg', 'performance']
const TYPE_NEEDS_MODULE = ['topics', 'blocks', 'cases']

function getTargetHint(type) {
  const t = TYPE_OPTIONS_MAP[type]
  return t ? t.hint : ''
}

const TYPE_OPTIONS_MAP = {}
GOAL_TYPE_OPTIONS.forEach(o => { TYPE_OPTIONS_MAP[o.value] = o })

export default function GoalForm({ initial, onSubmit, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [goalType, setGoalType] = useState(initial?.goal_type || 'questions')
  const [targetValue, setTargetValue] = useState(initial?.target_value || '')
  const [category, setCategory] = useState(initial?.category || 'daily')
  const [subjectId, setSubjectId] = useState(initial?.subject_id || '')
  const [module, setModule] = useState(initial?.module || '')
  const [deadline, setDeadline] = useState(initial?.deadline?.split('T')[0] || '')
  const [notes, setNotes] = useState(initial?.notes || '')

  const needsDeadline = TYPE_NEEDS_DEADLINE.includes(goalType)
  const needsSubject = TYPE_NEEDS_SUBJECT.includes(goalType)
  const needsModule = TYPE_NEEDS_MODULE.includes(goalType)

  function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !targetValue) return

    const hasRequiredDeadline = needsDeadline && !deadline
    if (hasRequiredDeadline) return

    onSubmit({
      id: initial?.id,
      title: title.trim(),
      goal_type: goalType,
      target_value: Number(targetValue),
      category,
      subject_id: needsSubject ? subjectId || null : null,
      module: needsModule ? module || null : null,
      deadline: deadline || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <button type="button" onClick={onCancel} className={styles.closeBtn}>
        <X size={18} />
      </button>
      <div className={styles.formTitle}>
        {initial ? 'Edit Goal' : 'New Goal'}
      </div>

      <div className={styles.fieldGrid}>
        <div className={styles.fieldFull}>
          <label className={styles.label}>Title</label>
          <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Finish UWorld Cardiology" autoFocus />
        </div>

        <div>
          <label className={styles.label}>Goal Type</label>
          <select className={styles.select} value={goalType} onChange={e => setGoalType(e.target.value)}>
            {GOAL_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className={styles.fieldDesc}>{getTargetHint(goalType)}</div>
        </div>

        <div>
          <label className={styles.label}>
            Target Value
            {needsDeadline && <span className={styles.required}> *</span>}
          </label>
          <input className={styles.input} type="number" min="1" value={targetValue} onChange={e => setTargetValue(e.target.value)}
            placeholder={goalType === 'hours' ? 'e.g. 100' : goalType === 'performance' || goalType === 'subject_avg' ? 'e.g. 80' : 'e.g. 500'} />
        </div>

        <div>
          <label className={styles.label}>Category</label>
          <select className={styles.select} value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {needsSubject && (
          <div>
            <label className={styles.label}>Subject <span className={styles.required}>*</span></label>
            <select className={styles.select} value={subjectId} onChange={e => setSubjectId(e.target.value)}>
              <option value="">Select subject</option>
              {SUBJECT_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        )}

        {needsModule && (
          <div>
            <label className={styles.label}>Module</label>
            <select className={styles.select} value={module} onChange={e => setModule(e.target.value)}>
              <option value="">All modules</option>
              {MODULE_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={styles.label}>
            Deadline
            {needsDeadline ? <span className={styles.required}> *</span> : <span className={styles.optional}> (optional)</span>}
          </label>
          <input className={styles.input} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>

        <div className={styles.fieldFull}>
          <label className={styles.label}>Notes <span className={styles.optional}>(optional)</span></label>
          <input className={styles.input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional details..." />
        </div>
      </div>

      <div className={styles.btnRow}>
        <button type="button" onClick={onCancel} className={styles.cancelBtn}>Cancel</button>
        <button type="submit" className={styles.submitBtn}>
          {initial ? 'Save Changes' : 'Create Goal'}
        </button>
      </div>
    </form>
  )
}
