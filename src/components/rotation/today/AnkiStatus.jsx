import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap, ExternalLink } from 'lucide-react'
import { apiGet } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { buildAnkiUrl } from './FlashcardReviewTask'
import styles from './AnkiStatus.module.css'

export default function AnkiStatus({ plan, topics, tasks, todayKey }) {
  const isOwner = !!plan?.usesFlashcardCapacity

  const { data: mappingsData, isLoading: mappingsLoading, isError: mappingsError } = useQuery({
    queryKey: queryKeys.deckMappings.list(),
    queryFn: () => apiGet('/api/deck-mappings'),
    staleTime: 30_000,
  })

  const canonicalTopicIds = useMemo(() => {
    const ids = new Set()
    for (const topic of topics || []) {
      if (topic.canonicalTopicId) ids.add(topic.canonicalTopicId)
    }
    return ids
  }, [topics])

  const mappedDeckNames = useMemo(() => {
    const names = []
    for (const mapping of Array.isArray(mappingsData?.mappings) ? mappingsData.mappings : []) {
      if (mapping.canonicalTopicId && canonicalTopicIds.has(mapping.canonicalTopicId)) {
        if (!names.includes(mapping.deckName)) names.push(mapping.deckName)
      }
    }
    return names
  }, [mappingsData, canonicalTopicIds])

  const todayFlashcardTasks = useMemo(() => {
    return (tasks || []).filter(task => task.taskType === 'flashcard_review' && task.taskDate === todayKey)
  }, [tasks, todayKey])

  const dueCount = useMemo(() => {
    let sum = 0
    for (const task of todayFlashcardTasks) {
      const count = task.dueCardCount ?? task.metadataJson?.dueCardCount
      if (typeof count === 'number' && Number.isFinite(count)) sum += count
    }
    return sum
  }, [todayFlashcardTasks])

  const deckNames = useMemo(() => {
    const names = []
    for (const task of todayFlashcardTasks) {
      for (const name of task.deckNames || []) {
        if (!names.includes(name)) names.push(name)
      }
    }
    return names
  }, [todayFlashcardTasks])

  if (!isOwner) {
    return (
      <div className={styles.status}>
        <GraduationCap size={14} className={styles.icon} />
        <span className={styles.text}>Another rotation plan currently owns your Anki review workload.</span>
      </div>
    )
  }

  if (mappingsLoading || mappingsError) return null

  if (mappedDeckNames.length === 0) {
    return (
      <div className={styles.status}>
        <GraduationCap size={14} className={styles.icon} />
        <span className={styles.text}>No Anki decks are mapped to this rotation.</span>
        <button type="button" className={styles.mapBtn} onClick={scrollToMappings}>
          Map Decks
        </button>
      </div>
    )
  }

  if (dueCount === 0) {
    return (
      <div className={styles.status}>
        <GraduationCap size={14} className={styles.icon} />
        <span className={styles.text}>No flashcards are due for this rotation today.</span>
      </div>
    )
  }

  const ankiUrl = buildAnkiUrl(deckNames)

  return (
    <div className={styles.status}>
      <GraduationCap size={14} className={styles.icon} />
      <span className={styles.text}>
        {dueCount} flashcard{dueCount !== 1 ? 's' : ''} due
      </span>
      {deckNames.length > 0 && (
        <span className={styles.deckNames}>{deckNames.join(', ')}</span>
      )}
      <a href={ankiUrl} className={styles.openLink}>
        Open Flashcards <ExternalLink size={12} />
      </a>
    </div>
  )
}

function scrollToMappings() {
  document.getElementById('deck-topic-mappings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
