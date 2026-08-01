import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createTestDb } from '../../__tests__/helpers/d1TestHarness.js'
import {
  handlePreviewRotationPlan,
  handleCreateRotationPlan,
  handleListRotationPlans,
  handleGetRotationPlan,
  handleDeleteRotationPlan,
  handleUpdateTask,
  handleRecalculatePlan,
} from '../rotationPlannerPlans.js'
import { persistRecalculationBatch } from '../../services/rotationPlannerPlans/persistence.js'
import { createEmptyFlashcardForecast } from '../../services/rotationPlannerPlans/forecastIntegration.js'

const USER_A = { sub: 'user-a', email: 'a@test.local', role: 'authenticated' }
const USER_B = { sub: 'user-b', email: 'b@test.local', role: 'authenticated' }
const NO_USER = null

const VALID_BODY = {
  sourceId: 'step-up-medicine-6e-2024',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-11',
  studyStyle: 'active',
  schedulingMode: 'efficient',
  questionStartRule: 'next_available_day',
  availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
  topics: [{
    normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
    uworldRemainingQuestions: 20,
    alreadyCompletedLearningPercentage: 0,
    alreadyCompletedQuestionCount: 0,
  }],
  acceptOverload: false,
}

let db

beforeEach(async () => {
  db = await createTestDb()
})

function makeRequest(path, { method = 'GET', body = null, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } }
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  return new Request(`https://medstudy.app${path}`, opts)
}

async function preview(body = VALID_BODY, user = USER_A) {
  const req = makeRequest('/api/rotation-planner/plans/preview', { method: 'POST', body })
  return handlePreviewRotationPlan(req, { DB: db }, user)
}

async function createPlan(body = VALID_BODY, user = USER_A, extraHeaders = {}) {
  const req = makeRequest('/api/rotation-planner/plans', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2), ...extraHeaders },
  })
  return handleCreateRotationPlan(req, { DB: db }, user)
}

async function listPlans(user = USER_A) {
  const req = makeRequest('/api/rotation-planner/plans')
  return handleListRotationPlans(req, { DB: db }, user)
}

async function getPlan(planId, user = USER_A) {
  const req = makeRequest(`/api/rotation-planner/plans/${planId}`)
  return handleGetRotationPlan(req, { DB: db }, user)
}

async function deletePlan(planId, user = USER_A) {
  const req = makeRequest(`/api/rotation-planner/plans/${planId}`, { method: 'DELETE' })
  return handleDeleteRotationPlan(req, { DB: db }, user)
}

async function patchTask(planId, taskId, body, user = USER_A, extraHeaders = {}) {
  const req = makeRequest(`/api/rotation-planner/plans/${planId}/tasks/${taskId}`, {
    method: 'PATCH',
    body,
    headers: extraHeaders,
  })
  return handleUpdateTask(req, { DB: db }, user)
}

async function recalculate(planId, body, user = USER_A) {
  const req = makeRequest(`/api/rotation-planner/plans/${planId}/recalculate`, {
    method: 'POST',
    body,
  })
  return handleRecalculatePlan(req, { DB: db }, user)
}

function makeBody(overrides = {}) {
  return { ...VALID_BODY, ...overrides }
}

// ─── Preview ───
describe('handlePreviewRotationPlan', () => {
  it('returns 200 with V2 contract shape { plan, topics, tasks, availability }', async () => {
    const res = await preview()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['availability', 'plan', 'tasks', 'topics'])
    expect(body.plan).toBeDefined()
    expect(body.topics).toBeDefined()
    expect(Array.isArray(body.topics)).toBe(true)
    expect(body.tasks).toBeDefined()
    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.availability).toBeDefined()
    expect(Array.isArray(body.availability)).toBe(true)
  })

  it('plan DTO contains forecastSettings and forecast', async () => {
    const res = await preview()
    const body = await res.json()
    expect(body.plan.settingsJson).toBeDefined()
    expect(body.plan.settingsJson).toHaveProperty('forecastSettings')
    expect(body.plan.settingsJson).toHaveProperty('forecast')
  })

  it('performs zero DB writes', async () => {
    const planBefore = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plans').first()
    await preview()
    const planAfter = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_plans').first()
    expect(planAfter.c).toBe(planBefore.c)
  })
})

// ─── Create lifecycle ───
describe('Full lifecycle', () => {
  it('preview → create → list → get → delete → get(404)', async () => {
    // Preview
    const previewRes = await preview()
    expect(previewRes.status).toBe(200)
    const previewBody = await previewRes.json()

    // Create
    const createRes = await createPlan(makeBody({ previewToken: previewBody.plan.scheduleFingerprint }))
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    const planId = createBody.plan.id

    // List
    const listRes = await listPlans()
    const listBody = await listRes.json()
    expect(listBody.length).toBeGreaterThanOrEqual(1)
    expect(listBody.some(p => p.id === planId)).toBe(true)

    // Get
    const getRes = await getPlan(planId)
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.plan.id).toBe(planId)

    // Delete
    const delRes = await deletePlan(planId)
    expect(delRes.status).toBe(200)
    const delBody = await delRes.json()
    expect(delBody.success).toBe(true)

    // Get → 404
    const getRes2 = await getPlan(planId)
    expect(getRes2.status).toBe(404)
  })
})

// ─── Confidence lookup via sourceTopicId ───
describe('estimateConfidence on GET plan', () => {
  it('returns confidence from source catalog matched by sourceTopicId', async () => {
    const createRes = await createPlan(makeBody())
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()

    const getRes = await getPlan(plan.id)
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    const topic = getBody.topics.find(t => t.sourceTopicId === 'cardiology.stable-angina-pectoris')
    expect(topic).toBeDefined()
    expect(topic.estimateConfidence).toBe('good')
  })

  it('uses sourceTopicId directly — does not derive from normalizedTopicId', async () => {
    const createRes = await createPlan(makeBody())
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()

    const getRes = await getPlan(plan.id)
    const { topics } = await getRes.json()
    const topicId = topics[0].id

    const originalNormalized = topics[0].normalizedTopicId
    expect(originalNormalized).toContain('cardiology.stable-angina-pectoris')

    await db.prepare("UPDATE rotation_planner_topics SET source_topic_id = 'cardiology.variant-prinzmetal-angina' WHERE id = ?").bind(topicId).run()

    const getRes2 = await getPlan(plan.id)
    const getBody = await getRes2.json()
    const topic = getBody.topics[0]

    expect(topic.normalizedTopicId).toBe(originalNormalized)
    expect(topic.sourceTopicId).toBe('cardiology.variant-prinzmetal-angina')
    expect(topic.estimateConfidence).toBe('medium')
  })

  it('returns null confidence for unknown sourceTopicId', async () => {
    const createRes = await createPlan(makeBody())
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()

    const getRes = await getPlan(plan.id)
    const { topics } = await getRes.json()
    const topicId = topics[0].id
    await db.prepare("UPDATE rotation_planner_topics SET source_topic_id = 'nonexistent.topic' WHERE id = ?").bind(topicId).run()

    const getRes2 = await getPlan(plan.id)
    const getBody = await getRes2.json()
    const topic = getBody.topics[0]
    expect(topic.estimateConfidence).toBeNull()
  })
})

// ─── Cross-user isolation ───
describe('Cross-user isolation', () => {
  it('user B cannot get user A plan', async () => {
    const createRes = await createPlan(makeBody(), USER_A)
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()

    const getRes = await getPlan(plan.id, USER_B)
    expect(getRes.status).toBe(404)
  })

  it('user B cannot delete user A plan', async () => {
    const createRes = await createPlan(makeBody(), USER_A)
    const { plan } = await createRes.json()

    const delRes = await deletePlan(plan.id, USER_B)
    expect(delRes.status).toBe(404)
  })

  it('list plans only returns own plans', async () => {
    await createPlan(makeBody(), USER_A)
    await createPlan(makeBody(), USER_B)

    const listA = await listPlans(USER_A)
    const bodyA = await listA.json()
    const listB = await listPlans(USER_B)
    const bodyB = await listB.json()

    expect(Array.isArray(bodyA)).toBe(true)
    expect(Array.isArray(bodyB)).toBe(true)
    expect(bodyA.length).toBeGreaterThanOrEqual(1)
    expect(bodyB.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Stale preview ───
describe('Stale preview', () => {
  it('returns 409 when previewToken does not match', async () => {
    const res = await createPlan(makeBody({ previewToken: 'deadbeef' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('PREVIEW_STALE')
  })
})

// ─── Infeasible plan ───
describe('Infeasible plan', () => {
  it('returns 422 when plan is infeasible and acceptOverload is false', async () => {
    const allOff = Array.from({ length: 7 }, () => ({ weekday: 0, availableMinutes: 0, isDayOff: true }))
    allOff.forEach((d, i) => d.weekday = i)
    const res = await createPlan(makeBody({
      availability: allOff,
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      acceptOverload: false,
    }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_INFEASIBLE')
  })
})

// ─── Overload acceptance ───
describe('Overload acceptance', () => {
  it('returns 201 when acceptOverload is true even for infeasible plan', async () => {
    const allOff = Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 0, isDayOff: true }))
    const res = await createPlan(makeBody({
      availability: allOff,
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      acceptOverload: true,
    }))
    expect(res.status).toBe(201)
  })
})

// ─── acceptOverload flow (preview false → create true) ───
describe('acceptOverload flow', () => {
  it('preview with acceptOverload=false can create with acceptOverload=true without PREVIEW_STALE', async () => {
    // Preview with acceptOverload=false
    const previewRes = await preview(makeBody({ acceptOverload: false }))
    const previewBody = await previewRes.json()

    // Create with acceptOverload=true but same schedule fingerprint
    const createRes = await createPlan(makeBody({
      previewToken: previewBody.plan.scheduleFingerprint,
      acceptOverload: true,
    }))
    expect(createRes.status).toBe(201)
  })
})

// ─── Idempotent replay ───
describe('Idempotent replay', () => {
  it('same key + same fingerprint returns existing plan', async () => {
    const idemKey = 'idem-replay-' + Date.now()
    const res1 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res1.status).toBe(201)
    const body1 = await res1.json()

    const res2 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.plan.id).toBe(body1.plan.id)
  })

  it('same key + different fingerprint returns 409', async () => {
    const idemKey = 'idem-conflict-' + Date.now()
    const res1 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res1.status).toBe(201)

    const res2 = await createPlan(makeBody({
      topics: [{
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.acute-coronary-syndromes-acs',
        uworldRemainingQuestions: 10,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
      }],
    }), USER_A, { 'Idempotency-Key': idemKey })
    expect(res2.status).toBe(409)
    const body = await res2.json()
    expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT')
  })
})

// ─── Phase 2 handler integration ───
describe('Phase 2 — handler idempotency integration', () => {
  it('same key + same fingerprint returns structurally equal response', async () => {
    const idemKey = 'idem-struct-' + Date.now()
    const res1 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res1.status).toBe(201)
    const body1 = await res1.json()

    const res2 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2).toEqual(body1)
  })

  it('replay returns stored creation response, not current plan state', async () => {
    const idemKey = 'idem-state-' + Date.now()
    const res1 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    const body1 = await res1.json()
    expect(body1.plan.status).toBe('draft')
    expect(body1.plan.usesFlashcardCapacity).toBe(1)

    // Mutate the plan's current state directly (simulate activation + pause)
    // to change uses_flashcard_capacity to 0, without deleting the plan/mutation.
    await db.exec(`
      UPDATE rotation_planner_plans
      SET uses_flashcard_capacity = 0, status = 'paused'
      WHERE id = '${body1.plan.id}'
    `)

    // Replay should return the original stored result (usesFlashcardCapacity: 1, status: draft)
    const res2 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.plan.id).toBe(body1.plan.id)
    expect(body2.plan.status).toBe('draft')
    expect(body2.plan.usesFlashcardCapacity).toBe(1)
    expect(body2.availability).toHaveLength(7)
    expect(body2.topics).toHaveLength(1)
    expect(body2.tasks).toHaveLength(body1.tasks.length)
  })

  it('handler does not re-parse request body on UNIQUE error', async () => {
    const idemKey = 'idem-noparse-' + Date.now()
    const res1 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res1.status).toBe(201)

    const res2 = await createPlan(makeBody({
      topics: [{
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.acute-coronary-syndromes-acs',
        uworldRemainingQuestions: 10,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
      }],
    }), USER_A, { 'Idempotency-Key': idemKey })
    expect(res2.status).toBe(409)
    const body = await res2.json()
    expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('stored result_json is returned on replay, not loadPlanFromDb', async () => {
    const idemKey = 'idem-json-' + Date.now()
    const res1 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res1.status).toBe(201)
    const body1 = await res1.json()

    expect(body1.plan).toBeDefined()
    expect(typeof body1.plan.id).toBe('string')
    expect(body1.plan.sourceTitle).toBeDefined()
    expect(Array.isArray(body1.availability)).toBe(true)
    expect(Array.isArray(body1.topics)).toBe(true)
    expect(Array.isArray(body1.tasks)).toBe(true)

    const res2 = await createPlan(makeBody(), USER_A, { 'Idempotency-Key': idemKey })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2).toEqual(body1)
  })
})

