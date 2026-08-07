import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../__tests__/helpers/d1TestHarness.js'
import {
  handleCreateRotationPlan,
  handleGetRotationPlan,
  handleUpdatePlanStatus,
} from '../rotationPlannerPlans.js'

const USER_A = { sub: 'user-a', email: 'a@test.local', role: 'authenticated' }
const USER_B = { sub: 'user-b', email: 'b@test.local', role: 'authenticated' }

const VALID_BODY = {
  displayName: 'Cardiology — January 2026',
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

async function createPlan(user = USER_A) {
  const req = makeRequest('/api/rotation-planner/plans', {
    method: 'POST',
    body: VALID_BODY,
    headers: { 'Idempotency-Key': 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2) },
  })
  const res = await handleCreateRotationPlan(req, { DB: db }, user)
  expect(res.status).toBe(201)
  return (await res.json()).plan
}

async function updateStatus(planId, body, envOverride, user = USER_A) {
  const req = makeRequest(`/api/rotation-planner/plans/${planId}/status`, { method: 'POST', body })
  return handleUpdatePlanStatus(req, envOverride || { DB: db }, user)
}

async function getPlan(planId, user = USER_A) {
  const req = makeRequest(`/api/rotation-planner/plans/${planId}`)
  const res = await handleGetRotationPlan(req, { DB: db }, user)
  return res
}

function lifecycleBody(overrides = {}) {
  return {
    action: 'activate',
    expectedRevision: 0,
    clientRequestId: `lifecycle-${crypto.randomUUID()}`,
    ...overrides,
  }
}

function forcePlanActive(planId) {
  try {
    db.run("UPDATE rotation_planner_plans SET status = 'active', uses_flashcard_capacity = 1 WHERE id = ?", [planId])
  } catch (_) {
    // sql.js throws synchronously when the unique active-plan index is hit.
  }
}

// Returns a DB handle whose active-plan pre-check always reports "no active plan",
// forcing the handler to fall through to the authoritative unique index.
function dbWithoutActivePrecheck() {
  return {
    prepare: (sql, ...rest) => {
      if (typeof sql === 'string' && sql.includes("status = 'active'")) {
        return {
          bind: () => ({
            first: async () => null,
            run: async () => ({ meta: { changes: 0 }, success: true }),
            all: async () => ({ results: [], success: true }),
          }),
        }
      }
      return db.prepare(sql, ...rest)
    },
    batch: (stmts) => db.batch(stmts),
    run: (sql, bindings) => db.run(sql, bindings),
    exec: (sql) => db.exec(sql),
  }
}

async function captureTasks(planId) {
  const { results } = await db.prepare('SELECT * FROM rotation_planner_daily_tasks WHERE plan_id = ? ORDER BY id').bind(planId).all()
  return results
}

