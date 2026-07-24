import { useState, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Check, Clock, AlertTriangle, Lock, Minus } from 'lucide-react'
import { getTodayKey, getBrowserTimezone, resolvePlannerTimezone } from './todayUtils'
import { groupTasksByDate } from './todayGrouping'
import { STATUS_LABELS, formatMinutes } from './taskDisplayModel'
import styles from './ScheduleView.module.css'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TASK_TYPE_LABELS = {
  learning: 'Learning',
  consolidation: 'Learning',
  uworld_questions: 'UWorld',
  incorrect_review: 'Incorrect Review',
  flashcard_review: 'Flashcard Review',
  mixed_review: 'Mixed Review',
  optional_book_questions: 'Practice',
}

const TASK_TYPE_COLORS = {
  learning: 'var(--blue)',
  consolidation: 'var(--blue)',
  uworld_questions: 'var(--emerald)',
  incorrect_review: 'var(--amber, #ffb800)',
  flashcard_review: 'var(--indigo)',
  mixed_review: 'var(--amber, #ffb800)',
  optional_book_questions: 'var(--text-secondary)',
}

const QUESTION_TASK_TYPES = new Set(['uworld_questions', 'incorrect_review'])

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

function formatFullDate(dateStr) {
  const d = parseDate(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function getDayOfWeek(dateStr) {
  return parseDate(dateStr).getDay()
}

function isOverdue(taskDate, todayKey, status) {
  if (taskDate >= todayKey) return false
  return status === 'pending' || status === 'in_progress'
}

function formatWorkload(task) {
  const { taskType, targetCount, completedCount, incorrectCount, estimatedMinutes } = task

  if (taskType === 'uworld_questions' && targetCount > 0) {
    return `${completedCount || 0} / ${targetCount} questions`
  }

  if (taskType === 'incorrect_review') {
    if (targetCount > 0) {
      const remaining = targetCount - (completedCount || 0)
      return `${remaining > 0 ? remaining : 0} questions remaining`
    }
    if (incorrectCount > 0) {
      return `${incorrectCount} questions remaining`
    }
  }

  if (taskType === 'flashcard_review' && targetCount > 0) {
    return `${targetCount} cards`
  }

  if (estimatedMinutes > 0) {
    return formatMinutes(estimatedMinutes)
  }

  return null
}

function StatusBadge({ status, overdue }) {
  if (overdue) {
    return (
      <span className={`${styles.statusBadge} ${styles.statusOverdue}`}>
        <AlertTriangle size={10} /> Overdue
      </span>
    )
  }

  const className = {
    locked: styles.statusLocked,
    pending: styles.statusPending,
    in_progress: styles.statusActive,
    partial: styles.statusPartial,
    completed: styles.statusTerminal,
    skipped: styles.statusSkipped,
  }[status] || styles.statusPending

  return (
    <span className={`${styles.statusBadge} ${className}`}>
      {status === 'completed' && <Check size={10} />}
      {status === 'locked' && <Lock size={10} />}
      {STATUS_LABELS[status] || status}
    </span>
  )
}

export default function ScheduleView({
  tasks,
  topicsById,
  sourceTitle,
  availability,
  todayKey: externalTodayKey,
}) {
  const timezone = resolvePlannerTimezone({
    browserTimezone: getBrowserTimezone(),
  })
  const todayKey = externalTodayKey || getTodayKey(new Date(), timezone)

  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState(todayKey)

  const tasksByDate = useMemo(() => groupTasksByDate(tasks), [tasks])

  const availabilityByWeekday = useMemo(() => {
    if (!availability || !Array.isArray(availability)) return null
    const map = new Map()
    for (const entry of availability) {
      map.set(entry.weekday, entry)
    }
    return map
  }, [availability])

  const weekStart = useMemo(() => {
    const d = parseDate(todayKey)
    const dayOfWeek = d.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    d.setDate(d.getDate() + diff + weekOffset * 7)
    return formatDate(d)
  }, [weekOffset, todayKey])

  const weekDays = useMemo(() => {
    const start = parseDate(weekStart)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return formatDate(d)
    })
  }, [weekStart])

  const selectedTasks = useMemo(() => {
    return tasksByDate.get(selectedDate) || []
  }, [tasksByDate, selectedDate])

  const selectedTopicMap = useMemo(() => {
    const map = new Map()
    for (const task of selectedTasks) {
      if (task.planTopicId && topicsById?.has(task.planTopicId)) {
        map.set(task.id, topicsById.get(task.planTopicId))
      }
    }
    return map
  }, [selectedTasks, topicsById])

  const selectedDayAvailability = useMemo(() => {
    if (!availabilityByWeekday) return null
    const dow = getDayOfWeek(selectedDate)
    return availabilityByWeekday.get(dow) || null
  }, [availabilityByWeekday, selectedDate])

  const isDayOff = selectedDayAvailability?.isDayOff === true

  const selectedDaySummary = useMemo(() => {
    const learningTasks = selectedTasks.filter(t => !QUESTION_TASK_TYPES.has(t.taskType))
    const questionTasks = selectedTasks.filter(t => QUESTION_TASK_TYPES.has(t.taskType))

    const learningMinutes = learningTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0)
    const questionCount = questionTasks.reduce((sum, t) => sum + (t.targetCount || 0), 0)

    return {
      totalTasks: selectedTasks.length,
      learningTasks: learningTasks.length,
      learningMinutes,
      questionTasks: questionTasks.length,
      questionCount,
    }
  }, [selectedTasks])

  const handlePrevWeek = useCallback(() => setWeekOffset(o => o - 1), [])
  const handleNextWeek = useCallback(() => setWeekOffset(o => o + 1), [])
  const handleToday = useCallback(() => {
    setWeekOffset(0)
    setSelectedDate(todayKey)
  }, [todayKey])

  const goTodayDisabled = weekOffset === 0 && selectedDate === todayKey

  return (
    <div className={styles.container}>
      {/* Week navigation */}
      <div className={styles.weekNav}>
        <button className={styles.navBtn} onClick={handlePrevWeek} aria-label="Previous week">
          <ChevronLeft size={16} />
        </button>
        <span className={styles.weekLabel}>
          {formatDisplayDate(weekDays[0])} – {formatDisplayDate(weekDays[6])}
        </span>
        <button className={styles.navBtn} onClick={handleNextWeek} aria-label="Next week">
          <ChevronRight size={16} />
        </button>
        {!goTodayDisabled && (
          <button className={styles.todayBtn} onClick={handleToday}>Today</button>
        )}
      </div>

      {/* Week strip */}
      <div className={styles.weekStrip}>
        {weekDays.map((dateStr) => {
          const dayTasks = tasksByDate.get(dateStr) || []
          const count = dayTasks.length
          const isToday = dateStr === todayKey
          const isSelected = dateStr === selectedDate

          return (
            <button
              key={dateStr}
              className={`${styles.dayCell} ${isToday ? styles.dayCellToday : ''} ${isSelected ? styles.dayCellSelected : ''}`}
              onClick={() => setSelectedDate(dateStr)}
            >
              <span className={styles.dayName}>{DAY_NAMES[weekDays.indexOf(dateStr)]}</span>
              <span className={styles.dayNum}>{parseDate(dateStr).getDate()}</span>
              {count > 0 ? (
                <span className={styles.dayCount}>{count}</span>
              ) : (
                <Minus size={10} className={styles.dayEmpty} />
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day agenda */}
      <div className={styles.agenda}>
        <div className={styles.agendaHeader}>
          <h3 className={styles.agendaTitle}>{formatFullDate(selectedDate)}</h3>
          {selectedDate === todayKey && <span className={styles.todayBadge}>TODAY</span>}
        </div>

        {selectedDaySummary.totalTasks > 0 && (
          <div className={styles.agendaSummary}>
            {selectedDaySummary.learningTasks > 0 && (
              <span>
                {selectedDaySummary.learningTasks} learning task{selectedDaySummary.learningTasks !== 1 ? 's' : ''}
                {selectedDaySummary.learningMinutes > 0 && ` · ${formatMinutes(selectedDaySummary.learningMinutes)}`}
              </span>
            )}
            {selectedDaySummary.questionTasks > 0 && (
              <span>
                {selectedDaySummary.learningTasks > 0 && ' · '}
                {selectedDaySummary.questionTasks} UWorld task{selectedDaySummary.questionTasks !== 1 ? 's' : ''}
                {selectedDaySummary.questionCount > 0 && ` · ${selectedDaySummary.questionCount} questions`}
              </span>
            )}
          </div>
        )}

        {selectedTasks.length === 0 ? (
          <div className={styles.emptyDay}>
            {isDayOff ? (
              <>
                <div className={styles.dayOffTitle}>Day off</div>
                <div className={styles.dayOffDesc}>No study time planned.</div>
              </>
            ) : (
              <div>Nothing scheduled for this day.</div>
            )}
          </div>
        ) : (
          <div className={styles.taskList}>
            {selectedTasks.map((task) => {
              const topic = selectedTopicMap.get(task.id)
              const overdue = isOverdue(task.taskDate, todayKey, task.status)
              const workload = formatWorkload(task)
              const typeLabel = TASK_TYPE_LABELS[task.taskType] || task.taskType
              const typeColor = TASK_TYPE_COLORS[task.taskType] || 'var(--text-secondary)'

              return (
                <div
                  key={task.id}
                  className={`${styles.taskRow} ${task.status === 'completed' ? styles.taskRowCompleted : ''} ${overdue ? styles.taskRowOverdue : ''}`}
                >
                  <div className={styles.taskMain}>
                    <div className={styles.taskTypeRow}>
                      <span className={styles.taskType} style={{ color: typeColor }}>
                        {typeLabel}
                      </span>
                    </div>
                    <div className={styles.taskTitle}>
                      {topic?.topicTitle || typeLabel}
                    </div>
                    {sourceTitle && (
                      <div className={styles.taskSource}>{sourceTitle}</div>
                    )}
                    <div className={styles.taskMeta}>
                      {workload && <span className={styles.workload}>{workload}</span>}
                    </div>
                  </div>
                  <div className={styles.taskStatus}>
                    <StatusBadge status={task.status} overdue={overdue} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