// ─── Validation errors ───
describe('Validation', () => {
  it('preview returns 400 for empty body', async () => {
    const req = makeRequest('/api/rotation-planner/plans/preview', { method: 'POST', body: {} })
    const res = await handlePreviewRotationPlan(req, { DB: db }, USER_A)
    expect(res.status).toBe(400)
  })

  it('create returns 400 for missing idempotency key', async () => {
    const req = makeRequest('/api/rotation-planner/plans', { method: 'POST', body: VALID_BODY })
    const res = await handleCreateRotationPlan(req, { DB: db }, USER_A)
    expect(res.status).toBe(400)
  })
})

// ─── PATCH /plans/:planId/tasks/:taskId ───
describe('handleUpdateTask', () => {
  async function createPlanAndGetFirstTask(user = USER_A) {
    const createRes = await createPlan(makeBody(), user)
    expect(createRes.status).toBe(201)
    const planBody = await createRes.json()
    const planId = planBody.plan.id
    const taskId = planBody.tasks[0].id
    return { planId, taskId }
  }

  it('returns 400 for missing action', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { payload: {}, expectedRevision: 0 })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid action', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'nonexistent_action', expectedRevision: 0 })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 for nonexistent plan', async () => {
    const res = await patchTask('nonexistent-plan', 'nonexistent-task', { action: 'start', expectedRevision: 0 })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_NOT_FOUND')
  })

  it('returns 404 for nonexistent task', async () => {
    const { planId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, 'nonexistent-task', { action: 'start', expectedRevision: 0 })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('TASK_NOT_FOUND')
  })

  it('successfully starts a pending task', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.taskId).toBe(taskId)
    expect(body.action).toBe('start')
    expect(body.status).toBe('in_progress')
  })

  it('successfully completes a pending task', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'complete', payload: { actualMinutes: 45 }, expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.taskId).toBe(taskId)
    expect(body.action).toBe('complete')
    expect(body.status).toBe('completed')
    expect(body.completedAt).toBeTruthy()
  })

  it('returns 409 for idempotency conflict', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, { action: 'start', clientRequestId: 'idem-1', expectedRevision: 0 })
    expect(res1.status).toBe(200)

    const res2 = await patchTask(planId, taskId, { action: 'complete', clientRequestId: 'idem-1', expectedRevision: 1 })
    expect(res2.status).toBe(409)
  })

  it('returns 400 when expectedRevision is missing', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'start' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('expectedRevision')
  })

  it('returns 400 when expectedRevision is not an integer', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'start', expectedRevision: 1.5 })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when expectedRevision is negative', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'start', expectedRevision: -1 })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 409 PLAN_REVISION_CONFLICT when expectedRevision does not match', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'start', expectedRevision: 999 })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_REVISION_CONFLICT')
  })

  it('reads Idempotency-Key header and uses it for idempotency', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 }, USER_A, { 'Idempotency-Key': 'header-key-1' })
    expect(res1.status).toBe(200)

    const res2 = await patchTask(planId, taskId, { action: 'start', expectedRevision: 1 }, USER_A, { 'Idempotency-Key': 'header-key-1' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.status).toBe('in_progress')
  })

  it('returns idempotent replay result for same header key + same input', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 }, USER_A, { 'Idempotency-Key': 'replay-key' })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()

    const res2 = await patchTask(planId, taskId, { action: 'start', expectedRevision: 1 }, USER_A, { 'Idempotency-Key': 'replay-key' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.taskId).toBe(body1.taskId)
    expect(body2.status).toBe(body1.status)
  })

  it('header Idempotency-Key takes precedence over body clientRequestId', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'start', clientRequestId: 'body-key', expectedRevision: 0 }, USER_A, { 'Idempotency-Key': 'header-key' })
    expect(res.status).toBe(200)

    const res2 = await patchTask(planId, taskId, { action: 'start', clientRequestId: 'body-key', expectedRevision: 1 }, USER_A, { 'Idempotency-Key': 'different-header-key' })
    expect(res2.status).toBe(409)
  })
})

// ─── POST /plans/:planId/recalculate ───
describe('handleRecalculatePlan', () => {
  async function createAndGetPlanId(user = USER_A) {
    const createRes = await createPlan(makeBody(), user)
    expect(createRes.status).toBe(201)
    const planBody = await createRes.json()
    return planBody.plan.id
  }

  it('returns 400 for missing recalculationDate', async () => {
    const planId = await createAndGetPlanId()
    const res = await recalculate(planId, {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 for nonexistent plan', async () => {
    const res = await recalculate('nonexistent-plan', { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_NOT_FOUND')
  })

  it('successfully recalculates a plan', async () => {
    const planId = await createAndGetPlanId()
    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.planId).toBe(planId)
    expect(body.recalculationDate).toBe('2026-01-06')
    expect(body.revision).toBeDefined()
    expect(body.topicStates).toBeDefined()
  })

  it('handles idempotent recalculation', async () => {
    const planId = await createAndGetPlanId()
    const res1 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'recalc-idem-1' })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()

    const res2 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'recalc-idem-1' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.planId).toBe(body1.planId)
  })

  it('returns 409 TASK_IN_PROGRESS when a task is in_progress', async () => {
    const createRes = await createPlan(makeBody(), USER_A)
    const planBody = await createRes.json()
    const planId = planBody.plan.id
    const taskId = planBody.tasks[0].id

    const startRes = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    expect(startRes.status).toBe(200)

    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 1 })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('TASK_IN_PROGRESS')
    expect(body.error.details.inProgressTaskId).toBe(taskId)
  })
})

// ─── PATCH recalculationRequired ───
describe('handleUpdateTask recalculationRequired', () => {
  async function createPlanAndGetFirstTask(user = USER_A) {
    const createRes = await createPlan(makeBody(), user)
    expect(createRes.status).toBe(201)
    const planBody = await createRes.json()
    return { planId: planBody.plan.id, taskId: planBody.tasks[0].id }
  }

  it('start action returns recalculationRequired: false', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recalculationRequired).toBe(false)
  })

  it('complete action returns recalculationRequired: true', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'complete', payload: { actualMinutes: 45 }, expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recalculationRequired).toBe(true)
  })

  it('partial action returns recalculationRequired: true', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const startRes = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    expect(startRes.status).toBe(200)
    const res = await patchTask(planId, taskId, { action: 'partial', payload: { completedPercentage: 50, actualMinutes: 30 }, expectedRevision: 1 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recalculationRequired).toBe(true)
  })

  it('skip action returns recalculationRequired: true', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, { action: 'skip', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recalculationRequired).toBe(true)
  })

  it('record_time action returns recalculationRequired: false', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const startRes = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    expect(startRes.status).toBe(200)
    const res = await patchTask(planId, taskId, { action: 'record_time', payload: { actualMinutes: 15 }, expectedRevision: 1 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recalculationRequired).toBe(false)
  })

  it('idempotent replay returns same recalculationRequired', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, { action: 'complete', payload: { actualMinutes: 45 }, expectedRevision: 0 }, USER_A, { 'Idempotency-Key': 'recalc-idem' })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()
    expect(body1.recalculationRequired).toBe(true)

    const res2 = await patchTask(planId, taskId, { action: 'complete', payload: { actualMinutes: 45 }, expectedRevision: 1 }, USER_A, { 'Idempotency-Key': 'recalc-idem' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.recalculationRequired).toBe(true)
    expect(body2.recalculationRequired).toBe(body1.recalculationRequired)
  })
})

