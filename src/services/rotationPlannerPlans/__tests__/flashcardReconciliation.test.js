import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../__tests__/helpers/d1TestHarness.js'
import { computeReviewWorkloadMap, allocateReviewMinutesByGroup } from '../../flashcardWorkload.js'
import { buildReviewTaskFromGroup, allocateDailyReviewCapacity } from '../../rotationPlannerV2/flashcardScheduling.js'
import { persistPlanBatch, persistRecalculationBatch } from '../persistence.js'
import { markPlannerFlashcardSatisfied, buildFlashcardReconciliationStatements } from '../flashcardReconciliation.js'
import worker from '../../../worker.js'

const USER_ID = 'user-1'
const SNAPSHOT_AT = '2026-08-01T00:00:00.000Z'

const DEFAULT_AVAILABILITY = Array.from({ length: 7 }, (_, i) => ({
  weekday: i,
  availableMinutes: 120,
  isDayOff: false,
}))

async function insertCard(db, userId, { id, deckName = 'Default Deck', state = 2, nextReview }) {
  await db.prepare(
    `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, deckName, state, '2026-07-01T10:00:00.000Z', nextReview, '2026-07-01T00:00:00.000Z').run()
}

async function insertMapping(db, userId, deckName, canonicalTopicId) {
  const id = `mapping-${deckName}-${canonicalTopicId}`
  await db.prepare(
    `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
  ).bind(id, userId, deckName, canonicalTopicId).run()
}

async function seedTask(db, userId, { taskId, planId, targetCount, cardIds, snapshotAt = SNAPSHOT_AT, status = 'pending' }) {
  await db.prepare(
    `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(planId, userId, 'cardiology', 'step-up-medicine-6e-2024', '2026-08-01', '2026-08-31', `creq-${planId}-${taskId}`, `fp-${planId}-${taskId}`).run()
  await db.prepare(
    `INSERT INTO rotation_planner_daily_tasks (id, plan_id, task_date, task_type, estimated_minutes, target_count, status)
     VALUES (?, ?, '2026-08-05', 'flashcard_review', 60, ?, ?)`
  ).bind(taskId, planId, targetCount, status).run()
  for (const cardId of cardIds) {
    await db.prepare(
      `INSERT INTO rotation_planner_flashcard_task_cards (task_id, user_id, card_id, deck_name, canonical_topic_id, snapshot_at, satisfied_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).bind(taskId, userId, cardId, 'Deck A', null, snapshotAt).run()
  }
}

async function getTask(db, taskId) {
  return db.prepare('SELECT * FROM rotation_planner_daily_tasks WHERE id = ?').bind(taskId).first()
}

async function satisfiedCount(db, taskId) {
  const { results } = await db.prepare(
    'SELECT COUNT(*) AS c FROM rotation_planner_flashcard_task_cards WHERE task_id = ? AND satisfied_at IS NOT NULL'
  ).bind(taskId).all()
  return results[0].c
}

async function snapshotCardIds(db, taskId) {
  const { results } = await db.prepare(
    'SELECT card_id FROM rotation_planner_flashcard_task_cards WHERE task_id = ? ORDER BY card_id'
  ).bind(taskId).all()
  return results.map(r => r.card_id)
}

async function buildTasksFromWorkload(env, workload) {
  const tasks = []
  let sortOrder = 0
  for (const [dateStr] of Object.entries(workload.dueReviewCardCountByDate).sort()) {
    const groups = workload.topicBreakdownByDate[dateStr] || []
    if (groups.length === 0) continue
    const withEstimates = allocateReviewMinutesByGroup(
      groups.map((g, i) => ({ ...g, key: `${dateStr}-${g.planTopicId || 'general'}-${i}`, stableOrder: i }))
    )
    const allocated = allocateDailyReviewCapacity(withEstimates, workload.dueReviewMinutesByDate[dateStr] || 0)
    for (const group of allocated) {
      const task = buildReviewTaskFromGroup(group, dateStr, sortOrder++)
      if (task) tasks.push(task)
    }
  }
  return tasks
}

