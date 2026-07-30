import { describe, it, expect } from 'vitest'
import { allocateDailyReviewCapacity, buildReviewTaskFromGroup } from '../flashcardScheduling.js'
import { buildRotationSchedule } from '../buildRotationSchedule.js'
import { calculatePlanFeasibility } from '../feasibility.js'
import { createTestDb } from '../../../__tests__/helpers/d1TestHarness.js'
import { persistPlanBatch } from '../../rotationPlannerPlans/persistence.js'
import { generatePlanPreview } from '../../rotationPlannerPlans/previewPipeline.js'

function makeTopic(overrides = {}) {
  return {
    canonicalTopicId: 'cardiology.hypertension',
    sourceTopicId: 'cardiology.hypertension',
    title: 'Hypertension',
    learningMinutes: { focused: 0, activeLow: 0, activeExpected: 0, activeHigh: 0, detailedNotes: 0 },
    uworldRemainingQuestions: 0,
    prerequisiteTopicIds: [],
    sharedTopicKey: null,
    alreadyCompletedLearningPercentage: 1.0,
    alreadyCompletedQuestionCount: 0,
    incorrectQuestionsRemaining: 0,
    ...overrides,
  }
}

function makePlanConfig(overrides = {}) {
  return {
    rotationId: 'cardiology',
    sourceId: 'step-up-medicine-6e-2024',
    startDate: '2026-08-01',
    endDate: '2026-08-07',
    examDate: null,
    studyStyle: 'active',
    schedulingMode: 'efficient',
    questionStartRule: 'next_available_day',
    maximumActiveTopics: 5,
    availabilityByWeekday: [
      { weekday: 0, availableMinutes: 0, isDayOff: true },
      { weekday: 1, availableMinutes: 240, isDayOff: false },
      { weekday: 2, availableMinutes: 240, isDayOff: false },
      { weekday: 3, availableMinutes: 240, isDayOff: false },
      { weekday: 4, availableMinutes: 240, isDayOff: false },
      { weekday: 5, availableMinutes: 240, isDayOff: false },
      { weekday: 6, availableMinutes: 0, isDayOff: true },
    ],
    blockedDates: [],
    bufferPercentage: 0,
    preferredQuestionsPerDay: 30,
    minimumQuestionsPerSession: 10,
    maximumQuestionsPerDay: 50,
    averageMinutesPerQuestion: 1.5,
    topics: [makeTopic()],
    dueReviewMinutesByDate: {},
    dueReviewCardCountByDate: {},
    topicBreakdownByDate: {},
    personalSourcePaceMultiplier: 1.0,
    examReviewWindowDays: 0,
    mixedReviewQuestionsPerDay: 0,
    ...overrides,
  }
}

const SAMPLE_GROUP = {
  key: 'topic:t1',
  planTopicId: 't1',
  canonicalTopicId: 'topic-a',
  estimatedMinutes: 20,
  dueCardCount: 10,
  deckNames: ['Deck A'],
  displayOrder: 0,
}