// ─── POST /plans/:planId/recalculate expectedRevision ───
describe('handleRecalculatePlan expectedRevision', () => {
  async function createAndGetPlanId(user = USER_A) {
    const createRes = await createPlan(makeBody(), user)
    expect(createRes.status).toBe(201)
    const planBody = await createRes.json()
    return planBody.plan.id
  }

  it('returns 400 when expectedRevision is missing', async () => {
    const planId = await createAndGetPlanId()
    const res = await recalculate(planId, { recalculationDate: '2026-01-06' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when expectedRevision is negative', async () => {
    const planId = await createAndGetPlanId()
    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: -1 })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when expectedRevision is not an integer', async () => {
    const planId = await createAndGetPlanId()
    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 1.5 })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 409 when expectedRevision is stale', async () => {
    const createRes = await createPlan(makeBody(), USER_A)
    const planBody = await createRes.json()
    const pid = planBody.plan.id
    const tid = planBody.tasks[0].id

    const startRes = await patchTask(pid, tid, { action: 'start', expectedRevision: 0 })
    expect(startRes.status).toBe(200)

    const res = await recalculate(pid, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_REVISION_CONFLICT')
  })

  it('successfully recalculates with matching expectedRevision', async () => {
    const planId = await createAndGetPlanId()
    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.planId).toBe(planId)
    expect(body.revision).toBeDefined()
  })

  it('records revision in response', async () => {
    const planId = await createAndGetPlanId()
    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revision).toBe(1)
  })

  it('idempotent replay returns same result', async () => {
    const planId = await createAndGetPlanId()
    const res1 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'recalc-replay' })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()

    const res2 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'recalc-replay' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.planId).toBe(body1.planId)
    expect(body2.revision).toBe(body1.revision)
    expect(body2.recalculationDate).toBe(body1.recalculationDate)
  })
})

// ─── Topic status transitions ───
describe('topic status transitions on task mutations', () => {
  async function createPlanAndGetFirstTask(user = USER_A) {
    const createRes = await createPlan(makeBody(), user)
    expect(createRes.status).toBe(201)
    const planBody = await createRes.json()
    return { planId: planBody.plan.id, taskId: planBody.tasks[0].id, topicId: planBody.topics[0].id }
  }

  async function getTopicStatus(topicId) {
    const row = await db.prepare('SELECT status FROM rotation_planner_topics WHERE id = ?').bind(topicId).first()
    return row?.status
  }

  it('starts a learning task and advances topic to learning', async () => {
    const { planId, taskId, topicId } = await createPlanAndGetFirstTask()
    const initialStatus = await getTopicStatus(topicId)

    const res = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    expect(res.status).toBe(200)

    const afterStatus = await getTopicStatus(topicId)
    const STATUS_ORDER = ['not_started', 'learning', 'questions_locked', 'uworld_in_progress', 'incorrect_review', 'maintenance', 'completed']
    expect(STATUS_ORDER.indexOf(afterStatus)).toBeGreaterThanOrEqual(STATUS_ORDER.indexOf(initialStatus))
  })

  it('does not regress topic status on partial action', async () => {
    const { planId, taskId, topicId } = await createPlanAndGetFirstTask()

    await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    const statusAfterStart = await getTopicStatus(topicId)

    await patchTask(planId, taskId, { action: 'partial', payload: { completionPercentage: 50, actualMinutes: 15 }, expectedRevision: 1 })
    const statusAfterPartial = await getTopicStatus(topicId)

    const STATUS_ORDER = ['not_started', 'learning', 'questions_locked', 'uworld_in_progress', 'incorrect_review', 'maintenance', 'completed']
    expect(STATUS_ORDER.indexOf(statusAfterPartial)).toBeGreaterThanOrEqual(STATUS_ORDER.indexOf(statusAfterStart))
  })

  it('does not regress topic status on skip action', async () => {
    const { planId, taskId, topicId } = await createPlanAndGetFirstTask()

    await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    const statusAfterStart = await getTopicStatus(topicId)

    await patchTask(planId, taskId, { action: 'skip', expectedRevision: 1 })
    const statusAfterSkip = await getTopicStatus(topicId)

    const STATUS_ORDER = ['not_started', 'learning', 'questions_locked', 'uworld_in_progress', 'incorrect_review', 'maintenance', 'completed']
    expect(STATUS_ORDER.indexOf(statusAfterSkip)).toBeGreaterThanOrEqual(STATUS_ORDER.indexOf(statusAfterStart))
  })
})

// ─── R1 integration — persistence durability, rollback, bulk ───
describe('R1 integration — persistence durability, rollback, bulk', () => {
  it('POST→GET deep durability — recalculate persists all data to DB', async () => {
    const createRes = await createPlan()
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    const planId = createBody.plan.id

    const recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(recalcRes.status).toBe(200)
    const recalcBody = await recalcRes.json()
    expect(recalcBody.revision).toBe(1)

    const getRes1 = await getPlan(planId)
    expect(getRes1.status).toBe(200)
    const getBody1 = await getRes1.json()

    expect(getBody1.plan.id).toBe(planId)
    expect(getBody1.plan.revision).toBe(1)

    expect(getBody1.tasks.length).toBeGreaterThan(0)
    for (const task of getBody1.tasks) {
      expect(task.id).toBeDefined()
      expect(task.planTopicId).toBeDefined()
      expect(task.taskDate).toBeDefined()
      expect(task.taskType).toBeDefined()
      expect(task.status).toBe('pending')
      expect(task.estimatedMinutes).toBeGreaterThan(0)
    }

    expect(getBody1.topics.length).toBe(1)
    expect(getBody1.topics[0].normalizedTopicId).toBe('step-up-medicine-6e-2024::cardiology.stable-angina-pectoris')
    expect(getBody1.topics[0].totalUworldQuestions).toBe(20)

    const getRes2 = await getPlan(planId)
    expect(getRes2.status).toBe(200)
    const getBody2 = await getRes2.json()

    expect(getBody2.plan.id).toBe(getBody1.plan.id)
    expect(getBody2.plan.revision).toBe(getBody1.plan.revision)
    expect(getBody2.tasks.length).toBe(getBody1.tasks.length)
    expect(getBody2.tasks.map(t => t.id).sort()).toEqual(getBody1.tasks.map(t => t.id).sort())
  })

  it('transaction rollback — invalid data does not corrupt existing state', async () => {
    const createRes = await createPlan()
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    const planId = createBody.plan.id
    const originalTopics = createBody.topics
    const originalTasks = createBody.tasks

    const tasksBefore = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    const topicsBefore = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    const planBefore = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind(planId).first()

    expect(tasksBefore.c).toBe(originalTasks.length)
    expect(topicsBefore.c).toBe(originalTopics.length)
    expect(planBefore.revision).toBe(0)

    await expect(
      persistRecalculationBatch({ DB: db }, {
        planId,
        userId: USER_A.sub,
        expectedRevision: 0,
        clientRequestId: 'test-rollback-' + Date.now(),
        requestFingerprint: 'test-fingerprint',
        operation: 'recalculate',
        regeneratedTasks: [{
          id: crypto.randomUUID(),
          planTopicId: originalTopics[0].id,
          taskDate: '2026-01-06',
          taskType: 'INVALID_TYPE',
          provider: null,
          estimatedMinutes: 30,
          targetCount: 0,
          mode: null,
          questionPool: null,
          status: 'pending',
          unlockCondition: null,
          displayOrder: 0,
          metadata: {},
        }],
        updatedTopics: [{
          planTopicId: originalTopics[0].id,
          completedUworldQuestions: 0,
          incorrectQuestionsRemaining: 0,
          learningCompletedAt: null,
          questionsUnlockedAt: null,
          status: 'not_started',
        }],
        resultJson: {
          planId,
          revision: 1,
          recalculationDate: '2026-01-06',
          replayed: false,
          tasks: { created: 1, modified: 0, preserved: 0 },
          topicStates: [],
        },
        recalculationMutationId: crypto.randomUUID(),
        recalculatedAt: new Date().toISOString(),
      })
    ).rejects.toThrow()

    const tasksAfter = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    const topicsAfter = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    const planAfter = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind(planId).first()

    expect(tasksAfter.c).toBe(tasksBefore.c)
    expect(topicsAfter.c).toBe(topicsBefore.c)
    expect(planAfter.revision).toBe(0)
  })

  it('bulk persistence — 120+ topics generate persisted tasks with unique IDs', async () => {
    const createRes = await createPlan()
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    const planId = createBody.plan.id

    const TOPIC_COUNT = 120
    for (let i = 0; i < TOPIC_COUNT; i++) {
      const topicId = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO rotation_planner_topics (
          id, plan_id, normalized_topic_id, canonical_topic_id, source_topic_id,
          shared_topic_key, topic_title, group_id,
          base_learning_minutes, personalized_learning_minutes,
          total_uworld_questions, completed_uworld_questions,
          learning_completed_at, questions_unlocked_at,
          status, incorrect_questions_remaining, mastery_score, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        topicId, planId,
        `step-up-medicine-6e-2024::cardiology.topic-${i}`,
        `cardiology.topic-${i}`,
        `cardiology.topic-${i}`,
        null,
        `Topic ${i}`,
        'cardiology',
        60, 60,
        10, 0,
        null, null,
        'not_started', 0, null, i + 1,
      ).run()
    }

    const topicCountBefore = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    expect(topicCountBefore.c).toBe(TOPIC_COUNT + 1)

    const recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(recalcRes.status).toBe(200)
    const recalcBody = await recalcRes.json()
    expect(recalcBody.revision).toBe(1)

    const getRes = await getPlan(planId)
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()

    expect(getBody.tasks.length).toBeGreaterThan(0)
    expect(getBody.tasks.length).toBe(recalcBody.tasks.created + recalcBody.tasks.preserved)

    const taskIds = getBody.tasks.map(t => t.id)
    const uniqueIds = new Set(taskIds)
    expect(uniqueIds.size).toBe(taskIds.length)

    expect(getBody.plan.revision).toBe(1)

    const VALID_TOPIC_STATUSES = new Set([
      'not_started', 'learning', 'questions_locked', 'uworld_in_progress',
      'incorrect_review', 'maintenance', 'completed',
    ])
    for (const topic of getBody.topics) {
      expect(VALID_TOPIC_STATUSES.has(topic.status)).toBe(true)
    }
  })
})

// ─── R2 — Recalculation Durability Contract ───

