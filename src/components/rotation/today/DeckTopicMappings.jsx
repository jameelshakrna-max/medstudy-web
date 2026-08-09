import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { getMappingEmptyState } from '../../../lib/plannerDeckMappings'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import styles from './DeckTopicMappings.module.css'

function buildTopicsByCanonicalId(topics) {
  const map = new Map()
  for (const t of topics) {
    if (t.canonicalTopicId) map.set(t.canonicalTopicId, t)
  }
  return map
}

function scrollToDeckList() {
  document.getElementById('deck-mapping-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function DeckTopicMappings({ planId, topics, usesFlashcardCapacity, hasLinkedDecks = false, onRecalculationRequired }) {
  const queryClient = useQueryClient()
  const [pendingMap, setPendingMap] = useState({})
  const [error, setError] = useState(null)
  const isOwner = usesFlashcardCapacity === 1

  const { data: decksData, isLoading: decksLoading } = useQuery({
    queryKey: ['flashcards', 'planner-decks'],
    queryFn: () => apiGet('/api/flashcards/decks'),
    staleTime: 30_000,
  })
  const decks = Array.isArray(decksData?.decks) ? decksData.decks : []

  const { data: mappingsData, isLoading: mappingsLoading, refetch: refetchMappings } = useQuery({
    queryKey: queryKeys.deckMappings.list(),
    queryFn: () => apiGet('/api/deck-mappings'),
    staleTime: 30_000,
  })
  const mappings = Array.isArray(mappingsData?.mappings) ? mappingsData.mappings : []
  const mappingByDeckName = useMemo(() => {
    const map = new Map()
    for (const m of mappings) {
      map.set(m.deckName, m)
    }
    return map
  }, [mappings])

  const planCanonicalTopicIds = useMemo(() => {
    const ids = new Set()
    for (const t of topics) {
      if (t.canonicalTopicId) ids.add(t.canonicalTopicId)
    }
    return ids
  }, [topics])

  const hasMappings = useMemo(() => {
    return mappings.some(m => m.canonicalTopicId && planCanonicalTopicIds.has(m.canonicalTopicId))
  }, [mappings, planCanonicalTopicIds])

  const mappingEmptyState = useMemo(() => {
    return getMappingEmptyState({ hasLinkedDecks, hasMappings })
  }, [hasLinkedDecks, hasMappings])

  const topicsByCanonicalId = useMemo(() => buildTopicsByCanonicalId(topics), [topics])
  const planTopicOptions = useMemo(() => topics.map(t => ({
    value: t.id,
    label: t.topicTitle || t.normalizedTopicId || t.id,
    canonicalTopicId: t.canonicalTopicId,
  })), [topics])

  const handleMap = useCallback(async (deckName, planTopicId) => {
    if (!planId || !planTopicId) return
    setPendingMap(p => ({ ...p, [deckName]: true }))
    setError(null)
    try {
      const clientRequestId = crypto.randomUUID()
      await apiPost('/api/deck-mappings', {
        planId,
        deckName,
        planTopicId,
        clientRequestId,
      })
      await refetchMappings()
      queryClient.invalidateQueries({ queryKey: ['flashcards', 'planner-decks'] })
      onRecalculationRequired?.()
    } catch (err) {
      setError(err?.message || 'Failed to create mapping')
    } finally {
      setPendingMap(p => ({ ...p, [deckName]: false }))
    }
  }, [planId, refetchMappings, queryClient, onRecalculationRequired])

  const handleUnmap = useCallback(async (deckName, mappingId) => {
    if (!mappingId) return
    setPendingMap(p => ({ ...p, [deckName]: true }))
    setError(null)
    try {
      const clientRequestId = crypto.randomUUID()
      await apiDelete(`/api/deck-mappings/${mappingId}`, { clientRequestId })
      await refetchMappings()
      queryClient.invalidateQueries({ queryKey: ['flashcards', 'planner-decks'] })
      onRecalculationRequired?.()
    } catch (err) {
      setError(err?.message || 'Failed to delete mapping')
    } finally {
      setPendingMap(p => ({ ...p, [deckName]: false }))
    }
  }, [refetchMappings, queryClient, onRecalculationRequired])

  const mergedDecks = useMemo(() => {
    const deckSet = new Map()
    for (const d of decks) {
      deckSet.set(d.deckName, { ...d, source: 'api' })
    }
    for (const m of mappings) {
      if (deckSet.has(m.deckName)) {
        deckSet.set(m.deckName, { ...deckSet.get(m.deckName), mapping: m })
      } else {
        deckSet.set(m.deckName, { deckName: m.deckName, cardCount: m.cardCount ?? 0, source: 'mapping', mapping: m })
      }
    }
    return [...deckSet.values()].sort((a, b) => a.deckName.localeCompare(b.deckName))
  }, [decks, mappings])

  const loading = decksLoading || mappingsLoading

  if (!isOwner) {
    return (
      <div id="deck-topic-mappings" className={styles.container}>
        <h3 className={styles.heading}>Deck-Topic Mappings</h3>
        <div className={styles.nonOwner}>
          Another rotation currently uses flashcard capacity. Mapping controls are not available.
        </div>
      </div>
    )
  }

  if (!planId) {
    return (
      <div id="deck-topic-mappings" className={styles.container}>
        <h3 className={styles.heading}>Deck-Topic Mappings</h3>
        <div className={styles.nonOwner}>
          Create the plan first to manage deck mappings.
        </div>
      </div>
    )
  }

  return (
    <div id="deck-topic-mappings" className={styles.container}>
      <h3 className={styles.heading}>Deck-Topic Mappings</h3>
      <p className={styles.hint}>Map flashcard decks to planner topics. Each deck maps to one topic.</p>

      {error && (
        <div className={styles.error} role="alert">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>
          <Loader2 size={16} className={styles.spin} /> Loading decks...
        </div>
      ) : mergedDecks.length === 0 ? (
        mappingEmptyState && (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateText}>{mappingEmptyState.copy}</span>
            {mappingEmptyState.action && (
              <button type="button" className={styles.mapTopicsBtn} onClick={scrollToDeckList}>
                {mappingEmptyState.action}
              </button>
            )}
          </div>
        )
      ) : (
        <>
          {mappingEmptyState && (
            <div className={styles.emptyState}>
              <span className={styles.emptyStateText}>{mappingEmptyState.copy}</span>
              {mappingEmptyState.action && (
                <button type="button" className={styles.mapTopicsBtn} onClick={scrollToDeckList}>
                  {mappingEmptyState.action}
                </button>
              )}
            </div>
          )}
          <div className={styles.deckList} id="deck-mapping-list">
            {mergedDecks.map(deck => {
              const mapping = deck.mapping
              const topic = mapping ? topicsByCanonicalId.get(mapping.canonicalTopicId) : null
              const isPending = pendingMap[deck.deckName]

              return (
                <div key={deck.deckName} className={styles.deckRow}>
                  <div className={styles.deckInfo}>
                    <span className={styles.deckName}>{deck.deckName}</span>
                    <span className={styles.cardCount}>{deck.cardCount} card{deck.cardCount !== 1 ? 's' : ''}</span>
                  </div>
                  {mapping && topic ? (
                    <div className={styles.mappedInfo}>
                      <span className={styles.topicBadge}>{topic.topicTitle || topic.normalizedTopicId}</span>
                      <button
                        className={styles.unmapBtn}
                        onClick={() => handleUnmap(deck.deckName, mapping.id)}
                        disabled={isPending}
                        aria-label={`Remove mapping for ${deck.deckName}`}
                      >
                        {isPending ? <Loader2 size={12} className={styles.spin} /> : <X size={12} />}
                      </button>
                    </div>
                  ) : mapping && !topic ? (
                    <div className={styles.mappedInfo}>
                      <span className={styles.unmatchedTopic}>Unknown topic</span>
                      <button
                        className={styles.unmapBtn}
                        onClick={() => handleUnmap(deck.deckName, mapping.id)}
                        disabled={isPending}
                        aria-label={`Remove mapping for ${deck.deckName}`}
                      >
                        {isPending ? <Loader2 size={12} className={styles.spin} /> : <X size={12} />}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.mapControls}>
                      <select
                        className={styles.topicSelect}
                        value=""
                        onChange={e => {
                          if (e.target.value) handleMap(deck.deckName, e.target.value)
                        }}
                        disabled={isPending || planTopicOptions.length === 0}
                        aria-label={`Select topic for ${deck.deckName}`}
                      >
                        <option value="">Map to topic...</option>
                        {planTopicOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {isPending && <Loader2 size={14} className={styles.spin} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
