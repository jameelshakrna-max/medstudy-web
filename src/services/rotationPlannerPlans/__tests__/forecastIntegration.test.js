import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb } from '../../../__tests__/helpers/d1TestHarness.js'
import { parseAndValidatePlanRequest } from '../requestValidation.js'
import { computeExistingReviewBaseline, createEmptyFlashcardForecast } from '../forecastIntegration.js'
import { calculateScheduleFingerprint, calculateRequestFingerprint } from '../idempotency.js'
import { signalFlashcardMappingsStaleness, EXISTING_REVIEW_IMPACT, FORECAST_ONLY_IMPACT, NO_SCHEDULING_IMPACT } from '../../flashcardMappings.js'
import { persistPlanBatch, persistRecalculationBatch } from '../persistence.js'
import { generatePlanPreview } from '../previewPipeline.js'
import { getFlashcardCapacityOwner } from '../ownership.js'

function makeRequest(overrides = {}) {
  return {
    headers: {
      get: (name) => overrides.headers?.[name] ?? null,
      ...overrides.headers,
    },
  }
}

const VALID_BODY = {
  sourceId: 'step-up-medicine-6e-2024',
  rotationId: 'cardiology',
  startDate: '2026-08-01',
  endDate: '2026-08-14',
  studyStyle: 'active',
  schedulingMode: 'efficient',
  questionStartRule: 'next_available_day',
  availability: Array.from({ length: 7 }, (_, i) => ({
    weekday: i, availableMinutes: 120, isDayOff: false,
  })),
  topics: [{
    normalizedTopicId: 'step-up-medicine-6e-2024::cardiology::ascvd',
    uworldRemainingQuestions: 20,
    alreadyCompletedLearningPercentage: 0,
    alreadyCompletedQuestionCount: 0,
  }],
}

// ============================================================
// Request Validation — flashcardSettings
// ============================================================

describe('flashcardSettings validation', () => {
  it('defaults to learning_completed and null limit when not provided', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, VALID_BODY, {})
    expect(result.valid).toBe(true)
    expect(result.parsed.flashcardSettings).toEqual({
      learningUnlockMode: 'learning_completed',
      maxProjectedFlashcardReviewMinutesPerDay: null,
    })
  })

  it('accepts explicit flashcardSettings with learning_started mode', () => {
    const req = makeRequest()
    const body = {
      ...VALID_BODY,
      flashcardSettings: { learningUnlockMode: 'learning_started', maxProjectedFlashcardReviewMinutesPerDay: 60 },
    }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(true)
    expect(result.parsed.flashcardSettings).toEqual({
      learningUnlockMode: 'learning_started',
      maxProjectedFlashcardReviewMinutesPerDay: 60,
    })
  })

  it('accepts null maxProjectedFlashcardReviewMinutesPerDay explicitly', () => {
    const req = makeRequest()
    const body = {
      ...VALID_BODY,
      flashcardSettings: { maxProjectedFlashcardReviewMinutesPerDay: null },
    }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(true)
    expect(result.parsed.flashcardSettings.maxProjectedFlashcardReviewMinutesPerDay).toBeNull()
  })

  it('rejects invalid learningUnlockMode', () => {
    const req = makeRequest()
    const body = {
      ...VALID_BODY,
      flashcardSettings: { learningUnlockMode: 'invalid_mode' },
    }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'flashcardSettings.learningUnlockMode')).toBe(true)
  })

  it('rejects zero maxProjectedFlashcardReviewMinutesPerDay', () => {
    const req = makeRequest()
    const body = {
      ...VALID_BODY,
      flashcardSettings: { maxProjectedFlashcardReviewMinutesPerDay: 0 },
    }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'flashcardSettings.maxProjectedFlashcardReviewMinutesPerDay')).toBe(true)
  })

  it('rejects negative maxProjectedFlashcardReviewMinutesPerDay', () => {
    const req = makeRequest()
    const body = {
      ...VALID_BODY,
      flashcardSettings: { maxProjectedFlashcardReviewMinutesPerDay: -1 },
    }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
  })

  it('rejects fractional maxProjectedFlashcardReviewMinutesPerDay', () => {
    const req = makeRequest()
    const body = {
      ...VALID_BODY,
      flashcardSettings: { maxProjectedFlashcardReviewMinutesPerDay: 5.5 },
    }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
  })

  it('rejects string maxProjectedFlashcardReviewMinutesPerDay', () => {
    const req = makeRequest()
    const body = {
      ...VALID_BODY,
      flashcardSettings: { maxProjectedFlashcardReviewMinutesPerDay: '60' },
    }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
  })

  it('rejects maxProjectedFlashcardReviewMinutesPerDay above limit', () => {
    const req = makeRequest()
    const body = {
      ...VALID_BODY,
      flashcardSettings: { maxProjectedFlashcardReviewMinutesPerDay: 999999 },
    }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
  })

  it('rejects non-object flashcardSettings', () => {
    const req = makeRequest()
    const body = { ...VALID_BODY, flashcardSettings: 'string' }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'flashcardSettings')).toBe(true)
  })

  it('rejects array flashcardSettings', () => {
    const req = makeRequest()
    const body = { ...VALID_BODY, flashcardSettings: [] }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'flashcardSettings')).toBe(true)
  })
})