describe('R2 — Idempotency Contract', () => {
  async function countRecalcMutations(planId) {
    const row = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_plan_mutations WHERE plan_id = ? AND operation = 'recalculate'").bind(planId).first()
    return row.c
  }

  it('A — same key + same request = replay (no revision increment)', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()
    const planId = plan.id

    const res1 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'idem-A' })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()
    const rev1 = body1.revision
    expect(rev1).toBe(1)

    const mutationsAfter1 = await countRecalcMutations(planId)
    expect(mutationsAfter1).toBe(1)

    const res2 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'idem-A' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()

    expect(body2.revision).toBe(rev1)
    expect(body2).toEqual(body1)

    const mutationsAfter2 = await countRecalcMutations(planId)
    expect(mutationsAfter2).toBe(1)
  })

  it('B — same key + different recalculationDate = IDEMPOTENCY_CONFLICT', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()
    const planId = plan.id

    const res1 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'idem-B' })
    expect(res1.status).toBe(200)

    const res2 = await recalculate(planId, { recalculationDate: '2026-01-07', expectedRevision: 0, clientRequestId: 'idem-B' })
    expect(res2.status).toBe(409)
    const body = await res2.json()
    expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('C — same key + different expectedRevision = IDEMPOTENCY_CONFLICT', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()
    const planId = plan.id

    const res1 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'idem-C' })
    expect(res1.status).toBe(200)

    // Same clientRequestId, same recalculationDate, but expectedRevision differs → different fingerprint
    const res2 = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 1, clientRequestId: 'idem-C' })
    expect(res2.status).toBe(409)
    const body = await res2.json()
    expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  // D — Concurrent duplicate with same fingerprint = replay (not conflict)
  // Cannot be simulated in single-DB tests; the race path is exercised only under true concurrency.
  // The idempotency check-before-batch path (tested in A) covers the common case.
})

describe('R2 — Stale Revision Contract', () => {
  it('returns 409 PLAN_REVISION_CONFLICT and preserves all state', async () => {
    const createRes = await createPlan()
    const { plan, tasks, topics } = await createRes.json()
    const planId = plan.id
    const taskId = tasks[0].id

    // Start a task to bump revision 0→1
    const startRes = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    expect(startRes.status).toBe(200)

    // Attempt recalculate with stale expectedRevision
    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'stale-rev' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_REVISION_CONFLICT')

    // Plan revision unchanged (still 1 from the task start)
    const planRow = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind(planId).first()
    expect(planRow.revision).toBe(1)

    // Task count unchanged
    const taskCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    expect(taskCount.c).toBe(tasks.length)

    // Topic count unchanged
    const topicCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    expect(topicCount.c).toBe(topics.length)

    // No new recalculation mutation rows for the stale recalculate request
    const mutations = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_plan_mutations WHERE plan_id = ? AND operation = 'recalculate'").bind(planId).first()
    expect(mutations.c).toBe(0)
  })
})

describe('R2 — In-Progress Safety', () => {
  it('A — single in_progress task blocks recalculation', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id
    const taskId = tasks[0].id

    const startRes = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0 })
    expect(startRes.status).toBe(200)

    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 1 })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('TASK_IN_PROGRESS')
    expect(body.error.details.inProgressTaskId).toBe(taskId)

    // Revision unchanged
    const planRow = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind(planId).first()
    expect(planRow.revision).toBe(1)

    // No task deletions
    const taskCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    expect(taskCount.c).toBe(tasks.length)

    // No topic updates (topics count unchanged)
    const topicCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    expect(topicCount.c).toBe(plan.topics?.length || 1)

    // No new recalculation mutation rows
    const mutations = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_plan_mutations WHERE plan_id = ? AND operation = 'recalculate'").bind(planId).first()
    expect(mutations.c).toBe(0)
  })

  it('B — multiple in_progress tasks block recalculation', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id
    const pendingTasks = tasks.filter(t => t.status === 'pending')
    expect(pendingTasks.length).toBeGreaterThanOrEqual(2)

    const start1 = await patchTask(planId, pendingTasks[0].id, { action: 'start', expectedRevision: 0 })
    expect(start1.status).toBe(200)

    const start2 = await patchTask(planId, pendingTasks[1].id, { action: 'start', expectedRevision: 1 })
    expect(start2.status).toBe(200)

    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 2 })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('TASK_IN_PROGRESS')
    expect(body.error.details.inProgressTaskId).toBeDefined()
  })
})

describe('R2 — Empty / No-Remaining-Work Recalculation', () => {
  function payloadForTask(task) {
    const payload = { actualMinutes: task.estimatedMinutes || 30 }
    if (task.taskType === 'uworld_questions') {
      payload.completedCount = task.targetCount || 10
      payload.incorrectCount = 2
    } else if (task.taskType === 'incorrect_review') {
      payload.completedCount = task.targetCount || 5
    }
    return payload
  }

  it('completing all tasks and recalculating preserves completed rows', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id

    // Complete all tasks directly from pending
    let rev = 0
    for (const task of tasks) {
      const res = await patchTask(planId, task.id, { action: 'complete', payload: payloadForTask(task), expectedRevision: rev })
      expect(res.status).toBe(200)
      rev++
    }

    // All tasks are completed
    const completedCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND status = ?').bind(planId, 'completed').first()
    expect(completedCount.c).toBe(tasks.length)

    // Recalculate — DELETE only targets pending/locked; completed rows preserved
    const res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.revision).toBe(rev + 1)
    expect(body.tasks.preserved).toBe(tasks.length)

    // Completed rows still in DB
    const completedAfter = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND status = ?').bind(planId, 'completed').first()
    expect(completedAfter.c).toBe(tasks.length)
  })
})

describe('R2 — Partial Learning Contract', () => {
  it('preserves partial row and generates remaining work, then completes learning', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id

    // Find first learning task
    const learningTask = tasks.find(t => t.taskType === 'learning')
    expect(learningTask).toBeDefined()

    // Start it → in_progress (rev 0→1)
    const startRes = await patchTask(planId, learningTask.id, { action: 'start', expectedRevision: 0 })
    expect(startRes.status).toBe(200)

    // Partial it → partial (rev 1→2)
    const partialRes = await patchTask(planId, learningTask.id, {
      action: 'partial',
      payload: { completedPercentage: 50, actualMinutes: 20 },
      expectedRevision: 1,
    })
    expect(partialRes.status).toBe(200)

    // Recalculate (rev 2→3)
    const recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 2 })
    expect(recalcRes.status).toBe(200)
    const recalcBody = await recalcRes.json()

    // Original partial row preserved
    const preservedTask = await db.prepare('SELECT * FROM rotation_planner_daily_tasks WHERE id = ?').bind(learningTask.id).first()
    expect(preservedTask.status).toBe('partial')

    // New tasks generated for remaining work
    expect(recalcBody.tasks.created).toBeGreaterThan(0)

    // Get updated plan to find new tasks
    const getRes = await getPlan(planId)
    const getBody = await getRes.json()

    const newLearningTasks = getBody.tasks.filter(t => t.taskType === 'learning' && t.status === 'pending')
    expect(newLearningTasks.length).toBeGreaterThan(0)

    // Complete all new learning tasks
    let rev = recalcBody.revision
    for (const task of newLearningTasks) {
      const res = await patchTask(planId, task.id, { action: 'complete', payload: { actualMinutes: 15 }, expectedRevision: rev })
      expect(res.status).toBe(200)
      rev++
    }

    // Recalculate again → learning complete, UWorld unlocks
    const recalc2Res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(recalc2Res.status).toBe(200)
    const recalc2Body = await recalc2Res.json()

    const topicState = recalc2Body.topicStates.find(ts => ts.id.includes('stable-angina'))
    expect(topicState).toBeDefined()
    expect(topicState.status).toBe('uworld_in_progress')
    expect(topicState.learningComplete).toBe(true)
  })
})

describe('R2 — Skipped Work Contract', () => {
  it('skipped row preserved and not duplicated across recalculations', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id
    const firstTask = tasks[0]

    // Skip first task (rev 0→1)
    const skipRes = await patchTask(planId, firstTask.id, { action: 'skip', expectedRevision: 0 })
    expect(skipRes.status).toBe(200)
    const skipBody = await skipRes.json()
    expect(skipBody.status).toBe('skipped')

    // Recalculate (rev 1→2)
    const recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 1 })
    expect(recalcRes.status).toBe(200)
    const recalcBody = await recalcRes.json()

    // Skipped row preserved
    const skippedRow = await db.prepare('SELECT * FROM rotation_planner_daily_tasks WHERE id = ?').bind(firstTask.id).first()
    expect(skippedRow.status).toBe('skipped')
    expect(skippedRow.task_date).toBe(firstTask.taskDate)

    // New tasks generated
    expect(recalcBody.tasks.created).toBeGreaterThan(0)

    // Recalculate again (rev → next)
    const recalc2Res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: recalcBody.revision })
    expect(recalc2Res.status).toBe(200)

    // Skipped row still exactly 1
    const skippedCount = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND status = ?').bind(planId, 'skipped').first()
    expect(skippedCount.c).toBe(1)

    // Same skipped row with same ID
    const skippedStill = await db.prepare('SELECT id FROM rotation_planner_daily_tasks WHERE plan_id = ? AND status = ?').bind(planId, 'skipped').all()
    expect(skippedStill.results[0].id).toBe(firstTask.id)
  })
})

describe('R2 — Overdue Pending / Locked Contract', () => {
  it('recalculation from later date deletes old pending tasks and regenerates from new date', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id

    // All tasks are pending from creation
    const pendingBefore = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND status = ?').bind(planId, 'pending').first()
    expect(pendingBefore.c).toBeGreaterThan(0)

    // Some tasks exist before 2026-01-07
    const before0107 = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND status = ? AND task_date < ?').bind(planId, 'pending', '2026-01-07').first()
    expect(before0107.c).toBeGreaterThan(0)

    // Recalculate from 2026-01-07
    const res = await recalculate(planId, { recalculationDate: '2026-01-07', expectedRevision: 0 })
    expect(res.status).toBe(200)

    // No pending tasks before 2026-01-07
    const beforeAfter = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND status = ? AND task_date < ?').bind(planId, 'pending', '2026-01-07').first()
    expect(beforeAfter.c).toBe(0)

    // New tasks from 2026-01-07 onward
    const from0107 = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND status = ? AND task_date >= ?').bind(planId, 'pending', '2026-01-07').first()
    expect(from0107.c).toBeGreaterThan(0)
  })
})

