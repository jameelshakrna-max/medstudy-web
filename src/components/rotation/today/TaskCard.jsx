import { useMemo, useCallback } from 'react'
import { Play, Check, SkipForward, Brain, BookOpen, FileQuestion, RotateCcw, Layers, Bookmark, GraduationCap, Timer } from 'lucide-react'
import { getAvailableTaskActions, TASK_TYPE_ICONS } from './taskActionRules'
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

export default function TaskCard({
  task,
  planId,
  plan,
  todayKey,
  topicsById,
  sourceTitle,
  isMutating,
  onStart,
  onComplete,
  onPartial,
  onRecordTime,
  onRecordQuestions,
  onSkip,
  onStudyPomodoro,
  canStudy,
}) {
  const actions = useMemo(() => getAvailableTaskActions(task), [task])
  const TypeIcon = ICON_MAP[TASK_TYPE_ICONS[task.taskType]] || BookOpen

  const isLocked = task.isLocked
  const isActive = task.isActive
  const isOverdue = task.isOverdue
  const isTerminal = task.isTerminal

  const displayName = task.topicTitle || task.typeLabel
  const sourceName = sourceTitle || task.topicSource || null
  const sectionName = task.topicSection || null

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
            {sectionName ? `${sourceName} \u2022 ${sectionName}` : sourceName}
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
            onClick={() => onStudyPomodoro(task)}
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
            onClick={() => onStart(task)}
            disabled={isMutating}
          >
            {isMutating ? 'Starting...' : <><Play size={14} /> Start</>}
          </button>
        )}
        {actions.includes('complete') && (
          <button
            className={`${styles.actionBtn} ${styles.completeBtn}`}
            onClick={() => onComplete(task)}
            disabled={isMutating}
          >
            <Check size={14} /> Done
          </button>
        )}
        {actions.includes('partial') && (
          <button
            className={styles.actionBtn}
            onClick={() => onPartial(task)}
            disabled={isMutating}
          >
            Partial
          </button>
        )}
        {actions.includes('skip') && (
          <button
            className={`${styles.actionBtn} ${styles.skipBtn}`}
            onClick={() => onSkip(task)}
            disabled={isMutating}
          >
            <SkipForward size={14} /> Skip
          </button>
        )}
        {actions.includes('record_time') && (
          <button
            className={styles.actionBtn}
            onClick={() => onRecordTime(task)}
            disabled={isMutating}
          >
            Log Time
          </button>
        )}
        {actions.includes('record_questions') && (
          <button
            className={styles.actionBtn}
            onClick={() => onRecordQuestions(task)}
            disabled={isMutating}
          >
            Log Questions
          </button>
        )}
      </div>
    </div>
  )
}