// ============================================================
// computeExistingReviewBaseline
// ============================================================

describe('computeExistingReviewBaseline', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = { DB: db }
    // Insert review cards with next_review within horizon
    await db.prepare(
      `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind('c1', 'user-1', 'Deck A', 2, '2026-07-20T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-07-01T00:00:00.000Z').run()

    await db.prepare(
      `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind('c2', 'user-1', 'Deck A', 2, '2026-07-21T00:00:00.000Z', '2026-08-05T00:00:00.000Z', '2026-07-01T00:00:00.000Z').run()

    // Card outside horizon — should not be included
    await db.prepare(
      `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind('c3', 'user-1', 'Deck A', 2, '2026-07-22T00:00:00.000Z', '2026-09-20T00:00:00.000Z', '2026-07-01T00:00:00.000Z').run()

    // Card with state=0 and no last_review — not a review card
    await db.prepare(
      `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind('c4', 'user-1', 'Deck A', 0, null, null, '2026-07-01T00:00:00.000Z').run()
  })

  it('returns existing review cards within the forecast horizon', async () => {
    const result = await computeExistingReviewBaseline({
      env,
      userId: 'user-1',
      forecastHorizonEndDate: '2026-08-14',
      effectiveStartDate: '2026-08-01',
      timezone: 'UTC',
      availabilityByWeekday: Array.from({ length: 7 }, (_, i) => ({
        weekday: i, availableMinutes: 120, isDayOff: false,
      })),
      blockedDates: [],
    })
    // c1 -> 2026-08-03, c2 -> 2026-08-05
    expect(result['2026-08-03']).toBe(1)
    expect(result['2026-08-05']).toBe(1)
    expect(Object.keys(result).length).toBe(2)
  })

  it('returns empty object when no review cards within horizon', async () => {
    const result = await computeExistingReviewBaseline({
      env,
      userId: 'user-1',
      forecastHorizonEndDate: '2026-07-01',
      effectiveStartDate: '2026-07-01',
      timezone: 'UTC',
      availabilityByWeekday: Array.from({ length: 7 }, (_, i) => ({
        weekday: i, availableMinutes: 120, isDayOff: false,
      })),
      blockedDates: [],
    })
    expect(result).toEqual({})
  })

  it('snaps dates forward when effectiveStartDate is after next_review', async () => {
    const result = await computeExistingReviewBaseline({
      env,
      userId: 'user-1',
      forecastHorizonEndDate: '2026-08-14',
      effectiveStartDate: '2026-08-04',
      timezone: 'UTC',
      availabilityByWeekday: Array.from({ length: 7 }, (_, i) => ({
        weekday: i, availableMinutes: 120, isDayOff: false,
      })),
      blockedDates: [],
    })
    // c1 (2026-08-03) snaps forward to 2026-08-04
    // c2 (2026-08-05) stays
    expect(result['2026-08-04']).toBe(1)
    expect(result['2026-08-05']).toBe(1)
  })
})

// ============================================================
// Fingerprint includes flashcardSettings
// ============================================================

