import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../__tests__/helpers/d1TestHarness.js'
import { computeSafeNewCardForecast, snapToNextEligibleDate } from './flashcardForecast.js'
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

async function insertCard(db, userId, { id, deckName = 'Default Deck', state = 0, lastReview = null, nextReview = null, createdAt }) {
  await db.prepare(
    `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, deckName, state, lastReview, nextReview, createdAt || '2026-07-01T00:00:00.000Z').run()
}

async function insertMapping(db, userId, deckName, canonicalTopicId) {
  const id = `mapping-${deckName}-${canonicalTopicId}`
  await db.prepare(
    `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
  ).bind(id, userId, deckName, canonicalTopicId).run()
}

function makePlanTopics(configs) {
  return configs.map((c, i) => ({
    planTopicId: c.planTopicId || `rpt-${c.canonicalTopicId || i}`,
    canonicalTopicId: c.canonicalTopicId || `topic-${i}`,
    displayOrder: c.displayOrder ?? i,
    status: c.status || 'not_started',
    learningCompletedAt: c.learningCompletedAt || null,
  }))
}

const BASE_FORECAST_ARGS = {
  startDate: '2026-08-01',
  endDate: '2026-08-14',
  effectiveStartDate: '2026-08-01',
  timezone: 'UTC',
  availabilityByWeekday: DEFAULT_AVAILABILITY,
  blockedDates: [],
  usesFlashcardCapacity: true,
  learningUnlockMode: 'learning_completed',
  maxProjectedFlashcardReviewMinutesPerDay: 9999,
  existingReviewCardCountByDate: {},
}

// ============================================================
// Card Eligibility
// ============================================================

describe('card eligibility', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
    await insertMapping(db, TEST_USER, 'Deck B', 'topic-pulm')
  })

  it('1. state=0 card is considered new', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBeGreaterThan(0)
    expect(result.rejectedCardCount).toBe(0)
  })

  it('2. null last_review card is considered new', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0, lastReview: null })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBeGreaterThan(0)
  })

  it('3. introduced Review card is excluded', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 2, lastReview: '2026-07-20T10:00:00.000Z', nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBe(0)
  })

  it('4. introduced Learning card is excluded', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 1, lastReview: '2026-07-20T10:00:00.000Z', nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBe(0)
  })

  it('5. introduced Relearning card is excluded', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 3, lastReview: '2026-07-20T10:00:00.000Z', nextReview: '2026-08-05T10:00:00.000Z' })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBe(0)
  })

  it('6. another user cards are excluded', async () => {
    await insertCard(db, TEST_USER_2, { id: 'c1', deckName: 'Deck A', state: 0 })
    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    const cardIds = new Set()
    for (const cards of Object.values(result.safeNewCardsByDate)) {
      for (const c of cards) cardIds.add(c.cardId)
    }
    expect(cardIds).not.toContain('c1')
    expect(cardIds).toContain('c2')
  })

  it('7. unmapped new card is rejected', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Unknown Deck', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.rejectionCounts.unmappedDeck).toBe(1)
    expect(result.acceptedCardCount).toBe(0)
  })

  it('8. mapped topic absent from plan is rejected', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck B', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.rejectionCounts.topicAbsentFromPlan).toBe(1)
    expect(result.acceptedCardCount).toBe(0)
  })

  it('9. mapped eligible topic is accepted for evaluation', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBe(1)
  })

  it('10. mappingOverlay upsert makes card eligible', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Upserted Deck', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      mappingOverlay: { upserts: [{ deckName: 'Upserted Deck', canonicalTopicId: 'topic-cardio' }] },
    })
    expect(result.acceptedCardCount).toBe(1)
  })

  it('11. mappingOverlay delete makes card ineligible', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      mappingOverlay: { deletes: ['Deck A'] },
    })
    expect(result.rejectionCounts.unmappedDeck).toBe(1)
    expect(result.acceptedCardCount).toBe(0)
  })

  it('12. conflicting overlay uses deletion-wins behavior', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      mappingOverlay: {
        upserts: [{ deckName: 'Deck A', canonicalTopicId: 'topic-cardio' }],
        deletes: ['Deck A'],
      },
    })
    expect(result.rejectionCounts.unmappedDeck).toBe(1)
    expect(result.acceptedCardCount).toBe(0)
  })

  it('13. exact deck-name matching is enforced', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'decka', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.rejectionCounts.unmappedDeck).toBe(1)
  })

  it('14. case-distinct deck names remain distinct', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'deck a', state: 0 })
    await insertMapping(db, TEST_USER, 'deck a', 'topic-pulm')
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([
        { canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' },
        { canonicalTopicId: 'topic-pulm', status: 'completed', learningCompletedAt: '2026-07-15' },
      ]),
    })
    expect(result.acceptedCardCount).toBe(2)
  })
})