describe('handleUpdatePlanStatus — plan lifecycle', () => {
  it('activates a draft plan and sets activated_at', async () => {
    const plan = await createPlan()
    const res = await updateStatus(plan.id, lifecycleBody())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan.status).toBe('active')
    expect(body.plan.activatedAt).toBeTruthy()
    expect(body.plan.pausedAt).toBeNull()
    expect(body.plan.completedAt).toBeNull()
  })

  it('requires an Idempotency-Key / clientRequestId', async () => {
    const plan = await createPlan()
    const res = await updateStatus(plan.id, { action: 'activate', expectedRevision: 0 })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })

  it('rejects unknown actions and non-integer revisions', async () => {
    const plan = await createPlan()
    const res1 = await updateStatus(plan.id, lifecycleBody({ action: 'explode' }))
    expect(res1.status).toBe(400)
    const res2 = await updateStatus(plan.id, lifecycleBody({ expectedRevision: 1.5 }))
    expect(res2.status).toBe(400)
  })

  it('returns 404 for a plan that does not exist (non-leaking)', async () => {
    const res = await updateStatus('no-such-plan', lifecycleBody())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN_NOT_FOUND')
  })

  describe('transition matrix', () => {
    it('draft → active through activate', async () => {
      const plan = await createPlan()
      const res = await updateStatus(plan.id, lifecycleBody())
      expect((await res.json()).plan.status).toBe('active')
    })

    it('active → paused through pause', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.plan.status).toBe('paused')
      expect(body.plan.pausedAt).toBeTruthy()
      expect(body.plan.activatedAt).toBeTruthy()
    })

    it('paused → active through resume', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'resume', expectedRevision: 2 }))
      expect(res.status).toBe(200)
      expect((await res.json()).plan.status).toBe('active')
    })

    it('active → completed through complete', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 1, confirmOutstanding: true }))
      expect(res.status).toBe(200)
      expect((await res.json()).plan.status).toBe('completed')
    })

    it('paused → completed through complete', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 2, confirmOutstanding: true }))
      expect(res.status).toBe(200)
      expect((await res.json()).plan.status).toBe('completed')
    })

    it('rejects activate on a paused plan (must use resume)', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      const res = await updateStatus(plan.id, lifecycleBody({ expectedRevision: 2 }))
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('INVALID_TRANSITION')
    })

    it('rejects resume on a draft plan', async () => {
      const plan = await createPlan()
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'resume' }))
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('INVALID_TRANSITION')
    })

    it('rejects pause on a draft plan', async () => {
      const plan = await createPlan()
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'pause' }))
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('INVALID_TRANSITION')
    })

    it('rejects complete on a draft plan', async () => {
      const plan = await createPlan()
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'complete', confirmOutstanding: true }))
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('INVALID_TRANSITION')
    })
  })

  describe('timestamp semantics', () => {
    it('activate sets activated_at only once across a pause/resume cycle', async () => {
      const plan = await createPlan()
      const activeRes = await updateStatus(plan.id, lifecycleBody())
      const firstActivatedAt = (await activeRes.json()).plan.activatedAt

      await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      const resumeRes = await updateStatus(plan.id, lifecycleBody({ action: 'resume', expectedRevision: 2 }))
      const resumedPlan = (await resumeRes.json()).plan

      expect(resumedPlan.status).toBe('active')
      expect(resumedPlan.activatedAt).toBe(firstActivatedAt)
      expect(resumedPlan.pausedAt).toBeNull()
    })

    it('pause sets paused_at and preserves activated_at', async () => {
      const plan = await createPlan()
      const activeRes = await updateStatus(plan.id, lifecycleBody())
      const activatedAt = (await activeRes.json()).plan.activatedAt
      const pauseRes = await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      const paused = (await pauseRes.json()).plan
      expect(paused.status).toBe('paused')
      expect(paused.pausedAt).toBeTruthy()
      expect(paused.activatedAt).toBe(activatedAt)
      expect(paused.completedAt).toBeNull()
    })

    it('complete sets completed_at once', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 1, confirmOutstanding: true }))
      const completed = (await res.json()).plan
      expect(completed.status).toBe('completed')
      expect(completed.completedAt).toBeTruthy()
    })
  })

  describe('revision and idempotency', () => {
    it('increments revision exactly once per transition', async () => {
      const plan = await createPlan()
      const res = await updateStatus(plan.id, lifecycleBody())
      const body = await res.json()
      expect(body.plan.revision).toBe(1)
    })

    it('exact replay returns the stored response without incrementing revision', async () => {
      const plan = await createPlan()
      const clientRequestId = `replay-${crypto.randomUUID()}`
      const res = await updateStatus(plan.id, lifecycleBody({ clientRequestId }))
      const original = await res.json()

      const replayRes = await updateStatus(plan.id, lifecycleBody({ clientRequestId }))
      const replay = await replayRes.json()

      expect(replayRes.status).toBe(200)
      expect(replay.plan.revision).toBe(original.plan.revision)
      expect(replay.plan.activatedAt).toBe(original.plan.activatedAt)
      expect(replay.plan.status).toBe(original.plan.status)

      const { results } = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_plan_mutations WHERE client_request_id = ?").bind(clientRequestId).all()
      expect(results[0].c).toBe(1)
    })

    it('mismatched fingerprint under the same key returns IDEMPOTENCY_CONFLICT', async () => {
      const plan = await createPlan()
      const clientRequestId = `conflict-${crypto.randomUUID()}`
      await updateStatus(plan.id, lifecycleBody({ clientRequestId }))
      const res = await updateStatus(plan.id, lifecycleBody({ clientRequestId, action: 'pause' }))
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('IDEMPOTENCY_CONFLICT')
    })

    it('a stale request cannot partially update the plan', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      const clientRequestId = `stale-${crypto.randomUUID()}`
      const res = await updateStatus(plan.id, lifecycleBody({ expectedRevision: 0, clientRequestId }))
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('REVISION_CONFLICT')

      const planRow = await db.prepare('SELECT status, revision FROM rotation_planner_plans WHERE id = ?').bind(plan.id).first()
      expect(planRow.status).toBe('active')
      expect(planRow.revision).toBe(1)

      const mutation = await db.prepare('SELECT id FROM rotation_planner_plan_mutations WHERE client_request_id = ?').bind(clientRequestId).first()
      expect(mutation).toBeNull()
    })
  })

  describe('at-most-one-active-plan invariant', () => {
    it('pre-check rejects a second active plan with ACTIVE_ROTATION_EXISTS', async () => {
      const planA = await createPlan()
      const planB = await createPlan()
      await updateStatus(planA.id, lifecycleBody())
      const res = await updateStatus(planB.id, lifecycleBody())
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('ACTIVE_ROTATION_EXISTS')
      const planBRow = await db.prepare('SELECT status FROM rotation_planner_plans WHERE id = ?').bind(planB.id).first()
      expect(planBRow.status).toBe('draft')
    })

    it('database unique index prevents two concurrent active plans', async () => {
      const planA = await createPlan()
      const planB = await createPlan()
      await updateStatus(planA.id, lifecycleBody())
      // Free the unique active slot so planB can be forced active directly.
      await updateStatus(planA.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      forcePlanActive(planB.id)
      // Simulate the concurrent-race path: the proxy makes the handler's
      // pre-check report "no active plan", so planA (paused) falls through to
      // the batch where the authoritative unique index must reject.
      const res = await updateStatus(planA.id, lifecycleBody({ action: 'resume', expectedRevision: 2 }), { DB: dbWithoutActivePrecheck() })
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('ACTIVE_ROTATION_EXISTS')
    })

    it('resume is also blocked when another active plan exists', async () => {
      const planA = await createPlan()
      const planB = await createPlan()
      await updateStatus(planA.id, lifecycleBody())
      await updateStatus(planA.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      // Force planB to active while the unique index is free (planA is paused),
      // then attempt to resume planA — the pre-check must block it.
      forcePlanActive(planB.id)
      const res = await updateStatus(planA.id, lifecycleBody({ action: 'resume', expectedRevision: 2 }))
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('ACTIVE_ROTATION_EXISTS')
    })
  })

  describe('completion guard', () => {
    it('returns PLAN_HAS_OUTSTANDING_TASKS with a readable summary when work remains', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 1 }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('PLAN_HAS_OUTSTANDING_TASKS')
      expect(body.error.details.outstanding.totalTasks).toBeGreaterThan(0)
      expect(typeof body.error.details.outstanding.learningTasks).toBe('number')
      expect(typeof body.error.details.outstanding.remainingQuestions).toBe('number')
    })

    it('rejected unconfirmed completion makes zero writes', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      const tasksBefore = await captureTasks(plan.id)
      const clientRequestId = `rejected-${crypto.randomUUID()}`
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 1, clientRequestId }))
      expect(res.status).toBe(409)

      const planRow = await db.prepare('SELECT status, revision FROM rotation_planner_plans WHERE id = ?').bind(plan.id).first()
      expect(planRow.status).toBe('active')
      expect(planRow.revision).toBe(1)

      const mutation = await db.prepare('SELECT id FROM rotation_planner_plan_mutations WHERE client_request_id = ?').bind(clientRequestId).first()
      expect(mutation).toBeNull()

      const tasksAfter = await captureTasks(plan.id)
      expect(tasksAfter).toEqual(tasksBefore)
    })

    it('confirmed completion preserves unfinished tasks unchanged and returns the summary', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      const tasksBefore = await captureTasks(plan.id)
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 1, confirmOutstanding: true }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.plan.status).toBe('completed')
      expect(body.plan.completedAt).toBeTruthy()
      expect(body.outstanding).toBeDefined()
      expect(body.outstanding.totalTasks).toBeGreaterThan(0)

      const tasksAfter = await captureTasks(plan.id)
      expect(tasksAfter).toEqual(tasksBefore)
    })

    it('a plan with no outstanding work completes directly without confirmation', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      await db.run("UPDATE rotation_planner_daily_tasks SET status = 'completed' WHERE plan_id = ?", [plan.id])
      const res = await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 1 }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.plan.status).toBe('completed')
      expect(body.outstanding.totalTasks).toBe(0)
    })
  })

  describe('terminal state', () => {
    it('rejects every mutation from a completed plan with PLAN_TERMINAL', async () => {
      const plan = await createPlan()
      await updateStatus(plan.id, lifecycleBody())
      await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 1, confirmOutstanding: true }))
      const attempts = [
        lifecycleBody({ action: 'activate', expectedRevision: 2 }),
        lifecycleBody({ action: 'pause', expectedRevision: 2 }),
        lifecycleBody({ action: 'resume', expectedRevision: 2 }),
        lifecycleBody({ action: 'complete', expectedRevision: 2 }),
      ]
      for (const attempt of attempts) {
        const res = await updateStatus(plan.id, attempt)
        expect(res.status).toBe(409)
        expect((await res.json()).error.code).toBe('PLAN_TERMINAL')
      }
    })
  })

  describe('task and schedule immutability', () => {
    it('lifecycle transitions do not replace or recalculate tasks', async () => {
      const plan = await createPlan()
      const tasksBefore = await captureTasks(plan.id)
      await updateStatus(plan.id, lifecycleBody())
      await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      await updateStatus(plan.id, lifecycleBody({ action: 'resume', expectedRevision: 2 }))
      const tasksAfter = await captureTasks(plan.id)
      expect(tasksAfter).toEqual(tasksBefore)
    })

    it('lifecycle transitions do not alter UWorld group targets', async () => {
      const plan = await createPlan()
      const { results: groupsBefore } = await db.prepare('SELECT * FROM rotation_planner_question_groups WHERE plan_id = ?').bind(plan.id).all()
      await updateStatus(plan.id, lifecycleBody())
      await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      await updateStatus(plan.id, lifecycleBody({ action: 'resume', expectedRevision: 2 }))
      const { results: groupsAfter } = await db.prepare('SELECT * FROM rotation_planner_question_groups WHERE plan_id = ?').bind(plan.id).all()
      expect(groupsAfter).toEqual(groupsBefore)
    })

    it('lifecycle transitions do not create duplicate flashcard-review work', async () => {
      const plan = await createPlan()
      const countBefore = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND task_type = 'flashcard_review'").bind(plan.id).first()
      await updateStatus(plan.id, lifecycleBody())
      await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      await updateStatus(plan.id, lifecycleBody({ action: 'resume', expectedRevision: 2 }))
      const countAfter = await db.prepare("SELECT COUNT(*) as c FROM rotation_planner_daily_tasks WHERE plan_id = ? AND task_type = 'flashcard_review'").bind(plan.id).first()
      expect(countAfter.c).toBe(countBefore.c)
    })
  })

  describe('flashcard capacity ownership', () => {
    it('activation claims capacity when free and releases on pause/complete', async () => {
      const plan = await createPlan()
      const activeRes = await updateStatus(plan.id, lifecycleBody())
      expect((await activeRes.json()).plan.usesFlashcardCapacity).toBe(1)

      const pauseRes = await updateStatus(plan.id, lifecycleBody({ action: 'pause', expectedRevision: 1 }))
      expect((await pauseRes.json()).plan.usesFlashcardCapacity).toBe(0)

      const resumeRes = await updateStatus(plan.id, lifecycleBody({ action: 'resume', expectedRevision: 2 }))
      expect((await resumeRes.json()).plan.usesFlashcardCapacity).toBe(1)

      await updateStatus(plan.id, lifecycleBody({ action: 'complete', expectedRevision: 3, confirmOutstanding: true }))
      const getRes = await getPlan(plan.id)
      expect((await getRes.json()).plan.usesFlashcardCapacity).toBe(0)
    })

    it('activation never steals capacity from an existing owner', async () => {
      const planA = await createPlan()
      const planB = await createPlan()
      // Give planA capacity ownership directly (draft owner scenario).
      await db.run("UPDATE rotation_planner_plans SET uses_flashcard_capacity = 1 WHERE id = ?", [planA.id])
      const res = await updateStatus(planB.id, lifecycleBody())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.plan.usesFlashcardCapacity).toBe(0)
      const ownerRow = await db.prepare('SELECT uses_flashcard_capacity FROM rotation_planner_plans WHERE id = ?').bind(planA.id).first()
      expect(ownerRow.uses_flashcard_capacity).toBe(1)
    })
  })

  describe('cross-user access', () => {
    it('returns a non-leaking 404 and makes zero writes for another user', async () => {
      const plan = await createPlan(USER_A)
      const res = await updateStatus(plan.id, lifecycleBody(), undefined, USER_B)
      expect(res.status).toBe(404)
      expect((await res.json()).error.code).toBe('PLAN_NOT_FOUND')
      const planRow = await db.prepare('SELECT status FROM rotation_planner_plans WHERE id = ?').bind(plan.id).first()
      expect(planRow.status).toBe('draft')
    })
  })
})
