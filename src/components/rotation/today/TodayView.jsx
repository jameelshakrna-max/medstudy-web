import { useMemo } from 'react'
import { getTodayKey } from './todayUtils'
import { groupTasksBySection, calculateDayProgress } from './todayGrouping'
import { getTaskDisplayModel } from './taskDisplayModel'
import TodaySection from './TodaySection'
import ProgressBar from '../../ui/ProgressBar/ProgressBar'
import styles from './TodayView.module.css'

export default function TodayView({ planId, tasks, plan }) {
  const todayKey = useMemo(() => getTodayKey(new Date()), [])

  const displayTasks = useMemo(
    () => tasks.map(t => getTaskDisplayModel(t, todayKey)),
    [tasks, todayKey]
  )

  const sections = useMemo(
    () => groupTasksBySection(displayTasks, todayKey),
    [displayTasks, todayKey]
  )

  const dayProgress = useMemo(
    () => calculateDayProgress(displayTasks, todayKey),
    [displayTasks, todayKey]
  )

  if (displayTasks.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>Nothing due today</div>
        <div className={styles.emptyDesc}>
          All caught up! Check the Schedule tab for upcoming tasks.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.progressHeader}>
        <div className={styles.progressStats}>
          <span className={styles.statPrimary}>
            {dayProgress.completedTasks}/{dayProgress.totalTasks} tasks
          </span>
          <span className={styles.statSecondary}>
            {formatMinutes(dayProgress.completedMinutes)} of {formatMinutes(dayProgress.totalMinutes)}
          </span>
        </div>
        <ProgressBar
          value={dayProgress.weightedProgress}
          label={`${Math.round(dayProgress.weightedProgress * 100)}%`}
          size="default"
        />
      </div>

      {sections.length > 0 ? (
        sections.map(section => (
          <TodaySection
            key={section.key}
            section={section}
            planId={planId}
            plan={plan}
            todayKey={todayKey}
          />
        ))
      ) : (
        <div className={styles.allDone}>
          <div className={styles.allDoneTitle}>All done for today!</div>
          <div className={styles.allDoneDesc}>
            Every task is complete. Great work!
          </div>
        </div>
      )}
    </div>
  )
}

function formatMinutes(mins) {
  if (!mins || mins <= 0) return '0m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
