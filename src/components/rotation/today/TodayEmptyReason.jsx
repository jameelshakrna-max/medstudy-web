import { CalendarDays, Play } from 'lucide-react'
import styles from './TodayEmptyReason.module.css'

export default function TodayEmptyReason({
  reason,
  isActivating = false,
  activationError = null,
  onActivate,
  onOpenAvailability,
}) {
  const r = reason || { reason: 'NONE', title: 'Nothing scheduled for today' }

  if (r.reason === 'DRAFT') {
    return (
      <div className={styles.empty}>
        <div className={styles.title}>{r.title}</div>
        <div className={styles.desc}>Activate your plan to start generating study tasks.</div>
        {activationError && <div className={styles.error}>{activationError}</div>}
        {onActivate && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onActivate}
            disabled={isActivating}
          >
            <Play size={14} /> {isActivating ? 'Activating...' : 'Activate plan'}
          </button>
        )}
      </div>
    )
  }

  if (r.reason === 'DAY_OFF') {
    return (
      <div className={styles.empty}>
        <div className={styles.title}>{r.title}</div>
        <div className={styles.desc}>
          {r.nextStudyDayLabel && <div>Next study day: {r.nextStudyDayLabel}</div>}
          {r.nextTask && (
            <div>
              Next task: {r.nextTask.title} &mdash; {r.nextTask.dateLabel}
            </div>
          )}
        </div>
        {onOpenAvailability && (
          <button type="button" className={styles.actionBtn} onClick={onOpenAvailability}>
            <CalendarDays size={14} /> View calendar or availability settings
          </button>
        )}
      </div>
    )
  }

  if (r.reason === 'ALL_DONE') {
    return (
      <div className={styles.empty}>
        <div className={styles.title}>{r.title}</div>
        {r.doneCount != null && (
          <div className={styles.desc}>
            {r.doneCount} task{r.doneCount === 1 ? '' : 's'} completed today.
          </div>
        )}
      </div>
    )
  }

  if (r.reason === 'LOCKED') {
    return (
      <div className={styles.empty}>
        <div className={styles.title}>{r.title}</div>
        {r.prereqNames && r.prereqNames.length > 0 && (
          <div className={styles.desc}>Complete these first: {r.prereqNames.join(', ')}</div>
        )}
      </div>
    )
  }

  if (r.reason === 'NEXT_TASK') {
    return (
      <div className={styles.empty}>
        <div className={styles.title}>{r.title}</div>
        {r.nextTask && (
          <div className={styles.desc}>
            Next task: {r.nextTask.title} &mdash; {r.nextTask.dateLabel}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.empty}>
      <div className={styles.title}>Nothing scheduled for today</div>
      <div className={styles.desc}>Check the Schedule tab for upcoming tasks.</div>
    </div>
  )
}
