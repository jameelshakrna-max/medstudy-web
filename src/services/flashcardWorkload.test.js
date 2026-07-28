import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../__tests__/helpers/d1TestHarness.js'
import { computeReviewWorkloadMap, allocateReviewMinutesByGroup } from './flashcardWorkload.js'
import { REVIEW_MINUTES_PER_CARD } from '../lib/flashcardPredicates.js'

const TEST_USER = 'user-test-1'
const TEST_USER_2 = 'user-test-2'

const DEFAULT_AVAILABILITY = Array.from({ length: 7 }, (_, i) => ({
  weekday: i,
  availableMinutes: 120,
  isDayOff: false,
}))

const WEEKENDS_OFF = Array.from({ length: 7 }, (_, i) => ({
  weekday: i,
  availableMinutes: i === 0 || i === 6 ? 0 : 120,
  isDayOff: i === 0 || i === 6,
}))

function makeEnv(db) {
  return { DB: db }
}

async function insertCard(db, userId, { id, deckName = 'Default Deck', state = 2, lastReview = '2026-07-01T10:00:00.000Z', nextReview, createdAt = '2026-07-01T00:00:00.000Z' }) {
  await db.prepare(
    `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, deckName, state, lastReview, nextReview, createdAt).run()
}

async function insertMapping(db, userId, deckName, canonicalTopicId) {
  const id = `mapping-${deckName}-${canonicalTopicId}`
  await db.prepare(
    `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
  ).bind(id, userId, deckName, canonicalTopicId).run()
}

function planTopics(ids) {
  return ids.map((id, i) => ({
    planTopicId: `rpt-${id}`,
    canonicalTopicId: id,
    displayOrder: i,
  }))
}

describe('allocateReviewMinutesByGroup', () => {
  it('31. single card → 2 minutes', () => {
    const result = allocateReviewMinutesByGroup([
      { key: 'a', dueCardCount: 1, stableOrder: 0 },
    ])
    expect(result[0].estimatedMinutes).toBe(2)
    expect(result[0].dueCardCount).toBe(1)
  })

  it('32. two cards → 3 minutes', () => {
    const result = allocateReviewMinutesByGroup([
      { key: 'a', dueCardCount: 2, stableOrder: 0 },
    ])
    expect(result[0].estimatedMinutes).toBe(3)
  })

  it('33. three cards → 5 minutes', () => {
    const result = allocateReviewMinutesByGroup([
      { key: 'a', dueCardCount: 3, stableOrder: 0 },
    ])
    expect(result[0].estimatedMinutes).toBe(5)
  })

  it('34. SUM(estimatedMinutes) equals ceil(totalCards * 1.5)', () => {
    const groups = [
      { key: 'a', dueCardCount: 5, stableOrder: 0 },
      { key: 'b', dueCardCount: 3, stableOrder: 1 },
      { key: 'c', dueCardCount: 7, stableOrder: 2 },
    ]
    const result = allocateReviewMinutesByGroup(groups)
    const total = result.reduce((s, g) => s + g.estimatedMinutes, 0)
    const expected = Math.ceil(15 * REVIEW_MINUTES_PER_CARD)
    expect(total).toBe(expected)
  })

  it('35. largest-remainder tie-breaking is deterministic', () => {
    const groups = [
      { key: 'x', dueCardCount: 1, stableOrder: 1 },
      { key: 'y', dueCardCount: 1, stableOrder: 0 },
    ]
    const result1 = allocateReviewMinutesByGroup(groups)
    const result2 = allocateReviewMinutesByGroup(groups)
    expect(result1).toEqual(result2)
  })

  it('36. distribution by fractional remainder descending', () => {
    const groups = [
      { key: 'a', dueCardCount: 1, stableOrder: 0 },
      { key: 'b', dueCardCount: 1, stableOrder: 1 },
    ]
    const result = allocateReviewMinutesByGroup(groups)
    const total = result.reduce((s, g) => s + g.estimatedMinutes, 0)
    expect(total).toBe(Math.ceil(2 * REVIEW_MINUTES_PER_CARD))
  })

  it('37. empty groups returns empty array', () => {
    expect(allocateReviewMinutesByGroup([])).toEqual([])
  })

  it('38. zero total returns all zeros', () => {
    const result = allocateReviewMinutesByGroup([
      { key: 'a', dueCardCount: 0, stableOrder: 0 },
      { key: 'b', dueCardCount: 0, stableOrder: 1 },
    ])
    expect(result[0].estimatedMinutes).toBe(0)
    expect(result[1].estimatedMinutes).toBe(0)
  })
})