function makeValidatedInput(overrides = {}) {
  return {
    sourceId: 'step-up-medicine-6e-2024',
    rotationId: 'cardiology',
    displayName: 'Flashcard plan',
    startDate: '2026-08-01',
    endDate: '2026-08-07',
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
    availability: DEFAULT_AVAILABILITY.map(a => ({ weekday: a.weekday, availableMinutes: a.availableMinutes, isDayOff: a.isDayOff })),
    blockedDates: [],
    topics: [],
    personalSourcePaceMultiplier: 1.0,
    examReviewWindowDays: 0,
    mixedReviewQuestionsPerDay: 0,
    dueReviewMinutesByDate: {},
    acceptOverload: false,
    ...overrides,
  }
}

function makePreview(tasks) {
  return {
    tasks,
    topicStates: [],
    questionGroups: [],
    unscheduledWork: [],
    feasibility: { feasible: true, missingCapacity: 0, topicsLeftUnscheduled: 0, possibleSolutions: [] },
    deduplicationLog: [],
  }
}

describe('flashcardReconciliation — statement builder', () => {
  it('returns exactly two statements (satisfy + progress recompute)', () => {
    const env = { DB: { prepare: () => ({ bind: () => ({}) }) } }
    const stmts = buildFlashcardReconciliationStatements({ env, userId: USER_ID, cardId: 'c1', reviewedAt: '2026-08-06T10:00:00.000Z' })
    expect(stmts).toHaveLength(2)
  })
})

describe('markPlannerFlashcardSatisfied — idempotency & monotonic progress', () => {
  it('is idempotent: double call marks one satisfied row and leaves progress unchanged', async () => {
    const db = await createTestDb()
    await seedTask(db, USER_ID, { taskId: 'task-1', planId: 'plan-1', targetCount: 2, cardIds: ['c1', 'c2'] })
    const reviewedAt = '2026-08-06T10:00:00.000Z'

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c1', reviewedAt })
    const afterFirst = await getTask(db, 'task-1')

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c1', reviewedAt })
    const afterSecond = await getTask(db, 'task-1')

    expect(await satisfiedCount(db, 'task-1')).toBe(1)
    expect(afterFirst.completed_count).toBe(1)
    expect(afterFirst.completion_percentage).toBe(50)
    expect(afterSecond.completed_count).toBe(afterFirst.completed_count)
    expect(afterSecond.completion_percentage).toBe(afterFirst.completion_percentage)
    expect(afterSecond.status).toBe('pending')
  })

  it('progress advances monotonically and only for cards in the snapshot', async () => {
    const db = await createTestDb()
    await seedTask(db, USER_ID, { taskId: 'task-1', planId: 'plan-1', targetCount: 2, cardIds: ['c1', 'c2'] })
    const reviewedAt = '2026-08-06T10:00:00.000Z'

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c1', reviewedAt })
    expect((await getTask(db, 'task-1')).completed_count).toBe(1)

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'not-in-snapshot', reviewedAt })
    expect((await getTask(db, 'task-1')).completed_count).toBe(1)
    expect((await getTask(db, 'task-1')).completion_percentage).toBe(50)
    expect((await getTask(db, 'task-1')).status).toBe('pending')

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c2', reviewedAt })
    const task = await getTask(db, 'task-1')
    expect(task.completed_count).toBe(2)
    expect(task.completion_percentage).toBe(100)
    expect(task.status).toBe('completed')
    expect(task.completed_on).toBe('2026-08-06')
    expect(task.completed_at).toBe(reviewedAt)
  })

  it('never sets partial; completes only when satisfied >= target_count', async () => {
    const db = await createTestDb()
    await seedTask(db, USER_ID, { taskId: 'task-1', planId: 'plan-1', targetCount: 3, cardIds: ['c1', 'c2', 'c3'] })
    const reviewedAt = '2026-08-06T10:00:00.000Z'

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c1', reviewedAt })
    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c2', reviewedAt })
    expect((await getTask(db, 'task-1')).status).toBe('pending')
    expect((await getTask(db, 'task-1')).completed_count).toBe(2)

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c3', reviewedAt })
    const task = await getTask(db, 'task-1')
    expect(task.completed_count).toBe(3)
    expect(task.completion_percentage).toBe(100)
    expect(task.status).toBe('completed')
  })

  it('never reopens a terminal task', async () => {
    const db = await createTestDb()
    await seedTask(db, USER_ID, { taskId: 'task-completed', planId: 'plan-1', targetCount: 1, cardIds: ['c9'], status: 'completed' })
    await seedTask(db, USER_ID, { taskId: 'task-partial', planId: 'plan-2', targetCount: 1, cardIds: ['c10'], status: 'partial' })
    await seedTask(db, USER_ID, { taskId: 'task-skipped', planId: 'plan-3', targetCount: 1, cardIds: ['c11'], status: 'skipped' })
    const reviewedAt = '2026-08-06T10:00:00.000Z'

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c9', reviewedAt })
    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c10', reviewedAt })
    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c11', reviewedAt })

    expect((await getTask(db, 'task-completed')).status).toBe('completed')
    expect((await getTask(db, 'task-partial')).status).toBe('partial')
    expect((await getTask(db, 'task-skipped')).status).toBe('skipped')

    for (const taskId of ['task-completed', 'task-partial', 'task-skipped']) {
      expect(await satisfiedCount(db, taskId)).toBe(0)
    }
  })
})

