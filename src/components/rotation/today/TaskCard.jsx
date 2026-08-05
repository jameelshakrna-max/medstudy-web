import { useMemo, useCallback } from 'react'
import { Play, Check, SkipForward, Brain, BookOpen, FileQuestion, RotateCcw, Layers, Bookmark, GraduationCap, Timer, Lock } from 'lucide-react'
import { getAvailableTaskActions, TASK_TYPE_ICONS } from './taskActionRules'
import ProgressBar from '../../ui/ProgressBar/ProgressBar'
import getTaskLockState from './getTaskLockState'
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

  const lock = getTaskLockState(task, topicsById)
  const isLocked = task.isLocked || lock.isLocked
  const isActive = task.isActive
  const isOverdue = task.isOverdue
  const isTerminal = task.isTerminal

  const isQuestionTask = task.taskType === 'uworld_questions' || task.taskType === 'incorrect_review'
  const remaining = Math.max(0, task.targetCount - (task.completedCount || 0))
  const showCountStats = isQuestionTask && task.targetCount > 0 && !isTerminal

  const displayName = task.topicTitle || task.typeLabel
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
          } ${isLocked ? styles.lockBadge : ''}`}
        >
          {isLocked ? <><Lock size={11} /> Locked</> : task.statusLabel}
        </span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.titleRow}>
          <span className={styles.topicTitle}>{displayName}</span>
        </div>
        {(sourceTitle || sectionName) && (
          <div className={styles.sourceInfo}>
            {sourceTitle}{sectionName && sourceTitle ? ` \u00b7 ${sectionName}` : sectionName}
          </div>
        )}
        <div className={styles.progressRow}>
          <span className={styles.timeEstimate}>{task.timeEstimate}</span>
          <div className={styles.progressInline}>
            <ProgressBar value={task.progressPercent} size="sm" />
            <span className={styles.progressLabel}>{task.progressLabel}</span>
          </div>
        </div>
        {isLocked && (
          <div className={styles.lockMessage}>
            {lock.message || 'Complete this task\'s prerequisite first.'}
          </div>
        )}
        {!isLocked && !isTerminal && task.taskType === 'uworld_questions' && (
          <div className={styles.uworldHint}>
            Complete these questions in UWorld, then record your progress in MedStudy.
          </div>
        )}
        {showCountStats && (
          <div className={styles.countStats}>
            {`${task.completedCount} of ${task.targetCount} questions \u00b7 ${remaining} remaining`}
          </div>
        )}
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

      {!isLocked && (
        <div className={styles.cardActions}>
          {actions.includes('start') && (
            <button
              className={`${styles.actionBtn} ${styles.playBtn}`}
              onClick={() => onStart(task)}
              disabled={isMutating}
            >
              {isMutating ? 'Starting...' : <><Play size={12} /> Start</>}
            </button>
          )}
          {actions.includes('complete') && (
            <button
              className={`${styles.actionBtn} ${styles.completeBtn}`}
              onClick={() => onComplete(task)}
              disabled={isMutating}
            >
              <Check size={12} /> {isQuestionTask ? 'Complete' : 'Done'}
            </button>
          )}
          {actions.includes('partial') && (
            <button
              className={styles.actionBtn}
              onClick={() => onPartial(task)}
              disabled={isMutating}
            >
              {isQuestionTask ? 'Record Progress' : 'Partial'}
            </button>
          )}
          {actions.includes('skip') && (
            <button
              className={`${styles.actionBtn} ${styles.skipBtn}`}
              onClick={() => onSkip(task)}
              disabled={isMutating}
            >
              <SkipForward size={12} /> Skip
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
      )}
    </div>
  )
}