describe('R2 — UWorld Progress', () => {
  function payloadForTask(task, overrides = {}) {
    const payload = { actualMinutes: overrides.actualMinutes ?? 15 }
    if (task.taskType === 'uworld_questions') {
      payload.completedCount = overrides.completedCount ?? task.targetCount ?? 10
      payload.incorrectCount = overrides.incorrectCount ?? 2
    } else if (task.taskType === 'incorrect_review') {
      payload.completedCount = overrides.completedCount ?? task.targetCount ?? 5
    }
    return payload
  }

  it('tracks completedUworldQuestions and incorrectQuestionsRemaining', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id

    // Complete all learning tasks
    const learningTasks = tasks.filter(t => t.taskType === 'learning')
    let rev = 0
    for (const task of learningTasks) {
      const res = await patchTask(planId, task.id, { action: 'complete', payload: payloadForTask(task), expectedRevision: rev })
      expect(res.status).toBe(200)
      rev++
    }

    // Recalculate → unlocks UWorld
    let recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(recalcRes.status).toBe(200)
    rev = (await recalcRes.json()).revision

    // GET plan to find UWorld tasks
    let getRes = await getPlan(planId)
    let getBody = await getRes.json()
    const uworldTasks = getBody.tasks.filter(t => t.taskType === 'uworld_questions')
    expect(uworldTasks.length).toBeGreaterThanOrEqual(1)

    // Complete UWorld tasks with specific counts
    let totalCompleted = 0
    let totalIncorrect = 0
    const incorrectCounts = [3, 2]
    for (let i = 0; i < uworldTasks.length; i++) {
      const task = uworldTasks[i]
      const ic = incorrectCounts[i] ?? 0
      const cc = task.targetCount || 10
      const res = await patchTask(planId, task.id, {
        action: 'complete',
        payload: { actualMinutes: 15, completedCount: cc, incorrectCount: ic },
        expectedRevision: rev,
      })
      expect(res.status).toBe(200)
      rev++
      totalCompleted += cc
      totalIncorrect += ic
    }

    // Recalculate
    recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(recalcRes.status).toBe(200)
    const recalcBody = await recalcRes.json()

    // Verify via GET topic state
    getRes = await getPlan(planId)
    getBody = await getRes.json()
    const topic = getBody.topics[0]
    expect(topic.completedUworldQuestions).toBe(totalCompleted)
    expect(topic.incorrectQuestionsRemaining).toBe(totalIncorrect)

    // Existing UWorld tasks preserved (status = completed)
    const completedUworld = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND task_type = ? AND status = ?').bind(planId, 'uworld_questions', 'completed').first()
    expect(completedUworld.c).toBe(uworldTasks.length)
  })
})

describe('R2 — Incorrect Review Progress', () => {
  function payloadForTask(task, overrides = {}) {
    const payload = { actualMinutes: overrides.actualMinutes ?? 15 }
    if (task.taskType === 'uworld_questions') {
      payload.completedCount = overrides.completedCount ?? task.targetCount ?? 10
      payload.incorrectCount = overrides.incorrectCount ?? 2
    } else if (task.taskType === 'incorrect_review') {
      payload.completedCount = overrides.completedCount ?? task.targetCount ?? 5
    }
    return payload
  }

  it('tracks incorrect review progress across recalculations', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id

    // Complete all learning tasks
    const learningTasks = tasks.filter(t => t.taskType === 'learning')
    let rev = 0
    for (const task of learningTasks) {
      const res = await patchTask(planId, task.id, { action: 'complete', payload: payloadForTask(task), expectedRevision: rev })
      expect(res.status).toBe(200)
      rev++
    }

    // Recalculate → UWorld unlocked
    let recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(recalcRes.status).toBe(200)
    rev = (await recalcRes.json()).revision

    // Complete UWorld tasks with incorrect counts
    let getRes = await getPlan(planId)
    let getBody = await getRes.json()
    const uworldTasks = getBody.tasks.filter(t => t.taskType === 'uworld_questions')
    const incorrectCounts = [3, 2]
    let totalIncorrect = 0
    for (let i = 0; i < uworldTasks.length; i++) {
      const task = uworldTasks[i]
      const ic = incorrectCounts[i] ?? 0
      const res = await patchTask(planId, task.id, {
        action: 'complete',
        payload: { actualMinutes: 15, completedCount: task.targetCount || 10, incorrectCount: ic },
        expectedRevision: rev,
      })
      expect(res.status).toBe(200)
      rev++
      totalIncorrect += ic
    }

    // First recalculate: persists correct incorrectQuestionsRemaining to DB.
    // scheduleIncorrectReview reads topic.incorrectQuestionsRemaining from planConfig.topics
    // (DB value = 0) rather than from topicStates, so no incorrect_review tasks are generated yet.
    recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(recalcRes.status).toBe(200)
    rev = (await recalcRes.json()).revision

    // Second recalculate: planConfig.topics now reads updated DB value (5),
    // so scheduleIncorrectReview generates incorrect_review tasks.
    recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(recalcRes.status).toBe(200)
    rev = (await recalcRes.json()).revision

    // Find incorrect_review tasks
    getRes = await getPlan(planId)
    getBody = await getRes.json()
    const incorrectTasks = getBody.tasks.filter(t => t.taskType === 'incorrect_review')
    expect(incorrectTasks.length).toBeGreaterThan(0)

    // Complete first incorrect_review task with completedCount: 2
    const firstIncorrect = incorrectTasks[0]
    const completeRes = await patchTask(planId, firstIncorrect.id, {
      action: 'complete',
      payload: { actualMinutes: 10, completedCount: 2 },
      expectedRevision: rev,
    })
    expect(completeRes.status).toBe(200)
    rev++

    // Recalculate
    recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(recalcRes.status).toBe(200)
    rev = (await recalcRes.json()).revision

    // Verify incorrectQuestionsRemaining = totalIncorrect - 2 (reviewed)
    getRes = await getPlan(planId)
    getBody = await getRes.json()
    const topic = getBody.topics[0]
    expect(topic.incorrectQuestionsRemaining).toBe(totalIncorrect - 2)

    // Completed incorrect_review row preserved
    const completedRow = await db.prepare('SELECT * FROM rotation_planner_daily_tasks WHERE id = ?').bind(firstIncorrect.id).first()
    expect(completedRow.status).toBe('completed')
    expect(completedRow.completed_count).toBe(2)

    // Repeated recalculation still returns same value
    const recalc2Res = await recalculate(planId, { recalculationDate: '2026-01-07', expectedRevision: rev })
    expect(recalc2Res.status).toBe(200)

    getRes = await getPlan(planId)
    getBody = await getRes.json()
    expect(getBody.topics[0].incorrectQuestionsRemaining).toBe(totalIncorrect - 2)
  })
})

describe('R2 — Topic Milestone Stability', () => {
  function payloadForTask(task) {
    const payload = { actualMinutes: 30 }
    if (task.taskType === 'uworld_questions') {
      payload.completedCount = task.targetCount || 10
      payload.incorrectCount = 0
    } else if (task.taskType === 'incorrect_review') {
      payload.completedCount = task.targetCount || 5
    }
    return payload
  }

  it('learningCompletedAt and questionsUnlockedAt are stable across recalculations', async () => {
    const createRes = await createPlan()
    const { plan, tasks } = await createRes.json()
    const planId = plan.id

    // Complete all learning tasks
    const learningTasks = tasks.filter(t => t.taskType === 'learning')
    let rev = 0
    for (const task of learningTasks) {
      const res = await patchTask(planId, task.id, { action: 'complete', payload: payloadForTask(task), expectedRevision: rev })
      expect(res.status).toBe(200)
      rev++
    }

    // Recalculate → sets learningCompletedAt and questionsUnlockedAt
    const recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: rev })
    expect(recalcRes.status).toBe(200)
    const recalcBody = await recalcRes.json()

    // Record milestones
    const topicRow1 = await db.prepare('SELECT learning_completed_at, questions_unlocked_at FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    expect(topicRow1.learning_completed_at).toBeTruthy()
    expect(topicRow1.questions_unlocked_at).toBeTruthy()
    const learningCompletedAt1 = topicRow1.learning_completed_at
    const questionsUnlockedAt1 = topicRow1.questions_unlocked_at

    // Recalculate again with different date
    const recalc2Res = await recalculate(planId, { recalculationDate: '2026-01-08', expectedRevision: recalcBody.revision })
    expect(recalc2Res.status).toBe(200)

    // Milestones unchanged
    const topicRow2 = await db.prepare('SELECT learning_completed_at, questions_unlocked_at FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    expect(topicRow2.learning_completed_at).toBe(learningCompletedAt1)
    expect(topicRow2.questions_unlocked_at).toBe(questionsUnlockedAt1)
  })
})

describe('R2 — Recalculation Date Boundaries', () => {
  it('A — recalculationDate == plan startDate succeeds', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()
    const res = await recalculate(plan.id, { recalculationDate: '2026-01-05', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.planId).toBe(plan.id)
  })

  it('B — recalculationDate == plan endDate succeeds', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()
    const res = await recalculate(plan.id, { recalculationDate: '2026-01-11', expectedRevision: 0 })
    expect(res.status).toBe(200)
  })

  it('C — recalculationDate after plan end succeeds with 0 generated tasks', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()
    const res = await recalculate(plan.id, { recalculationDate: '2026-01-15', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks.created).toBe(0)
  })

  it('D — recalculationDate within plan range succeeds', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()
    const res = await recalculate(plan.id, { recalculationDate: '2026-01-08', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revision).toBe(1)
  })
})