describe('computeReviewWorkloadMap — predicates/query', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('1. new state=0 excluded', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 0, lastReview: null, nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(0)
  })

  it('2. null last_review excluded', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, lastReview: null, nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(0)
  })

  it('3. learning state=1 with past next_review included', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 1, nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(1)
  })

  it('4. learning state=1 with future next_review excluded', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 1, nextReview: '2026-08-10T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(0)
  })

  it('5. review state=2 due included', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(1)
    expect(result.dueReviewCardCountByDate['2026-08-05']).toBe(1)
  })

  it('6. relearning state=3 due included', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 3, nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(1)
  })

  it('7. cards after endDate excluded', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-10T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(0)
  })

  it('8. backlog before effectiveStartDate included', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-07-20T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(1)
    expect(result.dueReviewCardCountByDate['2026-08-01']).toBe(1)
  })
})

describe('computeReviewWorkloadMap — bucketing', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('9. backlog goes to first eligible date', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-07-01T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-01']).toBe(1)
  })

  it('10. due card stays on eligible due date', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-03T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-03']).toBe(1)
  })

  it('11. day-off card moves to next eligible date', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Deck A', nextReview: '2026-08-02T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: WEEKENDS_OFF, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-02']).toBeUndefined()
    expect(result.dueReviewCardCountByDate['2026-08-03']).toBe(1)
  })

  it('12. blocked-date card moves to next eligible date', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-03T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: ['2026-08-03'], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-03']).toBeUndefined()
    expect(result.dueReviewCardCountByDate['2026-08-04']).toBe(1)
  })

  it('13. consecutive unavailable dates are skipped', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-02T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY,
      blockedDates: ['2026-08-02', '2026-08-03', '2026-08-04'],
      planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-05']).toBe(1)
  })

  it('14. no eligible date puts card in unscheduled', async () => {
    const allOff = Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 0, isDayOff: true }))
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-03T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: allOff, blockedDates: [],
      planTopics: [],
    })
    expect(result.unscheduled.totalCards).toBe(1)
  })

  it('15. each card appears exactly once', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-02T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-02T12:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 1, nextReview: '2026-08-02T14:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    const sumByDate = Object.values(result.dueReviewCardCountByDate).reduce((s, v) => s + v, 0)
    expect(sumByDate).toBe(3)
    expect(result.unscheduled.totalCards).toBe(0)
  })

  it('16. day-off date is not also populated', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-02T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: WEEKENDS_OFF, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-02']).toBeUndefined()
  })

  it('17. all-days-off range returns all cards unscheduled', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-02T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-04T10:00:00.000Z' })
    const allOff = Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 0, isDayOff: true }))
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: allOff, blockedDates: [], planTopics: [],
    })
    expect(result.unscheduled.totalCards).toBe(2)
  })

  it('18. zero-length valid range works', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-01T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-01',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-01']).toBe(1)
  })

  it('19. effectiveStartDate during recalculation excludes immutable earlier dates while carrying their due cards as backlog', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-01T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-03T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-03', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-01']).toBeUndefined()
    expect(result.dueReviewCardCountByDate['2026-08-03']).toBe(2)
  })
})

describe('computeReviewWorkloadMap — timezone', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('20. UTC+3 positive local date assignment', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T01:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'Asia/Baghdad',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-05']).toBe(1)
  })

  it('21. UTC-5 negative local date assignment', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T23:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'America/New_York',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-05']).toBe(1)
  })

  it('22. midnight boundary', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T23:59:59.999Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewCardCountByDate['2026-08-05']).toBe(1)
  })

  it('23. DST transition date', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-03-08T07:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-03-01', endDate: '2026-03-14',
      effectiveStartDate: '2026-03-01', timezone: 'America/New_York',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(1)
  })

  it('24. invalid timezone rejected', async () => {
    await expect(computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'Invalid/Timezone',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })).rejects.toThrow('Invalid timezone')
  })
})