// ──────────────────────────────────────────────────────────
// 1. allocateDailyReviewCapacity
// ──────────────────────────────────────────────────────────
describe('Phase 5 — allocateDailyReviewCapacity', () => {
  it('groups with total minutes <= capacity all get scheduled', () => {
    const groups = [
      { ...SAMPLE_GROUP, key: 'a', estimatedMinutes: 20 },
      { ...SAMPLE_GROUP, key: 'b', planTopicId: 't2', canonicalTopicId: 'topic-b', estimatedMinutes: 30, displayOrder: 1 },
    ]
    const result = allocateDailyReviewCapacity(groups, 100)
    expect(result).toHaveLength(2)
    expect(result[0].scheduledMinutes).toBe(20)
    expect(result[0].unmetReviewMinutes).toBe(0)
    expect(result[1].scheduledMinutes).toBe(30)
    expect(result[1].unmetReviewMinutes).toBe(0)
  })

  it('groups exceeding capacity get partial allocation by sort order', () => {
    const groups = [
      { ...SAMPLE_GROUP, key: 'a', estimatedMinutes: 50 },
      { ...SAMPLE_GROUP, key: 'b', planTopicId: 't2', canonicalTopicId: 'topic-b', estimatedMinutes: 40, displayOrder: 1 },
    ]
    const result = allocateDailyReviewCapacity(groups, 60)
    expect(result[0].scheduledMinutes).toBe(50)
    expect(result[0].unmetReviewMinutes).toBe(0)
    expect(result[1].scheduledMinutes).toBe(10)
    expect(result[1].unmetReviewMinutes).toBe(30)
  })

  it('empty topic groups produce scheduled = 0 when no estimated minutes', () => {
    const groups = [
      { key: 'general', estimatedMinutes: 0, dueCardCount: 0, planTopicId: null, canonicalTopicId: null, deckNames: [], displayOrder: Infinity },
    ]
    const result = allocateDailyReviewCapacity(groups, 50)
    expect(result[0].scheduledMinutes).toBe(0)
    expect(result[0].unmetReviewMinutes).toBe(0)
  })

  it('capacity = 0 produces all unmet', () => {
    const groups = [{ ...SAMPLE_GROUP, estimatedMinutes: 30 }]
    const result = allocateDailyReviewCapacity(groups, 0)
    expect(result[0].scheduledMinutes).toBe(0)
    expect(result[0].unmetReviewMinutes).toBe(30)
  })

  it('returns empty array for empty input', () => {
    expect(allocateDailyReviewCapacity([], 100)).toEqual([])
  })

  it('General Reviews (planTopicId=null) sorts last when displayOrder tied', () => {
    const groups = [
      { ...SAMPLE_GROUP, key: 'general', planTopicId: null, canonicalTopicId: null, estimatedMinutes: 10, displayOrder: 0 },
      { ...SAMPLE_GROUP, key: 'topic', estimatedMinutes: 10, displayOrder: 0 },
    ]
    const result = allocateDailyReviewCapacity(groups, 10)
    expect(result[0].planTopicId).not.toBeNull()
    expect(result[0].scheduledMinutes).toBe(10)
    expect(result[1].planTopicId).toBeNull()
    expect(result[1].scheduledMinutes).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────
// 2. buildReviewTaskFromGroup
// ──────────────────────────────────────────────────────────
describe('Phase 5 — buildReviewTaskFromGroup', () => {
  function makeGroup(overrides = {}) {
    return {
      key: 'topic:t1',
      planTopicId: 't1',
      canonicalTopicId: 'topic-a',
      estimatedMinutes: 20,
      scheduledMinutes: 20,
      unmetReviewMinutes: 0,
      dueCardCount: 10,
      deckNames: ['Deck A'],
      displayOrder: 0,
      ...overrides,
    }
  }

  it('valid group produces a task with correct fields', () => {
    const task = buildReviewTaskFromGroup(makeGroup(), '2026-08-03', 0)
    expect(task.taskDate).toBe('2026-08-03')
    expect(task.taskType).toBe('flashcard_review')
    expect(task.canonicalTopicId).toBe('topic-a')
    expect(task.estimatedMinutes).toBe(20)
    expect(task.targetCount).toBe(10)
    expect(task.planTopicId).toBe('t1')
    expect(task.status).toBe('pending')
    expect(task.metadata.dueCardCount).toBe(10)
    expect(task.metadata.scheduledMinutes).toBe(20)
    expect(task.metadata.unmetReviewMinutes).toBe(0)
    expect(task.metadata.deckNames).toEqual(['Deck A'])
  })

  it('empty dueCardCount produces null', () => {
    expect(buildReviewTaskFromGroup(makeGroup({ dueCardCount: 0 }), '2026-08-03', 0)).toBeNull()
  })

  it('null group produces null', () => {
    expect(buildReviewTaskFromGroup(null, '2026-08-03', 0)).toBeNull()
  })

  it('zero estimatedMinutes produces null', () => {
    expect(buildReviewTaskFromGroup(makeGroup({ estimatedMinutes: 0 }), '2026-08-03', 0)).toBeNull()
  })

  it('metadata deckNames are sorted', () => {
    const task = buildReviewTaskFromGroup(makeGroup({ deckNames: ['Z Deck', 'A Deck'] }), '2026-08-03', 0)
    expect(task.metadata.deckNames).toEqual(['A Deck', 'Z Deck'])
  })

  it('planTopicId and canonicalTopicId null for general group', () => {
    const task = buildReviewTaskFromGroup(makeGroup({ planTopicId: null, canonicalTopicId: null }), '2026-08-03', 0)
    expect(task.planTopicId).toBeNull()
    expect(task.canonicalTopicId).toBeNull()
  })

  it('metadata contains priority, dueCardCount, scheduledMinutes, unmetReviewMinutes, deckNames', () => {
    const task = buildReviewTaskFromGroup(makeGroup({
      dueCardCount: 7,
      scheduledMinutes: 14,
      unmetReviewMinutes: 3,
      deckNames: ['Deck X', 'Deck Y'],
    }), '2026-08-03', 0)
    expect(task.metadata).toHaveProperty('dueCardCount', 7)
    expect(task.metadata).toHaveProperty('scheduledMinutes', 14)
    expect(task.metadata).toHaveProperty('unmetReviewMinutes', 3)
    expect(task.metadata).toHaveProperty('deckNames')
    expect(task.metadata.deckNames).toContain('Deck X')
    expect(task.metadata.deckNames).toContain('Deck Y')
  })
})

// ──────────────────────────────────────────────────────────
// 3. TopicGrouped flashcard_review tasks in buildRotationSchedule
// ──────────────────────────────────────────────────────────
describe('Phase 5 — buildRotationSchedule topicGrouped flashcard tasks', () => {
  it('creates topic-grouped flashcard_review tasks from topicBreakdownByDate', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 5 },
      dueReviewCardCountByDate: { '2026-08-03': 3 },
      topicBreakdownByDate: {
        '2026-08-03': [
          { planTopicId: 'rpt-a', canonicalTopicId: 'topic-a', dueCardCount: 2, deckNames: ['Deck A'], displayOrder: 0 },
          { planTopicId: 'rpt-b', canonicalTopicId: 'topic-b', dueCardCount: 1, deckNames: ['Deck B'], displayOrder: 1 },
        ],
      },
    })
    const result = buildRotationSchedule(config)
    const flashTasks = result.tasks.filter(t => t.taskType === 'flashcard_review')
    expect(flashTasks).toHaveLength(2)
    expect(flashTasks[0].planTopicId).toBe('rpt-a')
    expect(flashTasks[0].canonicalTopicId).toBe('topic-a')
    expect(flashTasks[0].targetCount).toBe(2)
    expect(flashTasks[1].planTopicId).toBe('rpt-b')
    expect(flashTasks[1].canonicalTopicId).toBe('topic-b')
    expect(flashTasks[1].targetCount).toBe(1)
  })

  it('throws on invariant mismatch: sum(group dueCardCount) !== dueReviewCardCountByDate', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 5 },
      dueReviewCardCountByDate: { '2026-08-03': 3 },
      topicBreakdownByDate: {
        '2026-08-03': [
          { planTopicId: 'rpt-a', canonicalTopicId: 'topic-a', dueCardCount: 5, deckNames: ['Deck A'], displayOrder: 0 },
        ],
      },
    })
    expect(() => buildRotationSchedule(config)).toThrow('FLASHCARD_CAPACITY_INVARIANT')
  })

  it('fallback "General Reviews" task created when no topic groups exist but capacity.flashcardMinutes > 0', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 10 },
      dueReviewCardCountByDate: {},
      topicBreakdownByDate: {},
    })
    const result = buildRotationSchedule(config)
    const flashTasks = result.tasks.filter(
      t => t.taskType === 'flashcard_review' && t.taskDate === '2026-08-03'
    )
    expect(flashTasks).toHaveLength(1)
    expect(flashTasks[0].planTopicId).toBeUndefined()
    expect(flashTasks[0].canonicalTopicId).toBeNull()
    expect(flashTasks[0].targetCount).toBeNull()
    expect(flashTasks[0].estimatedMinutes).toBe(10)
    expect(flashTasks[0].metadata.dueCardCount).toBe(0)
    expect(flashTasks[0].metadata.scheduledMinutes).toBe(10)
  })

  it('invariant passes when dueReviewCardCountByDate is undefined (skipped)', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 5 },
      dueReviewCardCountByDate: undefined,
      topicBreakdownByDate: {
        '2026-08-03': [
          { planTopicId: 'rpt-a', canonicalTopicId: 'topic-a', dueCardCount: 2, deckNames: ['Deck A'], displayOrder: 0 },
        ],
      },
    })
    const result = buildRotationSchedule(config)
    const flashTasks = result.tasks.filter(t => t.taskType === 'flashcard_review')
    expect(flashTasks.length).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────────────────
