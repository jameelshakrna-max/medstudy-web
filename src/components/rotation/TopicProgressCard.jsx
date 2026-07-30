import styles from './TopicProgressCard.module.css'

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', colorClass: styles.statusNotStarted },
  in_progress: { label: 'In Progress', colorClass: styles.statusInProgress },
  completed: { label: 'Completed', colorClass: styles.statusCompleted },
}

function getConfidenceColor(confidence) {
  if (confidence >= 80) return 'var(--emerald)'
  if (confidence >= 50) return 'var(--amber)'
  return 'var(--red)'
}

export default function TopicProgressCard({ topic, progress, sourceTopic }) {
  const studyStatus = progress?.study_status || 'not_started'
  const uworldStatus = progress?.uworld_status || 'not_started'
  const uworldDone = progress?.uworld_done || 0
  const uworldTotal = progress?.uworld_total || 0
  const confidence = progress?.confidence || 0
  const notes = progress?.notes || ''
  const estimatedMinutes = topic?.estimated_minutes || sourceTopic?.active_minutes || 0

  const statusConfig = STATUS_CONFIG[studyStatus] || STATUS_CONFIG.not_started
  const uworldConfig = STATUS_CONFIG[uworldStatus] || STATUS_CONFIG.not_started

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.topicName}>{topic?.topic_name || progress?.topic_name || 'Topic'}</h3>
        <span className={`${styles.statusBadge} ${statusConfig.colorClass}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Study status */}
      <div className={styles.row}>
        <span className={styles.rowLabel}>Study</span>
        <span className={`${styles.statusBadge} ${statusConfig.colorClass}`} style={{ fontSize: '10px' }}>
          {statusConfig.label}
        </span>
      </div>

      {/* UWorld */}
      <div className={styles.row}>
        <span className={styles.rowLabel}>UWorld</span>
        <div className={styles.uworldInfo}>
          <span className={`${styles.statusBadge} ${uworldConfig.colorClass}`} style={{ fontSize: '10px' }}>
            {uworldConfig.label}
          </span>
          {uworldTotal > 0 && (
            <span className={styles.qCount}>
              {uworldDone}/{uworldTotal}
            </span>
          )}
        </div>
      </div>

      {/* Confidence */}
      <div className={styles.row}>
        <span className={styles.rowLabel}>Confidence</span>
        <div className={styles.confidenceWrap}>
          <div className={styles.confidenceBar}>
            <div
              className={styles.confidenceFill}
              style={{
                width: `${confidence}%`,
                background: getConfidenceColor(confidence),
              }}
            />
          </div>
          <span className={styles.confidenceText}>{confidence}%</span>
        </div>
      </div>

      {/* Estimated time */}
      {estimatedMinutes > 0 && (
        <div className={styles.row}>
          <span className={styles.rowLabel}>Est. Time</span>
          <span className={styles.estimateText}>{estimatedMinutes} min</span>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className={styles.notes}>
          {notes}
        </div>
      )}
    </div>
  )
}
