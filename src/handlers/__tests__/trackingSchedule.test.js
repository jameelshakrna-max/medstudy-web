import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTestDb } from '../../__tests__/helpers/d1TestHarness.js'
import { handleGetPlanTrackingSchedule } from '../rotationPlannerPlans.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const USER_A = { sub: 'user-a', email: 'a@test.local', role: 'authenticated' }
const USER_B = { sub: 'user-b', email: 'b@test.local', role: 'authenticated' }
const FIXED_NOW = '2026-01-05T12:00:00.000Z'

const WATCHED_TABLES = [
  'rotation_planner_plans',
  'rotation_planner_daily_tasks',
  'rotation_planner_topics',
  'rotation_planner_question_groups',
  'rotation_planner_plan_decks',
]

let db

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_NOW))
  db = await createTestDb()
})

afterEach(() => {
  vi.useRealTimers()
})

function makeRequest(path) {
  return new Request(`https://medstudy.app${path}`)
}

async function trackingSchedule(path, user = USER_A) {
  const req = makeRequest(path)
  return handleGetPlanTrackingSchedule(req, { DB: db }, user)
}

async function insertPlan(db, { id, userId = USER_A.sub, rotationId = 'cardiology', displayName = null, status = 'draft', updatedAt = '2026-01-01 00:00:00', revision = 0, sourceId = 'step-up-medicine-6e-2024', startDate = '2026-01-01', endDate = '2026-02-01', usesFlashcardCapacity = 0 }) {
  await db.prepare(
    `INSERT INTO rotation_planner_plans (
      id, user_id, rotation_id, source_id, start_date, end_date, status,
      uses_flashcard_capacity, display_name, client_request_id, request_fingerprint,
      settings_json, created_at, updated_at, revision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)`
  ).bind(
    id, userId, rotationId, sourceId, startDate, endDate, status,
    usesFlashcardCapacity, displayName, 'client-' + id, 'fp-' + id,
    updatedAt, updatedAt, revision
  ).run()
}

async function insertTopic(db, { id, planId, canonicalTopicId, sourceTopicId = null, title = 'Topic', personalizedLearningMinutes = 0 }) {
  await db.prepare(
    `INSERT INTO rotation_planner_topics (
      id, plan_id, normalized_topic_id, canonical_topic_id, source_topic_id,
      topic_title, personalized_learning_minutes, total_uworld_questions, status, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 0)`
  ).bind(
    id, planId, 'norm-' + id, canonicalTopicId, sourceTopicId,
    title, personalizedLearningMinutes, 0
  ).run()
}