describe('fingerprint forecast settings', () => {
  it('schedule fingerprint differs when flashcardSettings change', async () => {
    const base = {
      userId: 'user-1',
      sourceId: 'step-up-medicine-6e-2024',
      sourceVersion: '1.0.0',
      rotationId: 'cardio',
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      examDate: null,
      studyStyle: 'active',
      schedulingMode: 'focused',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
      blockedDates: [],
      topics: [{ normalizedTopicId: 'a', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }],
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      dueReviewMinutesByDate: {},
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: null },
    }

    const fp1 = await calculateScheduleFingerprint('user-1', base)

    const fp2 = await calculateScheduleFingerprint('user-1', {
      ...base,
      flashcardSettings: { learningUnlockMode: 'learning_started', maxProjectedFlashcardReviewMinutesPerDay: null },
    })

    const fp3 = await calculateScheduleFingerprint('user-1', {
      ...base,
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })

    expect(fp1).not.toBe(fp2)
    expect(fp1).not.toBe(fp3)
    expect(fp2).not.toBe(fp3)
  })

  it('request fingerprint differs when flashcardSettings change', async () => {
    const base = {
      userId: 'user-1',
      sourceId: 'step-up-medicine-6e-2024',
      sourceVersion: '1.0.0',
      rotationId: 'cardio',
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      examDate: null,
      studyStyle: 'active',
      schedulingMode: 'focused',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
      blockedDates: [],
      topics: [{ normalizedTopicId: 'a', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }],
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      dueReviewMinutesByDate: {},
      acceptOverload: false,
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: null },
    }

    const fp1 = await calculateRequestFingerprint('user-1', base)

    const fp2 = await calculateRequestFingerprint('user-1', {
      ...base,
      flashcardSettings: { learningUnlockMode: 'learning_started', maxProjectedFlashcardReviewMinutesPerDay: null },
    })

    const fp3 = await calculateRequestFingerprint('user-1', {
      ...base,
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: 30 },
    })

    expect(fp1).not.toBe(fp2)
    expect(fp1).not.toBe(fp3)
    expect(fp2).not.toBe(fp3)
  })
})

// ============================================================
// Staleness signal
// ============================================================

