import { describe, it, expect } from 'vitest'
import worker from '../worker.js'

function makeEnv() {
  return {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }) }) },
    IMAGES: { get: async () => null },
  }
}

function makeRequest(path, { method = 'GET', headers = {} } = {}) {
  return new Request(`https://medstudy.app${path}`, {
    method,
    headers: { 'x-test-user-id': 'test-user', ...headers },
  })
}

async function fetch(path, opts) {
  return worker.fetch(makeRequest(path, opts), makeEnv(), {})
}

describe('Worker route dispatch — rotation planner', () => {
  describe('GET /api/rotation-planner/rotations', () => {
    it('returns 200 with canonical rotations', async () => {
      const res = await fetch('/api/rotation-planner/rotations')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
      expect(body[0]).toHaveProperty('id')
      expect(body[0]).toHaveProperty('displayLabel')
    })
  })

  describe('GET /api/rotation-planner/sources', () => {
    it('returns 200 with sources', async () => {
      const res = await fetch('/api/rotation-planner/sources')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
      expect(body[0]).toHaveProperty('id')
      expect(body[0]).toHaveProperty('topicCount')
    })
  })

  describe('GET /api/rotation-planner/sources/:sourceId/rotations', () => {
    it('returns 200 for valid source', async () => {
      const res = await fetch('/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body[0]).toHaveProperty('id')
      expect(body[0]).toHaveProperty('topicCount')
    })

    it('returns 404 for unknown source', async () => {
      const res = await fetch('/api/rotation-planner/sources/nonexistent/rotations')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('SOURCE_NOT_FOUND')
    })
  })

  describe('GET /api/rotation-planner/sources/:sourceId/rotations/:rotationId/topics', () => {
    it('returns 200 for valid source+rotation', async () => {
      const res = await fetch('/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/cardiology/topics')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body[0]).toHaveProperty('normalizedTopicId')
      expect(body[0]).toHaveProperty('canonicalTopicId')
    })

    it('returns 404 for unknown source', async () => {
      const res = await fetch('/api/rotation-planner/sources/nonexistent/rotations/cardiology/topics')
      expect(res.status).toBe(404)
    })

    it('returns 404 for unsupported rotation', async () => {
      const res = await fetch('/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/ophthalmology/topics')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('ROTATION_NOT_SUPPORTED_BY_SOURCE')
    })
  })

  describe('Route specificity', () => {
    it('most-specific route is not shadowed by less-specific route', async () => {
      const topicsRes = await fetch('/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/cardiology/topics')
      const rotationsRes = await fetch('/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations')
      expect(topicsRes.status).toBe(200)
      expect(rotationsRes.status).toBe(200)
      const topicsBody = await topicsRes.json()
      const rotationsBody = await rotationsRes.json()
      expect(Array.isArray(topicsBody)).toBe(true)
      expect(Array.isArray(rotationsBody)).toBe(true)
      expect(topicsBody[0]).toHaveProperty('normalizedTopicId')
      expect(rotationsBody[0]).toHaveProperty('topicCount')
    })
  })

  describe('Trailing slash', () => {
    it('trailing slash on /rotations returns 404 (exact match convention)', async () => {
      const res = await fetch('/api/rotation-planner/rotations/')
      expect(res.status).toBe(404)
    })

    it('trailing slash on /sources returns 404 (exact match convention)', async () => {
      const res = await fetch('/api/rotation-planner/sources/')
      expect(res.status).toBe(404)
    })
  })

  describe('Unsupported HTTP methods', () => {
    it('POST to /rotations returns 404', async () => {
      const res = await fetch('/api/rotation-planner/rotations', { method: 'POST' })
      expect(res.status).toBe(404)
    })

    it('PUT to /sources returns 404', async () => {
      const res = await fetch('/api/rotation-planner/sources', { method: 'PUT' })
      expect(res.status).toBe(404)
    })
  })

  describe('Authentication', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new Request('https://medstudy.app/api/rotation-planner/rotations', {
        method: 'GET',
      })
      const res = await worker.fetch(req, makeEnv(), {})
      expect(res.status).toBe(401)
    })
  })
})

function makePostRequest(path, body, { headers = {} } = {}) {
  return new Request(`https://medstudy.app${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'test-user', ...headers },
    body: JSON.stringify(body),
  })
}

async function postFetch(path, body, { headers = {} } = {}) {
  return worker.fetch(makePostRequest(path, body, { headers }), makeEnv(), {})
}

async function deleteFetch(path) {
  return worker.fetch(makeRequest(path, { method: 'DELETE' }), makeEnv(), {})
}

function makePatchRequest(path, body, { headers = {} } = {}) {
  return new Request(`https://medstudy.app${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'test-user', ...headers },
    body: JSON.stringify(body),
  })
}

async function patchFetch(path, body, { headers = {} } = {}) {
  return worker.fetch(makePatchRequest(path, body, { headers }), makeEnv(), {})
}

