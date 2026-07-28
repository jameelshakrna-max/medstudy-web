import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../../__tests__/helpers/d1TestHarness.js'
import { persistPlanBatch, loadPlanFromDb, loadPlanSummaries, updatePlanStatus } from '../persistence.js'
import { getActiveFlashcardCapacityOwner } from '../ownership.js'
import { mapPlanDto, mapPlanSummaryDto } from '../dtoMappers.js'

const VALID_SOURCE_ID = 'step-up-medicine-6e-2024'
const VALID_ROTATION_ID = 'cardiology'

function makeValidatedInput(overrides = {}) {
  return {
    sourceId: VALID_SOURCE_ID,
    rotationId: VALID_ROTATION_ID,
    startDate: '2026-01-05',
    endDate: '2026-01-11',
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
    topics: [
      {
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
        uworldRemainingQuestions: 20,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
        incorrectQuestionsRemaining: 0,
      },
    ],
    personalSourcePaceMultiplier: 1.0,
    examReviewWindowDays: 0,
    mixedReviewQuestionsPerDay: 0,
    dueReviewMinutesByDate: {},
    acceptOverload: false,
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
    pageRange: null,
    confidence: 'good',
    questionSource: 'uworld',
    sharedTopicKey: null,
    prerequisiteTopicIds: [],
    uworldRemainingQuestions: t.uworldRemainingQuestions,
    alreadyCompletedLearningPercentage: t.alreadyCompletedLearningPercentage / 100,
    alreadyCompletedQuestionCount: t.alreadyCompletedQuestionCount,
    incorrectQuestionsRemaining: t.incorrectQuestionsRemaining ?? 0,
  }))
}

function makePreview(resolvedTopics) {
  const tasks = resolvedTopics.map(topic => ({
    normalizedTopicId: topic.normalizedTopicId,
    taskDate: '2026-01-05',
    taskType: 'learning',
    provider: 'internal',
    estimatedMinutes: 50,
    targetCount: null,
    mode: 'focused',
    questionPool: null,
    unlockCondition: null,
    displayOrder: 0,
    metadata: { pageRange: null, studyStyle: 'focused' },
  }))
  return {
    tasks,
    topicStates: resolvedTopics.map((t, i) => ({
      normalizedTopicId: t.normalizedTopicId,
      baseLearningMinutes: 50,
      personalizedLearningMinutes: 50,
      totalUworldQuestions: 20,
      completedUworldQuestions: 0,
      learningCompletedAt: null,
      questionsUnlockedAt: null,
      status: 'not_started',
      displayOrder: i,
    })),
    unscheduledWork: [],
    feasibility: { feasible: true, missingCapacity: 0, topicsLeftUnscheduled: 0, possibleSolutions: [] },
    deduplicationLog: [],
  }
}

async function createPlan(env, userId, overrides = {}) {
  const input = makeValidatedInput(overrides)
  const resolved = makeResolvedTopics(input)
  const preview = makePreview(resolved)
  return persistPlanBatch(env, userId, input, resolved, preview, overrides._reqId || `req-${Date.now()}`, overrides._fp || `fp-${Date.now()}`)
}

