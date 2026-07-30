const PAGE_SIZE = 5000
const NEW_CARD_PAGE_SIZE = 5000
export const DUE_REVIEW_SAFETY_CEILING = 100000
export const NEW_CARD_SAFETY_CEILING = 100000
export const MAX_CANDIDATES = 10000

export class WorkloadTooLargeError extends Error {
  constructor() {
    super('Due review workload exceeds safety ceiling. Cannot generate a complete schedule.')
    this.code = 'WORKLOAD_TOO_LARGE'
  }
}

export class NewCardWorkloadTooLargeError extends Error {
  constructor() {
    super('New card candidate count exceeds safety ceiling. Cannot generate a complete forecast.')
    this.code = 'NEW_CARD_WORKLOAD_TOO_LARGE'
  }
}

export async function loadDueReviewCardsPaginated(env, userId, rangeEndUtcStr, opts = {}) {
  const { pageSize = PAGE_SIZE, safetyCeiling = DUE_REVIEW_SAFETY_CEILING } = opts
  const allCards = []

  let cursorNextReview = null
  let cursorId = null

  while (allCards.length < safetyCeiling + 1) {
    let sql
    let params

    if (cursorNextReview === null) {
      sql = `SELECT id, deck_name, state, last_review, next_review, created_at
             FROM flashcards
             WHERE user_id = ?
               AND last_review IS NOT NULL
               AND state IN (1, 2, 3)
               AND next_review IS NOT NULL
               AND next_review <= ?
             ORDER BY next_review ASC, id ASC
             LIMIT ?`
      params = [userId, rangeEndUtcStr, pageSize]
    } else {
      sql = `SELECT id, deck_name, state, last_review, next_review, created_at
             FROM flashcards
             WHERE user_id = ?
               AND last_review IS NOT NULL
               AND state IN (1, 2, 3)
               AND next_review IS NOT NULL
               AND next_review <= ?
               AND (next_review > ? OR (next_review = ? AND id > ?))
             ORDER BY next_review ASC, id ASC
             LIMIT ?`
      params = [userId, rangeEndUtcStr, cursorNextReview, cursorNextReview, cursorId, pageSize]
    }

    const { results } = await env.DB.prepare(sql).bind(...params).all()

    if (!results || results.length === 0) break

    for (const row of results) {
      allCards.push(row)
    }

    const lastRow = results[results.length - 1]
    cursorNextReview = lastRow.next_review
    cursorId = lastRow.id
  }

  if (allCards.length > safetyCeiling) {
    throw new WorkloadTooLargeError()
  }

  return allCards
}

export async function loadNewCardsPaginated(env, userId, opts = {}) {
  const { pageSize = NEW_CARD_PAGE_SIZE, safetyCeiling = DUE_REVIEW_SAFETY_CEILING } = opts
  const allCards = []

  let cursorCreatedAt = null
  let cursorId = null

  while (allCards.length < safetyCeiling) {
    let sql
    let params

    if (cursorCreatedAt === null) {
      sql = `SELECT id, deck_name, state, last_review, next_review, created_at
             FROM flashcards
             WHERE user_id = ?
               AND (state = 0 OR last_review IS NULL)
             ORDER BY created_at ASC, id ASC
             LIMIT ?`
      params = [userId, pageSize]
    } else {
      sql = `SELECT id, deck_name, state, last_review, next_review, created_at
             FROM flashcards
             WHERE user_id = ?
               AND (state = 0 OR last_review IS NULL)
               AND (created_at > ? OR (created_at = ? AND id > ?))
             ORDER BY created_at ASC, id ASC
             LIMIT ?`
      params = [userId, cursorCreatedAt, cursorCreatedAt, cursorId, pageSize]
    }

    const { results } = await env.DB.prepare(sql).bind(...params).all()

    if (!results || results.length === 0) break

    for (const row of results) {
      if (allCards.length >= safetyCeiling) break
      allCards.push(row)
    }

    const lastRow = results[results.length - 1]
    cursorCreatedAt = lastRow.created_at
    cursorId = lastRow.id
  }

  return allCards
}