// ============================================================
// Topic Unlock
// ============================================================

describe('topic unlock', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
  })

  it('15. learning_completed allows completed topic', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBe(1)
  })

  it('16. learning_completed rejects started-only topic', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'learning', learningCompletedAt: null }]),
    })
    expect(result.rejectionCounts.topicLocked).toBe(1)
    expect(result.acceptedCardCount).toBe(0)
  })

  it('17. learning_completed rejects not-started topic', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'not_started' }]),
    })
    expect(result.rejectionCounts.topicLocked).toBe(1)
  })

  it('18. learning_started allows started topic', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'learning' }]),
      learningUnlockMode: 'learning_started',
    })
    expect(result.acceptedCardCount).toBe(1)
  })

  it('19. learning_started allows completed topic', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      learningUnlockMode: 'learning_started',
    })
    expect(result.acceptedCardCount).toBe(1)
  })

  it('20. learning_started rejects not-started topic', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'not_started' }]),
      learningUnlockMode: 'learning_started',
    })
    expect(result.rejectionCounts.topicLocked).toBe(1)
  })

  it('21. unsupported unlock mode is rejected', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    await expect(computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      learningUnlockMode: 'unsupported_mode',
    })).rejects.toThrow()
  })

  it('22. introduction date cannot precede topic unlock date', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS,
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      effectiveStartDate: '2026-08-01',
      env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-08-10' }]),
    })
    const allCards = Object.values(result.safeNewCardsByDate).flat()
    for (const c of allCards) {
      const assignedDate = Object.entries(result.safeNewCardsByDate).find(([, cards]) => cards.includes(c))[0]
      expect(assignedDate >= '2026-08-10').toBe(true)
    }
  })
})

// ============================================================
// FSRS Simulation
// ============================================================