describe('computeReviewWorkloadMap — minutes', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('25. one card → 2 minutes', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewMinutesByDate['2026-08-05']).toBe(2)
  })

  it('26. two cards → 3 minutes', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-05T12:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewMinutesByDate['2026-08-05']).toBe(3)
  })

  it('27. three cards → 5 minutes', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-05T11:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 2, nextReview: '2026-08-05T12:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewMinutesByDate['2026-08-05']).toBe(5)
  })

  it('28. daily map contains integers', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-05T12:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(Number.isInteger(result.dueReviewMinutesByDate['2026-08-05'])).toBe(true)
  })

  it('29. unscheduled total uses ceiling', async () => {
    const allOff = Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 0, isDayOff: true }))
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-03T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: allOff, blockedDates: [], planTopics: [],
    })
    expect(result.unscheduled.totalMinutes).toBe(Math.ceil(1 * REVIEW_MINUTES_PER_CARD))
  })

  it('30. two single-card dates sum to 4 not 3', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-02T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-04T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.dueReviewMinutesByDate['2026-08-02']).toBe(2)
    expect(result.dueReviewMinutesByDate['2026-08-04']).toBe(2)
    expect(result.totalDueCards).toBe(2)
    expect(result.totalDueMinutes).toBe(4)
  })

  it('31. totalDueMinutes equals SUM(dueReviewMinutesByDate) + unscheduled.totalMinutes', async () => {
    const allOff = Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 0, isDayOff: true }))
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-02T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-02T11:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c4', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [],
    })
    const sum = Object.values(result.dueReviewMinutesByDate).reduce((s, v) => s + v, 0) + result.unscheduled.totalMinutes
    expect(result.totalDueMinutes).toBe(sum)
  })

  it('32. totalDueCards equals SUM(dueReviewCardCountByDate) + unscheduled.totalCards', async () => {
    const allOff = Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 0, isDayOff: true }))
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-02T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-04T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 2, nextReview: '2026-08-06T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    const countSum = Object.values(result.dueReviewCardCountByDate).reduce((s, v) => s + v, 0) + result.unscheduled.totalCards
    expect(result.totalDueCards).toBe(countSum)
  })

  it('33. dailyBreakdown.reviewCardCount matches dueReviewCardCountByDate', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-02T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, nextReview: '2026-08-02T12:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 2, nextReview: '2026-08-04T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    for (const [date, count] of Object.entries(result.dueReviewCardCountByDate)) {
      expect(result.dailyBreakdown[date].dueCardCount).toBe(count)
    }
  })

  it('34. SUM(topicBreakdownByDate card counts) equals dueReviewCardCountByDate', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Deck A', nextReview: '2026-08-02T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, deckName: 'Deck B', nextReview: '2026-08-02T11:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 2, deckName: 'Deck C', nextReview: '2026-08-02T12:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-a')
    await insertMapping(db, TEST_USER, 'Deck B', 'topic-a')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-a', canonicalTopicId: 'topic-a', displayOrder: 0 }],
    })
    for (const [date, count] of Object.entries(result.dueReviewCardCountByDate)) {
      const topicSum = result.topicBreakdownByDate[date].reduce((s, g) => s + g.dueCardCount, 0)
      expect(topicSum).toBe(count)
    }
  })

  it('35. mixed mapped/unmapped/absent/unscheduled — every card appears once', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Cardio Core', nextReview: '2026-08-02T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, deckName: 'Unmapped Deck', nextReview: '2026-08-02T11:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 2, deckName: 'Surgery Deck', nextReview: '2026-08-02T12:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c4', state: 2, deckName: 'Cardio Core', nextReview: '2026-08-10T10:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Cardio Core', 'topic-cardio')
    await insertMapping(db, TEST_USER, 'Surgery Deck', 'topic-surgery')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-14',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
    })
    const allOffCards = Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 0, isDayOff: true }))
    await insertCard(db, TEST_USER, { id: 'c5', state: 2, deckName: 'Solo Deck', nextReview: '2026-08-04T10:00:00.000Z' })
    const result2 = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-14',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: allOffCards, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
    })
    const cardCount = result2.dueReviewCardCountByDate
      ? Object.values(result2.dueReviewCardCountByDate).reduce((s, v) => s + v, 0)
      : 0
    const totalAccounted = cardCount + result2.unscheduled.totalCards
    expect(totalAccounted).toBe(5)
    expect(result2.totalDueCards).toBe(totalAccounted)
  })

  it('36. allocation helper SUM equals daily total', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Deck A', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, deckName: 'Deck A', nextReview: '2026-08-05T11:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c3', state: 2, deckName: 'Deck B', nextReview: '2026-08-05T12:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-a')
    await insertMapping(db, TEST_USER, 'Deck B', 'topic-b')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-a', canonicalTopicId: 'topic-a', displayOrder: 0 },
                   { planTopicId: 'rpt-b', canonicalTopicId: 'topic-b', displayOrder: 1 }],
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    const allocated = allocateReviewMinutesByGroup(
      groups.map((g, i) => ({ key: g.canonicalTopicId || `general-${i}`, dueCardCount: g.dueCardCount, stableOrder: i }))
    )
    const totalAllocated = allocated.reduce((s, g) => s + g.estimatedMinutes, 0)
    expect(totalAllocated).toBe(result.dueReviewMinutesByDate['2026-08-05'])
  })
})

