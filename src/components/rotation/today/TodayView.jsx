import { useMemo } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { getBrowserTimezone, resolvePlannerTimezone } from './todayUtils'
import { useTodayKey } from './useTodayKey'
import {
  groupTasksBySection,
  calculateDayProgress,
  classifyTodayState,
  classifyTodayReason,
  getTodayRelevantTasks,
  claimActiveBlockSiblings,
  buildAvailabilityByWeekday,
  getDayAvailabilityEntry,
  findNextFutureTask,
} from './todayGrouping'
import { getTaskDisplayModel } from './taskDisplayModel'
import { getPlanTodayAction, PLAN_TODAY_ACTION_LABELS } from './planTodayAction'
import TodaySection from './TodaySection'
import TodayEmptyReason from './TodayEmptyReason'
import usePlanActivation from './usePlanActivation'
import ProgressBar from '../../ui/ProgressBar/ProgressBar'
import { Banner, BannerAction } from '../../ui/Banner/Banner'
import { ContextualShortcuts } from '../../ui'
import styles from './TodayView.module.css'

export default function TodayView({
  planId,
  tasks,
  topics,
  topicsById,
  plan,
  sourceTitle,
  availability,
  onOpenAvailability,
  isMutating,
  isOrphaned,
  hasUnsyncedData,
  discardOrphanedPlannerContext,
  pausedSession,
  questionGroups = [],
  questionGroupStates = [],
  onStart,
  onComplete,
  onPartial,
  onRecordTime,
  onRecordQuestions,
  onSkip,
  onStudyPomodoro,
}) {
  const todayKey = useTodayKey(
    resolvePlannerTimezone({ browserTimezone: getBrowserTimezone() })
  )

  const activatePlan = usePlanActivation({
    planId,
    revision: plan?.revision,
  })

  const availabilityByWeekday = useMemo(() => {
    const source = availability ?? plan?.settingsJson?.availability
    return buildAvailabilityByWeekday(source)
  }, [availability, plan])

  const groupByKey = useMemo(() => {
    const map = new Map()
    for (const group of questionGroups) {
      if (!group) continue
      if (group.id) map.set(group.id, group)
      const key = group.key ?? group.groupKey
      if (key) map.set(key, group)
    }
    return map
  }, [questionGroups])

  const groupStateByKey = useMemo(() => {
    const map = new Map()
    for (const state of questionGroupStates) {
      const key = state?.groupKey ?? state?.key
      if (state && key) map.set(key, state)
    }
    return map
  }, [questionGroupStates])

  const lockContext = useMemo(() => ({ questionGroupStates: groupStateByKey }), [groupStateByKey])

  const planTodayAction = useMemo(
    () => getPlanTodayAction({ plan, todayKey, tasks, topicsById, lockContext, pausedSession }),
    [plan, todayKey, tasks, topicsById, lockContext, pausedSession]
  )

  const displayTasks = useMemo(
    () => tasks.map(t => {
      const topic = topicsById.get(t.planTopicId) || null
      const group = t.planQuestionGroupId
        ? (groupByKey.get(t.planQuestionGroupId) || (t.groupKey ? groupByKey.get(t.groupKey) : null) || null)
        : null
      return getTaskDisplayModel(t, todayKey, topic, group)
    }),
    [tasks, todayKey, topicsById, groupByKey]
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

  const emptyReason = useMemo(() => {
    if (todayState.state !== 'EMPTY_TODAY') return null
    const tasksToday = displayTasks.filter(t => t.taskDate === todayKey)
    const nextTask = findNextFutureTask(displayTasks, todayKey)
    return classifyTodayReason({
      planStatus: plan?.status,
      todayKey,
      dayAvailability: getDayAvailabilityEntry(todayKey, availabilityByWeekday),
      tasksToday,
      nextTask,
      availabilityByWeekday,
      blockedDates: plan?.settingsJson?.blockedDates || [],
      endDate: plan?.endDate,
      topicsById,
    })
  }, [todayState, displayTasks, todayKey, plan, availabilityByWeekday, topicsById])

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

  if (plan?.status === 'draft') {
    return (
      <TodayEmptyReason
        reason={{ reason: 'DRAFT', title: "This rotation starts today, but it isn't active yet." }}
        isActivating={activatePlan.isPending}
        activationError={activatePlan.error?.message || null}
        onActivate={() => activatePlan.mutate()}
      />
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
      <TodayEmptyReason
        reason={emptyReason}
        isActivating={activatePlan.isPending}
        activationError={activatePlan.error?.message || null}
        onActivate={() => activatePlan.mutate()}
        onOpenAvailability={onOpenAvailability}
      />
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

      {planTodayAction && (
        <ContextualShortcuts
          items={[{
            key: planTodayAction.action,
            icon: planTodayAction.action === 'resume'
              ? <RotateCcw size={16} strokeWidth={2} />
              : <Play size={16} strokeWidth={2} />,
            label: PLAN_TODAY_ACTION_LABELS[planTodayAction.action],
            onClick: () => onStudyPomodoro(planTodayAction.task),
          }]}
        />
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
        {planTodayAction && (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.planActionDesktop}`}
            onClick={() => onStudyPomodoro(planTodayAction.task)}
          >
            {planTodayAction.action === 'resume'
              ? <><RotateCcw size={14} /> {PLAN_TODAY_ACTION_LABELS.resume}</>
              : <><Play size={14} /> {PLAN_TODAY_ACTION_LABELS.start}</>}
          </button>
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
          lockContext={lockContext}
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
