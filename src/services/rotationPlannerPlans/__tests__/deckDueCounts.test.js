import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb } from '../../../__tests__/helpers/d1TestHarness.js'
import { computeLinkedDeckStats, buildAnkiOpenUrl } from '../deckDueCounts.js'

const TEST_USER = 'user-deck-stats'

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
    overrides.lastReview === undefined ? '2026-01-01T10:00:00.000Z' : overrides.lastReview,
    overrides.nextReview ?? '2026-01-10T10:00:00.000Z',
    overrides.createdAt ?? '2026-01-01T00:00:00.000Z'
  ).run()
}

describe('buildAnkiOpenUrl', () => {
  it('encodes the deck name into the anki open url', () => {
    expect(buildAnkiOpenUrl('Cardio Deck')).toBe('/anki?deck=Cardio%20Deck')
    expect(buildAnkiOpenUrl('Neurology')).toBe('/anki?deck=Neurology')
  })
})

describe('computeLinkedDeckStats', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns [] for an empty deck list without querying', async () => {
    const result = await computeLinkedDeckStats(env, TEST_USER, [], 'UTC')
    expect(result).toEqual([])
  })

  it('reports cardCount totals and dueCount using the current-day cutoff', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T04:00:00.000Z'))

    await insertCard(db, TEST_USER, { deckName: 'Deck A', nextReview: '2026-01-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { deckName: 'Deck A', nextReview: '2026-01-05T20:00:00.000Z' })
    await insertCard(db, TEST_USER, { deckName: 'Deck A', nextReview: '2026-01-06T00:00:00.000Z' })
    await insertCard(db, TEST_USER, { deckName: 'Deck B', nextReview: '2026-01-05T10:00:00.000Z' })

    const result = await computeLinkedDeckStats(env, TEST_USER, [
      { deck_name: 'Deck A', is_primary: 1 },
      { deck_name: 'Deck B', is_primary: 0 },
    ], 'UTC')

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      deckName: 'Deck A',
      isPrimary: true,
      cardCount: 3,
      dueCount: 2,
      openUrl: '/anki?deck=Deck%20A',
    })
    expect(result[1]).toEqual({
      deckName: 'Deck B',
      isPrimary: false,
      cardCount: 1,
      dueCount: 1,
      openUrl: '/anki?deck=Deck%20B',
    })
  })

  it('treats a card with next_review exactly at end-of-day as due, next day as not', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T04:00:00.000Z'))

    await insertCard(db, TEST_USER, { deckName: 'Boundary', nextReview: '2026-01-05T23:59:59.999Z' })
    await insertCard(db, TEST_USER, { deckName: 'Boundary', nextReview: '2026-01-06T00:00:00.000Z' })

    const result = await computeLinkedDeckStats(env, TEST_USER, [
      { deck_name: 'Boundary', is_primary: 0 },
    ], 'UTC')

    expect(result[0].cardCount).toBe(2)
    expect(result[0].dueCount).toBe(1)
  })

  it('excludes state 0 cards from dueCount', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T04:00:00.000Z'))

    await insertCard(db, TEST_USER, { deckName: 'State Deck', state: 0, nextReview: '2026-01-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { deckName: 'State Deck', state: 2, nextReview: '2026-01-05T10:00:00.000Z' })

    const result = await computeLinkedDeckStats(env, TEST_USER, [
      { deck_name: 'State Deck', is_primary: 0 },
    ], 'UTC')

    expect(result[0].cardCount).toBe(2)
    expect(result[0].dueCount).toBe(1)
  })

  it('excludes cards without a last_review from dueCount', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T04:00:00.000Z'))

    await insertCard(db, TEST_USER, { deckName: 'No Review', lastReview: null, nextReview: '2026-01-05T10:00:00.000Z' })

    const result = await computeLinkedDeckStats(env, TEST_USER, [
      { deck_name: 'No Review', is_primary: 0 },
    ], 'UTC')

    expect(result[0].cardCount).toBe(1)
    expect(result[0].dueCount).toBe(0)
  })

  it('orders primary first, then deckName localeCompare', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T04:00:00.000Z'))

    await insertCard(db, TEST_USER, { deckName: 'alpha' })
    await insertCard(db, TEST_USER, { deckName: 'beta' })
    await insertCard(db, TEST_USER, { deckName: 'gamma' })

    const result = await computeLinkedDeckStats(env, TEST_USER, [
      { deck_name: 'gamma', is_primary: 0 },
      { deck_name: 'alpha', is_primary: 1 },
      { deck_name: 'beta', is_primary: 0 },
    ], 'UTC')

    expect(result.map(r => r.deckName)).toEqual(['alpha', 'beta', 'gamma'])
    expect(result[0].isPrimary).toBe(true)
    expect(result[1].isPrimary).toBe(false)
    expect(result[2].isPrimary).toBe(false)
  })

  it('uses the plan timezone for the cutoff when valid', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T04:00:00.000Z'))

    // 2026-01-05T05:30Z is 2026-01-04 23:30 in America/New_York and
    // 2026-01-05 in UTC, so the end-of-day cutoff differs.
    await insertCard(db, TEST_USER, { deckName: 'TZ Deck', nextReview: '2026-01-05T05:30:00.000Z' })

    const ny = await computeLinkedDeckStats(env, TEST_USER, [
      { deck_name: 'TZ Deck', is_primary: 0 },
    ], 'America/New_York')
    expect(ny[0].dueCount).toBe(0)

    const utc = await computeLinkedDeckStats(env, TEST_USER, [
      { deck_name: 'TZ Deck', is_primary: 0 },
    ], 'UTC')
    expect(utc[0].dueCount).toBe(1)
  })

  it('falls back to UTC when timezone is invalid', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T04:00:00.000Z'))

    await insertCard(db, TEST_USER, { deckName: 'Bad TZ', nextReview: '2026-01-05T05:30:00.000Z' })

    const result = await computeLinkedDeckStats(env, TEST_USER, [
      { deck_name: 'Bad TZ', is_primary: 0 },
    ], 'Not/A/Timezone')

    expect(result[0].dueCount).toBe(1)
  })
})
