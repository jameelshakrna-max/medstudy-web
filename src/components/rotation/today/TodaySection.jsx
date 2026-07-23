import TaskCard from './TaskCard'
import { calculateSectionProgress } from './todayGrouping'
import styles from './TodaySection.module.css'

export default function TodaySection({ section, planId, plan, todayKey }) {
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
          />
        ))}
      </div>
    </div>
  )
}
