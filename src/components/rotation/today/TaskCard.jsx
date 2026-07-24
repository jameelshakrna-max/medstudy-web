import { useMemo, useCallback, useState } from 'react'
import { Play, Pause, Check, SkipForward, Brain, BookOpen, FileQuestion, RotateCcw, Layers, Bookmark, GraduationCap, Timer, X } from 'lucide-react'
import { getAvailableTaskActions, TASK_TYPE_ICONS } from './taskActionRules'
import { STATUS_LABELS } from './taskDisplayModel'
import ProgressBar from '../../ui/ProgressBar/ProgressBar'
import styles from './TaskCard.module.css'

const ICON_MAP = {
  BookOpen,
  Brain,
  FileQuestion,
  RotateCcw,
  Layers,
  Bookmark,
  GraduationCap,
}

export default function TaskCard({ task, planId, plan, todayKey, topicsById, mutations, taskAttachment, sourceTitle }) {
  const actions = useMemo(() => getAvailableTaskActions(task), [task])
  const TypeIcon = ICON_MAP[TASK_TYPE_ICONS[task.taskType]] || BookOpen

  const isLocked = task.isLocked
  const isActive = task.isActive
  const isOverdue = task.isOverdue
  const isTerminal = task.isTerminal

  const topic = topicsById?.get(task.planTopicId) || null
  const displayName = task.topicTitle || task.typeLabel
  const sourceName = sourceTitle || task.topicSource || null
  const sectionName = task.topicSection || null

  const isMutating = mutations?.isPending ?? false

  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showPartialDialog, setShowPartialDialog] = useState(false)
  const [showSkipDialog, setShowSkipDialog] = useState(false)
  const [completeMinutes, setCompleteMinutes] = useState('')
  const [partialPercentage, setPartialPercentage] = useState('')
  const [partialMinutes, setPartialMinutes] = useState('')

  const handleStart = useCallback(() => {
    mutations?.startTask(task.id)
  }, [mutations, task.id])

  const handleComplete = useCallback(() => {
    const payload = {}
    const mins = parseInt(completeMinutes, 10)
    if (!isNaN(mins) && mins > 0) {
      payload.actualMinutes = mins
    }
    mutations?.completeTask(task.id, payload)
    setShowCompleteDialog(false)
    setCompleteMinutes('')
  }, [mutations, task.id, completeMinutes])

  const handlePartial = useCallback(() => {
    const payload = {}
    const pct = parseInt(partialPercentage, 10)
    if (!isNaN(pct) && pct > 0 && pct < 100) {
      payload.completedPercentage = pct
    }
    const mins = parseInt(partialMinutes, 10)
    if (!isNaN(mins) && mins > 0) {
      payload.actualMinutes = mins
    }
    mutations?.partialTask(task.id, payload)
    setShowPartialDialog(false)
    setPartialPercentage('')
    setPartialMinutes('')
  }, [mutations, task.id, partialPercentage, partialMinutes])

  const handleSkip = useCallback(() => {
    mutations?.skipTask(task.id)
    setShowSkipDialog(false)
  }, [mutations, task.id])

  const handleStudyPomodoro = useCallback(() => {
    taskAttachment?.handlePlay(task)
  }, [taskAttachment, task])

  const canStudy = task.status === 'pending' || task.status === 'in_progress'

  return (
    <div
      className={`${styles.card} ${
        isActive ? styles.active : ''
      } ${isOverdue ? styles.overdue : ''} ${
        isLocked ? styles.locked : ''
      } ${isTerminal ? styles.completed : ''}`}
      aria-disabled={isLocked || undefined}
    >
      <div className={styles.cardHeader}>
        <div className={styles.typeInfo}>
          <TypeIcon size={14} className={styles.typeIcon} />
          <span className={styles.typeLabel}>{task.typeLabel}</span>
        </div>
        <span
          className={`${styles.statusBadge} ${
            isActive ? styles.statusActive :
            isOverdue ? styles.statusOverdue :
            isTerminal ? styles.statusTerminal :
            ''
          }`}
        >
          {task.statusLabel}
        </span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.titleRow}>
          <span className={styles.topicTitle}>{displayName}</span>
        </div>
        {sourceName && (
          <div className={styles.sourceInfo}>
            {sectionName ? `${sourceName} • ${sectionName}` : sourceName}
          </div>
        )}
        <div className={styles.timeInfo}>
          <span className={styles.timeEstimate}>{task.timeEstimate}</span>
          {task.timeActual && (
            <span className={styles.timeActual}>{task.timeActual} spent</span>
          )}
        </div>
        <ProgressBar value={task.progressPercent} size="sm" />
        <span className={styles.progressLabel}>{task.progressLabel}</span>
      </div>

      {canStudy && (
        <div className={styles.pomodoroRow}>
          <button
            className={`${styles.actionBtn} ${styles.pomodoroBtn}`}
            onClick={handleStudyPomodoro}
            disabled={isMutating}
          >
            <Timer size={14} /> Study with Pomodoro
          </button>
        </div>
      )}

      <div className={styles.cardActions}>
        {actions.includes('start') && (
          <button
            className={`${styles.actionBtn} ${styles.playBtn}`}
            onClick={handleStart}
            disabled={isMutating}
          >
            {isMutating ? 'Starting...' : <><Play size={14} /> Start</>}
          </button>
        )}
        {actions.includes('complete') && (
          <button
            className={`${styles.actionBtn} ${styles.completeBtn}`}
            onClick={() => setShowCompleteDialog(true)}
            disabled={isMutating}
          >
            <Check size={14} /> Done
          </button>
        )}
        {actions.includes('partial') && (
          <button
            className={styles.actionBtn}
            onClick={() => setShowPartialDialog(true)}
            disabled={isMutating}
          >
            Partial
          </button>
        )}
        {actions.includes('skip') && (
          <button
            className={`${styles.actionBtn} ${styles.skipBtn}`}
            onClick={() => setShowSkipDialog(true)}
            disabled={isMutating}
          >
            <SkipForward size={14} /> Skip
          </button>
        )}
        {actions.includes('record_time') && (
          <button
            className={styles.actionBtn}
            disabled={isMutating}
          >
            Log Time
          </button>
        )}
        {actions.includes('record_questions') && (
          <button
            className={styles.actionBtn}
            disabled={isMutating}
          >
            Log Questions
          </button>
        )}
      </div>

      {showCompleteDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowCompleteDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <h4>Mark as Complete</h4>
              <button className={styles.dialogClose} onClick={() => setShowCompleteDialog(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.dialogBody}>
              <label className={styles.dialogLabel}>
                Actual time (minutes)
                <input
                  type="number"
                  className={styles.dialogInput}
                  value={completeMinutes}
                  onChange={(e) => setCompleteMinutes(e.target.value)}
                  placeholder="Optional"
                  min="0"
                />
              </label>
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setShowCompleteDialog(false)}>Cancel</button>
              <button
                className={`${styles.actionBtn} ${styles.completeBtn}`}
                onClick={handleComplete}
                disabled={isMutating}
              >
                {isMutating ? 'Saving...' : 'Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPartialDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowPartialDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <h4>Mark as Partial</h4>
              <button className={styles.dialogClose} onClick={() => setShowPartialDialog(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.dialogBody}>
              <label className={styles.dialogLabel}>
                Completion percentage (1-99)
                <input
                  type="number"
                  className={styles.dialogInput}
                  value={partialPercentage}
                  onChange={(e) => setPartialPercentage(e.target.value)}
                  placeholder="Required"
                  min="1"
                  max="99"
                />
              </label>
              <label className={styles.dialogLabel}>
                Actual time (minutes)
                <input
                  type="number"
                  className={styles.dialogInput}
                  value={partialMinutes}
                  onChange={(e) => setPartialMinutes(e.target.value)}
                  placeholder="Optional"
                  min="0"
                />
              </label>
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setShowPartialDialog(false)}>Cancel</button>
              <button
                className={styles.actionBtn}
                onClick={handlePartial}
                disabled={isMutating}
              >
                {isMutating ? 'Saving...' : 'Save Partial'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSkipDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowSkipDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <h4>Skip Task</h4>
              <button className={styles.dialogClose} onClick={() => setShowSkipDialog(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.dialogBody}>
              <p className={styles.dialogText}>Are you sure you want to skip this task?</p>
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setShowSkipDialog(false)}>Cancel</button>
              <button
                className={`${styles.actionBtn} ${styles.skipBtn}`}
                onClick={handleSkip}
                disabled={isMutating}
              >
                {isMutating ? 'Skipping...' : 'Skip Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
