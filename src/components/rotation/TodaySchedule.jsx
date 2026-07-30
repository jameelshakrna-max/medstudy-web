import { useMemo } from 'react'
import { Check, Clock, BookOpen } from 'lucide-react'
import styles from './TodaySchedule.module.css'

const ACTIVITY_COLORS = {
  study: 'var(--blue)',
  uworld: 'var(--emerald)',
  flashcards: 'var(--indigo)',
  mixed: 'var(--amber)',
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function getTodayDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function TodaySchedule({ schedule, progress, onEntryUpdate }) {
  const todayStr = getTodayDateStr()

  const todayEntries = useMemo(() => {
    return schedule
      .filter((e) => e.date === todayStr)
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [schedule, todayStr])

  const completedCount = todayEntries.filter((e) => e.status === 'completed').length
  const totalMinutes = todayEntries.reduce((sum, e) => sum + (e.estimated_minutes || 0), 0)

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Today</h2>
          <p className={styles.date}>{formatToday()}</p>
        </div>
        {todayEntries.length > 0 && (
          <div className={styles.stats}>
            <span className={styles.stat}>
              <Check size={14} />
              {completedCount}/{todayEntries.length}
            </span>
            <span className={styles.stat}>
              <Clock size={14} />
              {totalMinutes}m
            </span>
          </div>
        )}
      </div>

      {todayEntries.length === 0 ? (
        <div className={styles.empty}>
          <BookOpen size={32} strokeWidth={1.5} />
          <p>No tasks scheduled for today</p>
        </div>
      ) : (
        <div className={styles.entryList}>
          {todayEntries.map((entry) => {
            const isCompleted = entry.status === 'completed'
            const color = ACTIVITY_COLORS[entry.activity_type] || 'var(--mist)'

            return (
              <div
                key={entry.id}
                className={`${styles.entry} ${isCompleted ? styles.entryCompleted : ''}`}
              >
                <div
                  className={styles.entryAccent}
                  style={{ background: color }}
                />
                <div className={styles.entryContent}>
                  <div className={styles.entryHeader}>
                    <span
                      className={styles.activityBadge}
                      style={{
                        background: `${color}20`,
                        color,
                      }}
                    >
                      {entry.activity_type}
                    </span>
                    <span className={styles.entryTime}>
                      {entry.estimated_minutes}m
                    </span>
                  </div>
                  <div className={styles.entryDesc}>{entry.description}</div>
                  {entry.uworld_questions > 0 && (
                    <div className={styles.entryMeta}>
                      {entry.uworld_questions} UWorld Qs ({entry.uworld_mode || 'timed'})
                    </div>
                  )}
                </div>
                {!isCompleted && onEntryUpdate && (
                  <button
                    className={styles.completeBtn}
                    onClick={() => onEntryUpdate(entry.id, 'completed')}
                    title="Mark as complete"
                  >
                    <Check size={14} />
                  </button>
                )}
                {isCompleted && (
                  <div className={styles.completedCheck}>
                    <Check size={14} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
