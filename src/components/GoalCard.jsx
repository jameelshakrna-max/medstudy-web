import { Target, TrendingUp, Clock, Flame, BookOpen, CaseSensitive, Trash2, Pencil, Check } from 'lucide-react'
import { getGoalTypeLabel } from '../services/goalProgress'
import styles from './GoalCard.module.css'

const TYPE_ICONS = {
  questions: BookOpen,
  blocks: BookOpen,
  topics: TrendingUp,
  cases: CaseSensitive,
  hours: Clock,
  streak: Flame,
  subject_avg: Target,
  performance: Target,
}

function formatDate(date) {
  if (!date) return null
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function GoalCard({ goal, onEdit, onDelete, compact }) {
  const Icon = TYPE_ICONS[goal.goal_type] || Target
  const isCompleted = goal.status === 'completed'
  const isExpired = goal.status === 'expired'
  const isPastDeadline = goal.deadline && new Date(goal.deadline) < new Date()

  const barPct = Math.min(100, goal.pct || 0)

  const displayCurrent = goal.goal_type === 'hours'
    ? Math.round(goal.current * 10) / 10
    : Math.round(goal.current)

  const displayTarget = goal.goal_type === 'hours'
    ? Math.round(goal.target_value * 10) / 10
    : Math.round(goal.target_value)

  const unit = goal.goal_type === 'hours' ? ' hrs'
    : goal.goal_type === 'performance' || goal.goal_type === 'subject_avg' ? '%'
    : ''

  if (compact) {
    return (
      <div className={styles.compactCard}>
        <div className={`${styles.compactIcon} ${isCompleted ? styles.compactIconDone : styles.compactIconActive}`}>
          {isCompleted ? <Check size={14} color="#0B1120" /> : <Icon size={14} color="#0B1120" />}
        </div>
        <div className={styles.compactBody}>
          <div className={styles.compactTitle}>{goal.title}</div>
          <div className={styles.compactTrack}>
            <div className={styles.compactFill} style={{ width: `${barPct}%`, background: isCompleted ? 'var(--emerald)' : 'var(--blue)' }} />
          </div>
          <div className={styles.compactSub}>{displayCurrent}{unit} / {displayTarget}{unit} · {barPct}%</div>
        </div>
        <div className={styles.compactPct}>{isCompleted ? 'Done' : `${barPct}%`}</div>
      </div>
    )
  }

  const cardClass = `${styles.card} ${isCompleted ? styles.cardCompleted : isExpired ? styles.cardExpired : styles.cardActive}`

  return (
    <div className={cardClass}>
      <div className={styles.accentBar} style={{
        background: isCompleted ? 'var(--emerald)' : isExpired ? 'var(--red)' : 'var(--blue)',
      }} />

      <div className={styles.topRow}>
        <div className={styles.leftCol}>
          <div className={`${styles.iconBox} ${isCompleted ? styles.iconBoxCompleted : styles.iconBoxActive}`}>
            {isCompleted ? <Check size={16} color="#0B1120" /> : <Icon size={16} color="#0B1120" />}
          </div>
          <div>
            <div className={styles.title}>{goal.title}</div>
            <div className={styles.typeLabel}>
              {getGoalTypeLabel(goal.goal_type)}{goal.subject_id ? ` · ${goal.subject_id}` : ''}{goal.module ? ` · ${goal.module}` : ''}
            </div>
          </div>
        </div>
        <div className={styles.actionRow}>
          {isCompleted && <span className={styles.badgeCompleted}>Completed</span>}
          {isExpired && <span className={styles.badgeExpired}>Expired</span>}
          <button onClick={onEdit} className={styles.iconBtn}><Pencil size={14} /></button>
          <button onClick={onDelete} className={styles.iconBtn}><Trash2 size={14} /></button>
        </div>
      </div>

      <div className={styles.progTrack}>
        <div className={styles.progFill} style={{
          width: `${barPct}%`,
          background: `linear-gradient(90deg, ${isCompleted ? 'var(--emerald)' : isExpired ? 'var(--red)' : 'var(--blue)'}, ${isCompleted ? 'var(--emerald)' : isExpired ? 'var(--red)' : 'var(--blue)'}dd)`,
        }} />
      </div>

      <div className={styles.statsRow}>
        <div className={styles.currentText}>
          <span className={styles.currentNum}>{displayCurrent}</span>{unit}
          {' / '}
          <span className={styles.targetNum}>{displayTarget}</span>{unit}
        </div>
        <div className={styles.pctDisplay} style={{ color: isCompleted ? 'var(--emerald)' : isExpired ? 'var(--red)' : 'var(--blue)' }}>
          {barPct}%
        </div>
      </div>

      <div className={styles.metaRow}>
        {goal.nextMilestone && !isCompleted && (
          <span>Next milestone: <span className={styles.metaLabel}>{goal.nextMilestone}{unit}</span></span>
        )}
        {goal.estimatedDate && !isCompleted && (
          <span>Est. completion: <span className={styles.metaLabel}>{formatDate(goal.estimatedDate)}</span></span>
        )}
        {goal.daysRemaining !== null && !isCompleted && !isPastDeadline && goal.pct < 100 && (
          <span>
            <span className={goal.daysRemaining <= 7 ? styles.metaUrgent : styles.metaLabel}>
              {goal.daysRemaining}d
            </span> remaining
          </span>
        )}
        {goal.daysRemaining !== null && isPastDeadline && goal.pct < 100 && (
          <span className={styles.metaOverdue}>Overdue</span>
        )}
        {goal.deadline && (
          <span>
            Deadline: <span className={isPastDeadline && goal.pct < 100 ? styles.metaDeadlineOverdue : styles.metaDeadline}>
              {formatDate(goal.deadline)}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
