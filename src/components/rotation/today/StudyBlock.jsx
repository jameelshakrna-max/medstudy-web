import { useState, useMemo } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Timer } from 'lucide-react'
import ProgressBar from '../../ui/ProgressBar/ProgressBar'
import TaskCard from './TaskCard'
import styles from './StudyBlock.module.css'

export default function StudyBlock({
  block,
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
}) {
  const [expanded, setExpanded] = useState(false)

  const {
    studyBlockId,
    tasks,
    totalEstimatedMinutes,
    progress,
    primaryTask,
    title,
    topicNames,
    hasMoreTopics,
    topicCount,
  } = block

  const hasInProgress = tasks.some((t) => t.status === 'in_progress')

  const inProgressTask = useMemo(
    () => tasks.find((t) => t.status === 'in_progress') || null,
    [tasks],
  )

  const countsSummary = useMemo(() => {
    const parts = []
    if (progress.completed > 0) parts.push(`${progress.completed} completed`)
    if (progress.skipped > 0) parts.push(`${progress.skipped} skipped`)
    if (progress.remaining > 0) parts.push(`${progress.remaining} remaining`)
    return parts.join(' \u00b7 ')
  }, [progress])

  const blockId = `study-block-${studyBlockId}`

  return (
    <div
      className={`${styles.block} ${hasInProgress ? styles.active : ''}`}
      role="region"
      aria-label={title}
    >
      <div className={styles.blockHeader}>
        <button
          className={styles.expandBtn}
          aria-expanded={expanded}
          aria-controls={blockId}
          aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className={styles.headerContent}>
          <div className={styles.titleRow}>
            <BookOpen size={14} className={styles.icon} />
            <span className={styles.blockTitle}>{title}</span>
          </div>

          <div className={styles.meta}>
            {totalEstimatedMinutes}m &middot; {topicCount} topic{topicCount !== 1 ? 's' : ''}
          </div>

          <div className={styles.topicPreview}>
            {topicNames.slice(0, 3).map((name) => (
              <span key={name} className={styles.topicName}>{name}</span>
            ))}
            {hasMoreTopics && (
              <span className={styles.moreTopics}>+{topicCount - 3} more</span>
            )}
          </div>

          {hasInProgress && inProgressTask && (
            <div className={styles.studyingNow}>
              Currently studying: {inProgressTask.topicTitle}
            </div>
          )}

          <div className={styles.progressRow}>
            <ProgressBar value={progress.percent / 100} size="sm" />
          </div>

          {countsSummary && (
            <div className={styles.countSummary}>{countsSummary}</div>
          )}

          <div className={styles.actionsRow}>
            {primaryTask && (
              <button
                className={styles.pomodoroBtn}
                onClick={() => onStudyPomodoro(primaryTask)}
                disabled={isMutating}
              >
                <Timer size={14} /> Study with Pomodoro
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className={styles.children} id={blockId}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              planId={planId}
              plan={plan}
              todayKey={todayKey}
              topicsById={topicsById}
              sourceTitle={sourceTitle}
              isMutating={isMutating}
              onStart={onStart}
              onComplete={onComplete}
              onPartial={onPartial}
              onRecordTime={onRecordTime}
              onRecordQuestions={onRecordQuestions}
              onSkip={onSkip}
              onStudyPomodoro={onStudyPomodoro}
            />
          ))}
        </div>
      )}
    </div>
  )
}
