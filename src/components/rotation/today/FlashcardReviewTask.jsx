import { GraduationCap, ExternalLink } from 'lucide-react'
import styles from './FlashcardReviewTask.module.css'

function buildAnkiUrl(deckNames) {
  if (!deckNames || deckNames.length === 0) return '/anki'
  const unique = [...new Set(deckNames)]
  if (unique.length > 5) return '/anki'
  const params = new URLSearchParams()
  for (const name of unique) {
    params.append('deck', name)
  }
  return `/anki?${params.toString()}`
}

export { buildAnkiUrl }

export default function FlashcardReviewTask({ task, planTopicId, topicsById }) {
  const topic = planTopicId ? topicsById?.get(planTopicId) : null
  const topicName = topic?.topicTitle || (planTopicId ? 'General Reviews' : 'General Reviews')
  const deckNames = task.deckNames || []
  const dueCardCount = task.dueCardCount || 0
  const scheduledMinutes = task.scheduledMinutes || 0
  const unmetReviewMinutes = task.unmetReviewMinutes || 0

  const isGeneralReview = !planTopicId || !topic
  const isTopicReview = !isGeneralReview

  const ankiUrl = isGeneralReview
    ? '/anki'
    : buildAnkiUrl(deckNames)

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.typeInfo}>
          <GraduationCap size={14} className={styles.typeIcon} />
          <span className={styles.typeLabel}>Flashcard Review</span>
        </div>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.titleRow}>
          <span className={styles.topicTitle}>{topicName}</span>
        </div>
        <div className={styles.statsRow}>
          {dueCardCount > 0 && (
            <span className={styles.stat}>
              {dueCardCount} card{dueCardCount !== 1 ? 's' : ''} due
            </span>
          )}
          <span className={styles.stat}>{scheduledMinutes} min scheduled</span>
          {unmetReviewMinutes > 0 && (
            <span className={`${styles.stat} ${styles.unmet}`}>
              {unmetReviewMinutes} min over capacity
            </span>
          )}
        </div>
        {deckNames.length > 0 && (
          <div className={styles.deckRow}>
            {[...new Set(deckNames)].map(name => (
              <span key={name} className={styles.deckBadge}>{name}</span>
            ))}
          </div>
        )}
      </div>
      <div className={styles.cardActions}>
        <a
          href={ankiUrl}
          className={styles.openBtn}
          onClick={e => {
            const href = ankiUrl.startsWith('/') ? window.location.origin + ankiUrl : ankiUrl
          }}
        >
          Open Flashcards <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}
