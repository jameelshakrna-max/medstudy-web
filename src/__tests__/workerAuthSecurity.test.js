import { describe, it, expect, vi } from 'vitest'
import worker from '../worker.js'
import { createTestDb } from './helpers/d1TestHarness.js'

vi.mock('../_auth.js', () => ({
  createAuth: vi.fn(() => async (token) => {
    if (token === 'valid-jwt') {
      return { sub: 'real-user', email: 'real@test.local', role: 'authenticated' }
    }
    return null
  }),
}))

function makeEnv(overrides = {}) {
  return {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }), first: async () => null }) }) },
    IMAGES: { get: async () => null },
    ...overrides,
  }
}

function req(path, { method = 'GET', headers = {}, body } = {}) {
  const opts = { method, headers: { ...headers } }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  return new Request(`https://medstudy.app${path}`, opts)
}

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

describe('Synthetic-auth hook (x-test-user-id / __test)', () => {
  it('production (no ENVIRONMENT) rejects x-test-user-id with 404 and never authenticates', async () => {
    const env = makeEnv()
    const res = await worker.fetch(req('/api/rotation-planner/plans', { headers: { 'x-test-user-id': 'victim-sub' } }), env, {})
    expect(res.status).toBe(404)
  })

  it('production rejects __test query routes with 404', async () => {
    const env = makeEnv()
    const res = await worker.fetch(req('/api/rotation-planner/plans?__test=victim-sub'), env, {})
    expect(res.status).toBe(404)
  })

  it('production rejects a request carrying both a valid session and the hook header', async () => {
    const env = makeEnv()
    const res = await worker.fetch(
      req('/api/rotation-planner/plans', { headers: { Authorization: 'Bearer valid-jwt', 'x-test-user-id': 'victim-sub' } }),
      env,
      {}
    )
    expect(res.status).toBe(404)
  })

  it('staging (ENVIRONMENT=staging) rejects the hook unless explicitly enabled', async () => {
    const env = makeEnv({ ENVIRONMENT: 'staging' })
    const headerRes = await worker.fetch(req('/api/rotation-planner/plans', { headers: { 'x-test-user-id': 'u' } }), env, {})
    const queryRes = await worker.fetch(req('/api/rotation-planner/plans?__test=u'), env, {})
    expect(headerRes.status).toBe(404)
    expect(queryRes.status).toBe(404)
  })

  it('test environment (ENVIRONMENT=test) intentionally allows the hook', async () => {
    const env = makeEnv({ ENVIRONMENT: 'test' })
    const res = await worker.fetch(req('/api/rotation-planner/plans', { headers: { 'x-test-user-id': 'local-test-user' } }), env, {})
    expect(res.status).toBe(200)
  })
})

describe('Real authentication unaffected', () => {
  it('no-auth requests remain 401', async () => {
    const env = makeEnv()
    const res = await worker.fetch(req('/api/rotation-planner/plans'), env, {})
    expect(res.status).toBe(401)
  })

  it('an invalid bearer token remains 401', async () => {
    const env = makeEnv()
    const res = await worker.fetch(req('/api/rotation-planner/plans', { headers: { Authorization: 'Bearer bogus' } }), env, {})
    expect(res.status).toBe(401)
  })

  it('a valid real Supabase session still works in production', async () => {
    const env = makeEnv()
    const res = await worker.fetch(req('/api/rotation-planner/plans', { headers: { Authorization: 'Bearer valid-jwt' } }), env, {})
    expect(res.status).toBe(200)
  })
})

describe('Cross-user access', () => {
  it('impersonation is impossible in production and cross-user reads stay 404', async () => {
    const db = await createTestDb()
    const testEnv = makeEnv({ ENVIRONMENT: 'test', DB: db })
    const prodEnv = makeEnv({ DB: db })

    const createRes = await worker.fetch(
      req('/api/rotation-planner/plans', {
        method: 'POST',
        headers: { 'x-test-user-id': 'user-b', 'Idempotency-Key': 'idem-security-' + Date.now() },
        body: VALID_BODY,
      }),
      testEnv,
      {}
    )
    expect(createRes.status).toBe(201)
    const { plan } = await createRes.json()
    expect(plan.id).toBeTruthy()

    const attack = await worker.fetch(
      req(`/api/rotation-planner/plans/${plan.id}`, { headers: { 'x-test-user-id': 'user-b' } }),
      prodEnv,
      {}
    )
    expect(attack.status).toBe(404)

    const cross = await worker.fetch(
      req(`/api/rotation-planner/plans/${plan.id}`, { headers: { Authorization: 'Bearer valid-jwt' } }),
      prodEnv,
      {}
    )
    expect(cross.status).toBe(404)

    const own = await worker.fetch(
      req(`/api/rotation-planner/plans/${plan.id}`, { headers: { 'x-test-user-id': 'user-b' } }),
      testEnv,
      {}
    )
    expect(own.status).toBe(200)
  })
})

describe('CORS', () => {
  it('CORS preflight does not advertise the synthetic-auth header', async () => {
    const env = makeEnv()
    const res = await worker.fetch(req('/api/rotation-planner/plans', { method: 'OPTIONS' }), env, {})
    const allowHeaders = res.headers.get('access-control-allow-headers') || ''
    expect(allowHeaders.toLowerCase()).not.toContain('x-test-user-id')
    expect(allowHeaders.toLowerCase()).not.toContain('__test')
    expect(allowHeaders).toContain('Authorization')
  })
})
