import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../../__tests__/helpers/d1TestHarness.js'
import { persistPlanBatch, loadPlanFromDb, loadPlanSummaries, updatePlanStatus } from '../persistence.js'
import { getFlashcardCapacityOwner } from '../ownership.js'
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

async function getFlag(db, planId) {
  const row = await db.prepare(
    'SELECT status, uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?'
  ).bind(planId).first()
  return row
}

// ──────────────────────────────────────────────────────────
// 1–3: First draft plan claims ownership via S6
// ──────────────────────────────────────────────────────────
describe('Phase 2 — first draft plan claims ownership', () => {
  it('1. first draft plan is created with flag=1 (S6 claims ownership)', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-d1')

    const plan = await getFlag(db, planId)
    expect(plan.status).toBe('draft')
    expect(plan.uses_flashcard_capacity).toBe(1)
  })

  it('2. second draft plan is created with flag=0', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-d2', { _reqId: 'req-1', _fp: 'fp-1' })
    const { planId } = await createPlan(env, 'user-d2', { _reqId: 'req-2', _fp: 'fp-2' })

    const plan = await getFlag(db, planId)
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('3. getFlashcardCapacityOwner returns the first plan when it owns', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-d3')

    const owner = await getFlashcardCapacityOwner(env, 'user-d3')
    expect(owner).not.toBeNull()
    expect(owner.id).toBe(planId)
    expect(owner.usesFlashcardCapacity).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────
// 4–7: Creation ownership claim (S6)
// ──────────────────────────────────────────────────────────
describe('Phase 2 — creation ownership claim', () => {
  it('4. first draft plan with no existing owner becomes owner via S6', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-c1')

    const plan = await getFlag(db, planId)
    expect(plan.status).toBe('draft')
    expect(plan.uses_flashcard_capacity).toBe(1)

    const owner = await getFlashcardCapacityOwner(env, 'user-c1')
    expect(owner).not.toBeNull()
    expect(owner.id).toBe(planId)
    expect(owner.usesFlashcardCapacity).toBe(true)
  })

  it('5. second draft plan is non-owner when first already owns', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId: p1 } = await createPlan(env, 'user-c2', { _reqId: 'req-1', _fp: 'fp-1' })
    const { planId: p2 } = await createPlan(env, 'user-c2', { _reqId: 'req-2', _fp: 'fp-2' })

    const flag1 = await getFlag(db, p1)
    const flag2 = await getFlag(db, p2)
    expect(flag1.uses_flashcard_capacity).toBe(1)
    expect(flag2.uses_flashcard_capacity).toBe(0)
  })

  it('6. creation response returns persisted ownership flag (not pre-batch)', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-c3')

    const loaded = await loadPlanFromDb(env, planId, 'user-c3')
    expect(loaded.plan.usesFlashcardCapacity).toBe(1)
  })

  it('7. creation of second plan returns persisted flag=0', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-c4', { _reqId: 'req-1', _fp: 'fp-1' })
    const { planId } = await createPlan(env, 'user-c4', { _reqId: 'req-2', _fp: 'fp-2' })

    const loaded = await loadPlanFromDb(env, planId, 'user-c4')
    expect(loaded.plan.usesFlashcardCapacity).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────
// 8–10: Activation ownership claim
// ──────────────────────────────────────────────────────────
describe('Phase 2 — activation ownership claim', () => {
  it('8. activating plan with no active/draft owner claims ownership', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-a1')
    await updatePlanStatus(env, planId, 'user-a1', 'active')

    const plan = await getFlag(db, planId)
    expect(plan.status).toBe('active')
    expect(plan.uses_flashcard_capacity).toBe(1)

    const owner = await getFlashcardCapacityOwner(env, 'user-a1')
    expect(owner).not.toBeNull()
    expect(owner.id).toBe(planId)
  })

  it('9. activating second plan while owner exists stays non-owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId: p1 } = await createPlan(env, 'user-a2', { _reqId: 'req-1', _fp: 'fp-1' })
    const { planId: p2 } = await createPlan(env, 'user-a2', { _reqId: 'req-2', _fp: 'fp-2' })

    await updatePlanStatus(env, p1, 'user-a2', 'active')
    await updatePlanStatus(env, p2, 'user-a2', 'active')

    const plan1 = await getFlag(db, p1)
    const plan2 = await getFlag(db, p2)
    expect(plan1.uses_flashcard_capacity).toBe(1)
    expect(plan2.uses_flashcard_capacity).toBe(0)
  })

  it('10. two concurrently activated plans produce exactly one owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId: p1 } = await createPlan(env, 'user-a3', { _reqId: 'req-1', _fp: 'fp-1' })
    const { planId: p2 } = await createPlan(env, 'user-a3', { _reqId: 'req-2', _fp: 'fp-2' })

    await Promise.all([
      updatePlanStatus(env, p1, 'user-a3', 'active'),
      updatePlanStatus(env, p2, 'user-a3', 'active'),
    ])

    const { results } = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE user_id = ? AND status IN (\'draft\', \'active\')'
    ).bind('user-a3').all()
    const ownerCount = results.filter(r => r.uses_flashcard_capacity === 1).length
    expect(ownerCount).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────
// 11: Defensive: inactive flagged fixtures
// ──────────────────────────────────────────────────────────
describe('Phase 2 — inactive flagged fixture ignored', () => {
  it('11. paused flagged plans are ignored by getFlashcardCapacityOwner', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind('plan-paused-flag', 'user-fixture', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'paused', 'req-pf', 'fp-pf', 1).run()

    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind('plan-completed-flag', 'user-fixture', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'completed', 'req-cf', 'fp-cf', 1).run()

    const owner = await getFlashcardCapacityOwner(env, 'user-fixture')
    expect(owner).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────
// 12–16: Status lifecycle — ownership clearing
// ──────────────────────────────────────────────────────────
describe('Phase 2 — status lifecycle', () => {
  it('12. pausing the owner clears ownership', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-pause')
    await updatePlanStatus(env, planId, 'user-pause', 'active')
    expect((await getFlag(db, planId)).uses_flashcard_capacity).toBe(1)

    await updatePlanStatus(env, planId, 'user-pause', 'paused')

    const plan = await getFlag(db, planId)
    expect(plan.status).toBe('paused')
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('13. completing the owner clears ownership', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-complete')
    await updatePlanStatus(env, planId, 'user-complete', 'active')
    expect((await getFlag(db, planId)).uses_flashcard_capacity).toBe(1)

    await updatePlanStatus(env, planId, 'user-complete', 'completed')

    const plan = await getFlag(db, planId)
    expect(plan.status).toBe('completed')
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('14. archiving the owner clears ownership', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-archive')
    await updatePlanStatus(env, planId, 'user-archive', 'active')
    expect((await getFlag(db, planId)).uses_flashcard_capacity).toBe(1)

    await updatePlanStatus(env, planId, 'user-archive', 'archived')

    const plan = await getFlag(db, planId)
    expect(plan.status).toBe('archived')
    expect(plan.uses_flashcard_capacity).toBe(0)
  })

  it('15. reactivating with another owner stays non-owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId: owner } = await createPlan(env, 'user-react', { _reqId: 'req-o', _fp: 'fp-o' })
    const { planId: nonOwner } = await createPlan(env, 'user-react', { _reqId: 'req-n', _fp: 'fp-n' })

    await updatePlanStatus(env, owner, 'user-react', 'active')
    expect((await getFlag(db, owner)).uses_flashcard_capacity).toBe(1)

    await updatePlanStatus(env, nonOwner, 'user-react', 'paused')
    await updatePlanStatus(env, nonOwner, 'user-react', 'active')

    const plan = await getFlag(db, nonOwner)
    expect(plan.status).toBe('active')
    expect(plan.uses_flashcard_capacity).toBe(0)

    const ownerPlan = await getFlag(db, owner)
    expect(ownerPlan.uses_flashcard_capacity).toBe(1)
  })

  it('16. reactivating with no owner claims ownership', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-react2')

    await updatePlanStatus(env, planId, 'user-react2', 'active')
    expect((await getFlag(db, planId)).uses_flashcard_capacity).toBe(1)

    await updatePlanStatus(env, planId, 'user-react2', 'paused')
    expect((await getFlag(db, planId)).uses_flashcard_capacity).toBe(0)

    await updatePlanStatus(env, planId, 'user-react2', 'active')

    const plan = await getFlag(db, planId)
    expect(plan.status).toBe('active')
    expect(plan.uses_flashcard_capacity).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────
// 17–18: Deletion
// ──────────────────────────────────────────────────────────
describe('Phase 2 — deletion', () => {
  it('17. deleting the owner leaves no active owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-del1')
    await updatePlanStatus(env, planId, 'user-del1', 'active')

    const owner = await getFlashcardCapacityOwner(env, 'user-del1')
    expect(owner).not.toBeNull()

    await db.prepare('DELETE FROM rotation_planner_plans WHERE id = ?').bind(planId).run()

    const ownerAfter = await getFlashcardCapacityOwner(env, 'user-del1')
    expect(ownerAfter).toBeNull()
  })

  it('18. deleting owner does not modify other plans', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId: ownerPlan } = await createPlan(env, 'user-del2', { _reqId: 'req-o', _fp: 'fp-o' })
    const { planId: otherPlan } = await createPlan(env, 'user-del2', { _reqId: 'req-n', _fp: 'fp-n' })

    await updatePlanStatus(env, ownerPlan, 'user-del2', 'active')
    await updatePlanStatus(env, otherPlan, 'user-del2', 'active')

    const ownerFlag = (await getFlag(db, ownerPlan)).uses_flashcard_capacity
    const otherFlagBefore = (await getFlag(db, otherPlan)).uses_flashcard_capacity
    expect(ownerFlag).toBe(1)
    expect(otherFlagBefore).toBe(0)

    await db.prepare('DELETE FROM rotation_planner_plans WHERE id = ?').bind(ownerPlan).run()

    const other = await getFlag(db, otherPlan)
    expect(other.status).toBe('active')
    expect(other.uses_flashcard_capacity).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────
// 19–21: DTO mapping — uses_flashcard_capacity → usesFlashcardCapacity
// ──────────────────────────────────────────────────────────
describe('Phase 2 — DTO mapping', () => {
  it('19. plan DTO maps uses_flashcard_capacity → usesFlashcardCapacity', () => {
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

  it('20. plan detail exposes usesFlashcardCapacity from DB', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-detail')
    const loaded = await loadPlanFromDb(env, planId, 'user-detail')
    expect(loaded.plan.usesFlashcardCapacity).toBe(1)
  })

  it('21. plan summary exposes usesFlashcardCapacity', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-summary')
    const summaries = await loadPlanSummaries(env, 'user-summary')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].usesFlashcardCapacity).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────
// 22–23: Creation idempotency
// ──────────────────────────────────────────────────────────
describe('Phase 2 — creation idempotency', () => {
  it('22. creation replay preserves the persisted ownership flag', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const r1 = await createPlan(env, 'user-idem', { _reqId: 'req-replay', _fp: 'fp-replay' })

    const plan = await getFlag(db, r1.planId)
    expect(plan.uses_flashcard_capacity).toBe(1)
  })

  it('23. idempotency conflict causes zero additional writes', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-idem2', { _reqId: 'req-conflict', _fp: 'fp-c1' })

    await expect(
      createPlan(env, 'user-idem2', { _reqId: 'req-conflict', _fp: 'fp-c2' })
    ).rejects.toThrow()

    const plans = await db.prepare(
      'SELECT COUNT(*) as c FROM rotation_planner_plans WHERE user_id = ?'
    ).bind('user-idem2').first()
    expect(plans.c).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────
// 24: Existing flows preserved
// ──────────────────────────────────────────────────────────
describe('Phase 2 — existing flows preserved', () => {
  it('24. existing task creation and read flows remain unchanged', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-unchanged')

    const plan = await loadPlanFromDb(env, planId, 'user-unchanged')
    expect(plan.plan.id).toBe(planId)
    expect(plan.plan.usesFlashcardCapacity).toBe(1)
    expect(plan.tasks).toHaveLength(1)
    expect(plan.topics).toHaveLength(1)
    expect(plan.availability).toHaveLength(7)
  })
})

// ──────────────────────────────────────────────────────────
// 25–26: Ownership race handling
// ──────────────────────────────────────────────────────────
describe('Phase 2 — normal non-owner creation', () => {
  it('25. concurrent plan creations produce exactly one owner', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    const [r1, r2] = await Promise.all([
      createPlan(env, 'user-race', { _reqId: 'req-r1', _fp: 'fp-r1' }),
      createPlan(env, 'user-race', { _reqId: 'req-r2', _fp: 'fp-r2' }),
    ])

    const { results } = await db.prepare(
      'SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE user_id = ?'
    ).bind('user-race').all()
    const ownerCount = results.filter(r => r.uses_flashcard_capacity === 1).length
    expect(ownerCount).toBe(1)
    expect(results.length).toBe(2)
  })

  it('26. non-owner plan from race is a valid plan with flag=0', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    const [r1, r2] = await Promise.all([
      createPlan(env, 'user-race2', { _reqId: 'req-r1', _fp: 'fp-r1' }),
      createPlan(env, 'user-race2', { _reqId: 'req-r2', _fp: 'fp-r2' }),
    ])

    const flag1 = await getFlag(db, r1.planId)
    const flag2 = await getFlag(db, r2.planId)
    const flags = [flag1.uses_flashcard_capacity, flag2.uses_flashcard_capacity]
    expect(flags.sort()).toEqual([0, 1])
    expect(flag1.status).toBe('draft')
    expect(flag2.status).toBe('draft')
  })
})

// ──────────────────────────────────────────────────────────
// 27–28: getFlashcardCapacityOwner query
// ──────────────────────────────────────────────────────────
describe('Phase 2 — getFlashcardCapacityOwner', () => {
  it('27. returns draft owner with correct fields', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-own')

    const owner = await getFlashcardCapacityOwner(env, 'user-own')
    expect(owner).not.toBeNull()
    expect(owner.id).toBe(planId)
    expect(owner.usesFlashcardCapacity).toBe(true)
    expect(typeof owner.revision).toBe('number')
  })

  it('28. returns null for user with only paused plans', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-paused')
    await updatePlanStatus(env, planId, 'user-paused', 'active')
    await updatePlanStatus(env, planId, 'user-paused', 'paused')

    const owner = await getFlashcardCapacityOwner(env, 'user-paused')
    expect(owner).toBeNull()
  })
})

describe('Phase 2 — claim conflict atomicity', () => {
  it('1-4. mutation claim conflict rolls back plan, availability, topics, and tasks', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-atom', { _reqId: 'req-atom', _fp: 'fp-1' })

    await expect(
      createPlan(env, 'user-atom', { _reqId: 'req-atom', _fp: 'fp-2' })
    ).rejects.toThrow()

    const plans = await db.prepare('SELECT id FROM rotation_planner_plans WHERE user_id = ?').bind('user-atom').all()
    expect(plans.results).toHaveLength(1)
    const planId = plans.results[0].id

    const av = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_availability WHERE plan_id = ?').bind(planId).first()
    expect(av.c).toBe(7)
    const top = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    expect(top.c).toBe(1)
    const task = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    expect(task.c).toBe(1)
  })
})

describe('Phase 2 — ownership retry (fault injection)', () => {
  it('ownership-index conflict: first batch rolls back, retry succeeds without S6', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    const originalBatch = env.DB.batch.bind(env.DB)
    let callCount = 0
    env.DB.batch = async (statements) => {
      callCount++
      if (callCount === 1) {
        throw new Error('UNIQUE constraint failed: idx_rpp_flashcard_owner')
      }
      return originalBatch(statements)
    }

    const { planId } = await createPlan(env, 'user-fault', {
      _reqId: 'req-fault', _fp: 'fp-fault'
    })

    expect(callCount).toBe(2)
    expect(planId).toBeDefined()

    const plan = await getFlag(db, planId)
    expect(plan).not.toBeNull()
    expect(plan.status).toBe('draft')
    expect(plan.uses_flashcard_capacity).toBe(0)

    const avCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_availability WHERE plan_id = ?').bind(planId).first()
    expect(avCount.c).toBe(7)
    const topCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    expect(topCount.c).toBe(1)
    const taskCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    expect(taskCount.c).toBe(1)

    const planCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plans WHERE user_id = ?').bind('user-fault').first()
    expect(planCount.c).toBe(1)

    const mutation = await db.prepare(
      'SELECT result_json, plan_id, client_request_id FROM rotation_planner_plan_mutations WHERE user_id = ? AND client_request_id = ?'
    ).bind('user-fault', 'req-fault').first()
    expect(mutation).not.toBeNull()
    expect(mutation.plan_id).toBe(planId)
    expect(mutation.client_request_id).toBe('req-fault')

    const parsed = JSON.parse(mutation.result_json)
    expect(parsed.plan.id).toBe(planId)
    expect(parsed.plan.usesFlashcardCapacity).toBe(0)
    expect(parsed.plan.status).toBe('draft')
    expect(parsed.plan.revision).toBe(0)
    expect(parsed.availability).toHaveLength(7)
    expect(parsed.topics).toHaveLength(1)
    expect(parsed.tasks).toHaveLength(1)
  })

  it('ownership retry preserves planId, mutationId, and clientRequestId', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    const originalBatch = env.DB.batch.bind(env.DB)
    let callCount = 0
    env.DB.batch = async (statements) => {
      callCount++
      if (callCount === 1) {
        throw new Error('UNIQUE constraint failed: idx_rpp_flashcard_owner')
      }
      return originalBatch(statements)
    }

    const { planId } = await createPlan(env, 'user-fault2', {
      _reqId: 'req-fault2', _fp: 'fp-fault2'
    })

    const mutation = await db.prepare(
      'SELECT id, plan_id, client_request_id FROM rotation_planner_plan_mutations WHERE user_id = ?'
    ).bind('user-fault2').first()

    expect(mutation.plan_id).toBe(planId)
    expect(mutation.client_request_id).toBe('req-fault2')

    const planCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plans WHERE user_id = ?').bind('user-fault2').first()
    expect(planCount.c).toBe(1)

    const revision = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind(planId).first()
    expect(revision.revision).toBe(0)
  })
})

describe('Phase 2 — stored result_json', () => {
  it('12. stored result_json contains full plan/availability/topics/tasks', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-fulljson', { _reqId: 'req-json', _fp: 'fp-json' })

    const mutation = await db.prepare(
      'SELECT result_json FROM rotation_planner_plan_mutations WHERE user_id = ? AND client_request_id = ?'
    ).bind('user-fulljson', 'req-json').first()

    expect(mutation).not.toBeNull()
    const parsed = JSON.parse(mutation.result_json)

    expect(parsed.plan).toBeDefined()
    expect(parsed.plan.id).toBe(planId)
    expect(parsed.plan.usesFlashcardCapacity).toBe(1)
    expect(parsed.plan.status).toBe('draft')
    expect(parsed.plan.revision).toBe(0)
    expect(typeof parsed.plan.sourceTitle).toBe('string')
    expect(parsed.availability).toHaveLength(7)
    expect(parsed.topics).toHaveLength(1)
    expect(parsed.tasks).toHaveLength(1)

    const plan = await getFlag(db, planId)
    expect(parsed.plan.usesFlashcardCapacity).toBe(plan.uses_flashcard_capacity)
  })

  it('result_json ownership=0 for non-owner plan', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-rj2', { _reqId: 'req-owner', _fp: 'fp-owner' })
    const { planId } = await createPlan(env, 'user-rj2', { _reqId: 'req-non', _fp: 'fp-non' })

    const mutation = await db.prepare(
      'SELECT result_json FROM rotation_planner_plan_mutations WHERE user_id = ? AND client_request_id = ?'
    ).bind('user-rj2', 'req-non').first()

    const parsed = JSON.parse(mutation.result_json)
    expect(parsed.plan.usesFlashcardCapacity).toBe(0)
    expect(parsed.plan.id).toBe(planId)
  })
})

describe('Phase 2 — creation idempotency replay', () => {
  it('5. same clientRequestId + same fingerprint at persistence level throws (handler returns replay)', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const r1 = await createPlan(env, 'user-replay', { _reqId: 'req-replay', _fp: 'fp-same' })

    await expect(
      createPlan(env, 'user-replay', { _reqId: 'req-replay', _fp: 'fp-same' })
    ).rejects.toThrow()

    const plans = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plans WHERE user_id = ?').bind('user-replay').first()
    expect(plans.c).toBe(1)
  })

  it('6. same clientRequestId + different fingerprint leaves zero new rows', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await createPlan(env, 'user-conflict', { _reqId: 'req-conflict2', _fp: 'fp-a' })

    await expect(
      createPlan(env, 'user-conflict', { _reqId: 'req-conflict2', _fp: 'fp-b' })
    ).rejects.toThrow()

    const plans = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plans WHERE user_id = ?').bind('user-conflict').first()
    expect(plans.c).toBe(1)

    const av = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_availability').first()
    const top = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics').first()
    const task = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks').first()
    expect(av.c).toBe(7)
    expect(top.c).toBe(1)
    expect(task.c).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────
// S7 atomicity — rollback tests
// ──────────────────────────────────────────────────────────
describe('Phase 2 — S7 atomicity (batch failure rolls back all statements)', () => {
  async function createPlanWithBatchFault(faultMessage) {
    const db = await createTestDb()
    const env = { DB: db }

    const originalBatch = env.DB.batch.bind(env.DB)
    env.DB.batch = async (statements) => {
      throw new Error(faultMessage)
    }

    const userId = 'user-s7roll-' + Date.now()
    await expect(
      createPlan(env, userId, { _reqId: 'req-s7roll', _fp: 'fp-s7roll' })
    ).rejects.toThrow()

    return { db, env, userId }
  }

  it('S7-1: batch failure rolls back S1 (no plan row)', async () => {
    const { db, userId } = await createPlanWithBatchFault('S1 simulated failure')
    const count = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plans WHERE user_id = ?').bind(userId).first()
    expect(count.c).toBe(0)
  })

  it('S7-2: batch failure rolls back S3 (no availability rows)', async () => {
    const { db, userId } = await createPlanWithBatchFault('S3 simulated failure')
    const count = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_availability').first()
    expect(count.c).toBe(0)
  })

  it('S7-3: batch failure rolls back S4 (no topic rows)', async () => {
    const { db, userId } = await createPlanWithBatchFault('S4 simulated failure')
    const count = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics').first()
    expect(count.c).toBe(0)
  })

  it('S7-4: batch failure rolls back S5 (no task rows)', async () => {
    const { db, userId } = await createPlanWithBatchFault('S5 simulated failure')
    const count = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks').first()
    expect(count.c).toBe(0)
  })

  it('S7-5: batch failure rolls back S7 (no result_json stored)', async () => {
    const { db, userId } = await createPlanWithBatchFault('S7 simulated failure')
    const count = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plan_mutations WHERE user_id = ?').bind(userId).first()
    expect(count.c).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────
// S7 deterministic timestamp strategy
// ──────────────────────────────────────────────────────────
describe('Phase 2 — S7 deterministic timestamp strategy', () => {
  it('S7 stores createdAt/updatedAt matching S1 plan row values', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-s7ts', { _reqId: 'req-ts', _fp: 'fp-ts' })

    const planRow = await db.prepare(
      'SELECT created_at, updated_at FROM rotation_planner_plans WHERE id = ?'
    ).bind(planId).first()

    const mutation = await db.prepare(
      'SELECT result_json FROM rotation_planner_plan_mutations WHERE plan_id = ?'
    ).bind(planId).first()
    const parsed = JSON.parse(mutation.result_json)

    expect(parsed.plan.createdAt).toBe(planRow.created_at)
    expect(parsed.plan.updatedAt).toBe(planRow.updated_at)
  })

  it('S7 stores deterministic task timestamps matching S5 values', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-s7ts2', { _reqId: 'req-ts2', _fp: 'fp-ts2' })

    const taskRow = await db.prepare(
      'SELECT created_at, updated_at FROM rotation_planner_daily_tasks WHERE plan_id = ? LIMIT 1'
    ).bind(planId).first()

    const mutation = await db.prepare(
      'SELECT result_json FROM rotation_planner_plan_mutations WHERE plan_id = ?'
    ).bind(planId).first()
    const parsed = JSON.parse(mutation.result_json)

    expect(parsed.tasks[0].createdAt).toBe(taskRow.created_at)
    expect(parsed.tasks[0].updatedAt).toBe(taskRow.updated_at)
  })
})

// ──────────────────────────────────────────────────────────
// DTO normalization — stored result matches loadPlanFromDb
// ──────────────────────────────────────────────────────────
describe('Phase 2 — DTO normalization (stored result matches loadPlanFromDb)', () => {
  it('stored result_json has identical shape and values as loadPlanFromDb', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-dto', { _reqId: 'req-dto', _fp: 'fp-dto' })

    const mutation = await db.prepare(
      'SELECT result_json FROM rotation_planner_plan_mutations WHERE plan_id = ?'
    ).bind(planId).first()
    const stored = JSON.parse(mutation.result_json)

    const loaded = await loadPlanFromDb(env, planId, 'user-dto')

    expect(stored.plan.id).toBe(loaded.plan.id)
    expect(stored.plan.status).toBe(loaded.plan.status)
    expect(stored.plan.revision).toBe(loaded.plan.revision)
    expect(stored.plan.usesFlashcardCapacity).toBe(loaded.plan.usesFlashcardCapacity)
    expect(stored.plan.sourceTitle).toBe(loaded.plan.sourceTitle)
    expect(stored.plan.settingsJson).toEqual(loaded.plan.settingsJson)
    expect(stored.plan.createdAt).toBe(loaded.plan.createdAt)
    expect(stored.plan.updatedAt).toBe(loaded.plan.updatedAt)

    expect(stored.availability).toHaveLength(loaded.availability.length)
    for (let i = 0; i < stored.availability.length; i++) {
      expect(stored.availability[i].id).toBe(loaded.availability[i].id)
      expect(stored.availability[i].weekday).toBe(loaded.availability[i].weekday)
      expect(stored.availability[i].availableMinutes).toBe(loaded.availability[i].availableMinutes)
    }

    expect(stored.topics).toHaveLength(loaded.topics.length)
    for (let i = 0; i < stored.topics.length; i++) {
      expect(stored.topics[i].id).toBe(loaded.topics[i].id)
      expect(stored.topics[i].normalizedTopicId).toBe(loaded.topics[i].normalizedTopicId)
      expect(stored.topics[i].incorrectQuestionsRemaining).toBe(loaded.topics[i].incorrectQuestionsRemaining)
    }

    expect(stored.tasks).toHaveLength(loaded.tasks.length)
    for (let i = 0; i < stored.tasks.length; i++) {
      expect(stored.tasks[i].id).toBe(loaded.tasks[i].id)
      expect(stored.tasks[i].taskType).toBe(loaded.tasks[i].taskType)
      expect(stored.tasks[i].targetCount).toBe(loaded.tasks[i].targetCount)
      expect(stored.tasks[i].completedCount).toBe(loaded.tasks[i].completedCount)
      expect(stored.tasks[i].metadataJson).toEqual(loaded.tasks[i].metadataJson)
      expect(stored.tasks[i].studyBlockId).toBe(loaded.tasks[i].studyBlockId)
    }
  })

  it('stored result_json plan.usesFlashcardCapacity matches DB flag', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    const { planId } = await createPlan(env, 'user-dto2', { _reqId: 'req-dto2', _fp: 'fp-dto2' })

    const plan = await getFlag(db, planId)
    const mutation = await db.prepare(
      'SELECT result_json FROM rotation_planner_plan_mutations WHERE plan_id = ?'
    ).bind(planId).first()
    const stored = JSON.parse(mutation.result_json)

    expect(stored.plan.usesFlashcardCapacity).toBe(plan.uses_flashcard_capacity)
  })
})
