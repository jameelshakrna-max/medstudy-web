import { REVIEW_MINUTES_PER_CARD } from '../../lib/flashcardPredicates.js'

export function allocateDailyReviewCapacity(groups, flashcardMinutes) {
  if (!groups || groups.length === 0) return []

  const totalEstimatedMinutes = groups.reduce(
    (sum, g) => sum + (g.estimatedMinutes || 0),
    0
  )

  const unmetFlashcardMinutes = Math.max(
    0,
    totalEstimatedMinutes - flashcardMinutes
  )

  if (totalEstimatedMinutes <= flashcardMinutes) {
    return groups.map(g => ({
      ...g,
      scheduledMinutes: g.estimatedMinutes || 0,
      unmetReviewMinutes: 0,
    }))
  }

  const sorted = [...groups].sort((a, b) => {
    const da = a.displayOrder ?? Infinity
    const db = b.displayOrder ?? Infinity
    if (da !== db) return da - db
    if (a.planTopicId === null && b.planTopicId !== null) return 1
    if (a.planTopicId !== null && b.planTopicId === null) return -1
    return (a.planTopicId || '').localeCompare(b.planTopicId || '')
  })

  const result = []
  let remaining = flashcardMinutes

  for (const g of sorted) {
    const allocated = Math.min(g.estimatedMinutes || 0, remaining)
    result.push({
      ...g,
      scheduledMinutes: allocated,
      unmetReviewMinutes: (g.estimatedMinutes || 0) - allocated,
    })
    remaining -= allocated
  }

  return result
}

export function buildReviewTaskFromGroup(group, dateStr, sortOrder) {
  if (!group || !group.dueCardCount || group.dueCardCount <= 0) return null
  if (!group.estimatedMinutes || group.estimatedMinutes <= 0) return null

  const task = {
    taskDate: dateStr,
    taskType: 'flashcard_review',
    normalizedTopicId: null,
    canonicalTopicId: group.canonicalTopicId || null,
    estimatedMinutes: group.estimatedMinutes,
    targetCount: group.dueCardCount,
    provider: null,
    mode: null,
    questionPool: null,
    selection: null,
    status: 'pending',
    unlockCondition: null,
    displayOrder: sortOrder,
    metadata: {
      dueCardCount: group.dueCardCount,
      scheduledMinutes: group.scheduledMinutes,
      unmetReviewMinutes: group.unmetReviewMinutes,
      deckNames: [...group.deckNames].sort(),
    },
    isNew: true,
    planTopicId: group.planTopicId || null,
  }
  if (group.cardIds && group.cardIds.length > 0) {
    task.snapshotCardIds = group.cardIds
  }
  return task
}
