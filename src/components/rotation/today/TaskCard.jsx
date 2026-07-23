import { useMemo, useCallback } from 'react'
import { Play, Pause, Check, SkipForward, Brain, BookOpen, FileQuestion, RotateCcw, Layers, Bookmark, GraduationCap } from 'lucide-react'
import { getAvailableTaskActions, TASK_TYPE_LABELS, TASK_TYPE_ICONS } from './taskActionRules'
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

export default function TaskCard({ task, planId, plan, todayKey, onPlay, onAction }) {
  const actions = useMemo(() => getAvailableTaskActions(task), [task])
  const TypeIcon = ICON_MAP[TASK_TYPE_ICONS[task.taskType]] || BookOpen

  const isLocked = task.isLocked
  const isActive = task.isActive
  const isOverdue = task.isOverdue
  const isTerminal = task.isTerminal

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
        <div className={styles.timeInfo}>
          <span className={styles.timeEstimate}>{task.timeEstimate}</span>
          {task.timeActual && (
            <span className={styles.timeActual}>{task.timeActual} spent</span>
          )}
        </div>
        <ProgressBar value={task.progressPercent} size="sm" />
        <span className={styles.progressLabel}>{task.progressLabel}</span>
      </div>

      <div className={styles.cardActions}>
        {actions.includes('start') && (
          <button
            className={`${styles.actionBtn} ${styles.playBtn}`}
            onClick={() => onPlay?.(task)}
          >
            <Play size={14} /> Start
          </button>
        )}
        {actions.includes('complete') && (
          <button
            className={`${styles.actionBtn} ${styles.completeBtn}`}
            onClick={() => onAction?.('complete', task)}
          >
            <Check size={14} /> Done
          </button>
        )}
        {actions.includes('partial') && (
          <button
            className={styles.actionBtn}
            onClick={() => onAction?.('partial', task)}
          >
            Partial
          </button>
        )}
        {actions.includes('skip') && (
          <button
            className={`${styles.actionBtn} ${styles.skipBtn}`}
            onClick={() => onAction?.('skip', task)}
          >
            <SkipForward size={14} /> Skip
          </button>
        )}
        {actions.includes('record_time') && (
          <button
            className={styles.actionBtn}
            onClick={() => onAction?.('record_time', task)}
          >
            Log Time
          </button>
        )}
        {actions.includes('record_questions') && (
          <button
            className={styles.actionBtn}
            onClick={() => onAction?.('record_questions', task)}
          >
            Log Questions
          </button>
        )}
      </div>
    </div>
  )
}