describe('Worker route dispatch — rotation planner plans', () => {
  describe('POST /api/rotation-planner/plans (create)', () => {
    it('returns 400 when body is invalid', async () => {
      const res = await postFetch('/api/rotation-planner/plans', {})
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when idempotency key is missing', async () => {
      const res = await postFetch('/api/rotation-planner/plans', {
        sourceId: 'step-up-medicine-6e-2024',
        rotationId: 'cardiology',
        startDate: '2026-01-05',
        endDate: '2026-01-11',
        studyStyle: 'active',
        schedulingMode: 'efficient',
        questionStartRule: 'next_available_day',
        availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
        topics: [{ normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris', uworldRemainingQuestions: 20, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }],
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.message).toContain('Idempotency-Key')
    })

    it('returns 409 when previewToken does not match', async () => {
      const res = await postFetch('/api/rotation-planner/plans', {
        sourceId: 'step-up-medicine-6e-2024',
        rotationId: 'cardiology',
        startDate: '2026-01-05',
        endDate: '2026-01-11',
        studyStyle: 'active',
        schedulingMode: 'efficient',
        questionStartRule: 'next_available_day',
        availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
        topics: [{ normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris', uworldRemainingQuestions: 20, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }],
        previewToken: 'deadbeef',
        clientRequestId: 'req-001',
      }, { headers: { 'Idempotency-Key': 'req-001' } })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('PREVIEW_STALE')
    })

    it('returns 422 when plan is infeasible and acceptOverload is false', async () => {
      const res = await postFetch('/api/rotation-planner/plans', {
        sourceId: 'step-up-medicine-6e-2024',
        rotationId: 'cardiology',
        startDate: '2026-01-05',
        endDate: '2026-01-05',
        studyStyle: 'active',
        schedulingMode: 'efficient',
        questionStartRule: 'next_available_day',
        availability: [{ weekday: 0, availableMinutes: 0, isDayOff: true }, { weekday: 1, availableMinutes: 0, isDayOff: true }, { weekday: 2, availableMinutes: 0, isDayOff: true }, { weekday: 3, availableMinutes: 0, isDayOff: true }, { weekday: 4, availableMinutes: 0, isDayOff: true }, { weekday: 5, availableMinutes: 0, isDayOff: true }, { weekday: 6, availableMinutes: 0, isDayOff: true }],
        topics: [{ normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris', uworldRemainingQuestions: 20, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }],
        acceptOverload: false,
        clientRequestId: 'req-002',
      }, { headers: { 'Idempotency-Key': 'req-002' } })
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('PLAN_INFEASIBLE')
    })
  })

  describe('POST /api/rotation-planner/plans/preview', () => {
    it('returns 400 when body is invalid', async () => {
      const res = await postFetch('/api/rotation-planner/plans/preview', {})
      expect(res.status).toBe(400)
    })

    it('does not require idempotency key', async () => {
      const res = await postFetch('/api/rotation-planner/plans/preview', {
        sourceId: 'step-up-medicine-6e-2024',
        rotationId: 'cardiology',
        startDate: '2026-01-05',
        endDate: '2026-01-11',
        studyStyle: 'active',
        schedulingMode: 'efficient',
        questionStartRule: 'next_available_day',
        availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
        topics: [{ normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris', uworldRemainingQuestions: 20, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }],
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('previewToken')
      expect(body).toHaveProperty('tasks')
    })
  })

  describe('GET /api/rotation-planner/plans (list)', () => {
    it('returns 200 with empty array for new user', async () => {
      const res = await fetch('/api/rotation-planner/plans')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
    })
  })

  describe('GET/DELETE /api/rotation-planner/plans/:planId', () => {
    it('GET returns 404 for nonexistent plan', async () => {
      const res = await fetch('/api/rotation-planner/plans/nonexistent-id')
      expect(res.status).toBe(404)
    })

    it('DELETE returns 404 for nonexistent plan', async () => {
      const res = await deleteFetch('/api/rotation-planner/plans/nonexistent-id')
      expect(res.status).toBe(404)
    })

    it('GET /plans/preview is not treated as a planId', async () => {
      const res = await fetch('/api/rotation-planner/plans/preview')
      expect(res.status).toBe(404)
    })

    it('DELETE /plans/preview is not treated as a planId', async () => {
      const res = await deleteFetch('/api/rotation-planner/plans/preview')
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/rotation-planner/plans/:planId/tasks/:taskId', () => {
    it('returns non-404 for route matching', async () => {
      const res = await patchFetch('/api/rotation-planner/plans/fake-plan/tasks/fake-task', { action: 'start' })
      expect(res.status).not.toBe(404)
    })
  })

  describe('POST /api/rotation-planner/plans/:planId/recalculate', () => {
    it('returns non-404 for route matching', async () => {
      const res = await postFetch('/api/rotation-planner/plans/fake-plan/recalculate', { recalculationDate: '2026-01-06' })
      expect(res.status).not.toBe(404)
    })
  })
})