async function insertTask(db, { id, planId, planTopicId = null, planQuestionGroupId = null, taskDate, taskType = 'uworld_questions', targetCount = 0, completedCount = 0, status = 'pending', unlockCondition = null, displayOrder = 0 }) {
  await db.prepare(
    `INSERT INTO rotation_planner_daily_tasks (
      id, plan_id, plan_topic_id, plan_question_group_id, task_date, task_type,
      target_count, completed_count, status, unlock_condition, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, planId, planTopicId, planQuestionGroupId, taskDate, taskType,
    targetCount, completedCount, status, unlockCondition, displayOrder
  ).run()
}

async function insertGroup(db, { id, planId, groupKey, title, targetQuestions, requiredTopicIds = [], memberTopicIds = [], excluded = 0, displayOrder = 0 }) {
  await db.prepare(
    `INSERT INTO rotation_planner_question_groups (
      id, plan_id, group_key, title, target_questions,
      member_topic_ids_json, required_topic_ids_json, excluded, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, planId, groupKey, title, targetQuestions,
    JSON.stringify(memberTopicIds), JSON.stringify(requiredTopicIds), excluded, displayOrder
  ).run()
}

async function insertPlanDeck(db, { id, planId, deckName, isPrimary = 0 }) {
  await db.prepare(
    `INSERT INTO rotation_planner_plan_decks (id, plan_id, deck_name, is_primary, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
  ).bind(id, planId, deckName, isPrimary).run()
}

async function insertCard(db, { id, userId = USER_A.sub, deckName, state = 2, lastReview = '2020-01-01T10:00:00.000Z', nextReview = '2020-01-02T10:00:00.000Z' }) {
  await db.prepare(
    `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, deckName, state, lastReview, nextReview, '2020-01-01T00:00:00.000Z').run()
}

async function insertRealisticPlan(db, userId = USER_A.sub) {
  const planId = 'plan-realistic'
  await insertPlan(db, { id: planId, userId, rotationId: 'cardiology', displayName: 'Cardiology Plan', status: 'active', updatedAt: '2026-01-05 00:00:00' })
  await insertTopic(db, { id: 'topic-a', planId, canonicalTopicId: 'c-cardio-1', sourceTopicId: 'src-cardio-1', title: 'Cardio Topic A', personalizedLearningMinutes: 0 })
  await insertTopic(db, { id: 'topic-b', planId, canonicalTopicId: 'c-cardio-2', sourceTopicId: 'src-cardio-2', title: 'Cardio Topic B', personalizedLearningMinutes: 120 })
  await insertGroup(db, { id: 'group-1', planId, groupKey: 'cardio-uworld-1', title: 'Cardio UWorld Group 1', targetQuestions: 40, requiredTopicIds: ['src-cardio-2'], memberTopicIds: ['src-cardio-1', 'src-cardio-2'] })
  await insertTask(db, { id: 'task-1', planId, planQuestionGroupId: 'group-1', taskDate: '2026-01-05', taskType: 'uworld_questions', targetCount: 20, completedCount: 0, status: 'pending', unlockCondition: 'learning_group_completed:cardio-uworld-1', displayOrder: 0 })
  await insertTask(db, { id: 'task-2', planId, planQuestionGroupId: 'group-1', taskDate: '2026-01-05', taskType: 'uworld_questions', targetCount: 20, completedCount: 0, status: 'pending', unlockCondition: 'learning_group_completed:cardio-uworld-1', displayOrder: 0 })
  await insertTask(db, { id: 'task-3', planId, planTopicId: 'topic-b', planQuestionGroupId: null, taskDate: '2026-01-07', taskType: 'uworld_questions', targetCount: 10, completedCount: 0, status: 'pending', unlockCondition: 'learning_completed:c-cardio-2', displayOrder: 0 })
  await insertTask(db, { id: 'task-4', planId, planQuestionGroupId: 'group-1', taskDate: '2026-01-06', taskType: 'incorrect_review', targetCount: 10, completedCount: 0, status: 'pending', unlockCondition: null, displayOrder: 0 })
  return planId
}

async function snapshotTables() {
  const out = {}
  for (const table of WATCHED_TABLES) {
    const { results } = await db.prepare(`SELECT * FROM ${table}`).all()
    out[table] = results
  }
  return out
}

describe('handleGetPlanTrackingSchedule', () => {
  it('returns the selected plan with selectionReason explicit for an explicit planId', async () => {
    const planId = await insertRealisticPlan(db)
    const res = await trackingSchedule(`/api/rotation-planner/tracking/schedule?planId=${planId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.selectionReason).toBe('explicit')
    expect(body.plan.id).toBe(planId)
    expect(body.plan.displayName).toBe('Cardiology Plan')
    expect(body.plan.status).toBe('active')
    expect(body.plan.rotationLabel).toBe('Cardiology')
    expect(body.plan.startDate).toBe('2026-01-01')
    expect(body.plan.endDate).toBe('2026-02-01')
    expect(body.plan.revision).toBe(0)
  })

  it('returns 404 for a cross-user planId without leaking ownership', async () => {
    await insertRealisticPlan(db, USER_A.sub)
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=plan-realistic', USER_B)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_NOT_FOUND')
  })

  it('returns 404 for a missing or nonexistent planId without leaking', async () => {
    await insertRealisticPlan(db)
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=does-not-exist')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_NOT_FOUND')
  })

  it('returns an empty 200 (not 404) when the user has no plans', async () => {
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan).toBeNull()
    expect(body.selectionReason).toBeNull()
    expect(body.nextBlock).toBeNull()
    expect(body.schedule).toEqual([])
    expect(body.incorrectReview).toEqual([])
    expect(body.linkedDecks).toEqual([])
    expect(body.window).toEqual({
      timezone: 'UTC',
      startDate: '2026-01-05',
      endDate: '2026-01-18',
      windowDays: 14,
    })
  })

  it('auto-selects an active plan first', async () => {
    await insertPlan(db, { id: 'p-active', status: 'active', updatedAt: '2026-01-01 00:00:00' })
    await insertPlan(db, { id: 'p-draft', status: 'draft', updatedAt: '2026-01-09 00:00:00' })
    await insertPlan(db, { id: 'p-paused', status: 'paused', updatedAt: '2026-01-08 00:00:00' })
    await insertPlan(db, { id: 'p-completed', status: 'completed', updatedAt: '2026-01-10 00:00:00' })
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.selectionReason).toBe('active')
    expect(body.plan.id).toBe('p-active')
  })

  it('auto-selects the newest draft by updatedAt', async () => {
    await insertPlan(db, { id: 'p-draft-1', status: 'draft', updatedAt: '2026-01-05 00:00:00' })
    await insertPlan(db, { id: 'p-draft-2', status: 'draft', updatedAt: '2026-01-09 00:00:00' })
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule')
    const body = await res.json()
    expect(body.selectionReason).toBe('newest_draft')
    expect(body.plan.id).toBe('p-draft-2')
  })

  it('auto-selects the newest paused by updatedAt', async () => {
    await insertPlan(db, { id: 'p-paused-1', status: 'paused', updatedAt: '2026-01-01 00:00:00' })
    await insertPlan(db, { id: 'p-paused-2', status: 'paused', updatedAt: '2026-01-03 00:00:00' })
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule')
    const body = await res.json()
    expect(body.selectionReason).toBe('newest_paused')
    expect(body.plan.id).toBe('p-paused-2')
  })

  it('auto-selects the newest completed by updatedAt', async () => {
    await insertPlan(db, { id: 'p-done-1', status: 'completed', updatedAt: '2026-01-01 00:00:00' })
    await insertPlan(db, { id: 'p-done-2', status: 'completed', updatedAt: '2026-01-02 00:00:00' })
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule')
    const body = await res.json()
    expect(body.selectionReason).toBe('newest_completed')
    expect(body.plan.id).toBe('p-done-2')
  })

  it('validates windowDays against defaults and bounds', async () => {
    await insertRealisticPlan(db)
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=plan-realistic')
    const body = await res.json()
    expect(body.window.windowDays).toBe(14)
    expect(body.window.startDate).toBe('2026-01-05')
    expect(body.window.endDate).toBe('2026-01-18')

    const oneDay = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=plan-realistic&windowDays=1')
    const oneDayBody = await oneDay.json()
    expect(oneDayBody.window.windowDays).toBe(1)
    expect(oneDayBody.window.endDate).toBe('2026-01-05')

    for (const bad of ['0', '31', '-5', '14.5', 'abc']) {
      const badRes = await trackingSchedule(`/api/rotation-planner/tracking/schedule?planId=plan-realistic&windowDays=${bad}`)
      expect(badRes.status).toBe(400)
      const badBody = await badRes.json()
      expect(badBody.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('falls back to UTC for missing or invalid timezone and preserves valid timezones', async () => {
    await insertRealisticPlan(db)
    const missing = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=plan-realistic')
    expect((await missing.json()).window.timezone).toBe('UTC')

    const invalid = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=plan-realistic&timezone=Not/A/Timezone')
    expect((await invalid.json()).window.timezone).toBe('UTC')

    const valid = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=plan-realistic&timezone=America/New_York')
    const validBody = await valid.json()
    expect(validBody.window.timezone).toBe('America/New_York')
    expect(validBody.window.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(validBody.window.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('performs zero writes to planner tables', async () => {
    await insertRealisticPlan(db)
    const before = await snapshotTables()
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=plan-realistic')
    expect(res.status).toBe(200)
    const after = await snapshotTables()
    expect(after).toEqual(before)
  })

  it('returns linkedDecks with deck stats when decks are linked', async () => {
    await insertRealisticPlan(db)
    await insertPlanDeck(db, { id: 'deck-link-1', planId: 'plan-realistic', deckName: 'Deck A', isPrimary: 1 })
    await insertPlanDeck(db, { id: 'deck-link-2', planId: 'plan-realistic', deckName: 'Deck B', isPrimary: 0 })
    await insertCard(db, { id: 'card-1', deckName: 'Deck A', nextReview: '2026-01-05T10:00:00.000Z' })
    await insertCard(db, { id: 'card-2', deckName: 'Deck A', nextReview: '2026-01-06T10:00:00.000Z' })
    await insertCard(db, { id: 'card-3', deckName: 'Deck B', nextReview: '2026-01-01T10:00:00.000Z' })

    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=plan-realistic')
    const body = await res.json()
    expect(body.linkedDecks).toHaveLength(2)
    expect(body.linkedDecks[0]).toMatchObject({ deckName: 'Deck A', isPrimary: true, cardCount: 2, dueCount: 1 })
    expect(body.linkedDecks[1]).toMatchObject({ deckName: 'Deck B', isPrimary: false, cardCount: 1, dueCount: 1 })
  })

  it('returns the full response shape with a valid projection', async () => {
    const planId = await insertRealisticPlan(db)
    const res = await trackingSchedule(`/api/rotation-planner/tracking/schedule?planId=${planId}`)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(Object.keys(body).sort()).toEqual(['incorrectReview', 'linkedDecks', 'nextBlock', 'plan', 'schedule', 'selectionReason', 'window'])
    expect(Object.keys(body.plan).sort()).toEqual(['displayName', 'endDate', 'id', 'revision', 'rotationLabel', 'startDate', 'status'])
    expect(body.plan.rotationLabel).toBe('Cardiology')

    expect(body.schedule).toHaveLength(3)
    expect(body.schedule.map(s => s.taskId)).toEqual(['task-1', 'task-2', 'task-3'])
    expect(body.schedule[0]).toMatchObject({
      planQuestionGroupId: 'group-1',
      groupKey: 'cardio-uworld-1',
      groupTitle: 'Cardio UWorld Group 1',
      taskType: 'uworld_questions',
      plannedDate: '2026-01-05',
      targetQuestions: 20,
      completedQuestions: 0,
      remainingQuestions: 20,
      status: 'locked',
    })
    expect(body.schedule[0].missingLearningPrerequisites).toEqual([
      { planTopicId: 'topic-b', canonicalTopicId: 'c-cardio-2', title: 'Cardio Topic B' },
    ])
    expect(body.schedule[2]).toMatchObject({ taskId: 'task-3', plannedDate: '2026-01-07', targetQuestions: 10, remainingQuestions: 10 })

    expect(body.incorrectReview).toHaveLength(1)
    expect(body.incorrectReview[0]).toMatchObject({ taskId: 'task-4', taskType: 'incorrect_review', plannedDate: '2026-01-06' })

    expect(body.nextBlock).not.toBeNull()
    expect(body.nextBlock).toMatchObject({
      taskId: 'task-1',
      planQuestionGroupId: 'group-1',
      groupKey: 'cardio-uworld-1',
      groupTitle: 'Cardio UWorld Group 1',
      status: 'locked',
      targetQuestions: 40,
      completedQuestions: 0,
      remainingQuestions: 40,
      isPlanned: false,
      mayMove: false,
    })
  })

  it('returns a null rotationLabel for an unknown rotation_id', async () => {
    await insertPlan(db, { id: 'p-mystery', rotationId: 'not-a-real-rotation', displayName: 'Mystery', status: 'draft' })
    const res = await trackingSchedule('/api/rotation-planner/tracking/schedule?planId=p-mystery')
    const body = await res.json()
    expect(body.plan.rotationLabel).toBeNull()
  })

  it('does not reference legacy V1 endpoints in handler or projection source', () => {
    const handlerSource = readFileSync(resolve(__dirname, '../rotationPlannerPlans.js'), 'utf8')
    const projectionSource = readFileSync(resolve(__dirname, '../../services/rotationPlannerPlans/trackingProjection.js'), 'utf8')
    for (const source of [handlerSource, projectionSource]) {
      expect(source).not.toContain('/api/rotations/')
      expect(source).not.toContain('legacyPlans')
      expect(source).not.toContain('rotationPlannerV1')
    }
  })
})