describe('R2 — Infeasible Recalculation', () => {
  it('returns feasibility metadata for infeasible plan', async () => {
    const infeasibleBody = makeBody({
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      acceptOverload: true,
      availability: Array.from({ length: 7 }, (_, i) => ({
        weekday: i,
        availableMinutes: i === 1 ? 1 : 0,
        isDayOff: i !== 1,
      })),
    })
    const createRes = await createPlan(infeasibleBody)
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()

    const res = await recalculate(plan.id, { recalculationDate: '2026-01-05', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.feasibility).toBeDefined()
    expect(typeof body.feasibility).toBe('object')
  })
})

describe('R2 — Large Plan Stress', () => {
  it('creates exactly 1 mutation row and idempotent replay returns identical result', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()
    const planId = plan.id

    const TOPIC_COUNT = 120
    for (let i = 0; i < TOPIC_COUNT; i++) {
      const topicId = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO rotation_planner_topics (
          id, plan_id, normalized_topic_id, canonical_topic_id, source_topic_id,
          shared_topic_key, topic_title, group_id,
          base_learning_minutes, personalized_learning_minutes,
          total_uworld_questions, completed_uworld_questions,
          learning_completed_at, questions_unlocked_at,
          status, incorrect_questions_remaining, mastery_score, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        topicId, planId,
        `step-up-medicine-6e-2024::cardiology.topic-${i}`,
        `cardiology.topic-${i}`,
        `cardiology.topic-${i}`,
        null,
        `Topic ${i}`,
        'cardiology',
        60, 60,
        10, 0,
        null, null,
        'not_started', 0, null, i + 1,
      ).run()
    }

    const recalcRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'large-plan-idem' })
    expect(recalcRes.status).toBe(200)
    const body1 = await recalcRes.json()

    // Exactly 1 recalculation mutation row
    const mutations = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_plan_mutations WHERE plan_id = ? AND operation = 'recalculate'").bind(planId).first()
    expect(mutations.c).toBe(1)

    // Idempotent replay returns identical stored result
    const recalc2Res = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 0, clientRequestId: 'large-plan-idem' })
    expect(recalc2Res.status).toBe(200)
    const body2 = await recalc2Res.json()
    expect(body2).toEqual(body1)

    // Still exactly 1 recalculation mutation row
    const mutations2 = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_plan_mutations WHERE plan_id = ? AND operation = 'recalculate'").bind(planId).first()
    expect(mutations2.c).toBe(1)
  })
})

describe('R2 — Response Contract', () => {
  it('recalculate response has correct shape', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()

    const res = await recalculate(plan.id, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(typeof body.planId).toBe('string')
    expect(body.planId).toBe(plan.id)
    expect(typeof body.revision).toBe('number')
    expect(body.revision).toBe(1)
    expect(typeof body.recalculationDate).toBe('string')
    expect(body.recalculationDate).toBe('2026-01-06')
    expect(typeof body.replayed).toBe('boolean')
    expect(body.replayed).toBe(false)

    expect(body.tasks).toBeDefined()
    expect(typeof body.tasks.created).toBe('number')
    expect(typeof body.tasks.modified).toBe('number')
    expect(typeof body.tasks.preserved).toBe('number')

    expect(Array.isArray(body.topicStates)).toBe(true)
    expect(body.topicStates.length).toBeGreaterThan(0)
    for (const ts of body.topicStates) {
      expect(typeof ts.id).toBe('string')
      expect(typeof ts.status).toBe('string')
      expect(typeof ts.learningComplete).toBe('boolean')
      expect(typeof ts.projectedQuestionsRemaining).toBe('number')
    }

    expect(body.feasibility).toBeDefined()
    expect(typeof body.feasibility).toBe('object')
  })

  it('GET response has correct shape', async () => {
    const createRes = await createPlan()
    const { plan } = await createRes.json()

    const res = await getPlan(plan.id)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.plan).toBeDefined()
    expect(body.plan.id).toBe(plan.id)
    expect(typeof body.plan.revision).toBe('number')

    expect(Array.isArray(body.topics)).toBe(true)
    expect(body.topics.length).toBeGreaterThan(0)
    for (const topic of body.topics) {
      expect(topic.id).toBeDefined()
      expect(typeof topic.status).toBe('string')
    }

    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.tasks.length).toBeGreaterThan(0)
    for (const task of body.tasks) {
      expect(task.id).toBeDefined()
      expect(typeof task.taskType).toBe('string')
      expect(typeof task.status).toBe('string')
    }

    expect(Array.isArray(body.availability)).toBe(true)
    expect(body.availability.length).toBe(7)
  })
})

describe('F4 — premature questions_locked prevention', () => {
  async function createPlanAndGetTasks(user = USER_A) {
    const createRes = await createPlan(makeBody(), user)
    expect(createRes.status).toBe(201)
    const planBody = await createRes.json()
    const planId = planBody.plan.id
    const topicId = planBody.topics[0].id
    const tasks = planBody.tasks
    return { planId, topicId, tasks }
  }

  async function getTopicStatus(topicId) {
    const row = await db.prepare('SELECT status FROM rotation_planner_topics WHERE id = ?').bind(topicId).first()
    return row?.status
  }

  it('does not prematurely transition topic to questions_locked when one learning task completes', async () => {
    // This test verifies that completing ONE learning task does NOT change
    // topic status to questions_locked. Topic status transitions are the
    // responsibility of recalculation (deriveActualTopicStates).

    const { planId, topicId, tasks } = await createPlanAndGetTasks()

    // Find learning tasks
    let learningTasks = tasks.filter(t => t.taskType === 'learning')

    // If the scheduler only generated 1 learning task, insert a second one
    if (learningTasks.length < 2) {
      const secondLearningId = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO rotation_planner_daily_tasks (
          id, plan_id, plan_topic_id, task_date, task_type, provider,
          estimated_minutes, target_count, mode, question_pool,
          status, unlock_condition, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        secondLearningId, planId, topicId, '2026-01-06', 'learning', null,
        30, 0, null, null,
        'pending', null, 99
      ).run()
      learningTasks = [...learningTasks, {
        id: secondLearningId, taskType: 'learning', status: 'pending',
        taskDate: '2026-01-06', estimatedMinutes: 30, targetCount: 0,
      }]
    }

    // Ensure topic is in 'learning' status for the test scenario
    await db.prepare(
      "UPDATE rotation_planner_topics SET status = 'learning' WHERE id = ?"
    ).bind(topicId).run()

    const statusBefore = await getTopicStatus(topicId)
    expect(statusBefore).toBe('learning')

    // Start the first learning task (it may already be started)
    const firstTask = learningTasks[0]
    let rev = 0
    await patchTask(planId, firstTask.id, { action: 'start', expectedRevision: rev })
    rev++

    // Complete the first learning task
    const completeRes = await patchTask(planId, firstTask.id, { action: 'complete', payload: { actualMinutes: 20 }, expectedRevision: rev })
    expect(completeRes.status).toBe(200)
    rev++

    // Key assertion: topic status must NOT be questions_locked
    const statusAfterComplete = await getTopicStatus(topicId)
    expect(statusAfterComplete).not.toBe('questions_locked')
    // It should still be 'learning' since other learning tasks remain
    expect(statusAfterComplete).toBe('learning')
  })
})

describe('R2 — Failure Atomicity', () => {
  it('invalid topic status rolls back entire batch preserving all data', async () => {
    const createRes = await createPlan()
    const { plan, tasks, topics } = await createRes.json()
    const planId = plan.id
    const topicId = topics[0].id

    const tasksBefore = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    const topicsBefore = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    const planBefore = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind(planId).first()

    await expect(
      persistRecalculationBatch({ DB: db }, {
        planId,
        userId: USER_A.sub,
        expectedRevision: 0,
        clientRequestId: 'test-rollback-invalid-topic-' + Date.now(),
        requestFingerprint: 'test-fingerprint',
        operation: 'recalculate',
        regeneratedTasks: [{
          id: crypto.randomUUID(),
          planTopicId: topicId,
          taskDate: '2026-01-06',
          taskType: 'learning',
          provider: null,
          estimatedMinutes: 30,
          targetCount: 0,
          mode: null,
          questionPool: null,
          status: 'pending',
          unlockCondition: null,
          displayOrder: 0,
          metadata: {},
        }],
        updatedTopics: [{
          planTopicId: topicId,
          completedUworldQuestions: 0,
          incorrectQuestionsRemaining: 0,
          learningCompletedAt: null,
          questionsUnlockedAt: null,
          status: 'INVALID_STATUS',
        }],
        resultJson: {
          planId,
          revision: 1,
          recalculationDate: '2026-01-06',
          replayed: false,
          tasks: { created: 1, modified: 0, preserved: 0 },
          topicStates: [],
        },
        recalculationMutationId: crypto.randomUUID(),
        recalculatedAt: new Date().toISOString(),
      })
    ).rejects.toThrow()

    const tasksAfter = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()
    const topicsAfter = await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_topics WHERE plan_id = ?').bind(planId).first()
    const planAfter = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind(planId).first()

    expect(tasksAfter.c).toBe(tasksBefore.c)
    expect(topicsAfter.c).toBe(topicsBefore.c)
    expect(planAfter.revision).toBe(planBefore.revision)
  })
})