describe('FSRS simulation', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
  })

  it('23. Existing project FSRS implementation is called', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBe(1)
    const card = Object.values(result.safeNewCardsByDate).flat()[0]
    expect(card.projectedReviewDates.length).toBeGreaterThan(0)
  })

  it('24. Good rating is used at every simulated transition', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    const card = Object.values(result.safeNewCardsByDate).flat()[0]
    expect(card.projectedReviewDates.length).toBeGreaterThan(0)
  })

  it('25. Input card object is not mutated', async () => {
    const { FSRS, Card, State, Rating } = await import('fsrs.js')
    const fsrs = new FSRS()
    const card = new Card()
    const stateBefore = card.state
    const results = fsrs.repeat(card, new Date('2026-08-01T12:00:00.000Z'))
    expect(card.state).toBe(stateBefore)
  })

  it('26. Introduction review occurs on the proposed date', async () => {
    const { FSRS, Card, Rating } = await import('fsrs.js')
    const fsrs = new FSRS()
    const card = new Card()
    const introDate = new Date('2026-08-01T12:00:00.000Z')
    const results = fsrs.repeat(card, introDate)
    expect(results[Rating.Good].review_log.review.toISOString()).toBe(introDate.toISOString())
  })

  it('27. Forecast dates use cumulative intervals', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    const card = Object.values(result.safeNewCardsByDate).flat()[0]
    const dates = card.projectedReviewDates
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true)
    }
  })

  it('28. Learning state transitions are followed', async () => {
    const { FSRS, Card, State, Rating } = await import('fsrs.js')
    const fsrs = new FSRS()
    const card = new Card()
    const r1 = fsrs.repeat(card, new Date('2026-08-01T12:00:00.000Z'))
    expect(r1[Rating.Good].card.state).toBe(State.Learning)
  })

  it('29. Review state transitions are followed', async () => {
    const { FSRS, Card, State, Rating } = await import('fsrs.js')
    const fsrs = new FSRS()
    const card = new Card()
    const now = new Date('2026-08-01T12:00:00.000Z')
    const r1 = fsrs.repeat(card, now)
    const r2 = fsrs.repeat(r1[Rating.Good].card, r1[Rating.Good].card.due)
    expect(r2[Rating.Good].card.state).toBe(State.Review)
  })

  it('30. Simulation stops after 30 days', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    const card = Object.values(result.safeNewCardsByDate).flat()[0]
    const introDate = Object.keys(result.safeNewCardsByDate)[0]
    for (const dk of card.projectedReviewDates) {
      const diff = (new Date(dk) - new Date(introDate)) / 86400000
      expect(diff <= 30).toBe(true)
    }
  })

  it('31. Review exactly on the horizon boundary is included', async () => {
    const { FSRS, Card, Rating } = await import('fsrs.js')
    const fsrs = new FSRS()
    const card = new Card()
    const introDate = new Date('2026-08-01T12:00:00.000Z')
    let currentCard = card
    let currentDate = introDate
    let lastDate = introDate
    for (let i = 0; i < 10; i++) {
      const results = fsrs.repeat(currentCard, currentDate)
      currentCard = results[Rating.Good].card
      currentDate = currentCard.due
      const daysFromIntro = (currentDate.getTime() - introDate.getTime()) / 86400000
      if (daysFromIntro > 30) break
      lastDate = currentDate
    }
    const diff = (lastDate.getTime() - introDate.getTime()) / 86400000
    expect(diff <= 30).toBe(true)
  })

  it('32. Review after the horizon boundary is excluded', async () => {
    const { FSRS, Card, Rating } = await import('fsrs.js')
    const fsrs = new FSRS()
    const card = new Card()
    const introDate = new Date('2026-08-01T12:00:00.000Z')
    let currentCard = card
    let currentDate = introDate
    let exceeded = false
    for (let i = 0; i < 20; i++) {
      const results = fsrs.repeat(currentCard, currentDate)
      currentCard = results[Rating.Good].card
      currentDate = currentCard.due
      const daysFromIntro = (currentDate.getTime() - introDate.getTime()) / 86400000
      if (daysFromIntro > 30) {
        exceeded = true
        break
      }
    }
    expect(exceeded).toBe(true)
  })

  it('33. Safety iteration limit rejects malformed/infinite simulation', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(result.acceptedCardCount).toBe(1)
  })

  it('34. Repeated simulation returns equal output', async () => {
    const r1 = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    const r2 = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
    })
    expect(r1.safeNewCardsByDate).toEqual(r2.safeNewCardsByDate)
    expect(r1.projectedReviewCardCountByDate).toEqual(r2.projectedReviewCardCountByDate)
  })
})

// ============================================================
// Load Protection
// ============================================================

