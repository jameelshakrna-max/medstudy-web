import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { apiGet } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { getRotationById } from '../../data/studySources/rotationRegistry'
import { CalendarRange, Clock, BookOpen, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import styles from './RotationSummary.module.css'

const STATUS_ORDER = { active: 0, draft: 1, paused: 2 }

const STATUS_CONFIG = {
  active: { badge: 'Active', sub: 'Active Rotation' },
  draft: { badge: 'Draft', sub: 'Rotation Plan Ready' },
  paused: { badge: 'Paused', sub: 'Paused Rotation' },
}

export function selectRotationSummaryPlan(plans) {
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

function formatDateRange(start, end) {
  if (!start || !end) return ''
  const fmt = { month: 'short', day: 'numeric' }
  return `${new Date(start + 'T00:00:00').toLocaleDateString('en-US', fmt)} → ${new Date(end + 'T00:00:00').toLocaleDateString('en-US', fmt)}`
}

function formatDaysLeft(end) {
  if (!end) return ''
  const endDate = new Date(end + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((endDate - today) / 86400000))
}

export default function RotationSummary() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: plans, isLoading } = useQuery({
    queryKey: queryKeys.rotations.plans(),
    queryFn: () => apiGet('/rotation-planner/plans'),
    enabled: !!user,
  })

  const plan = selectRotationSummaryPlan(plans)

  if (isLoading) return <div className={styles.loading}>Loading...</div>

  if (!plan) {
    return (
      <div className={styles.empty}>
        <CalendarRange size={32} strokeWidth={1.5} />
        <p>No rotation plan yet</p>
        <button className={styles.linkBtn} onClick={() => navigate('/rotations')}>
          Create one <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  const config = STATUS_CONFIG[plan.status]
  const rotation = getRotationById(plan.rotationId)
  const rotationLabel = rotation?.displayLabel || plan.rotationId
  const daysLeft = formatDaysLeft(plan.endDate)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <CalendarRange size={18} />
          <span>{plan.displayName || plan.sourceTitle || 'Rotation Plan'}</span>
        </div>
        <span className={styles.badge}>{config.badge}</span>
      </div>

      <p className={styles.subtitle}>{config.sub}</p>

      <div className={styles.stats}>
        {daysLeft > 0 && (
          <div className={styles.stat}>
            <Clock size={14} />
            <span>{daysLeft} days left</span>
          </div>
        )}
        <div className={styles.stat}>
          <BookOpen size={14} />
          <span>{plan.topicCount > 0 ? `${plan.topicCount} topics` : rotationLabel}</span>
        </div>
      </div>

      <div className={styles.dates}>{formatDateRange(plan.startDate, plan.endDate)}</div>

      <button className={styles.viewBtn} onClick={() => navigate(`/rotations?plan=${plan.id}`)}>
        View Full Planner <ChevronRight size={14} />
      </button>
    </div>
  )
}