// ─── F9: timezone-aware completedOn ───
describe('F9 timezone-aware completedOn', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  async function createPlanAndGetFirstTask(user = USER_A) {
    const createRes = await createPlan(makeBody(), user)
    expect(createRes.status).toBe(201)
    const planBody = await createRes.json()
    return { planId: planBody.plan.id, taskId: planBody.tasks[0].id }
  }

  it('invalid timezone returns 400', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
      timezone: 'Not/A/Timezone',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('timezone')
  })

  it('F: complete with America/New_York — completedOn is planner-local date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T03:30:00.000Z'))

    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
      timezone: 'America/New_York',
    })
    expect(res.status).toBe(200)

    const taskRow = await db.prepare('SELECT completed_on FROM rotation_planner_daily_tasks WHERE id = ?').bind(taskId).first()
    expect(taskRow.completed_on).toBe('2026-07-26')
  })

  it('G: partial with America/New_York — completedOn is planner-local date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T03:30:00.000Z'))

    const { planId, taskId } = await createPlanAndGetFirstTask()
    const startRes = await patchTask(planId, taskId, { action: 'start', expectedRevision: 0, clientRequestId: 'g-start' }, USER_A, { 'Idempotency-Key': 'g-start' })
    expect(startRes.status).toBe(200)

    const res = await patchTask(planId, taskId, {
      action: 'partial',
      payload: { completedPercentage: 50, actualMinutes: 30 },
      expectedRevision: 1,
      timezone: 'America/New_York',
      clientRequestId: 'g-partial',
    }, USER_A, { 'Idempotency-Key': 'g-partial' })
    expect(res.status).toBe(200)

    const taskRow = await db.prepare('SELECT completed_on FROM rotation_planner_daily_tasks WHERE id = ?').bind(taskId).first()
    expect(taskRow.completed_on).toBe('2026-07-26')
  })

  it('H: skip with America/New_York — completedOn is planner-local date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T03:30:00.000Z'))

    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, {
      action: 'skip',
      expectedRevision: 0,
      timezone: 'America/New_York',
    })
    expect(res.status).toBe(200)

    const taskRow = await db.prepare('SELECT completed_on FROM rotation_planner_daily_tasks WHERE id = ?').bind(taskId).first()
    expect(taskRow.completed_on).toBe('2026-07-26')
  })

  it('J: complete without timezone — defaults to UTC date', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
    })
    expect(res.status).toBe(200)

    const taskRow = await db.prepare('SELECT completed_on FROM rotation_planner_daily_tasks WHERE id = ?').bind(taskId).first()
    const todayUtc = new Date().toISOString().slice(0, 10)
    expect(taskRow.completed_on).toBe(todayUtc)
  })

  it('K: idempotent retry — same timezone + same key returns exact replay', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T03:30:00.000Z'))

    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
      timezone: 'America/New_York',
      clientRequestId: 'idem-tz-1',
    }, USER_A, { 'Idempotency-Key': 'idem-tz-1' })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()

    const res2 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 1,
      timezone: 'America/New_York',
      clientRequestId: 'idem-tz-1',
    }, USER_A, { 'Idempotency-Key': 'idem-tz-1' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.taskId).toBe(body1.taskId)
    expect(body2.status).toBe(body1.status)
  })

  it('L: different timezone with same key — IDEMPOTENCY_CONFLICT', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T03:30:00.000Z'))

    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
      timezone: 'America/New_York',
      clientRequestId: 'idem-tz-conflict',
    }, USER_A, { 'Idempotency-Key': 'idem-tz-conflict' })
    expect(res1.status).toBe(200)

    const res2 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 1,
      timezone: 'Asia/Tokyo',
      clientRequestId: 'idem-tz-conflict',
    }, USER_A, { 'Idempotency-Key': 'idem-tz-conflict' })
    expect(res2.status).toBe(409)
    const body2 = await res2.json()
    expect(body2.error.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('I: milestone propagation — completedOn feeds into recalculation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-06T03:30:00.000Z'))

    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
      timezone: 'America/New_York',
    })
    expect(res.status).toBe(200)

    const taskRow = await db.prepare('SELECT completed_on FROM rotation_planner_daily_tasks WHERE id = ?').bind(taskId).first()
    expect(taskRow.completed_on).toBe('2026-01-05')

    const recalRes = await recalculate(planId, { recalculationDate: '2026-01-06', expectedRevision: 1 })
    expect(recalRes.status).toBe(200)

    const topicId = (await db.prepare('SELECT plan_topic_id FROM rotation_planner_daily_tasks WHERE id = ?').bind(taskId).first()).plan_topic_id
    const updatedTopic = await db.prepare('SELECT learning_completed_at FROM rotation_planner_topics WHERE id = ?').bind(topicId).first()
    expect(updatedTopic.learning_completed_at).toBe('2026-01-05')
  })

  it('M: legacy mutation retry — no timezone produces same fingerprint as no timezone', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
      clientRequestId: 'legacy-retry-1',
    }, USER_A, { 'Idempotency-Key': 'legacy-retry-1' })
    expect(res1.status).toBe(200)

    const res2 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 1,
      clientRequestId: 'legacy-retry-1',
    }, USER_A, { 'Idempotency-Key': 'legacy-retry-1' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.taskId).toBeDefined()
  })

  it('N: explicit UTC same as no timezone — replay (no conflict)', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
      clientRequestId: 'utc-same-as-none',
    }, USER_A, { 'Idempotency-Key': 'utc-same-as-none' })
    expect(res1.status).toBe(200)

    const res2 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 1,
      timezone: 'UTC',
      clientRequestId: 'utc-same-as-none',
    }, USER_A, { 'Idempotency-Key': 'utc-same-as-none' })
    expect(res2.status).toBe(200)
  })

  it('O: non-UTC timezone retry conflict — different fingerprint', async () => {
    const { planId, taskId } = await createPlanAndGetFirstTask()
    const res1 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 0,
      clientRequestId: 'tz-conflict-legacy',
    }, USER_A, { 'Idempotency-Key': 'tz-conflict-legacy' })
    expect(res1.status).toBe(200)

    const res2 = await patchTask(planId, taskId, {
      action: 'complete',
      payload: { actualMinutes: 45 },
      expectedRevision: 1,
      timezone: 'America/New_York',
      clientRequestId: 'tz-conflict-legacy',
    }, USER_A, { 'Idempotency-Key': 'tz-conflict-legacy' })
    expect(res2.status).toBe(409)
    const body2 = await res2.json()
    expect(body2.error.code).toBe('IDEMPOTENCY_CONFLICT')
  })
})

// ─── Canonical Empty Forecast ───
describe('canonical empty forecast', () => {
  const EMPTY_FORECAST = createEmptyFlashcardForecast()

  function assertCanonicalEmpty(forecast) {
    expect(forecast).not.toBeNull()
    expect(forecast).not.toBeUndefined()
    expect(forecast).toEqual(EMPTY_FORECAST)
  }

  it('preview with forecasting disabled returns canonical empty forecast', async () => {
    const res = await preview(makeBody({
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: null },
    }))
    const body = await res.json()
    assertCanonicalEmpty(body.plan.settingsJson.forecast)
  })

  it('non-owner preview returns canonical empty forecast', async () => {
    const res = await preview(VALID_BODY, USER_B)
    const body = await res.json()
    assertCanonicalEmpty(body.plan.settingsJson.forecast)
  })

  it('non-owner creation stores canonical empty forecast', async () => {
    const res = await createPlan(makeBody(), USER_B)
    expect(res.status).toBe(201)
    const body = await res.json()
    assertCanonicalEmpty(body.plan.settingsJson.forecast)
  })

  it('non-owner recalculation stores canonical empty forecast', async () => {
    // Create plan as USER_B
    const createRes = await createPlan(makeBody(), USER_B)
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()

    // Recalculate
    const recalcRes = await recalculate(plan.id, { recalculationDate: '2026-01-06', expectedRevision: 0 }, USER_B)
    expect(recalcRes.status).toBe(200)

    const getRes = await getPlan(plan.id, USER_B)
    const getBody = await getRes.json()
    assertCanonicalEmpty(getBody.plan.settingsJson.forecast)
  })

  it('owner recalculation with forecasting disabled stores canonical empty forecast', async () => {
    // Create plan with forecasting disabled
    const body = makeBody({
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: null },
    })
    const createRes = await createPlan(body)
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()

    // Recalculate
    const recalcRes = await recalculate(plan.id, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(recalcRes.status).toBe(200)

    const getRes = await getPlan(plan.id)
    const getBody = await getRes.json()
    assertCanonicalEmpty(getBody.plan.settingsJson.forecast)
  })
})

// ─── Overflow Atomicity — Forecast computation failure ───
describe('overflow atomicity — forecast failure', () => {
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('creation succeeds when computeSafeNewCardForecast throws', async () => {
    const forecastModule = await import('../../services/flashcardForecast.js')
    vi.spyOn(forecastModule, 'computeSafeNewCardForecast').mockRejectedValue(new Error('Forecast overflow'))
    const body = makeBody({
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })
    const res = await createPlan(body)
    expect(res.status).toBe(201)
    const result = await res.json()
    expect(result.plan.usesFlashcardCapacity).toBe(1)
    expect(result.plan.settingsJson.forecast.safeNewCardsByDate).toEqual({})
    expect(result.plan.settingsJson.forecast.acceptedCardCount).toBe(0)
    vi.restoreAllMocks()
  })

  it('recalculation succeeds when computeSafeNewCardForecast throws', async () => {
    const forecastModule = await import('../../services/flashcardForecast.js')
    const body = makeBody({
      flashcardSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })
    const createRes = await createPlan(body)
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()

    vi.spyOn(forecastModule, 'computeSafeNewCardForecast').mockRejectedValue(new Error('Forecast overflow'))
    const recalcRes = await recalculate(plan.id, { recalculationDate: '2026-01-06', expectedRevision: 0 })
    expect(recalcRes.status).toBe(200)

    const getRes = await getPlan(plan.id)
    const getBody = await getRes.json()
    expect(getBody.plan.settingsJson.forecast.safeNewCardsByDate).toEqual({})
    expect(getBody.plan.settingsJson.forecast.acceptedCardCount).toBe(0)
    vi.restoreAllMocks()
  })
})