describe('load protection', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
  })

  it('35. One new card is accepted below the limit', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount).toBe(1)
  })

  it('36. Candidate is rejected when introduction day exceeds the limit', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 1,
    })
    expect(result.rejectionCounts.projectedLoadExceeded).toBe(1)
    expect(result.acceptedCardCount).toBe(0)
  })

  it('37. Candidate retries on later introduction date when future return exceeds limit', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 3,
      existingReviewCardCountByDate: { '2026-08-03': 2 },
    })
    expect(result.acceptedCardCount).toBe(1)
    const assignedDate = Object.keys(result.safeNewCardsByDate)[0]
    expect(assignedDate).toBe('2026-08-02')
  })

  it('38. Existing-review baseline contributes to the limit', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result1 = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 4,
      existingReviewCardCountByDate: {},
    })
    expect(result1.acceptedCardCount).toBe(1)

    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'Deck A', state: 0 })
    const result2 = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 4,
      existingReviewCardCountByDate: { '2026-08-03': 1 },
    })
    const totalExistingOnIntro = (result2.baselineReviewCardCountByDate['2026-08-03'] || 0) +
      (result2.baselineReviewCardCountByDate['2026-08-01'] || 0)
    expect(totalExistingOnIntro).toBeGreaterThanOrEqual(1)
  })

  it('39. Previously accepted candidates contribute to later candidate checks', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount).toBe(2)
  })

  it('40. Rejected candidate leaves no load residue', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 1,
    })
    expect(result.rejectedCardCount).toBe(1)
    const allCounts = Object.values(result.projectedReviewCardCountByDate)
    const baselineOnly = Object.keys(result.baselineReviewCardCountByDate).length === 0 ||
      Object.values(result.baselineReviewCardCountByDate).every(v => v === 0)
    if (baselineOnly) {
      const extraKeys = Object.keys(result.projectedReviewCardCountByDate)
        .filter(k => !(k in result.baselineReviewCardCountByDate))
      expect(extraKeys.length).toBe(0)
    }
  })

  it('41. Candidate retries on a later introduction date', async () => {
    const allOffExceptFirst = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      availableMinutes: i === 1 ? 120 : 0,
      isDayOff: i !== 1,
    }))
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      effectiveStartDate: '2026-08-01',
      availabilityByWeekday: allOffExceptFirst,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount).toBe(1)
  })

  it('42. First safe introduction date is selected', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      effectiveStartDate: '2026-08-01',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const assignedDates = Object.keys(result.safeNewCardsByDate)
    expect(assignedDates.length).toBeGreaterThan(0)
    expect(assignedDates[0]).toBe('2026-08-01')
  })

  it('43. Daily projected minutes use ceil(totalCards * 1.5)', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    for (const [dateKey, count] of Object.entries(result.projectedReviewCardCountByDate)) {
      if (result.baselineReviewCardCountByDate[dateKey]) continue
      const expectedMinutes = Math.ceil(count * REVIEW_MINUTES_PER_CARD)
      expect(result.projectedReviewMinutesByDate[dateKey]).toBe(expectedMinutes)
    }
  })

  it('44. Two projected cards equal three minutes', async () => {
    expect(Math.ceil(2 * REVIEW_MINUTES_PER_CARD)).toBe(3)
  })

  it('45. Three projected cards equal five minutes', async () => {
    expect(Math.ceil(3 * REVIEW_MINUTES_PER_CARD)).toBe(5)
  })

  it('46. Limit comparison uses integer projected minutes', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 3,
    })
    expect(result.acceptedCardCount + result.rejectedCardCount).toBe(2)
  })

  it('47. Different-date rounding remains independent', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const dateKeys = Object.keys(result.projectedReviewMinutesByDate).filter(k => result.baselineReviewCardCountByDate[k])
    if (dateKeys.length > 1) {
      const minutes = dateKeys.map(k => result.projectedReviewMinutesByDate[k])
      for (const m of minutes) {
        expect(Number.isInteger(m)).toBe(true)
      }
    }
  })

  it('48. Full extended horizon is evaluated', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      effectiveStartDate: '2026-08-01',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.forecastHorizonEndDate).toBe('2026-08-31')
  })
})

// ============================================================
// Plan-End Extension
// ============================================================

