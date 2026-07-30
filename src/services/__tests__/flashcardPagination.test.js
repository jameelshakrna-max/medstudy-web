import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../__tests__/helpers/d1TestHarness.js'
import {
  loadDueReviewCardsPaginated, loadNewCardsPaginated,
  selectNewCardsBounded,
  DUE_REVIEW_SAFETY_CEILING, NEW_CARD_SAFETY_CEILING, MAX_CANDIDATES,
  WorkloadTooLargeError, NewCardWorkloadTooLargeError,
} from '../flashcardPagination.js'

const TEST_USER = 'user-test-pag'
const PAGE_SIZE = 5000

function makeEnv(db) {
  return { DB: db }
}

async function insertCard(db, userId, overrides = {}) {
  const id = overrides.id || `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await db.prepare(
    `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, userId,
    overrides.deckName || 'Default Deck',
    overrides.state ?? 2,
    overrides.lastReview ?? '2026-07-01T10:00:00.000Z',
    overrides.nextReview ?? '2026-07-15T10:00:00.000Z',
    overrides.createdAt ?? '2026-07-01T00:00:00.000Z'
  ).run()
}

async function insertMapping(db, userId, deckName, canonicalTopicId) {
  await db.prepare(
    `INSERT OR IGNORE INTO flashcard_deck_mappings (user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?)`
  ).bind(userId, deckName, canonicalTopicId).run()
}

