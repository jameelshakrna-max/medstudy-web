import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { apiGet } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { getRotationById } from '../../data/studySources/rotationRegistry'
import useRotationPlanDetail from '../rotation/today/useRotationPlanDetail'
import { getTodayKey, resolvePlannerTimezone, getBrowserTimezone } from '../rotation/today/todayUtils'
import {
  calculateOverallTopicProgress,
  calculateLearningProgress,
  calculateUworldProgress,
} from '../rotation/progressAnalytics'
import ProgressBar from '../ui/ProgressBar/ProgressBar'
import { selectNextTask, describeTaskPrerequisite } from './nextTask'
import styles from './ActiveRotationSection.module.css'

const STATUS_CONFIG = {
  active: { heading: 'Active Rotation', sub: 'Auto-managed by Rotation Planner' },
  draft: { heading: 'Rotation Plan Ready', sub: 'Activate this plan to begin tracking your schedule.' },
  paused: { heading: 'Paused Rotation', sub: 'Resume this plan to continue your schedule.' },
}

const STATUS_ORDER = { active: 0, draft: 1, paused: 2 }

const STATUS_LABEL = { active: 'Active', draft: 'Draft', paused: 'Paused' }

const TASK_TYPE_LABELS = {
  learning: task => `Learning — ${task.estimatedMinutes} min`,
  uworld_questions: () => 'UWorld questions',
  incorrect_review: () => 'Incorrect review',
  flashcard_review: () => 'Flashcard review',
  consolidation: () => 'Consolidation',
  mixed_review: () => 'Mixed review',
}

export function selectCurrentPlan(plans) {
  const eligible = (Array.isArray(plans) ? plans : []).filter(
    plan => plan && STATUS_ORDER[plan.status] !== undefined
  )
  if (eligible.length === 0) return null

  return eligible
    .slice()
    .sort((a, b) => {
      const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (orderDiff !== 0) return orderDiff
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      if (aTime !== bTime) return bTime - aTime
      return String(a.id).localeCompare(String(b.id))
    })[0]
}

function formatShortDate(dateKey) {
  if (!dateKey) return null
  return new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function ActiveRotationSection() {
  const { user } = useAuth()
  const titleId = useId()

  const plansQuery = useQuery({
    queryKey: queryKeys.rotations.plans(),
    enabled: !!user,
    queryFn: () => apiGet('/rotation-planner/plans'),
  })

  const currentPlan = selectCurrentPlan(plansQuery.data)

  const detailQuery = useRotationPlanDetail(currentPlan?.id)

  const timezone = resolvePlannerTimezone({ browserTimezone: getBrowserTimezone() })
  const todayKey = getTodayKey(new Date(), timezone)

  if (plansQuery.isPending) {
    return (
      <section className={styles.skeleton} aria-busy="true" aria-label="Active rotation loading">
        <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} aria-hidden="true" />
        <div className={`${styles.skeletonLine} ${styles.skeletonSub}`} aria-hidden="true" />
        <div className={styles.card}>
          <div className={styles.skeletonLine} aria-hidden="true" />
          <div className={styles.skeletonLine} aria-hidden="true" />
          <div className={styles.skeletonLine} aria-hidden="true" />
        </div>
      </section>
    )
  }

  if (plansQuery.isError) {
    return (
      <section className={styles.error}>
        <h2 className={styles.errorHeading}>Rotation Planner</h2>
        <p className={styles.errorText}>Couldn&apos;t load your rotation plans.</p>
        <button type="button" className={styles.retryBtn} onClick={() => plansQuery.refetch()}>
          Retry
        </button>
      </section>
    )
  }

  if (!currentPlan) return null

  const config = STATUS_CONFIG[currentPlan.status]
  const rotation = getRotationById(currentPlan.rotationId)
  const rotationLabel = rotation?.displayLabel || currentPlan.rotationId
  const planTitle = currentPlan.displayName || currentPlan.sourceTitle || rotation?.displayLabel || 'Rotation Plan'
  const startShort = formatShortDate(currentPlan.startDate)
  const endShort = formatShortDate(currentPlan.endDate)
  const dateRange = startShort && endShort ? `${startShort} – ${endShort}` : null

  const detail = detailQuery.data

  let metrics
  let nextTaskLine = null

  if (detailQuery.isPending) {
    metrics = <p className={styles.metricsText}>Loading plan details…</p>
  } else if (detailQuery.isError) {
    metrics = (
      <div className={styles.detailError}>
        <p className={styles.metricsText}>Couldn&apos;t load plan details.</p>
        <button type="button" className={styles.retryBtn} onClick={() => detailQuery.refetch()}>
          Retry
        </button>
      </div>
    )
  } else if (!detail?.plan) {
    metrics = <p className={styles.metricsText}>Plan details unavailable</p>
  } else {
    const topics = detail.topics || []
    const tasks = detail.tasks || []

    const overall = calculateOverallTopicProgress(topics)
    const learning = calculateLearningProgress(topics, tasks)
    const uworld = calculateUworldProgress(topics)
    const flashcardTasks = tasks.filter(task => task.taskType === 'flashcard_review')

    const rows = []
    if (overall.total > 0) {
      rows.push(
        <ProgressBar
          key="overall"
          value={overall.percent / 100}
          label={`Overall · ${overall.completed}/${overall.total} topics`}
        />
      )
    }
    if (learning.total > 0) {
      rows.push(
        <ProgressBar
          key="learning"
          value={learning.percent / 100}
          label={`Learning · ${Math.round(learning.completed)}/${Math.round(learning.total)} min`}
        />
      )
    }
    if (uworld.total > 0) {
      rows.push(
        <ProgressBar
          key="uworld"
          value={uworld.percent / 100}
          label={`UWorld · ${uworld.completed}/${uworld.total} questions`}
        />
      )
    }
    const flashcardDueCounts = flashcardTasks
      .map(task => task.dueCardCount ?? task.metadataJson?.dueCardCount)
      .filter(count => typeof count === 'number' && Number.isFinite(count))
    if (flashcardDueCounts.length > 0) {
      const due = flashcardDueCounts.reduce((sum, count) => sum + count, 0)
      rows.push(
        <p key="flashcards" className={styles.metricsText}>
          {due > 0 ? `Flashcards · ${due} due` : 'Flashcards · No cards due'}
        </p>
      )
    }

    metrics = rows.length > 0 ? <div className={styles.metrics}>{rows}</div> : null

    const nextTask = selectNextTask(tasks, todayKey)
    if (nextTask) {
      const label = TASK_TYPE_LABELS[nextTask.taskType]
        ? TASK_TYPE_LABELS[nextTask.taskType](nextTask)
        : nextTask.taskType
      const prereq = describeTaskPrerequisite(nextTask, topics)
      nextTaskLine = prereq ? `Next: ${label} — ${prereq}` : `Next: ${label}`
    } else {
      nextTaskLine = 'No upcoming task scheduled.'
    }
  }

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.sectionHeading}>{config.heading}</h2>
      <p className={styles.sectionSub}>{config.sub}</p>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{planTitle}</h3>
        <p className={styles.cardSub}>
          {rotationLabel}
          {dateRange ? ` · ${dateRange}` : ''}
        </p>
        <span className={styles.statusText}>{STATUS_LABEL[currentPlan.status]}</span>
        {metrics}
        {nextTaskLine !== null && <p className={styles.nextTask}>{nextTaskLine}</p>}
        <Link
          to={`/rotations?plan=${currentPlan.id}`}
          className={styles.openLink}
          aria-label={`Open ${planTitle} rotation plan`}
        >
          Open Rotation
        </Link>
      </div>
    </section>
  )
}