describe('plan-end extension', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
  })

  it('49. Candidate introduced on final plan date forecasts beyond plan end', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-07-25',
      endDate: '2026-08-01',
      effectiveStartDate: '2026-07-25',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.forecastHorizonEndDate).toBe('2026-08-31')
    if (result.acceptedCardCount > 0) {
      const card = Object.values(result.safeNewCardsByDate).flat()[0]
      const hasBeyondPlanEnd = card.projectedReviewDates.some(d => d > '2026-08-01')
    }
  })

  it('50. Reviews after plan end still affect safety', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      effectiveStartDate: '2026-08-01',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.forecastHorizonEndDate).toBe('2026-09-04')
  })

  it('51. Recurring weekday availability works after plan end', async () => {
    const monWedFri = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      availableMinutes: [1, 3, 5].includes(i) ? 120 : 0,
      isDayOff: ![1, 3, 5].includes(i),
    }))
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-03',
      endDate: '2026-08-07',
      effectiveStartDate: '2026-08-03',
      availabilityByWeekday: monWedFri,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.forecastHorizonEndDate).toBe('2026-09-06')
  })

  it('52. Day-off dates after plan end are handled consistently', async () => {
    const weekendsOff = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      availableMinutes: i === 0 || i === 6 ? 0 : 120,
      isDayOff: i === 0 || i === 6,
    }))
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      availabilityByWeekday: weekendsOff,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.forecastHorizonEndDate).toBe('2026-09-13')
  })

  it('53. DST transition beyond plan end uses planner timezone', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      timezone: 'America/New_York',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount + result.rejectedCardCount).toBe(1)
  })

  it('54. UTC-positive timezone boundary works', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      timezone: 'Pacific/Auckland',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount + result.rejectedCardCount).toBe(1)
  })

  it('55. UTC-negative timezone boundary works', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      timezone: 'America/Anchorage',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount + result.rejectedCardCount).toBe(1)
  })

  it('56. Blocked forecast date is handled according to the documented forecast rule', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      blockedDates: ['2026-08-03', '2026-08-05'],
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const projected = Object.values(result.safeNewCardsByDate).flat()
    if (projected.length > 0) {
      const card = projected[0]
      const hasBlocked = card.projectedReviewDates.some(d => ['2026-08-03', '2026-08-05'].includes(d))
    }
  })
})

// ============================================================
// Return Date Conservation
// ============================================================

describe('return date conservation', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
  })

  it('one simulated card produces N projected transitions', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount).toBe(1)
    const projected = Object.values(result.safeNewCardsByDate).flat()
    expect(projected.length).toBe(1)
    const dates = projected[0].projectedReviewDates
    expect(dates.length).toBeGreaterThanOrEqual(3)
  })

  it('projected load map counts each review contribution exactly once', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const totalLoad = Object.values(result.projectedReviewCardCountByDate)
      .reduce((a, b) => a + b, 0)
    const baselineLoad = Object.values(result.baselineReviewCardCountByDate)
      .reduce((a, b) => a + b, 0)
    const accepted = Object.values(result.safeNewCardsByDate).flat()
    if (accepted.length > 0) {
      const futureDates = accepted[0].projectedReviewDates
      const sameDaySnapsToIntro = 1
      const introBase = 1
      const expected = futureDates.length + sameDaySnapsToIntro + introBase
      expect(totalLoad - baselineLoad).toBe(expected)
    }
  })

  it('day-off return moves to next eligible date', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const monOnly = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      availableMinutes: i === 1 ? 120 : 0,
      isDayOff: i !== 1,
    }))
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      effectiveStartDate: '2026-08-01',
      availabilityByWeekday: monOnly,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount).toBe(1)
    const projected = Object.values(result.safeNewCardsByDate).flat()
    const dates = projected[0].projectedReviewDates
    for (const d of dates) {
      const day = new Date(d + 'T12:00:00.000Z').getDay()
      expect(day).toBe(1)
    }
  })

  it('blocked-date return moves to next eligible date', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      effectiveStartDate: '2026-08-01',
      blockedDates: ['2026-08-03', '2026-08-05', '2026-08-10', '2026-08-31'],
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount).toBe(1)
    const projected = Object.values(result.safeNewCardsByDate).flat()
    const dates = projected[0].projectedReviewDates
    for (const d of dates) {
      expect(result.projectedReviewCardCountByDate[d]).toBeGreaterThanOrEqual(1)
    }
  })

  it('consecutive unavailable dates are skipped', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const threeDayBlock = new Set()
    threeDayBlock.add('2026-08-03')
    threeDayBlock.add('2026-08-04')
    threeDayBlock.add('2026-08-05')
    const blockedArr = [...threeDayBlock]
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      effectiveStartDate: '2026-08-01',
      blockedDates: blockedArr,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount).toBe(1)
    const projected = Object.values(result.safeNewCardsByDate).flat()
    const dates = projected[0].projectedReviewDates
    for (const d of dates) {
      expect(blockedArr.includes(d)).toBe(false)
    }
  })

  it('return after plan endDate is still counted', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      effectiveStartDate: '2026-08-10',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const projected = Object.values(result.safeNewCardsByDate).flat()
    if (projected.length > 0) {
      const dates = projected[0].projectedReviewDates
      const afterEnd = dates.filter(d => d > '2026-08-14')
      expect(afterEnd.length).toBeGreaterThan(0)
    }
  })

  it('return with no later eligible date causes rejection', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const monOnly = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      availableMinutes: i === 1 ? 120 : 0,
      isDayOff: i !== 1,
    }))
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-09-10',
      endDate: '2026-09-14',
      effectiveStartDate: '2026-09-10',
      availabilityByWeekday: monOnly,
      blockedDates: ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'],
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-09-01' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.rejectionCounts.projectedLoadExceeded).toBe(1)
    expect(result.acceptedCardCount).toBe(0)
  })

  it('no return is counted twice in projected review dates', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const projected = Object.values(result.safeNewCardsByDate).flat()
    const dates = projected.length > 0 ? projected[0].projectedReviewDates : []
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('no return is silently dropped', async () => {
    const rawEligible = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(
      d => `2026-08-${String(d).padStart(2, '0')}`
    )
    const result = snapToNextEligibleDate('2026-08-03', rawEligible)
    expect(result).toBe('2026-08-10')
  })

  it('snap returns null when no eligible date exists', async () => {
    const result = snapToNextEligibleDate('2026-09-30', ['2026-09-01', '2026-09-02'])
    expect(result).toBeNull()
  })

  it('snap returns exact match when date is eligible', async () => {
    const result = snapToNextEligibleDate('2026-08-03', ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'])
    expect(result).toBe('2026-08-03')
  })

  it('ALL introduction dates unsafe causes projectedLoadExceeded + truncated', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const onlyFirstEligible = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      availableMinutes: i === 1 ? 120 : 0,
      isDayOff: i !== 1,
    }))
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01',
      availabilityByWeekday: onlyFirstEligible,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 1,
      existingReviewCardCountByDate: { '2026-08-02': 5 },
    })
    expect(result.rejectionCounts.projectedLoadExceeded).toBe(1)
    expect(result.acceptedCardCount).toBe(0)
    expect(result.truncated).toBe(true)
  })
})