describe('markPlannerFlashcardSatisfied — snapshot_at guard', () => {
  it('a review before snapshot_at does not satisfy', async () => {
    const db = await createTestDb()
    await seedTask(db, USER_ID, {
      taskId: 'task-1', planId: 'plan-1', targetCount: 1, cardIds: ['c1'],
      snapshotAt: '2026-08-05T00:00:00.000Z',
    })

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c1', reviewedAt: '2026-08-04T23:59:59.999Z' })
    expect(await satisfiedCount(db, 'task-1')).toBe(0)
    expect((await getTask(db, 'task-1')).completed_count).toBe(0)

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c1', reviewedAt: '2026-08-05T00:00:00.000Z' })
    expect(await satisfiedCount(db, 'task-1')).toBe(1)
    expect((await getTask(db, 'task-1')).completed_count).toBe(1)
  })
})

describe('markPlannerFlashcardSatisfied — no double credit across tasks/plans', () => {
  it('a card in two plans satisfies each task independently', async () => {
    const db = await createTestDb()
    await seedTask(db, USER_ID, { taskId: 'task-1', planId: 'plan-1', targetCount: 2, cardIds: ['c1', 'c2'] })
    await seedTask(db, USER_ID, { taskId: 'task-2', planId: 'plan-2', targetCount: 1, cardIds: ['c1'] })
    const reviewedAt = '2026-08-06T10:00:00.000Z'

    await markPlannerFlashcardSatisfied({ env: { DB: db }, userId: USER_ID, cardId: 'c1', reviewedAt })

    const task1 = await getTask(db, 'task-1')
    const task2 = await getTask(db, 'task-2')
    expect(task1.completed_count).toBe(1)
    expect(task1.completion_percentage).toBe(50)
    expect(task1.status).toBe('pending')
    expect(task2.completed_count).toBe(1)
    expect(task2.completion_percentage).toBe(100)
    expect(task2.status).toBe('completed')

    expect(await satisfiedCount(db, 'task-1')).toBe(1)
    expect(await satisfiedCount(db, 'task-2')).toBe(1)
  })
})

