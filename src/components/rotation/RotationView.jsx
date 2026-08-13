import { useMemo } from 'react'
import { TrendingUp, CalendarClock, Clock, Gauge, AlertTriangle } from 'lucide-react'
import { formatMinutes } from './today/taskDisplayModel'
import { getNextActionableBlock } from './today/nextActionableBlock'
import styles from './RotationView.module.css'

const STATUS_META = {
  on_track: { label: 'On Track', className: styles.statusOnTrack },
  at_risk: { label: 'At Risk', className: styles.statusAtRisk },
  impossible: { label: 'Cannot fit', className: styles.statusImpossible },
}

function formatDate(dateKey) {
  if (!dateKey) return null
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function prettifyStatus(status) {
  const meta = STATUS_META[status]
  if (meta) return meta.label
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function RotationView({
  plan,
  forecast,
  forecastLoading,
  forecastError,
  topicsById,
  usesFlashcardCapacity,
  tasks,
  todayKey,
}) {
  const unscheduledTopics = useMemo(() => {
    const ids = Array.isArray(forecast?.unscheduledTopics) ? forecast.unscheduledTopics : []
    return ids
      .map((id) => topicsById.get(String(id)) || topicsById.get(id))
      .filter(Boolean)
  }, [forecast?.unscheduledTopics, topicsById])

  const statusMeta = STATUS_META[forecast?.status]
  const completionDate = formatDate(forecast?.estimatedCompletionDate)

  const nextBlock = useMemo(
    () => getNextActionableBlock({ tasks, todayKey, topicsById }),
    [tasks, todayKey, topicsById]
  )

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Rotation Overview</h2>

      <section className={styles.card} aria-label="Plan forecast">
        {forecastLoading ? (
          <div className={styles.emptyState}>Loading forecast...</div>
        ) : forecastError ? (
          <div className={styles.emptyState}>Forecast unavailable</div>
        ) : forecast ? (
          <>
            <div className={styles.statusRow}>
              <span className={`${styles.statusBadge} ${statusMeta?.className || styles.statusOnTrack}`}>
                {prettifyStatus(forecast.status)}
              </span>
              {completionDate && (
                <span className={styles.completionDate}>
                  <CalendarClock size={14} />
                  Est. completion {completionDate}
                </span>
              )}
            </div>

            {forecast.statusReason && (
              <p className={styles.statusReason}>{forecast.statusReason}</p>
            )}

            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>
                  <Clock size={14} />
                  Remaining
                </span>
                <span className={styles.metricValue}>
                  {formatMinutes(forecast.remainingRequiredMinutes)}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>
                  <Gauge size={14} />
                  Available capacity
                </span>
                <span className={styles.metricValue}>
                  {formatMinutes(forecast.availableMinutes)}
                </span>
              </div>
              {forecast.missingCapacityMinutes > 0 && (
                <div className={`${styles.metric} ${styles.metricWarning}`}>
                  <span className={styles.metricLabel}>
                    <AlertTriangle size={14} />
                    Missing capacity
                  </span>
                  <span className={styles.metricValue}>
                    {formatMinutes(forecast.missingCapacityMinutes)}
                  </span>
                </div>
              )}
              {forecast.requiredExtraMinutesPerDay > 0 && (
                <div className={`${styles.metric} ${styles.metricWarning}`}>
                  <span className={styles.metricLabel}>
                    <TrendingUp size={14} />
                    Extra needed / day
                  </span>
                  <span className={styles.metricValue}>
                    {formatMinutes(forecast.requiredExtraMinutesPerDay)}
                  </span>
                </div>
              )}
            </div>

            {unscheduledTopics.length > 0 && (
              <div className={styles.unscheduled}>
                <span className={styles.unscheduledLabel}>
                  {unscheduledTopics.length} topic{unscheduledTopics.length !== 1 ? 's' : ''} unscheduled
                </span>
                <ul className={styles.unscheduledList}>
                  {unscheduledTopics.map((topic) => (
                    <li key={topic.id || topic.title}>{topic.title}</li>
                  ))}
                </ul>
              </div>
            )}

            {usesFlashcardCapacity && (
              <p className={styles.flashcardNote}>
                Flashcard review capacity is factored into this plan's schedule.
              </p>
            )}
          </>
        ) : (
          <div className={styles.emptyState}>No forecast data available</div>
        )}
      </section>

      <section className={styles.nextBlockCard} aria-label="Next scheduled block">
        <h3 className={styles.nextBlockHeading}>Next scheduled block</h3>
        {nextBlock ? (
          <>
            <div className={styles.nextBlockTitle}>{nextBlock.title}</div>
            <div className={styles.nextBlockMeta}>
              <span>{formatDate(nextBlock.dateKey)}</span>
              {nextBlock.typeLabel && <span>{nextBlock.typeLabel}</span>}
              {nextBlock.estimatedMinutes > 0 && (
                <span>{formatMinutes(nextBlock.estimatedMinutes)}</span>
              )}
              {nextBlock.questionCount != null && (
                <span>{nextBlock.questionCount} questions</span>
              )}
            </div>
          </>
        ) : (
          <div className={styles.nextBlockEmpty}>No upcoming actionable block scheduled.</div>
        )}
      </section>
    </div>
  )
}