describe('computeReviewWorkloadMap — mappings', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('32. mapped deck resolves to planTopicId', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Cardio Core', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Cardio Core', 'topic-cardio')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups).toHaveLength(1)
    expect(groups[0].planTopicId).toBe('rpt-cardio')
    expect(groups[0].canonicalTopicId).toBe('topic-cardio')
  })

  it('33. two decks mapped to same canonical topic aggregate', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Cardio Core', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, deckName: 'Heart Failure', nextReview: '2026-08-05T11:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Cardio Core', 'topic-cardio')
    await insertMapping(db, TEST_USER, 'Heart Failure', 'topic-cardio')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups).toHaveLength(1)
    expect(groups[0].dueCardCount).toBe(2)
    expect(groups[0].deckNames).toEqual(['Cardio Core', 'Heart Failure'])
  })

  it('34. unmapped deck goes to General Reviews', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Misc Deck', nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups).toHaveLength(1)
    expect(groups[0].planTopicId).toBeNull()
    expect(groups[0].canonicalTopicId).toBeNull()
  })

  it('35. mapping absent from current plan goes to General Reviews', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Cardio Core', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Cardio Core', 'topic-cardio')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-surgery', canonicalTopicId: 'topic-surgery', displayOrder: 0 }],
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups).toHaveLength(1)
    expect(groups[0].planTopicId).toBeNull()
  })

  it('36. mappingOverlay upsert affects computation only', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Unmapped Deck', nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
      mappingOverlay: { upserts: [{ deckName: 'Unmapped Deck', canonicalTopicId: 'topic-cardio' }], deletes: [] },
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups[0].planTopicId).toBe('rpt-cardio')
  })

  it('37. mappingOverlay delete affects computation only', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Cardio Core', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Cardio Core', 'topic-cardio')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
      mappingOverlay: { upserts: [], deletes: ['Cardio Core'] },
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups[0].planTopicId).toBeNull()
  })

  it('38. overlay does not write to database', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Unmapped Deck', nextReview: '2026-08-05T10:00:00.000Z' })
    await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [],
      mappingOverlay: { upserts: [{ deckName: 'Unmapped Deck', canonicalTopicId: 'topic-cardio' }], deletes: [] },
    })
    const { results } = await db.prepare(
      `SELECT * FROM flashcard_deck_mappings WHERE user_id = ?`
    ).bind(TEST_USER).all()
    expect(results).toHaveLength(0)
  })

  it('39. conflicting overlay — deletion wins over upsert', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Conflict Deck', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Conflict Deck', 'topic-cardio')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
      mappingOverlay: {
        upserts: [{ deckName: 'Conflict Deck', canonicalTopicId: 'topic-cardio' }],
        deletes: ['Conflict Deck'],
      },
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups[0].planTopicId).toBeNull()
    expect(groups[0].canonicalTopicId).toBeNull()
  })

  it('40. deckNames are distinct and sorted', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Zebra Deck', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, deckName: 'Alpha Deck', nextReview: '2026-08-05T11:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Zebra Deck', 'topic-cardio')
    await insertMapping(db, TEST_USER, 'Alpha Deck', 'topic-cardio')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups[0].deckNames).toEqual(['Alpha Deck', 'Zebra Deck'])
  })

  it('41. General Reviews sorted last', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Cardio Core', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, deckName: 'Misc Deck', nextReview: '2026-08-05T11:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Cardio Core', 'topic-cardio')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    const lastGroup = groups[groups.length - 1]
    expect(lastGroup.planTopicId).toBeNull()
    expect(lastGroup.canonicalTopicId).toBeNull()
  })

  it('42. plan topic display order is respected', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, deckName: 'Deck B', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER, { id: 'c2', state: 2, deckName: 'Deck A', nextReview: '2026-08-05T11:00:00.000Z' })
    await insertMapping(db, TEST_USER, 'Deck B', 'topic-b')
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-a')
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [
        { planTopicId: 'rpt-a', canonicalTopicId: 'topic-a', displayOrder: 0 },
        { planTopicId: 'rpt-b', canonicalTopicId: 'topic-b', displayOrder: 1 },
      ],
    })
    const groups = result.topicBreakdownByDate['2026-08-05']
    expect(groups[0].planTopicId).toBe('rpt-a')
    expect(groups[1].planTopicId).toBe('rpt-b')
  })
})

