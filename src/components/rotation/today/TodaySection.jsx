import { useMemo } from 'react'
import TaskCard from './TaskCard'
import StudyBlock from './StudyBlock'
import FlashcardReviewTask from './FlashcardReviewTask'
import { calculateSectionProgress } from './todayGrouping'
import { groupTasksIntoStudyBlocks } from './studyBlockGrouping'
import styles from './TodaySection.module.css'

export default function TodaySection({
  section,
  planId,
  plan,
  todayKey,
  topicsById,
  sourceTitle,
  isMutating,
  lockContext,
  onStart,
  onComplete,
  onPartial,
  onRecordTime,
  onRecordQuestions,
  onSkip,
  onStudyPomodoro,
}) {
  const progress = calculateSectionProgress(section.tasks)

  const entries = useMemo(
    () => groupTasksIntoStudyBlocks(section.tasks, topicsById),
    [section.tasks, topicsById]
  )

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{section.label}</h3>
        <span className={styles.sectionProgress}>
          {progress.completed}/{progress.total}
        </span>
      </div>
      <div className={styles.taskList}>
        {entries.map(entry =>
          entry.type === 'study_block' ? (
            <StudyBlock
              key={`block-${entry.studyBlockId}`}
              block={entry}
              planId={planId}
              plan={plan}
              todayKey={todayKey}
              topicsById={topicsById}
              sourceTitle={sourceTitle}
              isMutating={isMutating}
              lockContext={lockContext}
              onStart={onStart}
              onComplete={onComplete}
              onPartial={onPartial}
              onRecordTime={onRecordTime}
              onRecordQuestions={onRecordQuestions}
              onSkip={onSkip}
              onStudyPomodoro={onStudyPomodoro}
            />
          ) : entry.task.taskType === 'flashcard_review' ? (
            <FlashcardReviewTask
              key={entry.task.id}
              task={entry.task}
              planTopicId={entry.task.planTopicId}
              topicsById={topicsById}
            />
          ) : (
            <TaskCard
              key={entry.task.id}
              task={entry.task}
              planId={planId}
              plan={plan}
              todayKey={todayKey}
              topicsById={topicsById}
              sourceTitle={sourceTitle}
              isMutating={isMutating}
              lockContext={lockContext}
              onStart={onStart}
              onComplete={onComplete}
              onPartial={onPartial}
              onRecordTime={onRecordTime}
              onRecordQuestions={onRecordQuestions}
              onSkip={onSkip}
              onStudyPomodoro={onStudyPomodoro}
              canStudy={entry.task.status === 'pending' || entry.task.status === 'in_progress'}
            />
          )
        )}
      </div>
    </div>
  )
}
