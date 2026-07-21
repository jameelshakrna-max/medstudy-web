import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import styles from './ScheduleView.module.css'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const ACTIVITY_COLORS = {
  study: 'var(--blue)',
  uworld: 'var(--emerald)',
  flashcards: 'var(--indigo)',
  mixed: 'var(--amber)',
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDisplayDate(dateStr) {
  const d = parseDate(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ScheduleView({ schedule, progress, onEntryUpdate }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [expandedDate, setExpandedDate] = useState(null)

  const today = formatDate(new Date())

  // Group schedule by date
  const scheduleByDate = useMemo(() => {
    const map = {}
    for (const entry of schedule) {
      if (!map[entry.date]) map[entry.date] = []
      map[entry.date].push(entry)
    }
    return map
  }, [schedule])

  // Compute the week range
  const weekStart = useMemo(() => {
    const d = new Date()
    const dayOfWeek = d.getDay()
    // Shift to Monday
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    d.setDate(d.getDate() + diff + weekOffset * 7)
    d.setHours(0, 0, 0, 0)
    return d
  }, [weekOffset])

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return formatDate(d)
    })
  }, [weekStart])

  const totalWeeks = useMemo(() => {
    if (schedule.length === 0) return 0
    const dates = schedule.map((e) => e.date).sort()
    const first = parseDate(dates[0])
    const last = parseDate(dates[dates.length - 1])
    const diffMs = last - first
    return Math.ceil(diffMs / (7 * 86400000)) + 1
  }, [schedule])

  function getCompletedCount(dateStr) {
    const entries = scheduleByDate[dateStr] || []
    return entries.filter((e) => e.status === 'completed').length
  }

  function toggleExpand(dateStr) {
    setExpandedDate(expandedDate === dateStr ? null : dateStr)
  }

  return (
    <div className={styles.container}>
      {/* Week navigation */}
      <div className={styles.weekNav}>
        <button
          className={styles.weekNavBtn}
          onClick={() => setWeekOffset((o) => o - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className={styles.weekLabel}>
          {formatDisplayDate(weekDays[0])} - {formatDisplayDate(weekDays[6])}
        </span>
        <button
          className={styles.weekNavBtn}
          onClick={() => setWeekOffset((o) => o + 1)}
        >
          <ChevronRight size={16} />
        </button>
        {weekOffset !== 0 && (
          <button
            className={styles.todayBtn}
            onClick={() => setWeekOffset(0)}
          >
            Today
          </button>
        )}
      </div>

      {/* Calendar grid */}
      <div className={styles.grid}>
        {/* Day headers */}
        {DAY_NAMES.map((name) => (
          <div key={name} className={styles.dayHeader}>
            {name}
          </div>
        ))}

        {/* Day cells */}
        {weekDays.map((dateStr) => {
          const entries = scheduleByDate[dateStr] || []
          const isToday = dateStr === today
          const isExpanded = expandedDate === dateStr
          const completedCount = getCompletedCount(dateStr)
          const hasEntries = entries.length > 0

          // Get unique activity types
          const activityTypes = [...new Set(entries.map((e) => e.activity_type))]

          return (
            <div
              key={dateStr}
              className={`${styles.dayCell} ${isToday ? styles.dayCellToday : ''} ${hasEntries ? styles.dayCellHasEntries : ''} ${isExpanded ? styles.dayCellExpanded : ''}`}
              onClick={() => hasEntries && toggleExpand(dateStr)}
            >
              <div className={styles.dayDate}>
                <span className={styles.dayDateNum}>
                  {parseDate(dateStr).getDate()}
                </span>
                {completedCount > 0 && (
                  <span className={styles.dayCompletedBadge}>
                    <Check size={10} />
                    {completedCount}/{entries.length}
                  </span>
                )}
              </div>

              {/* Activity indicators */}
              {hasEntries && !isExpanded && (
                <div className={styles.activityDots}>
                  {activityTypes.map((type) => (
                    <span
                      key={type}
                      className={styles.activityDot}
                      style={{ background: ACTIVITY_COLORS[type] || 'var(--mist)' }}
                      title={`${entries.filter((e) => e.activity_type === type).length} ${type}`}
                    />
                  ))}
                </div>
              )}

              {/* Entry count */}
              {hasEntries && !isExpanded && (
                <span className={styles.entryCount}>
                  {entries.length} task{entries.length !== 1 ? 's' : ''}
                </span>
              )}

              {/* Expanded view */}
              {isExpanded && (
                <div className={styles.dayEntries}>
                  {entries
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className={`${styles.dayEntry} ${entry.status === 'completed' ? styles.dayEntryCompleted : ''}`}
                      >
                        <div className={styles.dayEntryHeader}>
                          <span
                            className={styles.activityBadge}
                            style={{
                              background: `${ACTIVITY_COLORS[entry.activity_type] || 'var(--mist)'}20`,
                              color: ACTIVITY_COLORS[entry.activity_type] || 'var(--mist)',
                            }}
                          >
                            {entry.activity_type}
                          </span>
                          {entry.status === 'completed' && (
                            <Check size={12} className={styles.entryCheck} />
                          )}
                        </div>
                        <div className={styles.dayEntryDesc}>{entry.description}</div>
                        <div className={styles.dayEntryMeta}>
                          {entry.estimated_minutes && (
                            <span>{entry.estimated_minutes}m</span>
                          )}
                          {entry.uworld_questions > 0 && (
                            <span>{entry.uworld_questions} Qs</span>
                          )}
                        </div>
                        {entry.status !== 'completed' && onEntryUpdate && (
                          <button
                            className={styles.completeBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              onEntryUpdate(entry.id, 'completed')
                            }}
                          >
                            <Check size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {/* Empty day */}
              {!hasEntries && (
                <div className={styles.emptyDay}>-</div>
              )}
            </div>
          )
        })}
      </div>

      {schedule.length === 0 && (
        <div className={styles.empty}>
          No schedule entries generated yet.
        </div>
      )}
    </div>
  )
}