describe('signalFlashcardMappingsStaleness — mutation classification', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = { DB: db }
  })

  async function insertOwnerPlan(planId, userId, forecastLimit) {
    const settings = {
      forecastSettings: {
        learningUnlockMode: 'learning_completed',
        maxProjectedFlashcardReviewMinutesPerDay: forecastLimit,
      },
    }
    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, uses_flashcard_capacity, client_request_id, request_fingerprint, settings_json, created_at, updated_at)
       VALUES (?, ?, 'rot-1', 'src-1', '2026-08-01', '2026-08-14', 'active', 1, 'test', 'fp', ?, datetime('now'), datetime('now'))`
    ).bind(planId, userId, JSON.stringify(settings)).run()
  }

  it('sets stale_at when forecasting is enabled', async () => {
    await insertOwnerPlan('plan-1', 'user-1', 60)
    await signalFlashcardMappingsStaleness(env, 'user-1')
    const plan = await db.prepare('SELECT stale_at FROM rotation_planner_plans WHERE id = ?').bind('plan-1').first()
    expect(plan.stale_at).toBeTruthy()
  })

  it('sets stale_at regardless of forecast limit (mapping POST/DELETE always signals)', async () => {
    await insertOwnerPlan('plan-1', 'user-1', null)
    await signalFlashcardMappingsStaleness(env, 'user-1')
    const plan = await db.prepare('SELECT stale_at FROM rotation_planner_plans WHERE id = ?').bind('plan-1').first()
    expect(plan.stale_at).toBeTruthy()
  })

  it('sets stale_at even without forecastSettings (existing-review impact always signals)', async () => {
    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, uses_flashcard_capacity, client_request_id, request_fingerprint, settings_json, created_at, updated_at)
       VALUES (?, ?, 'rot-1', 'src-1', '2026-08-01', '2026-08-14', 'active', 1, 'test', 'fp', '{}', datetime('now'), datetime('now'))`
    ).bind('plan-1', 'user-1').run()
    await signalFlashcardMappingsStaleness(env, 'user-1')
    const plan = await db.prepare('SELECT stale_at FROM rotation_planner_plans WHERE id = ?').bind('plan-1').first()
    expect(plan.stale_at).toBeTruthy()
  })

  it('does NOT set stale_at when no owner exists', async () => {
    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, uses_flashcard_capacity, client_request_id, request_fingerprint, settings_json, created_at, updated_at)
       VALUES (?, ?, 'rot-1', 'src-1', '2026-08-01', '2026-08-14', 'active', 0, 'test', 'fp', '{}', datetime('now'), datetime('now'))`
    ).bind('plan-2', 'user-2').run()
    await signalFlashcardMappingsStaleness(env, 'user-2')
    const plan = await db.prepare('SELECT stale_at FROM rotation_planner_plans WHERE id = ?').bind('plan-2').first()
    expect(plan.stale_at).toBeNull()
  })

  it('sets stale_at when limit is valid positive integer', async () => {
    await insertOwnerPlan('plan-1', 'user-1', 30)
    await signalFlashcardMappingsStaleness(env, 'user-1')
    const plan = await db.prepare('SELECT stale_at FROM rotation_planner_plans WHERE id = ?').bind('plan-1').first()
    expect(plan.stale_at).toBeTruthy()
  })
})

// ============================================================
// Canonical Empty Forecast Shape
// ============================================================

describe('createEmptyFlashcardForecast', () => {
  it('returns the complete Phase 6 empty shape with zeroed rejection keys', () => {
    const result = createEmptyFlashcardForecast()
    expect(result).toEqual({
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
    })
  })

  it('rejectionCounts keys match Phase 6 computeSafeNewCardForecast keys', () => {
    const empty = createEmptyFlashcardForecast()
    const keys = Object.keys(empty.rejectionCounts).sort()
    expect(keys).toEqual([
      'invalidCardState',
      'noEligibleIntroductionDate',
      'projectedLoadExceeded',
      'topicAbsentFromPlan',
      'topicLocked',
      'unmappedDeck',
    ])
  })
})

// ============================================================
// Preview Response Contract (via generatePlanPreview)
// ============================================================

describe('preview response contract', () => {
  function makeValidatedInput(overrides = {}) {
    return {
      sourceId: 'step-up-medicine-6e-2024',
      rotationId: 'cardiology',
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      examDate: null,
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
      blockedDates: [],
      topics: [{
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology::ascvd',
        uworldRemainingQuestions: 20,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
      }],
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: null },
      ...overrides,
    }
  }

  function makeResolvedTopics(validatedInput) {
    return validatedInput.topics.map((t, i) => ({
      normalizedTopicId: t.normalizedTopicId,
      canonicalTopicId: t.normalizedTopicId.split('::')[1],
      sourceTopicId: t.normalizedTopicId.split('::')[1],
      sourceId: validatedInput.sourceId,
      title: `Topic ${i}`,
      groupId: `group-${i}`,
      learningMinutes: { focused: 50, activeLow: 30, activeExpected: 45, activeHigh: 60, detailedNotes: 90 },
      uworldRemainingQuestions: t.uworldRemainingQuestions,
      alreadyCompletedLearningPercentage: t.alreadyCompletedLearningPercentage / 100,
      alreadyCompletedQuestionCount: t.alreadyCompletedQuestionCount,
    }))
  }

  it('no top-level flashcardForecast field in preview response', async () => {
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const result = generatePlanPreview(resolved, input)
    expect(result).not.toHaveProperty('flashcardForecast')
    expect(result).not.toHaveProperty('previewSettings')
  })

  it('preview returns tasks, topicStates, unscheduledWork, feasibility', () => {
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const result = generatePlanPreview(resolved, input)
    expect(result).toHaveProperty('preview')
    expect(result.preview).toHaveProperty('tasks')
    expect(result.preview).toHaveProperty('topicStates')
    expect(result.preview).toHaveProperty('unscheduledWork')
    expect(result.preview).toHaveProperty('feasibility')
  })
})

// ============================================================
// No Schedule Effect
// ============================================================

describe('no schedule effect — forecast does not alter schedule output', () => {
  function makeValidatedInput(overrides = {}) {
    return {
      sourceId: 'step-up-medicine-6e-2024',
      rotationId: 'cardiology',
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      examDate: null,
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
      blockedDates: [],
      topics: [{
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology::ascvd',
        uworldRemainingQuestions: 20,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
      }],
      ...overrides,
    }
  }

  function makeResolvedTopics(validatedInput) {
    return validatedInput.topics.map((t, i) => ({
      normalizedTopicId: t.normalizedTopicId,
      canonicalTopicId: t.normalizedTopicId.split('::')[1],
      sourceTopicId: t.normalizedTopicId.split('::')[1],
      sourceId: validatedInput.sourceId,
      title: `Topic ${i}`,
      groupId: `group-${i}`,
      learningMinutes: { focused: 50, activeLow: 30, activeExpected: 45, activeHigh: 60, detailedNotes: 90 },
      uworldRemainingQuestions: t.uworldRemainingQuestions,
      alreadyCompletedLearningPercentage: t.alreadyCompletedLearningPercentage / 100,
      alreadyCompletedQuestionCount: t.alreadyCompletedQuestionCount,
    }))
  }

  function normalizeTasks(tasks) {
    return tasks.map(t => ({
      taskType: t.taskType,
      estimatedMinutes: t.estimatedMinutes,
      targetCount: t.targetCount,
      taskDate: t.taskDate,
    }))
  }

  it('preview scheduling output is identical regardless of flashcardSettings', () => {
    const inputDisabled = makeValidatedInput({ flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: null } })
    const inputEnabled = makeValidatedInput({ flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: 1440 } })
    const resolved = makeResolvedTopics(inputDisabled)

    const resultA = generatePlanPreview(resolved, inputDisabled)
    const resultB = generatePlanPreview(resolved, inputEnabled)

    expect(resultA.preview.tasks.length).toBe(resultB.preview.tasks.length)
    expect(normalizeTasks(resultA.preview.tasks)).toEqual(normalizeTasks(resultB.preview.tasks))
    expect(resultA.preview.feasibility).toEqual(resultB.preview.feasibility)
    expect(resultA.preview.topicStates).toEqual(resultB.preview.topicStates)
    expect(resultA.preview.unscheduledWork).toEqual(resultB.preview.unscheduledWork)
  })
})

// ============================================================
// Ownership Retry — Settings Preservation
// ============================================================

describe('ownership retry preserves forecastSettings', () => {
  let db, env, USER

  beforeEach(async () => {
    db = await createTestDb()
    env = { DB: db }
    USER = { sub: 'user-retryn', email: 'retryn@test.local', role: 'authenticated' }
  })

  function makeValidatedInput(overrides = {}) {
    return {
      sourceId: 'step-up-medicine-6e-2024',
      rotationId: 'cardiology',
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      examDate: null,
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
      blockedDates: [],
      topics: [{
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology::ascvd',
        uworldRemainingQuestions: 20,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
        incorrectQuestionsRemaining: 0,
      }],
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      dueReviewMinutesByDate: {},
      topicBreakdownByDate: {},
      acceptOverload: false,
      flashcardSettings: {
        learningUnlockMode: 'learning_started',
        maxProjectedFlashcardReviewMinutesPerDay: 45,
      },
      ...overrides,
    }
  }

  function makeResolvedTopics(validatedInput) {
    return validatedInput.topics.map((t, i) => ({
      normalizedTopicId: t.normalizedTopicId,
      canonicalTopicId: t.normalizedTopicId.split('::')[1],
      sourceTopicId: t.normalizedTopicId.split('::')[1],
      sourceId: validatedInput.sourceId,
      title: `Topic ${i}`,
      groupId: `group-${i}`,
      learningMinutes: { focused: 50, activeLow: 30, activeExpected: 45, activeHigh: 60, detailedNotes: 90 },
      uworldRemainingQuestions: t.uworldRemainingQuestions,
      alreadyCompletedLearningPercentage: t.alreadyCompletedLearningPercentage / 100,
      alreadyCompletedQuestionCount: t.alreadyCompletedQuestionCount,
      incorrectQuestionsRemaining: t.incorrectQuestionsRemaining ?? 0,
    }))
  }

  it('retry preserves requested forecastSettings when ownership race is lost', async () => {
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const { preview } = generatePlanPreview(resolved, input)
    const emptyForecast = createEmptyFlashcardForecast()

    const originalBatch = env.DB.batch.bind(env.DB)
    let callCount = 0
    env.DB.batch = async (statements) => {
      callCount++
      if (callCount === 1) throw new Error('UNIQUE constraint failed: idx_rpp_flashcard_owner')
      return originalBatch(statements)
    }

    const { planId } = await persistPlanBatch(
      env, USER.sub, input, resolved, preview,
      'retry-settings-' + Date.now(), 'fp-retry-' + Date.now(),
    )

    const plan = await db.prepare(
      'SELECT uses_flashcard_capacity, settings_json FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()
    const settings = JSON.parse(plan.settings_json)

    expect(plan.uses_flashcard_capacity).toBe(0)
    expect(settings.forecastSettings).toEqual({
      learningUnlockMode: 'learning_started',
      maxProjectedFlashcardReviewMinutesPerDay: 45,
    })
    expect(settings.forecast).toEqual(emptyForecast)
  })
})

// ============================================================
// Recalculation Forecast Failure — Atomic Abort (via persistRecalculationBatch)
// ============================================================

describe('recalculation forecast failure atomicity', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = { DB: db }
  })

  async function insertPlan(planId, userId, settings = {}) {
    const settingsJson = JSON.stringify(settings)
    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, uses_flashcard_capacity, client_request_id, request_fingerprint, settings_json, revision, created_at, updated_at)
       VALUES (?, ?, 'rot-1', 'src-1', '2026-08-01', '2026-08-14', 'active', 1, 'test-fc', 'fp', ?, 1, datetime('now'), datetime('now'))`
    ).bind(planId, userId, settingsJson).run()
  }

  it('persistRecalculationBatch rethrows forecast-related errors', async () => {
    await insertPlan('plan-recalc-1', 'user-recalc-1', {
      timezone: 'UTC',
      blockedDates: [],
      forecastSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })

    const baseArgs = {
      planId: 'plan-recalc-1',
      userId: 'user-recalc-1',
      expectedRevision: 1,
      clientRequestId: 'recalc-fail-1',
      requestFingerprint: 'fp-recalc-1',
      operation: 'recalculate',
      regeneratedTasks: [],
      updatedTopics: [],
      resultJson: {},
      recalculationMutationId: 'mut-1',
      recalculatedAt: new Date().toISOString(),
      recalculationDate: '2026-08-05',
      workloadSnapshot: {},
      forecastSnapshot: { safeNewCardsByDate: null },
    }

    // forecastSnapshot with null should not trigger exception — that's not the right way to test
    // Instead, mock DB to fail during json_set write of forecast
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('Forecast write failed'))
    await expect(persistRecalculationBatch(env, baseArgs)).rejects.toThrow('Forecast write failed')

    const plan = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind('plan-recalc-1').first()
    expect(plan.revision).toBe(1)

    vi.restoreAllMocks()
  })
})