// 4. Feasibility flashcard integration
// ──────────────────────────────────────────────────────────
describe('Phase 5 — feasibility flashcard integration', () => {
  it('dateCapacities.unmetFlashcardMinutes populated from dueReviewMinutesByDate exceeding capacity', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 500 },
    })
    const result = buildRotationSchedule(config)
    expect(result.feasibility.flashcardUnmetMinutes).toBeGreaterThan(0)
    expect(result.feasibility.missingCapacity).toBeGreaterThanOrEqual(result.feasibility.flashcardUnmetMinutes)
  })

  it('flashcardUnmetMinutes contributes to missingCapacity', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 500 },
    })
    const result = buildRotationSchedule(config)
    expect(result.feasibility.flashcardUnmetMinutes).toBe(260)
    expect(result.feasibility.missingCapacity).toBeGreaterThan(0)
  })

  it('feasible = false when flashcardUnmetMinutes > 0', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 500 },
    })
    const result = buildRotationSchedule(config)
    expect(result.feasibility.feasible).toBe(false)
    expect(result.feasibility.flashcardUnmetMinutes).toBeGreaterThan(0)
  })

  it('feasible = true when flashcardUnmetMinutes === 0', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 10 },
    })
    const result = buildRotationSchedule(config)
    expect(result.feasibility.flashcardUnmetMinutes).toBe(0)
    expect(result.feasibility.feasible).toBe(true)
  })

  it('calculatePlanFeasibility directly reflects unmetFlashcardMinutes', () => {
    const dateCapacities = {
      '2026-08-03': { usableMinutes: 240, unmetFlashcardMinutes: 100, isDayOff: false, isBlocked: false },
    }
    const planConfig = {
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 0,
      studyStyle: 'active',
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
    }
    const result = calculatePlanFeasibility({ resolvedTopics: [], dateCapacities, planConfig, topicStates: {} })
    expect(result.flashcardUnmetMinutes).toBe(100)
    expect(result.missingCapacity).toBe(100)
    expect(result.feasible).toBe(false)
  })

  it('zero flashcardUnmetMinutes with unmet from other work still shows flashcardUnmetMinutes = 0', () => {
    const dateCapacities = {
      '2026-08-03': { usableMinutes: 240, unmetFlashcardMinutes: 0, isDayOff: false, isBlocked: false },
    }
    const resolvedTopics = [{ canonicalTopicId: 'topic-a', title: 'Topic A', satisfiedBySharedCompletion: false }]
    const topicStates = {
      'topic-a': {
        personalizedLearningMinutes: 900,
        remainingUworldQuestions: 0,
        satisfiedBySharedCompletion: false,
      },
    }
    const planConfig = {
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 0,
      studyStyle: 'active',
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
    }
    const result = calculatePlanFeasibility({ resolvedTopics, dateCapacities, planConfig, topicStates })
    expect(result.flashcardUnmetMinutes).toBe(0)
    expect(result.feasible).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────
// 5. Persistence retry (ownership)
// ──────────────────────────────────────────────────────────
describe('Phase 5 — persistence retry flashcard ownership', () => {
  function makeValidatedInput(overrides = {}) {
    return {
      sourceId: 'step-up-medicine-6e-2024',
      rotationId: 'cardiology',
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
      topics: [{
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
        uworldRemainingQuestions: 20,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
        incorrectQuestionsRemaining: 0,
      }],
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      dueReviewMinutesByDate: {},
      dueReviewCardCountByDate: {},
      topicBreakdownByDate: {},
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

  async function createPlan(env, userId, overrides = {}) {
    const input = makeValidatedInput(overrides)
    const resolved = makeResolvedTopics(input)
    const { preview } = generatePlanPreview(resolved, input)
    return persistPlanBatch(
      env, userId, input, resolved, preview,
      overrides._reqId || `req-${Date.now()}`,
      overrides._fp || `fp-${Date.now()}`,
    )
  }

  it('retry calls generatePlanPreview with empty workload on idx_rpp_flashcard_owner error', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    const input = makeValidatedInput({
      dueReviewMinutesByDate: { '2026-01-05': 20 },
      topicBreakdownByDate: {
        '2026-01-05': [
          { planTopicId: null, canonicalTopicId: null, dueCardCount: 5, deckNames: ['Deck A'], displayOrder: Infinity },
        ],
      },
    })
    const resolved = makeResolvedTopics(input)
    const { preview: originalPreview } = generatePlanPreview(resolved, input)

    const originalFlashcardTasks = originalPreview.tasks.filter(t => t.taskType === 'flashcard_review')
    expect(originalFlashcardTasks.length).toBeGreaterThan(0)

    const originalBatch = env.DB.batch.bind(env.DB)
    let callCount = 0
    env.DB.batch = async (statements) => {
      callCount++
      if (callCount === 1) {
        throw new Error('UNIQUE constraint failed: idx_rpp_flashcard_owner')
      }
      return originalBatch(statements)
    }

    const { planId } = await persistPlanBatch(
      env, 'user-retry-1', input, resolved, originalPreview,
      'req-retry-1', 'fp-retry-1',
    )
    expect(callCount).toBe(2)
    expect(planId).toBeDefined()

    const mutation = await db.prepare(
      'SELECT result_json FROM rotation_planner_plan_mutations WHERE plan_id = ?',
    ).bind(planId).first()
    const stored = JSON.parse(mutation.result_json)

    const storedFlashcardTasks = stored.tasks.filter(t => t.taskType === 'flashcard_review')
    expect(storedFlashcardTasks).toHaveLength(0)
    expect(stored.tasks.length).toBeGreaterThan(0)
  })

  it('result_json tasks !== original preview tasks (regenerated, not filtered)', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    const input = makeValidatedInput({
      dueReviewMinutesByDate: { '2026-01-05': 20 },
      topicBreakdownByDate: {
        '2026-01-05': [
          { planTopicId: null, canonicalTopicId: null, dueCardCount: 5, deckNames: ['Deck A'], displayOrder: Infinity },
        ],
      },
    })
    const resolved = makeResolvedTopics(input)
    const { preview: originalPreview } = generatePlanPreview(resolved, input)

    const originalBatch = env.DB.batch.bind(env.DB)
    let callCount = 0
    env.DB.batch = async (statements) => {
      callCount++
      if (callCount === 1) {
        throw new Error('UNIQUE constraint failed: idx_rpp_flashcard_owner')
      }
      return originalBatch(statements)
    }

    const { planId } = await persistPlanBatch(
      env, 'user-retry-2', input, resolved, originalPreview,
      'req-retry-2', 'fp-retry-2',
    )

    const mutation = await db.prepare(
      'SELECT result_json FROM rotation_planner_plan_mutations WHERE plan_id = ?',
    ).bind(planId).first()
    const stored = JSON.parse(mutation.result_json)

    const originalTaskTypes = originalPreview.tasks.map(t => t.taskType)
    const storedTaskTypes = stored.tasks.map(t => t.taskType)

    expect(originalTaskTypes).toContain('flashcard_review')
    expect(storedTaskTypes).not.toContain('flashcard_review')
    expect(storedTaskTypes.length).toBeGreaterThan(0)
  })

  it('non-owner plan from retry has valid tasks', async () => {
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

    const { planId } = await createPlan(env, 'user-valid', {
      _reqId: 'req-valid', _fp: 'fp-valid',
    })

    const plan = await db.prepare(
      'SELECT status, uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?',
    ).bind(planId).first()
    expect(plan.status).toBe('draft')
    expect(plan.uses_flashcard_capacity).toBe(0)

    const taskCount = await db.prepare(
      'SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?',
    ).bind(planId).first()
    expect(taskCount.c).toBeGreaterThanOrEqual(1)
  })
})
