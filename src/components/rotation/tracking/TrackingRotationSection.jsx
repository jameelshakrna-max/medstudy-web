import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../context/AuthContext'
import { apiGet, queryFn } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { Link, useSearchParams } from 'react-router-dom'
import LoadingScreen from '../../LoadingScreen'
import { CalendarRange, Clock, BookOpen, ArrowUpRight } from 'lucide-react'
import { getBrowserTimezone, resolvePlannerTimezone } from '../today/todayUtils'
import { TASK_TYPE_LABELS } from '../today/taskActionRules'
import { buildAnkiOpenUrl } from '../../../services/rotationPlannerPlans/deckDueCounts'
import styles from './TrackingRotationSection.module.css'

const WINDOW_DAYS = 14

const PLAN_STATUS_LABELS = {
  active: 'Active',
  draft: 'Draft',
  paused: 'Paused',
  completed: 'Completed',
}

const STATUS_LABELS = {
  excluded: 'Excluded',
  completed: 'Completed',
  partial: 'Partial',
  in_progress: 'In progress',
  overdue: 'Overdue',
  due_today: 'Due today',
  locked: 'Locked',
  ready: 'Ready',
  planned: 'Planned',
}

const SWITCHER_ORDER = { active: 0, draft: 1, paused: 2, completed: 3 }

export function sortPlansForSwitcher(plans) {
  return (Array.isArray(plans) ? plans : []).slice().sort((a, b) => {
    const orderDiff = (SWITCHER_ORDER[a.status] ?? 99) - (SWITCHER_ORDER[b.status] ?? 99)
    if (orderDiff !== 0) return orderDiff
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    if (aTime !== bTime) return bTime - aTime
    return String(a.id).localeCompare(String(b.id))
  })
}