// ──────────────────────────────────────────────────────────
// Ownership creation assignment
// ──────────────────────────────────────────────────────────
describe('Phase 2 — ownership creation', () => {
  it('1. first active plan becomes flashcard-capacity owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-owner-1')

    const plan = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()
    expect(plan.uses_flashcard_capacity).toBe(1)
  })

  it('2. second active plan is created as non-owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-owner-2', { _reqId: 'req-1', _fp: 'fp-1' })
    const { planId } = await createPlan(env, 'user-owner-2', { _reqId: 'req-2', _fp: 'fp-2' })

    const plan = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('3. multiple active non-owner plans are allowed', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const r1 = await createPlan(env, 'user-multi', { _reqId: 'req-m1', _fp: 'fp-m1' })
    const r2 = await createPlan(env, 'user-multi', { _reqId: 'req-m2', _fp: 'fp-m2' })
    const r3 = await createPlan(env, 'user-multi', { _reqId: 'req-m3', _fp: 'fp-m3' })

    const p2 = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(r2.planId).first()
    const p3 = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(r3.planId).first()
    expect(p2.uses_flashcard_capacity).toBe(0)
    expect(p3.uses_flashcard_capacity).toBe(0)
  })

  it('4. draft plan never becomes owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-draft')

    const plan = await db.prepare(
      'SELECT status, uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()
    expect(plan.status).toBe('draft')
    expect(plan.uses_flashcard_capacity).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────
// DTO mapping
// ──────────────────────────────────────────────────────────
describe('Phase 2 — DTO mapping', () => {
  it('5. plan DTO maps uses_flashcard_capacity to usesFlashcardCapacity', () => {
    const row = {
      id: 'plan-dto', user_id: 'u1', rotation_id: 'r1', source_id: 's1', source_version: '1.0',
      start_date: '2026-01-01', end_date: '2026-04-01', exam_date: null,
      study_style: 'active', scheduling_mode: 'efficient', question_start_rule: 'next_available_day',
      preferred_questions_per_day: 30, minimum_questions_per_session: 10, maximum_questions_per_day: 50,
      average_minutes_per_question: 1.5, buffer_percentage: 20, maximum_active_topics: 5,
      status: 'active', uses_flashcard_capacity: 1, settings_json: '{}',
      created_at: '2026-01-01', updated_at: '2026-01-01', revision: 0, last_recalculated_at: null,
    }
    const dto = mapPlanDto(row)
    expect(dto.usesFlashcardCapacity).toBe(1)
  })

  it('6. plan detail response includes usesFlashcardCapacity', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-detail')
    const loaded = await loadPlanFromDb(env, planId, 'user-detail')
    expect(loaded.plan.usesFlashcardCapacity).toBe(1)
  })

  it('7. plan summary preserves the field', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-summary')
    const summaries = await loadPlanSummaries(env, 'user-summary')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].usesFlashcardCapacity).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────
// Status lifecycle — ownership clearing
// ──────────────────────────────────────────────────────────
describe('Phase 2 — status lifecycle', () => {
  it('8. pausing the owner clears ownership atomically', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-pause')
    await updatePlanStatus(env, planId, 'user-pause', 'paused')

    const plan = await db.prepare(
      'SELECT status, uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()
    expect(plan.status).toBe('paused')
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('9. completing the owner clears ownership atomically', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-complete')
    await updatePlanStatus(env, planId, 'user-complete', 'completed')

    const plan = await db.prepare(
      'SELECT status, uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()
    expect(plan.status).toBe('completed')
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('10. archiving the owner clears ownership atomically', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-archive')
    await updatePlanStatus(env, planId, 'user-archive', 'archived')

    const plan = await db.prepare(
      'SELECT status, uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()
    expect(plan.status).toBe('archived')
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('11. reactivating a plan does not restore ownership', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-reactivate')

    await updatePlanStatus(env, planId, 'user-reactivate', 'paused')
    await updatePlanStatus(env, planId, 'user-reactivate', 'active')

    const plan = await db.prepare(
      'SELECT status, uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()
    expect(plan.status).toBe('active')
    expect(plan.uses_flashcard_capacity).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────
// Deletion
// ──────────────────────────────────────────────────────────
describe('Phase 2 — deletion', () => {
  it('12. deleting the owner leaves no owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-delete-owner')
    const owner = await getActiveFlashcardCapacityOwner(env, 'user-delete-owner')
    expect(owner).not.toBeNull()

    await db.prepare(
      'DELETE FROM rotation_planner_plans WHERE user_id = ? AND uses_flashcard_capacity = 1'
    ).bind('user-delete-owner').run()

    const ownerAfter = await getActiveFlashcardCapacityOwner(env, 'user-delete-owner')
    expect(ownerAfter).toBeNull()
  })

  it('13. deleting the owner does not modify other active plans', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-del-other', { _reqId: 'req-d1', _fp: 'fp-d1' })
    const { planId: otherPlanId } = await createPlan(env, 'user-del-other', { _reqId: 'req-d2', _fp: 'fp-d2' })

    await db.prepare(
      'DELETE FROM rotation_planner_plans WHERE user_id = ? AND uses_flashcard_capacity = 1'
    ).bind('user-del-other').run()

    const other = await db.prepare(
      'SELECT status, uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(otherPlanId).first()
    expect(other.status).toBe('draft')
    expect(other.uses_flashcard_capacity).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────
// getActiveFlashcardCapacityOwner
// ──────────────────────────────────────────────────────────
describe('Phase 2 — getActiveFlashcardCapacityOwner', () => {
  it('14. returns only active owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-owner-q')

    const owner = await getActiveFlashcardCapacityOwner(env, 'user-owner-q')
    expect(owner).not.toBeNull()
    expect(owner.id).toBe(planId)
    expect(owner.usesFlashcardCapacity).toBe(true)
  })

  it('15. inactive flagged fixture is ignored defensively', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    db.run(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('plan-fixture', 'user-fixture', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'paused', 'req-fixture', 'fp-fixture', 1)`
    )

    const owner = await getActiveFlashcardCapacityOwner(env, 'user-fixture')
    expect(owner).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────
// Idempotency
// ──────────────────────────────────────────────────────────
describe('Phase 2 — idempotency', () => {
  it('16. creation idempotent replay preserves the original ownership flag', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const r1 = await createPlan(env, 'user-idem-replay', { _reqId: 'req-replay', _fp: 'fp-replay' })

    const p1 = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind(r1.planId).first()
    expect(p1.uses_flashcard_capacity).toBe(1)
  })

  it('17. creation idempotency conflict performs zero writes', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-idem-conflict', { _reqId: 'req-conflict', _fp: 'fp-c1' })

    await expect(
      createPlan(env, 'user-idem-conflict', { _reqId: 'req-conflict', _fp: 'fp-c2' })
    ).rejects.toThrow()

    const plans = await db.prepare(
      'SELECT COUNT(*) as c FROM rotation_planner_plans WHERE user_id = ?'
    ).bind('user-idem-conflict').first()
    expect(plans.c).toBe(1)
  })

  it('18. sequential owner assignment produces exactly one owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-race', { _reqId: 'req-r1', _fp: 'fp-r1' })
    await createPlan(env, 'user-race', { _reqId: 'req-r2', _fp: 'fp-r2' })

    const { results } = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE user_id = ?'
    ).bind('user-race').all()
    const ownerCount = results.filter(r => r.uses_flashcard_capacity === 1).length
    expect(ownerCount).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────
// Existing flows
// ──────────────────────────────────────────────────────────
describe('Phase 2 — existing flows preserved', () => {
  it('19. existing plans with default uses_flashcard_capacity=0 remain valid', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    db.run(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('plan-default-0', 'user-default', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-def', 'fp-def', 0)`
    )

    const plan = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
    ).bind('plan-default-0').first()
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('20. existing task creation and read flows remain unchanged', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId, taskIds, topicIds } = await createPlan(env, 'user-unchanged')

    const plan = await loadPlanFromDb(env, planId, 'user-unchanged')
    expect(plan.plan.id).toBe(planId)
    expect(plan.tasks).toHaveLength(1)
    expect(plan.topics).toHaveLength(1)
    expect(plan.availability).toHaveLength(7)
  })
})