// ============================================================
// Impact-Aware Staleness — Mutation Classification
// ============================================================

describe('impact-aware staleness', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = { DB: db }
  })

  async function insertOwnerPlan(planId, userId, settings = {}) {
    const settingsJson = JSON.stringify(settings)
    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, uses_flashcard_capacity, client_request_id, request_fingerprint, settings_json, created_at, updated_at)
       VALUES (?, ?, 'rot-1', 'src-1', '2026-08-01', '2026-08-14', 'active', 1, 'test', 'fp', ?, datetime('now'), datetime('now'))`
    ).bind(planId, userId, settingsJson).run()
  }

  function requireOwner(env, userId) {
    return getFlashcardCapacityOwner(env, userId).then(o => expect(o).toBeTruthy())
  }

  function assertStaleAt(env, planId) {
    return db.prepare('SELECT stale_at FROM rotation_planner_plans WHERE id = ?')
      .bind(planId).first()
      .then(plan => expect(plan.stale_at).toBeTruthy())
  }

  function assertNoStaleAt(env, planId) {
    return db.prepare('SELECT stale_at FROM rotation_planner_plans WHERE id = ?')
      .bind(planId).first()
      .then(plan => expect(plan.stale_at).toBeNull())
  }

  // 1. Mapping change signals with forecasting disabled
  it('mapping change (EXISTING_REVIEW_IMPACT) signals with forecasting disabled', async () => {
    await insertOwnerPlan('plan-s1', 'user-s1', {})
    await requireOwner(env, 'user-s1')
    await signalFlashcardMappingsStaleness(env, 'user-s1', EXISTING_REVIEW_IMPACT)
    await assertStaleAt(env, 'plan-s1')
  })

  // 2. Review/rating signals with forecasting disabled
  it('review/rating (EXISTING_REVIEW_IMPACT) signals with forecasting disabled', async () => {
    await insertOwnerPlan('plan-s2', 'user-s2', {})
    await requireOwner(env, 'user-s2')
    await signalFlashcardMappingsStaleness(env, 'user-s2', EXISTING_REVIEW_IMPACT)
    await assertStaleAt(env, 'plan-s2')
  })

  // 3. Introduced-card deletion signals with forecasting disabled
  it('introduced-card deletion (EXISTING_REVIEW_IMPACT) signals with forecasting disabled', async () => {
    await insertOwnerPlan('plan-s3', 'user-s3', {})
    await requireOwner(env, 'user-s3')
    await signalFlashcardMappingsStaleness(env, 'user-s3', EXISTING_REVIEW_IMPACT)
    await assertStaleAt(env, 'plan-s3')
  })

  // 4. New state=0 card signals when forecasting enabled
  it('new state=0 card (FORECAST_ONLY_IMPACT) signals when forecasting enabled', async () => {
    await insertOwnerPlan('plan-s4', 'user-s4', {
      forecastSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })
    await requireOwner(env, 'user-s4')
    await signalFlashcardMappingsStaleness(env, 'user-s4', FORECAST_ONLY_IMPACT)
    await assertStaleAt(env, 'plan-s4')
  })

  // 5. New state=0 card does not signal when forecasting disabled
  it('new state=0 card (FORECAST_ONLY_IMPACT) does NOT signal when forecasting disabled', async () => {
    await insertOwnerPlan('plan-s5', 'user-s5', {})
    await requireOwner(env, 'user-s5')
    await signalFlashcardMappingsStaleness(env, 'user-s5', FORECAST_ONLY_IMPACT)
    await assertNoStaleAt(env, 'plan-s5')
  })

  // 6. Content-only edit does not signal
  it('content-only edit (NO_SCHEDULING_IMPACT) does NOT signal', async () => {
    await insertOwnerPlan('plan-s6', 'user-s6', {
      forecastSettings: { maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })
    await requireOwner(env, 'user-s6')
    await signalFlashcardMappingsStaleness(env, 'user-s6', NO_SCHEDULING_IMPACT)
    await assertNoStaleAt(env, 'plan-s6')
  })

  // 7. Deck change signals
  it('deck change (EXISTING_REVIEW_IMPACT) signals with forecasting disabled', async () => {
    await insertOwnerPlan('plan-s7', 'user-s7', {})
    await requireOwner(env, 'user-s7')
    await signalFlashcardMappingsStaleness(env, 'user-s7', EXISTING_REVIEW_IMPACT)
    await assertStaleAt(env, 'plan-s7')
  })

  // 8. Another user's owner does not signal
  it('another user owner does NOT signal', async () => {
    await insertOwnerPlan('plan-s8a', 'user-s8a', {
      forecastSettings: { maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })
    await requireOwner(env, 'user-s8a')
    // signal as user-s8b (no plan owned by user-s8b)
    await expect(
      getFlashcardCapacityOwner(env, 'user-s8b')
    ).resolves.toBeFalsy()
    await signalFlashcardMappingsStaleness(env, 'user-s8b', EXISTING_REVIEW_IMPACT)
    // user-s8a's plan should not be affected
    await assertNoStaleAt(env, 'plan-s8a')
  })
})