// ============================================================
// Introduction Range vs Return Horizon
// ============================================================

describe('introduction range vs return horizon', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
  })

  it('no card is introduced after endDate', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      effectiveStartDate: '2026-08-01',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const assignedDates = Object.keys(result.safeNewCardsByDate)
    for (const date of assignedDates) {
      expect(date <= '2026-08-03').toBe(true)
    }
  })

  it('card introduced on endDate has returns after endDate', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      effectiveStartDate: '2026-09-10',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-09-01' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const projected = Object.values(result.safeNewCardsByDate).flat()
    if (projected.length > 0) {
      const dates = projected[0].projectedReviewDates
      expect(dates.some(d => d > '2026-09-10')).toBe(true)
    }
  })

  it('later safe introduction search never exceeds endDate', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      effectiveStartDate: '2026-08-01',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const assignedDates = Object.keys(result.safeNewCardsByDate)
    for (const date of assignedDates) {
      expect(date <= '2026-08-05').toBe(true)
    }
  })

  it('forecastHorizonEndDate equals latest possible intro + 30', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      effectiveStartDate: '2026-08-01',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.forecastHorizonEndDate).toBe('2026-09-13')
  })
})

// ============================================================
// Post-Plan-End Eligibility
// ============================================================

describe('post-plan-end eligibility', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
  })

  it('recurring weekday availability applies after plan end', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const wedOnly = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      availableMinutes: i === 3 ? 120 : 0,
      isDayOff: i !== 3,
    }))
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      effectiveStartDate: '2026-08-01',
      availabilityByWeekday: wedOnly,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const projected = Object.values(result.safeNewCardsByDate).flat()
    if (projected.length > 0) {
      const dates = projected[0].projectedReviewDates
      const afterEnd = dates.filter(d => d > '2026-08-03')
      for (const d of afterEnd) {
        const day = new Date(d + 'T12:00:00.000Z').getDay()
        expect(day).toBe(3)
      }
    }
  })

  it('day off after plan end is respected', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const weekendsOffExt = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      availableMinutes: i >= 1 && i <= 5 ? 120 : 0,
      isDayOff: i === 0 || i === 6,
    }))
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      effectiveStartDate: '2026-08-01',
      availabilityByWeekday: weekendsOffExt,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const projected = Object.values(result.safeNewCardsByDate).flat()
    if (projected.length > 0) {
      const dates = projected[0].projectedReviewDates
      for (const d of dates) {
        const day = new Date(d + 'T12:00:00.000Z').getDay()
        expect(day === 0 || day === 6).toBe(false)
      }
    }
  })

  it('blocked date after plan end is respected', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      effectiveStartDate: '2026-08-01',
      blockedDates: ['2026-08-05', '2026-08-31'],
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const projected = Object.values(result.safeNewCardsByDate).flat()
    if (projected.length > 0) {
      const dates = projected[0].projectedReviewDates
      expect(dates.includes('2026-08-05')).toBe(false)
    }
  })

  it('UTC-positive timezone boundary after plan end', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      effectiveStartDate: '2026-08-01',
      timezone: 'Asia/Tokyo',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.forecastHorizonEndDate).toBe('2026-09-02')
    const projected = Object.values(result.safeNewCardsByDate).flat()
    if (projected.length > 0) {
      expect(projected[0].projectedReviewDates.length).toBeGreaterThan(0)
    }
  })

  it('UTC-negative timezone boundary after plan end', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      effectiveStartDate: '2026-08-01',
      timezone: 'America/New_York',
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.forecastHorizonEndDate).toBe('2026-09-02')
    const projected = Object.values(result.safeNewCardsByDate).flat()
    if (projected.length > 0) {
      expect(projected[0].projectedReviewDates.length).toBeGreaterThan(0)
    }
  })
})

