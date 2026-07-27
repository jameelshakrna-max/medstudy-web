import { useMemo } from 'react'
import { getTodayKey, getBrowserTimezone, resolvePlannerTimezone } from './todayUtils'
import { groupTasksBySection, calculateDayProgress, classifyTodayState, getTodayRelevantTasks, claimActiveBlockSiblings } from './todayGrouping'
import { getTaskDisplayModel } from './taskDisplayModel'
import TodaySection from './TodaySection'
import ProgressBar from '../../ui/ProgressBar/ProgressBar'
import { Banner, BannerAction } from '../../ui/Banner/Banner'
import styles from './TodayView.module.css'

export default function TodayView({
  planId,
  tasks,
  topics,
  topicsById,
  plan,
  sourceTitle,
  isMutating,
  isOrphaned,
  hasUnsyncedData,
  discardOrphanedPlannerContext,
  onStart,
  onComplete,
  onPartial,
  onRecordTime,
  onRecordQuestions,
  onSkip,
  onStudyPomodoro,
}) {
  const todayKey = useMemo(() => {
    const tz = resolvePlannerTimezone({ browserTimezone: getBrowserTimezone() })
    return getTodayKey(new Date(), tz)
  }, [])

  const displayTasks = useMemo(
    () => tasks.map(t => getTaskDisplayModel(t, todayKey, topicsById.get(t.planTopicId) || null)),
    [tasks, todayKey, topicsById]
  )

  const sections = useMemo(
    () => claimActiveBlockSiblings(groupTasksBySection(displayTasks, todayKey)),
    [displayTasks, todayKey]
  )

  const todayState = useMemo(
    () => classifyTodayState({ todayKey, plan, displayTasks, sections }),
    [todayKey, plan, displayTasks, sections]
  )

  const todayRelevantTasks = useMemo(
    () => todayState.state === 'HAS_WORK' ? todayState.todayRelevantTasks : getTodayRelevantTasks(displayTasks, todayKey),
    [todayState, displayTasks, todayKey]
  )

  const dayProgress = useMemo(
    () => calculateDayProgress(displayTasks, todayKey, (t) => todayRelevantTasks.includes(t)),
    [displayTasks, todayKey, todayRelevantTasks]
  )

  if (todayState.state === 'PRE_START') {
    const startDate = todayState.startDate
    const dateDisplay = startDate ? formatDateShort(startDate) : 'soon'
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>Your rotation starts {dateDisplay}</div>
        <div className={styles.emptyDesc}>
          {tasks.length > 0 && `${tasks.length} upcoming task${tasks.length === 1 ? '' : 's'}`}
        </div>
      </div>
    )
  }

  if (todayState.state === 'ALL_DONE') {
    return (
      <div className={styles.container}>
        <div className={styles.progressHeader}>
          <div className={styles.heading}>Today's progress</div>
          <div className={styles.progressStats}>
            <span className={styles.statPrimary}>
              {dayProgress.completedTasks} of {dayProgress.totalTasks} task{dayProgress.totalTasks === 1 ? '' : 's'} completed
            </span>
            <span className={styles.statSecondary}>
              {formatMinutes(dayProgress.completedMinutes)} / {formatMinutes(dayProgress.totalMinutes)}
            </span>
          </div>
          <div className={styles.progressRow}>
            <ProgressBar
              value={dayProgress.weightedProgress}
              label={`${Math.round(dayProgress.weightedProgress * 100)}%`}
              size="default"
            />
          </div>
        </div>
        <div className={styles.allDone}>
          <div className={styles.allDoneTitle}>All done for today!</div>
          <div className={styles.allDoneDesc}>
            Every task is complete. Great work!
          </div>
        </div>
      </div>
    )
  }

  if (todayState.state === 'EMPTY_TODAY') {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>Nothing scheduled for today</div>
        <div className={styles.emptyDesc}>
          Check the Schedule tab for upcoming tasks.
        </div>
      </div>
    )
  }

  const remainingMinutes = dayProgress.totalMinutes - dayProgress.completedMinutes

  return (
    <div className={styles.container}>
      {isOrphaned && (
        <Banner variant="warning" className={styles.orphanBanner}>
          This planner task no longer exists after recalculation.
          {hasUnsyncedData
            ? ' Your unsynced focus time has been preserved.'
            : null}
          {hasUnsyncedData ? (
            <BannerAction onClick={() => discardOrphanedPlannerContext()}>
              Discard unsynced time
            </BannerAction>
          ) : null}
        </Banner>
      )}

      <div className={styles.progressHeader}>
        <div className={styles.heading}>Today's progress</div>
        <div className={styles.progressStats}>
          <span className={styles.statPrimary}>
            {dayProgress.completedTasks} of {dayProgress.totalTasks} task{dayProgress.totalTasks === 1 ? '' : 's'} completed
          </span>
          <span className={styles.statSecondary}>
            {formatMinutes(dayProgress.completedMinutes)} / {formatMinutes(dayProgress.totalMinutes)}
          </span>
        </div>
        <div className={styles.progressRow}>
          <ProgressBar
            value={dayProgress.weightedProgress}
            label={`${Math.round(dayProgress.weightedProgress * 100)}%`}
            size="default"
          />
        </div>
        {remainingMinutes > 0 && (
          <div className={styles.remaining}>{remainingMinutes} min remaining</div>
        )}
      </div>

      {sections.map(section => (
        <TodaySection
          key={section.key}
          section={section}
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

function formatDateShort(dateKey) {
  const [year, month, day] = dateKey.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthName = months[parseInt(month, 10) - 1]
  return `on ${monthName} ${parseInt(day, 10)}`
}