describe('loadDueReviewCardsPaginated', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('returns empty array when no due cards exist', async () => {
    const result = await loadDueReviewCardsPaginated(env, TEST_USER, '2026-07-31T23:59:59.999Z')
    expect(result).toEqual([])
  })

  it('excludes new cards (state=0) from due review pagination', async () => {
    await insertCard(db, TEST_USER, { id: 'c-due', state: 2, nextReview: '2026-07-10T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c-new', state: 0, lastReview: null, nextReview: null })
    const result = await loadDueReviewCardsPaginated(env, TEST_USER, '2026-07-31T23:59:59.999Z')
    const ids = result.map(c => c.id)
    expect(ids).not.toContain('c-new')
    expect(ids).toContain('c-due')
  })

  it('handles keyset continuity across same-timestamp cards', async () => {
    for (let i = 0; i < 3; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-st-${i}`,
        state: 2,
        nextReview: '2026-07-15T10:00:00.000Z',
      })
    }
    const result = await loadDueReviewCardsPaginated(env, TEST_USER, '2026-07-31T23:59:59.999Z')
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('c-st-0')
    expect(result[1].id).toBe('c-st-1')
    expect(result[2].id).toBe('c-st-2')
  })

  it('returns all cards when count exceeds PAGE_SIZE boundary', async () => {
    const totalCards = PAGE_SIZE + 1
    const ids = []
    for (let i = 0; i < totalCards; i++) {
      const id = `c-boundary-${String(i).padStart(5, '0')}`
      ids.push(id)
      await insertCard(db, TEST_USER, {
        id,
        state: 2,
        nextReview: '2026-07-15T10:00:00.000Z',
        createdAt: `2026-07-01T00:00:00.000Z`,
      })
    }
    const result = await loadDueReviewCardsPaginated(env, TEST_USER, '2026-07-31T23:59:59.999Z')
    expect(result).toHaveLength(totalCards)
    const resultIds = result.map(c => c.id)
    expect(resultIds[0]).toBe('c-boundary-00000')
    expect(resultIds[resultIds.length - 1]).toBe(`c-boundary-${String(PAGE_SIZE).padStart(5, '0')}`)
  })

  it('exactly safetyCeiling succeeds', async () => {
    const CEILING = 3
    for (let i = 0; i < CEILING; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-ceil-${i}`,
        state: 2,
        nextReview: '2026-07-15T10:00:00.000Z',
      })
    }
    const result = await loadDueReviewCardsPaginated(env, TEST_USER, '2026-07-31T23:59:59.999Z', {
      pageSize: 10, safetyCeiling: CEILING,
    })
    expect(result).toHaveLength(CEILING)
  })

  it('ceiling + 1 throws WorkloadTooLargeError', async () => {
    const CEILING = 3
    for (let i = 0; i < CEILING + 1; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-over-${i}`,
        state: 2,
        nextReview: '2026-07-15T10:00:00.000Z',
      })
    }
    await expect(
      loadDueReviewCardsPaginated(env, TEST_USER, '2026-07-31T23:59:59.999Z', {
        pageSize: 10, safetyCeiling: CEILING,
      })
    ).rejects.toThrow(WorkloadTooLargeError)
  })
})

describe('loadNewCardsPaginated', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('returns empty array when no new cards exist', async () => {
    await insertCard(db, TEST_USER, { state: 2, lastReview: '2026-07-01T10:00:00.000Z' })
    const result = await loadNewCardsPaginated(env, TEST_USER)
    expect(result).toEqual([])
  })

  it('returns only new cards (state=0) and excludes review cards', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 0, lastReview: '2026-07-01T10:00:00.000Z', createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 2, lastReview: '2026-07-03T00:00:00.000Z', createdAt: '2026-07-03T00:00:00.000Z' })
    const result = await loadNewCardsPaginated(env, TEST_USER)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c1')
  })

  it('returns cards in created_at ASC, id ASC order', async () => {
    await insertCard(db, TEST_USER, { id: 'e', state: 0, lastReview: null, createdAt: '2026-07-05T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'a', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'd', state: 0, lastReview: null, createdAt: '2026-07-03T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'b', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await loadNewCardsPaginated(env, TEST_USER)
    const ids = result.map(c => c.id)
    expect(ids).toEqual(['a', 'b', 'd', 'e'])
  })

  it('does not load cards from other users', async () => {
    await insertCard(db, TEST_USER, { id: 'mine', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, 'other-user', { id: 'theirs', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await loadNewCardsPaginated(env, TEST_USER)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('mine')
  })

  it('exactly safetyCeiling succeeds', async () => {
    const CEILING = 3
    for (let i = 0; i < CEILING; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-nceil-${i}`, state: 0, lastReview: null,
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      })
    }
    const result = await loadNewCardsPaginated(env, TEST_USER, {
      pageSize: 10, safetyCeiling: CEILING,
    })
    expect(result).toHaveLength(CEILING)
  })

  it('exceeds ceiling returns capped at safetyCeiling', async () => {
    const CEILING = 3
    for (let i = 0; i < CEILING + 1; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-ncap-${i}`, state: 0, lastReview: null,
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      })
    }
    const result = await loadNewCardsPaginated(env, TEST_USER, {
      pageSize: 10, safetyCeiling: CEILING,
    })
    expect(result).toHaveLength(CEILING)
  })
})

describe('selectNewCardsBounded', () => {
  let db, env

  function callBounded(opts = {}) {
    return selectNewCardsBounded({
      env,
      userId: TEST_USER,
      maxCandidates: opts.maxCandidates ?? 10,
      deckToCanonical: opts.deckToCanonical ?? new Map(),
      planTopicByCanonical: opts.planTopicByCanonical ?? new Map(),
      pageSize: opts.pageSize,
      safetyCeiling: opts.safetyCeiling,
    })
  }

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('returns empty selection when no new cards exist', async () => {
    await insertCard(db, TEST_USER, { state: 2, lastReview: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded()
    expect(result.selected).toEqual([])
    expect(result.candidateLimitReached).toBe(false)
    expect(result.totalMatching).toBe(0)
  })

  it('returns only new cards (state=0 or last_review IS NULL)', async () => {
    await insertCard(db, TEST_USER, { id: 'c-new', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c-review', state: 2, lastReview: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded()
    expect(result.selected).toHaveLength(1)
    expect(result.selected[0].id).toBe('c-new')
  })

  it('sorts unmapped (priority 2) cards by created_at ASC, id ASC', async () => {
    await insertCard(db, TEST_USER, { id: 'd', state: 0, lastReview: null, createdAt: '2026-07-04T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'a', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c', state: 0, lastReview: null, createdAt: '2026-07-03T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'b1', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'b2', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10 })
    expect(result.selected.map(c => c.id)).toEqual(['a', 'b1', 'b2', 'c', 'd'])
  })

  it('assigns priority 0 to cards mapped to a plan topic', async () => {
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-1')
    const deckToCanonical = new Map([['Deck A', 'topic-1']])
    const planTopicByCanonical = new Map([['topic-1', { planTopicId: 'pt-1', displayOrder: 1 }]])
    await insertCard(db, TEST_USER, { id: 'c-p0', deckName: 'Deck A', state: 0, lastReview: null, createdAt: '2026-07-02T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c-p2', deckName: 'Unmapped Deck', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10, deckToCanonical, planTopicByCanonical })
    expect(result.selected[0].id).toBe('c-p0')
    expect(result.selected[1].id).toBe('c-p2')
  })

  it('assigns priority 1 to cards mapped to canonical topic not in plan', async () => {
    await insertMapping(db, TEST_USER, 'Deck B', 'topic-2')
    const deckToCanonical = new Map([['Deck B', 'topic-2']])
    const result = await callBounded({ maxCandidates: 10, deckToCanonical })
    await insertCard(db, TEST_USER, { id: 'c-p1', deckName: 'Deck B', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c-p2', deckName: 'Unmapped', state: 0, lastReview: null, createdAt: '2026-07-02T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c-p0', deckName: 'Deck A', state: 0, lastReview: null, createdAt: '2026-07-03T00:00:00.000Z' })
    const planTopicByCanonical = new Map([['topic-1', { planTopicId: 'pt-1', displayOrder: 0 }]])
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-1')
    const deckToCanonical2 = new Map([['Deck A', 'topic-1'], ['Deck B', 'topic-2']])
    const result2 = await callBounded({ maxCandidates: 10, deckToCanonical: deckToCanonical2, planTopicByCanonical })
    expect(result2.selected[0].id).toBe('c-p0')
    expect(result2.selected[1].id).toBe('c-p1')
    expect(result2.selected[2].id).toBe('c-p2')
  })

  it('orders within priority 0 by displayOrder ASC', async () => {
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-a')
    await insertMapping(db, TEST_USER, 'Deck B', 'topic-b')
    const deckToCanonical = new Map([['Deck A', 'topic-a'], ['Deck B', 'topic-b']])
    const planTopicByCanonical = new Map([
      ['topic-a', { planTopicId: 'pt-a', displayOrder: 2 }],
      ['topic-b', { planTopicId: 'pt-b', displayOrder: 1 }],
    ])
    await insertCard(db, TEST_USER, { id: 'ca', deckName: 'Deck A', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'cb', deckName: 'Deck B', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10, deckToCanonical, planTopicByCanonical })
    expect(result.selected[0].id).toBe('cb')
    expect(result.selected[1].id).toBe('ca')
  })

  it('orders within priority 0 by ptId ASC when displayOrder ties', async () => {
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-a')
    await insertMapping(db, TEST_USER, 'Deck B', 'topic-b')
    const deckToCanonical = new Map([['Deck A', 'topic-a'], ['Deck B', 'topic-b']])
    const planTopicByCanonical = new Map([
      ['topic-a', { planTopicId: 'pt-a', displayOrder: 1 }],
      ['topic-b', { planTopicId: 'pt-b', displayOrder: 1 }],
    ])
    await insertCard(db, TEST_USER, { id: 'ca', deckName: 'Deck A', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'cb', deckName: 'Deck B', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10, deckToCanonical, planTopicByCanonical })
    expect(result.selected[0].id).toBe('ca')
    expect(result.selected[1].id).toBe('cb')
  })

  it('orders by deckName ASC when ptId ties', async () => {
    await insertMapping(db, TEST_USER, 'Deck B', 'topic-1')
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-1')
    const deckToCanonical = new Map([['Deck B', 'topic-1'], ['Deck A', 'topic-1']])
    const planTopicByCanonical = new Map([['topic-1', { planTopicId: 'pt-1', displayOrder: 1 }]])
    await insertCard(db, TEST_USER, { id: 'cb', deckName: 'Deck B', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'ca', deckName: 'Deck A', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10, deckToCanonical, planTopicByCanonical })
    expect(result.selected[0].id).toBe('ca')
    expect(result.selected[1].id).toBe('cb')
  })

  it('orders by createdAt ASC within same priority/deck', async () => {
    const deckToCanonical = new Map()
    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'SameDeck', state: 0, lastReview: null, createdAt: '2026-07-02T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'SameDeck', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10, deckToCanonical })
    expect(result.selected[0].id).toBe('c1')
    expect(result.selected[1].id).toBe('c2')
  })

  it('candidateLimitReached is false when totalMatching <= maxCandidates', async () => {
    for (let i = 0; i < 5; i++) {
      await insertCard(db, TEST_USER, { id: `c-${i}`, state: 0, lastReview: null, createdAt: `2026-07-0${i + 1}T00:00:00.000Z` })
    }
    const result = await callBounded({ maxCandidates: 10 })
    expect(result.candidateLimitReached).toBe(false)
    expect(result.selected).toHaveLength(5)
  })

  it('candidateLimitReached is true when totalMatching > maxCandidates', async () => {
    for (let i = 0; i < 15; i++) {
      await insertCard(db, TEST_USER, { id: `c-${String(i).padStart(3, '0')}`, state: 0, lastReview: null, createdAt: `2026-07-0${String(Math.min(i + 1, 9))}T00:00:00.000Z` })
    }
    const result = await callBounded({ maxCandidates: 10 })
    expect(result.candidateLimitReached).toBe(true)
    expect(result.selected).toHaveLength(10)
  })

  it('buffer retains top-N cards across multiple pages', async () => {
    const totalCards = 20
    const maxCandidates = 5
    for (let i = 0; i < totalCards; i++) {
      const datePart = `2026-07-${String(Math.floor(i / 2) + 1).padStart(2, '0')}`
      await insertCard(db, TEST_USER, { id: `c-${String(i).padStart(3, '0')}`, state: 0, lastReview: null, createdAt: `${datePart}T00:00:00.000Z` })
    }
    const result = await callBounded({ maxCandidates })
    expect(result.selected).toHaveLength(5)
    expect(result.candidateLimitReached).toBe(true)
    const ids = result.selected.map(c => c.id)
    expect(ids).toEqual(['c-000', 'c-001', 'c-002', 'c-003', 'c-004'])
  })

  it('exactly safetyCeiling succeeds', async () => {
    const CEILING = 3
    for (let i = 0; i < CEILING; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-bceil-${i}`, state: 0, lastReview: null,
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      })
    }
    const result = await callBounded({ maxCandidates: 5, safetyCeiling: CEILING, pageSize: 10 })
    expect(result.totalMatching).toBe(CEILING)
    expect(result.selected).toHaveLength(CEILING)
  })

  it('safetyCeiling + 1 throws NewCardWorkloadTooLargeError', async () => {
    const CEILING = 3
    for (let i = 0; i < CEILING + 1; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-bover-${i}`, state: 0, lastReview: null,
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      })
    }
    await expect(
      callBounded({ maxCandidates: 5, safetyCeiling: CEILING, pageSize: 10 })
    ).rejects.toThrow(NewCardWorkloadTooLargeError)
  })

  it('exactly maxCandidates sets candidateLimitReached=false', async () => {
    for (let i = 0; i < 3; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-clim-${i}`, state: 0, lastReview: null,
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      })
    }
    const result = await callBounded({ maxCandidates: 3, safetyCeiling: 5, pageSize: 10 })
    expect(result.candidateLimitReached).toBe(false)
    expect(result.selected).toHaveLength(3)
  })

  it('maxCandidates + 1 sets candidateLimitReached=true', async () => {
    for (let i = 0; i < 4; i++) {
      await insertCard(db, TEST_USER, {
        id: `c-clim2-${i}`, state: 0, lastReview: null,
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      })
    }
    const result = await callBounded({ maxCandidates: 3, safetyCeiling: 5, pageSize: 10 })
    expect(result.candidateLimitReached).toBe(true)
    expect(result.selected).toHaveLength(3)
  })

  it('isolates results by user', async () => {
    await insertCard(db, TEST_USER, { id: 'mine', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, 'other-user', { id: 'theirs', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await selectNewCardsBounded({
      env, userId: TEST_USER, maxCandidates: 10,
      deckToCanonical: new Map(), planTopicByCanonical: new Map(),
    })
    expect(result.selected).toHaveLength(1)
    expect(result.selected[0].id).toBe('mine')
  })

  it('handles no cards at all', async () => {
    const result = await callBounded()
    expect(result.selected).toEqual([])
    expect(result.candidateLimitReached).toBe(false)
    expect(result.totalMatching).toBe(0)
  })

  it('buffer sorts correctly when it fills exactly at maxCandidates', async () => {
    for (let i = 0; i < 10; i++) {
      await insertCard(db, TEST_USER, { id: `c-${String(i).padStart(2, '0')}`, state: 0, lastReview: null, createdAt: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` })
    }
    const result = await callBounded({ maxCandidates: 10 })
    expect(result.selected).toHaveLength(10)
    expect(result.candidateLimitReached).toBe(false)
    const ids = result.selected.map(c => c.id)
    expect(ids).toEqual(['c-00', 'c-01', 'c-02', 'c-03', 'c-04', 'c-05', 'c-06', 'c-07', 'c-08', 'c-09'])
  })

  it('totalMatching reflects total candidate count', async () => {
    for (let i = 0; i < 7; i++) {
      await insertCard(db, TEST_USER, { id: `c-${i}`, state: 0, lastReview: null, createdAt: `2026-07-0${i + 1}T00:00:00.000Z` })
    }
    const result = await callBounded({ maxCandidates: 3 })
    expect(result.totalMatching).toBe(7)
    expect(result.selected).toHaveLength(3)
  })

  it('priority 1 with same ptId sorts by deckName ASC', async () => {
    await insertMapping(db, TEST_USER, 'Deck Z', 'topic-common')
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-common')
    const deckToCanonical = new Map([['Deck Z', 'topic-common'], ['Deck A', 'topic-common']])
    await insertCard(db, TEST_USER, { id: 'cz', deckName: 'Deck Z', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'ca', deckName: 'Deck A', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10, deckToCanonical })
    expect(result.selected[0].id).toBe('ca')
    expect(result.selected[1].id).toBe('cz')
  })

  it('priority 0 with displayOrder=0 default', async () => {
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-1')
    const deckToCanonical = new Map([['Deck A', 'topic-1']])
    const planTopicByCanonical = new Map([['topic-1', { planTopicId: 'pt-1' }]])
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0, lastReview: null, createdAt: '2026-07-01T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'Unmapped', state: 0, lastReview: null, createdAt: '2026-07-02T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10, deckToCanonical, planTopicByCanonical })
    expect(result.selected[0].id).toBe('c1')
    expect(result.selected[1].id).toBe('c2')
  })

  it('cards with last_review=null and state!=0 are included as new cards', async () => {
    await db.prepare(
      `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)`
    ).bind('c-new-null', TEST_USER, 'Deck', 1, '2026-07-01T00:00:00.000Z').run()
    await insertCard(db, TEST_USER, { id: 'c-review', state: 2, lastReview: '2026-07-01T00:00:00.000Z', createdAt: '2026-07-02T00:00:00.000Z' })
    const result = await callBounded({ maxCandidates: 10 })
    expect(result.selected).toHaveLength(1)
    expect(result.selected[0].id).toBe('c-new-null')
  })
})
