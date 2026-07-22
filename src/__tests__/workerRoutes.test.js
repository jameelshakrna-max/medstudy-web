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