// ─── Explicit Staleness Outcomes ───
describe('explicit staleness outcomes', () => {
  let db

  beforeEach(async () => {
    db = await createTestDb()
  })

  async function insertOwnerPlan(planId, userId, settings = {}) {
    const settingsJson = JSON.stringify(settings)
    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, status, uses_flashcard_capacity, client_request_id, request_fingerprint, settings_json, created_at, updated_at)
       VALUES (?, ?, 'rot-1', 'src-1', '2026-08-01', '2026-08-14', 'active', 1, 'test', 'fp', ?, datetime('now'), datetime('now'))`
    ).bind(planId, userId, settingsJson).run()
  }

  async function assertStaleness(planId, expected) {
    const plan = await db.prepare('SELECT stale_at FROM rotation_planner_plans WHERE id = ?').bind(planId).first()
    if (expected) {
      expect(plan.stale_at).toBeTruthy()
    } else {
      expect(plan.stale_at).toBeNull()
    }
  }

  // Matrix tests
  it('mapping change + forecasting disabled → true (EXISTING_REVIEW_IMPACT)', async () => {
    await insertOwnerPlan('p1', 'u1')
    const { EXISTING_REVIEW_IMPACT } = await import('../../services/flashcardMappings.js')
    const { signalFlashcardMappingsStaleness } = await import('../../services/flashcardMappings.js')
    await signalFlashcardMappingsStaleness({ DB: db }, 'u1', EXISTING_REVIEW_IMPACT)
    await assertStaleness('p1', true)
  })

  it('review/rating + forecasting disabled → true (EXISTING_REVIEW_IMPACT)', async () => {
    await insertOwnerPlan('p2', 'u2')
    const { EXISTING_REVIEW_IMPACT, signalFlashcardMappingsStaleness } = await import('../../services/flashcardMappings.js')
    await signalFlashcardMappingsStaleness({ DB: db }, 'u2', EXISTING_REVIEW_IMPACT)
    await assertStaleness('p2', true)
  })

  it('introduced-card deletion + forecasting disabled → true (EXISTING_REVIEW_IMPACT)', async () => {
    await insertOwnerPlan('p3', 'u3')
    const { EXISTING_REVIEW_IMPACT, signalFlashcardMappingsStaleness } = await import('../../services/flashcardMappings.js')
    await signalFlashcardMappingsStaleness({ DB: db }, 'u3', EXISTING_REVIEW_IMPACT)
    await assertStaleness('p3', true)
  })

  it('new state=0 card + forecasting enabled → true (FORECAST_ONLY_IMPACT)', async () => {
    await insertOwnerPlan('p4', 'u4', {
      forecastSettings: { learningUnlockMode: 'learning_completed', maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })
    const { FORECAST_ONLY_IMPACT, signalFlashcardMappingsStaleness } = await import('../../services/flashcardMappings.js')
    await signalFlashcardMappingsStaleness({ DB: db }, 'u4', FORECAST_ONLY_IMPACT)
    await assertStaleness('p4', true)
  })

  it('new state=0 card + forecasting disabled → false (FORECAST_ONLY_IMPACT)', async () => {
    await insertOwnerPlan('p5', 'u5')
    const { FORECAST_ONLY_IMPACT, signalFlashcardMappingsStaleness } = await import('../../services/flashcardMappings.js')
    await signalFlashcardMappingsStaleness({ DB: db }, 'u5', FORECAST_ONLY_IMPACT)
    await assertStaleness('p5', false)
  })

  it('content-only edit → false (NO_SCHEDULING_IMPACT)', async () => {
    await insertOwnerPlan('p6', 'u6', {
      forecastSettings: { maxProjectedFlashcardReviewMinutesPerDay: 60 },
    })
    const { NO_SCHEDULING_IMPACT, signalFlashcardMappingsStaleness } = await import('../../services/flashcardMappings.js')
    await signalFlashcardMappingsStaleness({ DB: db }, 'u6', NO_SCHEDULING_IMPACT)
    await assertStaleness('p6', false)
  })

  it('no owner → false', async () => {
    await insertOwnerPlan('p7', 'u7')
    const { EXISTING_REVIEW_IMPACT, signalFlashcardMappingsStaleness } = await import('../../services/flashcardMappings.js')
    // signal as u7b — no plan owned by u7b
    const { getFlashcardCapacityOwner } = await import('../../services/rotationPlannerPlans/ownership.js')
    expect(await getFlashcardCapacityOwner({ DB: db }, 'u7b')).toBeFalsy()
    await signalFlashcardMappingsStaleness({ DB: db }, 'u7b', EXISTING_REVIEW_IMPACT)
    await assertStaleness('p7', false)
  })
})

// ─── PATCH reschedule stale revision (CAS) ───
describe('handleUpdateTask reschedule stale revision', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function createPlanAndGetTasks(user = USER_A) {
    const createRes = await createPlan(makeBody(), user)
    expect(createRes.status).toBe(201)
    const body = await createRes.json()
    return { planId: body.plan.id, taskId: body.tasks[0].id, tasks: body.tasks, topics: body.topics }
  }

  async function getTaskRows(planId) {
    const { results } = await db.prepare('SELECT * FROM rotation_planner_daily_tasks WHERE plan_id = ? ORDER BY id').bind(planId).all()
    return results
  }

  async function getTopicRows(planId) {
    const { results } = await db.prepare('SELECT * FROM rotation_planner_topics WHERE plan_id = ? ORDER BY id').bind(planId).all()
    return results
  }

  async function getPlanRevision(planId) {
    const row = await db.prepare('SELECT revision FROM rotation_planner_plans WHERE id = ?').bind(planId).first()
    return row.revision
  }

  async function countRescheduleMutations(planId) {
    const row = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_plan_mutations WHERE plan_id = ? AND operation = 'reschedule'").bind(planId).first()
    return row.c
  }

  function rescheduleRequest(taskId, newTaskDate, expectedRevision, clientRequestId) {
    return { action: 'reschedule', payload: { newTaskDate }, expectedRevision, clientRequestId }
  }

  // Simulate the TOCTOU window: the handler reads revision 0 (currentRevision),
  // then a concurrent request commits revision 0→1 in the DB BEFORE this
  // request's batch executes — so the batch CAS (WHERE revision = 0) fails even
  // though the pre-flight expectedRevision check passed.
  async function simulateConcurrentRevisionBump(planId) {
    const originalBatch = db.batch.bind(db)
    vi.spyOn(db, 'batch').mockImplementation(async (statements) => {
      await db.prepare('UPDATE rotation_planner_plans SET revision = revision + 1 WHERE id = ?').bind(planId).run()
      return originalBatch(statements)
    })
  }

  it('stale revision returns 409 PLAN_REVISION_CONFLICT, not 200', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    await simulateConcurrentRevisionBump(planId)

    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'stale-rev-1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_REVISION_CONFLICT')
    expect(body.error.message).toBe('Plan has been modified since you last loaded it. Please refresh.')
  })

  it('plan revision is unchanged after the conflict', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    await simulateConcurrentRevisionBump(planId)

    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'stale-rev-2'))
    expect(res.status).toBe(409)

    // The concurrent request bumped 0→1; this stale request must NOT bump it again.
    expect(await getPlanRevision(planId)).toBe(1)
  })

  it('existing tasks are unchanged field-for-field after the conflict', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    const tasksBefore = await getTaskRows(planId)

    await simulateConcurrentRevisionBump(planId)
    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'stale-rev-3'))
    expect(res.status).toBe(409)

    const tasksAfter = await getTaskRows(planId)
    expect(JSON.stringify(tasksAfter)).toBe(JSON.stringify(tasksBefore))
  })

  it('no task deletion happened', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    const countBefore = (await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()).c

    await simulateConcurrentRevisionBump(planId)
    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'stale-rev-4'))
    expect(res.status).toBe(409)

    const countAfter = (await db.prepare('SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ?').bind(planId).first()).c
    expect(countAfter).toBe(countBefore)
  })

  it('no replacement insertion happened (task count identical)', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    const idsBefore = new Set((await getTaskRows(planId)).map(r => r.id))

    await simulateConcurrentRevisionBump(planId)
    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'stale-rev-5'))
    expect(res.status).toBe(409)

    const rowsAfter = await getTaskRows(planId)
    expect(rowsAfter.length).toBe(idsBefore.size)
    for (const row of rowsAfter) {
      expect(idsBefore.has(row.id)).toBe(true)
    }
  })

  it('topic state is unchanged', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    const topicsBefore = await getTopicRows(planId)

    await simulateConcurrentRevisionBump(planId)
    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'stale-rev-6'))
    expect(res.status).toBe(409)

    const topicsAfter = await getTopicRows(planId)
    expect(JSON.stringify(topicsAfter)).toBe(JSON.stringify(topicsBefore))
  })

  it('no mutation row persisted for the failed attempt', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    await simulateConcurrentRevisionBump(planId)

    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'stale-rev-7'))
    expect(res.status).toBe(409)

    expect(await countRescheduleMutations(planId)).toBe(0)
  })

  it('correct (current) revision succeeds — task moved and pinned', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()

    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'resched-ok-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.taskId).toBe(taskId)
    expect(body.revision).toBe(1)

    const moved = await db.prepare('SELECT task_date, is_pinned, display_order FROM rotation_planner_daily_tasks WHERE id = ?').bind(taskId).first()
    expect(moved.task_date).toBe('2026-01-07')
    expect(moved.is_pinned).toBe(1)

    expect(await getPlanRevision(planId)).toBe(1)
  })

  it('exact idempotent replay returns the stored result without a second mutation', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    const idemKey = 'resched-replay'

    const res1 = await patchTask(planId, taskId, { action: 'reschedule', payload: { newTaskDate: '2026-01-07' }, expectedRevision: 0, clientRequestId: idemKey }, USER_A, { 'Idempotency-Key': idemKey })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()

    expect(await countRescheduleMutations(planId)).toBe(1)
    const tasksAfter1 = await getTaskRows(planId)

    // Replay with the current revision (the first reschedule advanced 0→1).
    const res2 = await patchTask(planId, taskId, { action: 'reschedule', payload: { newTaskDate: '2026-01-07' }, expectedRevision: 1, clientRequestId: idemKey }, USER_A, { 'Idempotency-Key': idemKey })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2).toEqual(body1)

    expect(await countRescheduleMutations(planId)).toBe(1)
    const tasksAfter2 = await getTaskRows(planId)
    expect(JSON.stringify(tasksAfter2)).toBe(JSON.stringify(tasksAfter1))
  })

  it('cross-user request is non-leaking and performs zero writes', async () => {
    const { planId, taskId } = await createPlanAndGetTasks(USER_A)
    const revBefore = await getPlanRevision(planId)
    const tasksBefore = await getTaskRows(planId)

    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'cross-user'), USER_B)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_NOT_FOUND')

    expect(await getPlanRevision(planId)).toBe(revBefore)
    expect(JSON.stringify(await getTaskRows(planId))).toBe(JSON.stringify(tasksBefore))
    expect(await countRescheduleMutations(planId)).toBe(0)
  })

  it('injected failure rolls back every statement — no partial writes', async () => {
    const { planId, taskId } = await createPlanAndGetTasks()
    const revBefore = await getPlanRevision(planId)
    const tasksBefore = await getTaskRows(planId)
    const topicsBefore = await getTopicRows(planId)

    // Force a mid-batch failure: abort any UPDATE that pins a task. The task-move
    // statement runs AFTER the mutation insert and revision bump in the batch, so
    // this exercises rollback of every prior statement.
    await db.exec(`
      CREATE TRIGGER force_reschedule_failure
      BEFORE UPDATE ON rotation_planner_daily_tasks
      WHEN NEW.is_pinned = 1
      BEGIN
        SELECT RAISE(ABORT, 'SIMULATED_CONSTRAINT_FAILURE');
      END
    `)

    const res = await patchTask(planId, taskId, rescheduleRequest(taskId, '2026-01-07', 0, 'fail-atomic'))
    expect(res.status).toBe(500)

    expect(await getPlanRevision(planId)).toBe(revBefore)
    expect(JSON.stringify(await getTaskRows(planId))).toBe(JSON.stringify(tasksBefore))
    expect(JSON.stringify(await getTopicRows(planId))).toBe(JSON.stringify(topicsBefore))
    expect(await countRescheduleMutations(planId)).toBe(0)
  })
})
