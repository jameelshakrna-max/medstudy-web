import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import styles from './FlashcardForecastRecommendations.module.css'

const EMPTY_FORECAST = {
  safeNewCardsByDate: {},
  projectedReviewCardCountByDate: {},
  projectedReviewMinutesByDate: {},
  baselineReviewCardCountByDate: {},
  acceptedCardCount: 0,
  rejectedCardCount: 0,
  rejectionCounts: {
    unmappedDeck: 0,
    topicAbsentFromPlan: 0,
    topicLocked: 0,
    noEligibleIntroductionDate: 0,
    projectedLoadExceeded: 0,
    invalidCardState: 0,
  },
  truncated: false,
  candidateLimitReached: false,
  forecastHorizonEndDate: null,
}

export default function FlashcardForecastRecommendations({
  forecast,
  usesFlashcardCapacity,
  topicsById,
  topics,
}) {
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const isOwner = usesFlashcardCapacity === 1
  const settingsJson = forecast || EMPTY_FORECAST

  const safeNewCardsByDate = settingsJson.safeNewCardsByDate || {}
  const acceptedCardCount = settingsJson.acceptedCardCount || 0
  const rejectedCardCount = settingsJson.rejectedCardCount || 0
  const rejectionCounts = settingsJson.rejectionCounts || {}
  const truncated = settingsJson.truncated || false
  const candidateLimitReached = settingsJson.candidateLimitReached || false

  const hasForecastEnabled = Object.keys(safeNewCardsByDate).length > 0 || acceptedCardCount > 0

  const topicsByCanonicalId = useMemo(() => {
    const map = new Map()
    for (const t of (topics || [])) {
      if (t.canonicalTopicId) map.set(t.canonicalTopicId, t)
    }
    return map
  }, [topics])

  function getTopicName(planTopicId) {
    if (topicsById?.has(planTopicId)) {
      return topicsById.get(planTopicId).topicTitle || 'Unknown Topic'
    }
    return 'Unknown Topic'
  }

  function toggleGroup(key) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!isOwner) {
    return (
      <div className={styles.container}>
        <h3 className={styles.heading}>Safe-New-Card Recommendations</h3>
        <div className={styles.infoBlock}>
          This plan does not currently own flashcard capacity. Recommendations appear when
          this plan becomes the flashcard-capacity owner.
        </div>
      </div>
    )
  }

  if (!hasForecastEnabled) {
    return (
      <div className={styles.container}>
        <h3 className={styles.heading}>Safe-New-Card Recommendations</h3>
        <div className={styles.infoBlock}>
          Enable safe-new-card forecasting in planner settings to see recommendations.
        </div>
      </div>
    )
  }

  if (acceptedCardCount === 0 && rejectedCardCount === 0) {
    return (
      <div className={styles.container}>
        <h3 className={styles.heading}>Safe-New-Card Recommendations</h3>
        <div className={styles.infoBlock}>
          No mapped and unlocked new cards are currently eligible for introduction.
        </div>
      </div>
    )
  }

  if (acceptedCardCount === 0 && rejectedCardCount > 0) {
    const totalRejected = rejectedCardCount
    const loadExceeded = rejectionCounts.projectedLoadExceeded || 0
    return (
      <div className={styles.container}>
        <h3 className={styles.heading}>Safe-New-Card Recommendations</h3>
        <div className={styles.infoBlock}>
          All eligible cards exceed the projected review limit.
          {candidateLimitReached && (
            <span className={styles.truncatedWarning}> Forecast was truncated due to data limits.</span>
          )}
          {truncated && !candidateLimitReached && (
            <span className={styles.truncatedWarning}> Forecast was truncated due to capacity limits.</span>
          )}
          {loadExceeded > 0 && (
            <div className={styles.rejectedDetail}>
              {totalRejected} card{totalRejected !== 1 ? 's' : ''} rejected due to capacity.
            </div>
          )}
        </div>
        {renderRejectionBreakdown(rejectionCounts, styles)}
      </div>
    )
  }

  const dateEntries = Object.entries(safeNewCardsByDate).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h3 className={styles.heading}>Safe-New-Card Recommendations</h3>
        <span className={styles.acceptedCount}>{acceptedCardCount} card{acceptedCardCount !== 1 ? 's' : ''}</span>
      </div>

      {candidateLimitReached && (
        <div className={styles.truncatedWarning}>
          <AlertTriangle size={14} /> Forecast was truncated due to data limits.
        </div>
      )}
      {truncated && !candidateLimitReached && (
        <div className={styles.truncatedWarning}>
          <AlertTriangle size={14} /> Forecast was truncated due to daily review capacity limits.
        </div>
      )}

      <p className={styles.hint}>
        Recommendations are advisory and do not automatically introduce cards.
      </p>

      {acceptedCardCount > 0 && rejectedCardCount > 0 && renderRejectionBreakdown(rejectionCounts, styles)}

      <div className={styles.recommendationsList}>
        {dateEntries.map(([date, items]) => {
          if (!Array.isArray(items) || items.length === 0) return null
          const groupKey = date
          const isExpanded = expandedGroups.has(groupKey)
          const count = items.length

          const groupedByTopic = {}
          for (const item of items) {
            const topicId = item.planTopicId || 'unknown'
            if (!groupedByTopic[topicId]) groupedByTopic[topicId] = { topicId, items: [] }
            groupedByTopic[topicId].items.push(item)
          }

          return (
            <div key={groupKey} className={styles.dateGroup}>
              <button
                className={styles.dateHeader}
                onClick={() => toggleGroup(groupKey)}
                aria-expanded={isExpanded}
                aria-label={`${date} — ${count} card${count !== 1 ? 's' : ''}`}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className={styles.dateLabel}>{date}</span>
                <span className={styles.dateCount}>Safe to introduce — {count} card{count !== 1 ? 's' : ''}</span>
              </button>

              {isExpanded && (
                <div className={styles.dateDetails}>
                  {Object.entries(groupedByTopic).map(([topicId, group]) => {
                    const topicName = getTopicName(topicId)

                    const groupedByDeck = {}
                    for (const item of group.items) {
                      const deck = item.deckName || 'Unknown'
                      if (!groupedByDeck[deck]) groupedByDeck[deck] = []
                      groupedByDeck[deck].push(item)
                    }

                    return (
                      <div key={topicId} className={styles.topicGroup}>
                        <span className={styles.topicName}>{topicName}</span>
                        <div className={styles.deckGroup}>
                          {Object.entries(groupedByDeck).map(([deck, deckItems]) => (
                            <div key={deck} className={styles.deckCards}>
                              <span className={styles.deckLabel}>{deck}</span>
                              <span className={styles.cardCount}>{deckItems.length} card{deckItems.length !== 1 ? 's' : ''}</span>
                              {deckItems[0]?.projectedReviewDates?.length > 0 && (
                                <span className={styles.projectedHint}>
                                  Review: {deckItems[0].projectedReviewDates.slice(0, 3).join(', ')}
                                  {deckItems[0].projectedReviewDates.length > 3 && ' ...'}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function renderRejectionBreakdown(rejectionCounts, styles) {
  const reasons = [
    { key: 'unmappedDeck', label: 'Unmapped decks' },
    { key: 'topicAbsentFromPlan', label: 'Topic absent from plan' },
    { key: 'topicLocked', label: 'Topic locked' },
    { key: 'noEligibleIntroductionDate', label: 'No eligible introduction date' },
    { key: 'projectedLoadExceeded', label: 'Exceeded projected load' },
    { key: 'invalidCardState', label: 'Invalid card state' },
  ]

  const active = reasons.filter(r => (rejectionCounts[r.key] || 0) > 0)
  if (active.length === 0) return null

  return (
    <div className={styles.rejectionBreakdown}>
      {active.map(r => (
        <div key={r.key} className={styles.rejectionRow}>
          <span className={styles.rejectionLabel}>{r.label}</span>
          <span className={styles.rejectionCount}>{rejectionCounts[r.key]}</span>
        </div>
      ))}
    </div>
  )
}