describe('snapshot persistence — pipeline invariant', () => {
  it('COUNT(snapshot rows) === target_count for every flashcard_review task in a multi-group plan', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    await insertCard(db, USER_ID, { id: 'c1', deckName: 'Cardio Core', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, USER_ID, { id: 'c2', deckName: 'Cardio Core', nextReview: '2026-08-05T11:00:00.000Z' })
    await insertCard(db, USER_ID, { id: 'c3', deckName: 'Surgery Deck', nextReview: '2026-08-05T12:00:00.000Z' })
    await insertCard(db, USER_ID, { id: 'c4', deckName: 'Misc Deck', nextReview: '2026-08-05T13:00:00.000Z' })
    await insertMapping(db, USER_ID, 'Cardio Core', 'topic-cardio')
    await insertMapping(db, USER_ID, 'Surgery Deck', 'topic-surgery')

    const workload = await computeReviewWorkloadMap({
      env, userId: USER_ID, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [
        { planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 },
        { planTopicId: 'rpt-surgery', canonicalTopicId: 'topic-surgery', displayOrder: 1 },
      ],
    })

    const groups = workload.topicBreakdownByDate['2026-08-05']
    expect(groups).toHaveLength(3)
    const groupByTopic = Object.fromEntries(groups.map(g => [g.planTopicId || 'general', g]))
    expect(groupByTopic['rpt-cardio'].dueCardCount).toBe(2)
    expect(groupByTopic['rpt-surgery'].dueCardCount).toBe(1)
    expect(groupByTopic['general'].dueCardCount).toBe(1)

    const tasks = await buildTasksFromWorkload(env, workload)
    expect(tasks).toHaveLength(3)
    expect(tasks.every(t => t.taskType === 'flashcard_review')).toBe(true)

    const preview = makePreview(tasks)
    const result = await persistPlanBatch(env, USER_ID, makeValidatedInput(), [], preview, 'req-flash-1', 'fp-flash-1')

    for (let i = 0; i < tasks.length; i++) {
      const { results } = await db.prepare(
        'SELECT COUNT(*) AS c FROM rotation_planner_flashcard_task_cards WHERE task_id = ?'
      ).bind(result.taskIds[i]).all()
      expect(results[0].c).toBe(tasks[i].targetCount)
    }
    expect(await snapshotCardIds(db, result.taskIds[0])).toEqual(['c1', 'c2'])
    expect(await snapshotCardIds(db, result.taskIds[1])).toEqual(['c3'])
    expect(await snapshotCardIds(db, result.taskIds[2])).toEqual(['c4'])
  })

  it('deterministic assignment: identical inputs yield identical, stably ordered snapshot card sets', async () => {
    const db = await createTestDb()
    const env = { DB: db }

    await insertCard(db, USER_ID, { id: 'c1', deckName: 'Cardio Core', nextReview: '2026-08-05T10:00:00.000Z' })
    await insertCard(db, USER_ID, { id: 'c2', deckName: 'Cardio Core', nextReview: '2026-08-05T11:00:00.000Z' })
    await insertCard(db, USER_ID, { id: 'c3', deckName: 'Misc Deck', nextReview: '2026-08-05T12:00:00.000Z' })
    await insertMapping(db, USER_ID, 'Cardio Core', 'topic-cardio')

    const opts = {
      env, userId: USER_ID, startDate: '2026-08-01', endDate: '2026-08-07',
      effectiveStartDate: '2026-08-01', timezone: 'UTC',
      availabilityByWeekday: DEFAULT_AVAILABILITY, blockedDates: [],
      planTopics: [{ planTopicId: 'rpt-cardio', canonicalTopicId: 'topic-cardio', displayOrder: 0 }],
    }
    const w1 = await computeReviewWorkloadMap(opts)
    const w2 = await computeReviewWorkloadMap(opts)
    expect(w1.topicBreakdownByDate).toEqual(w2.topicBreakdownByDate)

    const t1 = await buildTasksFromWorkload(env, w1)
    const t2 = await buildTasksFromWorkload(env, w2)
    expect(t1).toEqual(t2)

    const cardioGroup = w1.topicBreakdownByDate['2026-08-05'].find(g => g.planTopicId === 'rpt-cardio')
    expect(cardioGroup.cardIds).toEqual(['c1', 'c2'])
    expect(t1.find(t => t.planTopicId === 'rpt-cardio').snapshotCardIds).toEqual(['c1', 'c2'])
  })
})

