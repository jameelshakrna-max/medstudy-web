import TaskCard from './TaskCard'
import { calculateSectionProgress } from './todayGrouping'
import styles from './TodaySection.module.css'

export default function TodaySection({
  section,
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
  const progress = calculateSectionProgress(section.tasks)

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{section.label}</h3>
        <span className={styles.sectionProgress}>
          {progress.completed}/{progress.total}
        </span>
      </div>
      <div className={styles.taskList}>
        {section.tasks.map(task => (
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
            canStudy={task.status === 'pending' || task.status === 'in_progress'}
          />
        ))}
      </div>
    </div>
  )
}
