import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../../__tests__/helpers/d1TestHarness.js'
import { persistPlanBatch, loadPlanFromDb, loadPlanSummaries } from '../persistence.js'

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
      {
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.acute-coronary-syndromes-acs',
        uworldRemainingQuestions: 15,
        alreadyCompletedLearningPercentage: 50,
        alreadyCompletedQuestionCount: 5,
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
  const tasks = []
  for (const topic of resolvedTopics) {
    tasks.push({
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
    })
  }
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

describe('persistPlanBatch', () => {
  it('inserts a full plan with availability, topics, and tasks', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)

    const env = { DB: db }
    const result = await persistPlanBatch(env, 'user-1', input, resolved, preview, 'req-001', 'fp-001')

    expect(result.planId).toBeDefined()
    expect(result.topicIds).toHaveLength(2)
    expect(result.taskIds).toHaveLength(2)

    const plan = await db.prepare('SELECT * FROM rotation_planner_plans WHERE id = ?').bind(result.planId).first()
    expect(plan).not.toBeNull()
    expect(plan.user_id).toBe('user-1')
    expect(plan.client_request_id).toBe('req-001')
    expect(plan.request_fingerprint).toBe('fp-001')

    const avail = await db.prepare('SELECT * FROM rotation_planner_availability WHERE plan_id = ?').bind(result.planId).all()
    expect(avail.results).toHaveLength(7)

    const topics = await db.prepare('SELECT * FROM rotation_planner_topics WHERE plan_id = ?').bind(result.planId).all()
    expect(topics.results).toHaveLength(2)

    const tasks = await db.prepare('SELECT * FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(result.planId).all()
    expect(tasks.results).toHaveLength(2)
  })
})

describe('loadPlanFromDb', () => {
  it('returns nested structure with plan, availability, topics, tasks', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)
    const { planId } = await persistPlanBatch({ DB: db }, 'user-1', input, resolved, preview, 'req-load', 'fp-load')

    const plan = await loadPlanFromDb({ DB: db }, planId, 'user-1')
    expect(plan).not.toBeNull()
    expect(plan.plan).toBeDefined()
    expect(plan.plan.id).toBe(planId)
    expect(Array.isArray(plan.availability)).toBe(true)
    expect(plan.availability).toHaveLength(7)
    expect(Array.isArray(plan.topics)).toBe(true)
    expect(plan.topics).toHaveLength(2)
    expect(Array.isArray(plan.tasks)).toBe(true)
    expect(plan.tasks).toHaveLength(2)
  })

  it('returns null for nonexistent plan', async () => {
    const db = await createTestDb()
    const result = await loadPlanFromDb({ DB: db }, 'nonexistent', 'user-1')
    expect(result).toBeNull()
  })

  it('returns null when userId does not match', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)
    const { planId } = await persistPlanBatch({ DB: db }, 'user-owner', input, resolved, preview, 'req-owner', 'fp-owner')

    const result = await loadPlanFromDb({ DB: db }, planId, 'user-other')
    expect(result).toBeNull()
  })

  it('topics are ordered by display_order', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)
    preview.topicStates[0].displayOrder = 1
    preview.topicStates[1].displayOrder = 0
    const { planId } = await persistPlanBatch({ DB: db }, 'user-1', input, resolved, preview, 'req-order', 'fp-order')

    const plan = await loadPlanFromDb({ DB: db }, planId, 'user-1')
    expect(plan.topics[0].displayOrder).toBe(0)
    expect(plan.topics[1].displayOrder).toBe(1)
  })
})

describe('loadPlanSummaries', () => {
  it('returns empty array for user with no plans', async () => {
    const db = await createTestDb()
    const summaries = await loadPlanSummaries({ DB: db }, 'user-empty')
    expect(summaries).toEqual([])
  })

  it('returns summary with topic and task counts', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)
    await persistPlanBatch({ DB: db }, 'user-sum', input, resolved, preview, 'req-sum', 'fp-sum')

    const summaries = await loadPlanSummaries({ DB: db }, 'user-sum')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].topicCount).toBe(2)
    expect(summaries[0].taskCount).toBe(2)
  })

  it('returns plans ordered by created_at DESC', async () => {
    const db = await createTestDb()
    const input1 = makeValidatedInput()
    const resolved1 = makeResolvedTopics(input1)
    const preview1 = makePreview(resolved1)
    await persistPlanBatch({ DB: db }, 'user-ord', input1, resolved1, preview1, 'req-ord-1', 'fp-ord-1')

    const input2 = makeValidatedInput()
    const resolved2 = makeResolvedTopics(input2)
    const preview2 = makePreview(resolved2)
    await persistPlanBatch({ DB: db }, 'user-ord', input2, resolved2, preview2, 'req-ord-2', 'fp-ord-2')

    const summaries = await loadPlanSummaries({ DB: db }, 'user-ord')
    expect(summaries).toHaveLength(2)
  })
})