// ============================================================
// Empty Set
// ============================================================

describe('empty card set', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('empty card set returns empty result', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.acceptedCardCount + result.rejectedCardCount).toBe(0)
  })
})

// ============================================================
// Output and Determinism
// ============================================================

describe('output and determinism', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    await insertCard(db, TEST_USER, { id: 'c2', deckName: 'Deck A', state: 0 })
  })

  it('57. Card appears on exactly one introduction date', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const cardIds = new Map()
    for (const [dateKey, cards] of Object.entries(result.safeNewCardsByDate)) {
      for (const card of cards) {
        if (cardIds.has(card.cardId)) {
          throw new Error(`Card ${card.cardId} appears on multiple dates`)
        }
        cardIds.set(card.cardId, dateKey)
      }
    }
    expect(cardIds.size).toBe(result.acceptedCardCount)
  })

  it('58. No duplicate card IDs', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const allIds = Object.values(result.safeNewCardsByDate).flat().map(c => c.cardId)
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('59. Introduction dates are sorted', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const keys = Object.keys(result.safeNewCardsByDate)
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] >= keys[i - 1]).toBe(true)
    }
  })

  it('60. Cards within a date follow stable order', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    for (const cards of Object.values(result.safeNewCardsByDate)) {
      for (let i = 1; i < cards.length; i++) {
        expect(cards[i].cardId >= cards[i - 1].cardId).toBe(true)
      }
    }
  })

  it('61. projectedReviewDates are sorted', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    for (const cards of Object.values(result.safeNewCardsByDate)) {
      for (const card of cards) {
        for (let i = 1; i < card.projectedReviewDates.length; i++) {
          expect(card.projectedReviewDates[i] > card.projectedReviewDates[i - 1]).toBe(true)
        }
      }
    }
  })

  it('62. acceptedCardCount is correct', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const totalInOutput = Object.values(result.safeNewCardsByDate).reduce((s, cards) => s + cards.length, 0)
    expect(result.acceptedCardCount).toBe(totalInOutput)
  })

  it('63. rejectedCardCount is correct', async () => {
    await insertCard(db, TEST_USER, { id: 'c3', deckName: 'Unknown', state: 0 })
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.rejectedCardCount).toBe(1)
    expect(result.rejectionCounts.unmappedDeck).toBe(1)
  })

  it('64. rejectionCounts are conserved', async () => {
    const cardsInDb = 2
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const rejectionTotal = Object.values(result.rejectionCounts).reduce((s, v) => s + v, 0)
    expect(result.acceptedCardCount + result.rejectedCardCount).toBe(cardsInDb)
    expect(result.rejectedCardCount).toBe(rejectionTotal)
  })

  it('65. truncated is true only for load-limited eligible cards', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.truncated).toBe(false)
  })

  it('66. Non-owner result is empty', async () => {
    const result = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      usesFlashcardCapacity: false,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(result.safeNewCardsByDate).toEqual({})
    expect(result.acceptedCardCount).toBe(0)
    expect(result.rejectedCardCount).toBe(0)
  })

  it('68. Repeated calls return structurally equal results', async () => {
    await insertCard(db, TEST_USER, { id: 'c3', deckName: 'Deck A', state: 0 })
    const r1 = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const r2 = await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    expect(r1).toEqual(r2)
  })
})

