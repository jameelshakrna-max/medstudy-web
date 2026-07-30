import { useState, useMemo, useCallback } from 'react'
import { Check, Lock, AlertTriangle } from 'lucide-react'
import Drawer from '../ui/Drawer/Drawer'
import {
  getDayAvailability,
  canMoveTask,
  getSuggestedDates,
} from './calendarUtils'
import { TASK_TYPE_LABELS, TASK_TYPE_COLORS } from './today/taskActionRules'
import { STATUS_LABELS, formatMinutes } from './today/taskDisplayModel'
import styles from './CalendarView.module.css'

const QUESTION_TASK_TYPES = new Set(['uworld_questions', 'incorrect_review'])

function formatFullDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatShortDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isOverdue(taskDate, todayKey, status) {
  if (taskDate >= todayKey) return false
  return status === 'pending' || status === 'in_progress'
}

export default function DailyTaskPanel({
  dateKey,
  tasks,
  topicsById,
  availability,
  todayKey,
  onReschedule,
  isMutating,
  plan,
  onClose,
}) {
  const [movingTaskId, setMovingTaskId] = useState(null)

  const availabilityByWeekday = useMemo(() => {
    if (!availability || !Array.isArray(availability)) return null
    const map = new Map()
    for (const entry of availability) {
      map.set(entry.weekday, entry)
    }
    return map
  }, [availability])

  const dayAvail = useMemo(
    () => getDayAvailability(dateKey, availabilityByWeekday),
    [dateKey, availabilityByWeekday]
  )

  const isDayOff = dayAvail?.isDayOff === true

  const totalMinutes = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0),
    [tasks]
  )

  const suggestedDates = useMemo(() => {
    if (!movingTaskId || !plan) return []
    return getSuggestedDates(dateKey, plan, availabilityByWeekday, 5)
  }, [movingTaskId, dateKey, plan, availabilityByWeekday])

  const handleMove = useCallback((taskId) => {
    setMovingTaskId(taskId)
  }, [])

  const handleMoveCancel = useCallback(() => {
    setMovingTaskId(null)
  }, [])

  const handleMoveConfirm = useCallback(async (taskId, newDate) => {
    setMovingTaskId(null)
    if (onReschedule) {
      await onReschedule(taskId, newDate)
    }
  }, [onReschedule])

  const isToday = dateKey === todayKey

  return (
    <div>
      <div className={styles.panelHeader}>
        <div className={styles.panelDateWrap}>
          <span className={styles.panelDate}>{formatFullDate(dateKey)}</span>
          {isToday && <span className={styles.panelToday}>TODAY</span>}
        </div>
        <Drawer.Close asChild>
          <button className={styles.navBtn} onClick={onClose} aria-label="Close panel">✕</button>
        </Drawer.Close>
      </div>

      <div className={styles.panelSummary}>
        <span className={styles.panelSummaryItem}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          {totalMinutes > 0 && ` · ${formatMinutes(totalMinutes)}`}
        </span>
        {dayAvail && !isDayOff && (
          <span className={styles.panelSummaryItem}>
            Available: {formatMinutes(dayAvail.availableMinutes)}
          </span>
        )}
        {isDayOff && (
          <span className={styles.panelSummaryItem}>Day off</span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className={styles.emptyState}>
          {isDayOff ? (
            <>
              <div className={styles.emptyStateTitle}>Day off</div>
              <div>No study time planned.</div>
            </>
          ) : (
            <div>No tasks scheduled for this day.</div>
          )}
        </div>
      ) : (
        <div className={styles.taskList}>
          {tasks.map((task) => {
            const topic = topicsById?.get(task.planTopicId)
            const typeLabel = TASK_TYPE_LABELS[task.taskType] || task.taskType
            const typeColor = TASK_TYPE_COLORS[task.taskType] || 'var(--text-secondary)'
            const workload = formatWorkload(task)
            const overdue = isOverdue(task.taskDate, todayKey, task.status)
            const canMove = canMoveTask(task)
            const isMoving = movingTaskId === task.id

            return (
              <div
                key={task.id}
                className={`${styles.taskRow} ${task.status === 'completed' ? styles.taskRowCompleted : ''}`}
              >
                <div className={styles.taskTypeRow}>
                  <span className={styles.taskTypeDot} style={{ background: typeColor }} />
                  <span className={styles.taskTypeLabel} style={{ color: typeColor }}>
                    {typeLabel}
                  </span>
                </div>

                <div className={styles.taskTitle}>
                  {topic?.topicTitle || typeLabel}
                </div>

                {topic?.groupId && (
                  <div className={styles.taskGroup}>{topic.groupId}</div>
                )}

                <div className={styles.taskMeta}>
                  <span className={styles.taskWorkload}>
                    {workload || (task.estimatedMinutes > 0 ? formatMinutes(task.estimatedMinutes) : null)}
                  </span>
                  <StatusBadge status={task.status} overdue={overdue} />
                </div>

                {canMove && !isMoving && (
                  <button
                    className={styles.moveBtn}
                    onClick={() => handleMove(task.id)}
                    disabled={isMutating}
                  >
                    Move
                  </button>
                )}

                {isMoving && (
                  <div className={styles.moveDateList}>
                    {suggestedDates.length === 0 ? (
                      <span className={styles.taskWorkload}>No available dates found.</span>
                    ) : (
                      suggestedDates.map((date) => (
                        <button
                          key={date}
                          className={styles.moveDateBtn}
                          onClick={() => handleMoveConfirm(task.id, date)}
                          disabled={isMutating}
                        >
                          {formatShortDate(date)}
                        </button>
                      ))
                    )}
                    <button
                      className={styles.moveCancelBtn}
                      onClick={handleMoveCancel}
                      disabled={isMutating}
                    >
                      Cancel
                    </button>
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