function humanLabelFromGroupKey(groupKey) {
  if (!groupKey) return 'Upcoming block'
  return String(groupKey)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

function formatDate(dateKey) {
  if (!dateKey) return ''
  const d = new Date(dateKey + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function lockedPrereqCopy(item) {
  const titles = (item.missingLearningPrerequisites || []).map(p => p?.title).filter(Boolean)
  if (titles.length === 0) return 'Locked'
  if (titles.length === 1) return `Locked — complete ${titles[0]}`
  return `Locked — complete ${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}

function StatusBadge({ status, plan }) {
  const label = plan ? PLAN_STATUS_LABELS[status] || status : STATUS_LABELS[status] || status
  const color = plan ? `plan${status[0].toUpperCase()}${status.slice(1)}` : status
  return <span className={`${styles.statusBadge} ${styles[color] || ''}`}>{label}</span>
}

function ScheduleRow({ item }) {
  const groupTitle = item.groupTitle || humanLabelFromGroupKey(item.groupKey)
  const typeLabel = TASK_TYPE_LABELS[item.taskType] || item.taskType
  const done = item.completedQuestions ?? 0
  const target = item.targetQuestions ?? 0
  const remaining = item.remainingQuestions ?? 0

  return (
    <li className={styles.scheduleRow}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{groupTitle}</span>
        <span className={styles.rowType}>{typeLabel}</span>
        <StatusBadge status={item.status} />
      </div>
      <div className={styles.rowMeta}>
        <span className={styles.rowCounts}>{`${done} / ${target} done`}</span>
        <span className={styles.rowRemaining}>{`${remaining} remaining`}</span>
      </div>
      {item.status === 'locked' && (
        <p className={styles.lockedCopy}>{lockedPrereqCopy(item)}</p>
      )}
      {item.isPlanned && (
        <p className={styles.helper}>{`Planned for ${formatDate(item.plannedDate)} — moves if you reschedule`}</p>
      )}
    </li>
  )
}

export default function TrackingRotationSection() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [planId, setPlanId] = useState(searchParams.get('plan') || null)

  const timezone = resolvePlannerTimezone({ browserTimezone: getBrowserTimezone() })

  const queryParams = new URLSearchParams()
  if (planId) queryParams.set('planId', planId)
  queryParams.set('timezone', timezone)
  queryParams.set('windowDays', String(WINDOW_DAYS))

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.rotations.tracking(planId, timezone, WINDOW_DAYS),
    queryFn: () => apiGet(`/rotation-planner/tracking/schedule?${queryParams.toString()}`),
    enabled: !!user,
  })

  const { data: plansData } = useQuery({
    queryKey: queryKeys.rotations.plans(),
    queryFn: queryFn('/rotation-planner/plans'),
    enabled: !!user,
  })

  const isDeletedPlan404 = isError && !!planId && error?.status === 404

  useEffect(() => {
    if (isDeletedPlan404) {
      setPlanId(null)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('plan')
        return next
      })
    }
  }, [isDeletedPlan404, setSearchParams])

  function handleSwitchPlan(e) {
    const value = e.target.value
    setPlanId(value || null)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set('plan', value)
      else next.delete('plan')
      return next
    })
  }

  if (isLoading || isDeletedPlan404) {
    return <LoadingScreen fullPage={false} message="Loading rotation schedule..." />
  }

  if (isError) {
    return (
      <div className={styles.trackingRoot} data-testid="tracking-root">
        <div className={styles.errorState} role="alert">
          <p className={styles.errorTitle}>Couldn&apos;t load your rotation schedule.</p>
          <p className={styles.errorText}>{error?.message || 'Something went wrong. Please try again.'}</p>
          <button type="button" className={styles.retryBtn} onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const plan = data?.plan ?? null
  const nextBlock = data?.nextBlock ?? null
  const schedule = Array.isArray(data?.schedule) ? data.schedule : []
  const incorrectReview = Array.isArray(data?.incorrectReview) ? data.incorrectReview : []
  const linkedDecks = Array.isArray(data?.linkedDecks) ? data.linkedDecks : []
  const sortedPlans = sortPlansForSwitcher(plansData)

  const scheduleByDate = schedule.reduce((acc, item) => {
    const date = item.plannedDate || 'unscheduled'
    if (!acc[date]) acc[date] = []
    acc[date].push(item)
    return acc
  }, {})

  if (!plan) {
    return (
      <div className={styles.trackingRoot} data-testid="tracking-root">
        <div className={styles.empty}>
          <CalendarRange size={32} strokeWidth={1.5} />
          <p>No rotation plan yet</p>
          <Link className={styles.linkBtn} to="/rotations">
            Create one
          </Link>
        </div>
      </div>
    )
  }

  const nextBlockTitle = nextBlock?.groupTitle || humanLabelFromGroupKey(nextBlock?.groupKey)

  return (
    <div className={styles.trackingRoot} data-testid="tracking-root">
      <section className={styles.section} aria-labelledby="current-rotation-title">
        <h2 className={styles.sectionTitle} id="current-rotation-title">Current Rotation</h2>
        <div className={styles.card}>
          <div className={styles.planHeader}>
            <h3 className={styles.planName}>{plan.displayName}</h3>
            <StatusBadge status={plan.status} plan />
          </div>
          {plan.rotationLabel && <p className={styles.rotationLabel}>{plan.rotationLabel}</p>}
          <div className={styles.switcherRow}>
            <label className={styles.fieldLabel} htmlFor="rotation-plan-switcher">Rotation plan</label>
            <select
              id="rotation-plan-switcher"
              className={styles.select}
              aria-label="Rotation plan"
              value={plan.id}
              onChange={handleSwitchPlan}
            >
              {sortedPlans.map(p => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
          </div>
          <Link className={styles.link} to={`/rotations?plan=${plan.id}`}>
            Open in planner <ArrowUpRight size={14} />
          </Link>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="next-block-title">
        <h2 className={styles.sectionTitle} id="next-block-title">Next UWorld Block</h2>
        {nextBlock ? (
          <div className={styles.card}>
            <p className={styles.blockTitle}>
              {nextBlockTitle} — {nextBlock.targetQuestions ?? 0}-question UWorld review block
            </p>
            {nextBlock.plannedDate && (
              <p className={styles.blockDate}>
                <Clock size={14} />
                Planned {formatDate(nextBlock.plannedDate)}
              </p>
            )}
            {nextBlock.status === 'locked' ? (
              <p className={styles.lockedCopy}>{lockedPrereqCopy(nextBlock)}</p>
            ) : (
              <StatusBadge status={nextBlock.status} />
            )}
          </div>
        ) : (
          <div className={styles.emptyInline}>No upcoming block</div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="schedule-title">
        <h2 className={styles.sectionTitle} id="schedule-title">Upcoming UWorld Schedule</h2>
        {schedule.length === 0 ? (
          <div className={styles.emptyInline}>No scheduled blocks</div>
        ) : (
          <div className={styles.scheduleList} data-testid="schedule-list">
            {Object.entries(scheduleByDate).map(([date, items]) => (
              <div className={styles.dayGroup} key={date}>
                <h3 className={styles.dateHeading}>{date === 'unscheduled' ? 'Unscheduled' : formatDate(date)}</h3>
                <ul className={styles.rows}>
                  {items.map(item => <ScheduleRow key={item.taskId} item={item} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${styles.section} ${styles.incorrectSection}`} aria-labelledby="incorrect-title">
        <h2 className={styles.sectionTitle} id="incorrect-title">Incorrect Review</h2>
        {incorrectReview.length === 0 ? (
          <div className={styles.emptyInline}>No incorrect questions to review</div>
        ) : (
          <ul className={styles.incorrectList} data-testid="incorrect-list">
            {incorrectReview.map(item => (
              <ScheduleRow key={item.taskId} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="decks-title">
        <h2 className={styles.sectionTitle} id="decks-title">Connected Anki Decks</h2>
        {linkedDecks.length === 0 ? (
          <div className={styles.emptyInline}>No linked decks</div>
        ) : (
          <ul className={styles.deckList}>
            {linkedDecks.map(deck => (
              <li className={styles.deckRow} key={deck.deckName}>
                <span className={styles.deckName}>{deck.deckName}</span>
                {deck.isPrimary && <span className={styles.primaryBadge}>Primary</span>}
                <span className={styles.deckCounts}>{deck.cardCount ?? 0} cards · {deck.dueCount ?? 0} due</span>
                <Link className={styles.link} to={buildAnkiOpenUrl(deck.deckName)}>
                  <BookOpen size={14} />
                  Open Deck
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