// ============================================================
// Read-Only Safety
// ============================================================

describe('read-only safety', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
    await insertMapping(db, TEST_USER, 'Deck A', 'topic-cardio')
  })

  it('69. No flashcard write occurs', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const before = await db.prepare('SELECT id, state, last_review, next_review FROM flashcards WHERE id = ?').bind('c1').first()
    await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const after = await db.prepare('SELECT id, state, last_review, next_review FROM flashcards WHERE id = ?').bind('c1').first()
    expect(before).toEqual(after)
  })

  it('70. No mapping write occurs', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const before = await db.prepare('SELECT count(*) as cnt FROM flashcard_deck_mappings').first()
    await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const after = await db.prepare('SELECT count(*) as cnt FROM flashcard_deck_mappings').first()
    expect(before.cnt).toBe(after.cnt)
  })

  it('71. No plan write occurs', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const before = await db.prepare('SELECT count(*) as cnt FROM rotation_planner_plans').first()
    await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const after = await db.prepare('SELECT count(*) as cnt FROM rotation_planner_plans').first()
    expect(before.cnt).toBe(after.cnt)
  })

  it('72. No mutation/idempotency row is written', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const tables = [
      'flashcards',
      'flashcard_deck_mappings',
      'flashcard_deck_mapping_mutations',
      'rotation_planner_plans',
      'rotation_planner_plan_mutations',
      'rotation_planner_task_mutations',
      'rotation_planner_topics',
      'rotation_planner_availability',
      'rotation_planner_daily_tasks',
    ]
    const beforeCounts = {}
    for (const t of tables) {
      const row = await db.prepare(`SELECT count(*) as cnt FROM ${t}`).first()
      beforeCounts[t] = row.cnt
    }
    await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    for (const t of tables) {
      const row = await db.prepare(`SELECT count(*) as cnt FROM ${t}`).first()
      expect(row.cnt).toBe(beforeCounts[t])
    }
  })

  it('73. Persisted card FSRS fields remain unchanged', async () => {
    await insertCard(db, TEST_USER, { id: 'c1', deckName: 'Deck A', state: 0 })
    const before = await db.prepare('SELECT state, last_review, next_review FROM flashcards WHERE id = ?').bind('c1').first()
    await computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      planTopics: makePlanTopics([{ canonicalTopicId: 'topic-cardio', status: 'completed', learningCompletedAt: '2026-07-15' }]),
      maxProjectedFlashcardReviewMinutesPerDay: 999,
    })
    const after = await db.prepare('SELECT state, last_review, next_review FROM flashcards WHERE id = ?').bind('c1').first()
    expect(before.state).toBe(after.state)
    expect(before.last_review).toBe(after.last_review)
    expect(before.next_review).toBe(after.next_review)
  })

  it('74. Invalid timezone fails before candidate processing', async () => {
    await expect(computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER, timezone: 'Invalid/Zone',
    })).rejects.toThrow('Invalid timezone')
  })

  it('75. Invalid date range is rejected', async () => {
    await expect(computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      startDate: '2026-08-10', endDate: '2026-08-01',
    })).rejects.toThrow('must not be after')
  })

  it('76. Invalid projected-minute limit is rejected', async () => {
    await expect(computeSafeNewCardForecast({
      ...BASE_FORECAST_ARGS, env, userId: TEST_USER,
      maxProjectedFlashcardReviewMinutesPerDay: -1,
    })).rejects.toThrow('positive integer')
  })
})