export async function selectNewCardsBounded({
  env,
  userId,
  maxCandidates,
  deckToCanonical,
  planTopicByCanonical,
  pageSize = PAGE_SIZE,
  safetyCeiling = NEW_CARD_SAFETY_CEILING,
}) {
  const buffer = []
  let totalMatching = 0
  let bufferSorted = false
  let cursorCreatedAt = null
  let cursorId = null

  function computeKey(card) {
    const canonicalTopicId = deckToCanonical.get(card.deck_name)
    const planTopic = canonicalTopicId ? planTopicByCanonical.get(canonicalTopicId) : undefined

    let priority
    let dispOrder
    let ptId

    if (planTopic) {
      priority = 0
      dispOrder = planTopic.displayOrder ?? 0
      ptId = planTopic.planTopicId
    } else if (canonicalTopicId) {
      priority = 1
      dispOrder = 0
      ptId = canonicalTopicId
    } else {
      priority = 2
      dispOrder = 0
      ptId = ''
    }

    return { priority, dispOrder, ptId, deckName: card.deck_name, createdAt: card.created_at, id: card.id }
  }

  function compareKeys(a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority
    if (a.dispOrder !== b.dispOrder) return a.dispOrder - b.dispOrder
    if (a.ptId < b.ptId) return -1
    if (a.ptId > b.ptId) return 1
    if (a.deckName < b.deckName) return -1
    if (a.deckName > b.deckName) return 1
    if (a.createdAt < b.createdAt) return -1
    if (a.createdAt > b.createdAt) return 1
    if (a.id < b.id) return -1
    if (a.id > b.id) return 1
    return 0
  }

  function lowerBound(arr, key) {
    let lo = 0, hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (compareKeys(arr[mid].key, key) <= 0) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo
  }

  while (totalMatching < safetyCeiling + 1) {
    let sql, params
    if (cursorCreatedAt === null) {
      sql = `SELECT id, deck_name, state, last_review, next_review, created_at
             FROM flashcards
             WHERE user_id = ?
               AND (state = 0 OR last_review IS NULL)
             ORDER BY created_at ASC, id ASC
             LIMIT ?`
      params = [userId, pageSize]
    } else {
      sql = `SELECT id, deck_name, state, last_review, next_review, created_at
             FROM flashcards
             WHERE user_id = ?
               AND (state = 0 OR last_review IS NULL)
               AND (created_at > ? OR (created_at = ? AND id > ?))
             ORDER BY created_at ASC, id ASC
             LIMIT ?`
      params = [userId, cursorCreatedAt, cursorCreatedAt, cursorId, pageSize]
    }

    const { results } = await env.DB.prepare(sql).bind(...params).all()
    if (!results || results.length === 0) break

    for (const card of results) {
      totalMatching++
      if (totalMatching > safetyCeiling) {
        throw new NewCardWorkloadTooLargeError()
      }

      const key = computeKey(card)

      if (buffer.length < maxCandidates) {
        buffer.push({ card, key })
      } else {
        if (!bufferSorted) {
          buffer.sort((a, b) => compareKeys(a.key, b.key))
          bufferSorted = true
        }

        if (compareKeys(key, buffer[buffer.length - 1].key) < 0) {
          buffer.pop()
          const pos = lowerBound(buffer, key)
          buffer.splice(pos, 0, { card, key })
        }
      }
    }

    const lastRow = results[results.length - 1]
    cursorCreatedAt = lastRow.created_at
    cursorId = lastRow.id
  }

  if (!bufferSorted && buffer.length > 0) {
    buffer.sort((a, b) => compareKeys(a.key, b.key))
  }

  const candidateLimitReached = totalMatching > maxCandidates

  return {
    selected: buffer.slice(0, maxCandidates).map(x => x.card),
    candidateLimitReached,
    totalMatching,
  }
}