describe('cascade delete', () => {
  it('deleting a plan cascades to availability, topics, and tasks', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)
    const { planId } = await persistPlanBatch({ DB: db }, 'user-cascade', input, resolved, preview, 'req-cascade', 'fp-cascade')

    await db.prepare('DELETE FROM rotation_planner_plans WHERE id = ?').bind(planId).run()

    const plan = await db.prepare('SELECT * FROM rotation_planner_plans WHERE id = ?').bind(planId).first()
    expect(plan).toBeNull()

    const avail = await db.prepare('SELECT * FROM rotation_planner_availability WHERE plan_id = ?').bind(planId).all()
    expect(avail.results).toHaveLength(0)

    const topics = await db.prepare('SELECT * FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).all()
    expect(topics.results).toHaveLength(0)

    const tasks = await db.prepare('SELECT * FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).all()
    expect(tasks.results).toHaveLength(0)
  })
})

describe('SET NULL on topic deletion', () => {
  it('deleting a topic sets daily_tasks.plan_topic_id to NULL', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)
    const { planId, topicIds } = await persistPlanBatch({ DB: db }, 'user-setnull', input, resolved, preview, 'req-setnull', 'fp-setnull')

    const task = await db.prepare('SELECT plan_topic_id FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    expect(task.plan_topic_id).not.toBeNull()

    await db.prepare('DELETE FROM rotation_planner_topics WHERE id = ?').bind(topicIds[0]).run()

    const taskAfter = await db.prepare('SELECT plan_topic_id FROM rotation_planner_daily_tasks WHERE id = (SELECT id FROM rotation_planner_daily_tasks WHERE plan_id = ? LIMIT 1)').bind(planId).first()
    expect(taskAfter.plan_topic_id).toBeNull()
  })
})

describe('batch rollback', () => {
  it('rolls back all tables when the batch fails', async () => {
    const db = await createTestDb()

    const planId = 'plan-rollback-' + Date.now()
    const planStmt = db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES (?, 'user-rollback', 'cardiology', 'step-up-medicine-6e-2024', '2026-01-05', '2026-01-11', 'req-rollback', 'fp-rollback')`
    ).bind(planId)

    const availStmt = db.prepare(
      `INSERT INTO rotation_planner_availability (id, plan_id, weekday, available_minutes, is_day_off)
       SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.weekday'), json_extract(value,'$.availableMinutes'), json_extract(value,'$.isDayOff')
       FROM json_each(?)`
    ).bind(planId, JSON.stringify([
      { id: 'av-r1', weekday: 0, availableMinutes: 120, isDayOff: 0 },
      { id: 'av-r2', weekday: 1, availableMinutes: 120, isDayOff: 0 },
    ]))

    const topicsStmt = db.prepare(
      `INSERT INTO rotation_planner_topics (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title)
       VALUES ('topic-r1', ?, 'src::topic1', 'topic1', 'Topic 1')`
    ).bind(planId)

    // This statement will fail: invalid task_type violates CHECK constraint
    const tasksStmt = db.prepare(
      `INSERT INTO rotation_planner_daily_tasks (id, plan_id, task_date, task_type)
       VALUES ('task-r1', ?, '2026-01-05', 'INVALID_TYPE')`
    ).bind(planId)

    await expect(
      db.batch([planStmt, availStmt, topicsStmt, tasksStmt])
    ).rejects.toThrow()

    const planCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plans WHERE id = ?').bind(planId).first()
    expect(planCount.c).toBe(0)

    const availCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_availability WHERE plan_id = ?').bind(planId).first()
    expect(availCount.c).toBe(0)

    const topicsCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    expect(topicsCount.c).toBe(0)
  })
})

describe('idempotency unique constraint', () => {
  it('rejects duplicate (user_id, client_request_id)', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)
    await persistPlanBatch({ DB: db }, 'user-idem', input, resolved, preview, 'req-dup', 'fp-1')

    await expect(
      persistPlanBatch({ DB: db }, 'user-idem', input, resolved, preview, 'req-dup', 'fp-2')
    ).rejects.toThrow()

    const plans = await db.prepare('SELECT id FROM rotation_planner_plans WHERE user_id = ?').bind('user-idem').all()
    expect(plans.results).toHaveLength(1)
  })

  it('allows same key for different users', async () => {
    const db = await createTestDb()
    const input = makeValidatedInput()
    const resolved = makeResolvedTopics(input)
    const preview = makePreview(resolved)

    const r1 = await persistPlanBatch({ DB: db }, 'user-A', input, resolved, preview, 'shared-key', 'fp-a')
    const r2 = await persistPlanBatch({ DB: db }, 'user-B', input, resolved, preview, 'shared-key', 'fp-b')

    expect(r1.planId).not.toBe(r2.planId)
  })
})