describe('computeReviewWorkloadMap — safety', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('43. service performs no writes', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    const before = await db.prepare(`SELECT * FROM flashcards WHERE user_id = ?`).bind(TEST_USER).all()
    await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    const after = await db.prepare(`SELECT * FROM flashcards WHERE user_id = ?`).bind(TEST_USER).all()
    expect(after.results.length).toBe(before.results.length)
    for (let i = 0; i < after.results.length; i++) {
      expect(after.results[i]).toEqual(before.results[i])
    }
  })

  it('44. repeated calls return equal results', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    const opts = {
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    }
    const r1 = await computeReviewWorkloadMap(opts)
    const r2 = await computeReviewWorkloadMap(opts)
    expect(r1).toEqual(r2)
  })

  it('45. different users cards never leak', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, TEST_USER_2, { id: 'c2', state: 2, nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(1)
  })

  it('46. empty card set returns empty maps and zero totals', async () => {
    const result = await computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })
    expect(result.totalDueCards).toBe(0)
    expect(result.totalDueMinutes).toBe(0)
    expect(result.unscheduled.totalCards).toBe(0)
    expect(result.unscheduled.totalMinutes).toBe(0)
    expect(Object.keys(result.dueReviewCardCountByDate)).toHaveLength(0)
  })
})

describe('computeReviewWorkloadMap — validation', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('rejects invalid timezone', async () => {
    await expect(computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'Bogus/Zone',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })).rejects.toThrow('Invalid timezone')
  })

  it('rejects startDate after endDate', async () => {
    await expect(computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-10', endDate: '2026-08-01',
      effectiveStartDate: '2026-08-10', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })).rejects.toThrow('startDate must not be after endDate')
  })

  it('rejects effectiveStartDate before startDate', async () => {
    await expect(computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-05', endDate: '2026-08-10',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })).rejects.toThrow('effectiveStartDate must not be before startDate')
  })

  it('rejects effectiveStartDate after endDate', async () => {
    await expect(computeReviewWorkloadMap({
      env, userId: TEST_USER, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-10', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })).rejects.toThrow('effectiveStartDate must not be after endDate')
  })

  it('rejects missing startDate', async () => {
    await expect(computeReviewWorkloadMap({
      env, userId: TEST_USER, endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [], planTopics: [],
    })).rejects.toThrow('startDate and endDate are required')
  })
})
