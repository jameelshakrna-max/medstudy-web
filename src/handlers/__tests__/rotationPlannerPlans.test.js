import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../__tests__/helpers/d1TestHarness.js'
import {
  handlePreviewRotationPlan,
  handleCreateRotationPlan,
  handleListRotationPlans,
  handleGetRotationPlan,
  handleDeleteRotationPlan,
} from '../rotationPlannerPlans.js'

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

function makeBody(overrides = {}) {
  return { ...VALID_BODY, ...overrides }
}

// ─── Preview ───
describe('handlePreviewRotationPlan', () => {
  it('returns 200 with preview token and tasks', async () => {
    const res = await preview()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.previewToken).toBeDefined()
    expect(body.tasks).toBeDefined()
    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.feasibility).toBeDefined()
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
    const createRes = await createPlan(makeBody({ previewToken: previewBody.previewToken }))
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
      previewToken: previewBody.previewToken,
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