describe('snapshot persistence — recalculation batch', () => {
  it('persistRecalculationBatch replaces snapshot rows for regenerated flashcard tasks', async () => {
    const db = await createTestDb()
    const env = { DB: db }
    await seedTask(db, USER_ID, { taskId: 'old-task', planId: 'plan-1', targetCount: 2, cardIds: ['c1', 'c2'] })

    const regeneratedTasks = [{
      id: 'new-task',
      planTopicId: null,
      taskDate: '2026-08-05',
      taskType: 'flashcard_review',
      estimatedMinutes: 3,
      targetCount: 2,
      mode: null,
      questionPool: null,
      unlockCondition: null,
      displayOrder: 0,
      metadata: { dueCardCount: 2, scheduledMinutes: 3, unmetReviewMinutes: 0, deckNames: ['Deck A'] },
      canonicalTopicId: null,
      snapshotCardIds: ['c1', 'c2'],
    }]

    await persistRecalculationBatch(env, {
      planId: 'plan-1',
      userId: USER_ID,
      expectedRevision: 0,
      clientRequestId: 'recalc-1',
      requestFingerprint: 'fp-recalc-1',
      operation: 'recalculate',
      regeneratedTasks,
      updatedTopics: [],
      resultJson: { planId: 'plan-1', revision: 1 },
      recalculationMutationId: 'mut-recalc-1',
      recalculatedAt: '2026-08-05T12:00:00.000Z',
      recalculationDate: '2026-08-05',
      workloadSnapshot: { usesFlashcardCapacity: 1, dueReviewMinutesByDate: {}, dueReviewCardCountByDate: {}, topicBreakdownByDate: {}, unscheduled: { totalCards: 0, totalMinutes: 0, cards: [] } },
      forecastSnapshot: {},
    })

    const oldTask = await db.prepare('SELECT COUNT(*) AS c FROM rotation_planner_daily_tasks WHERE id = ?').bind('old-task').first()
    expect(oldTask.c).toBe(0)
    const oldSnapshots = await db.prepare('SELECT COUNT(*) AS c FROM rotation_planner_flashcard_task_cards WHERE task_id = ?').bind('old-task').first()
    expect(oldSnapshots.c).toBe(0)

    const newSnapshots = await db.prepare(
      'SELECT card_id, snapshot_at FROM rotation_planner_flashcard_task_cards WHERE task_id = ? ORDER BY card_id'
    ).bind('new-task').all()
    expect(newSnapshots.results.map(r => r.card_id)).toEqual(['c1', 'c2'])
    expect(newSnapshots.results[0].snapshot_at).toBe('2026-08-05T12:00:00.000Z')
  })
})

describe('worker wiring — handleUpdateFlashcard', () => {
  async function workerEnv(db) {
    return { DB: db, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-key', ENVIRONMENT: 'test', IMAGES: { get: async () => null } }
  }

  async function putFlashcard(db, userId, cardId, body) {
    const req = new Request(`https://medstudy.app/api/flashcards/${cardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-user-id': userId },
      body: JSON.stringify(body),
    })
    return worker.fetch(req, await workerEnv(db), {})
  }

  it('a genuine review (last_review present) satisfies the planner snapshot in the same batch', async () => {
    const db = await createTestDb()
    const userId = 'user-wiring-1'
    await insertCard(db, userId, { id: 'card-1', deckName: 'Deck A', nextReview: '2026-08-05T10:00:00.000Z' })
    await seedTask(db, userId, { taskId: 'task-1', planId: 'plan-1', targetCount: 2, cardIds: ['card-1', 'card-2'] })

    const res = await putFlashcard(db, userId, 'card-1', {
      last_review: '2026-08-06T10:00:00.000Z',
      next_review: '2026-08-13T10:00:00.000Z',
      difficulty: 0.5, stability: 5, state: 2, interval: 7,
    })
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)

    expect(await satisfiedCount(db, 'task-1')).toBe(1)
    const task = await getTask(db, 'task-1')
    expect(task.completed_count).toBe(1)
    expect(task.completion_percentage).toBe(50)
  })

  it('an update without last_review does not touch the snapshot', async () => {
    const db = await createTestDb()
    const userId = 'user-wiring-2'
    await insertCard(db, userId, { id: 'card-1', deckName: 'Deck A', nextReview: '2026-08-05T10:00:00.000Z' })
    await seedTask(db, userId, { taskId: 'task-1', planId: 'plan-1', targetCount: 2, cardIds: ['card-1', 'card-2'] })

    const res = await putFlashcard(db, userId, 'card-1', { difficulty: 0.4, stability: 3, state: 1, interval: 0 })
    expect(res.status).toBe(200)

    expect(await satisfiedCount(db, 'task-1')).toBe(0)
    expect((await getTask(db, 'task-1')).completed_count).toBe(0)
  })
})
