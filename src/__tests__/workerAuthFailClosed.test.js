import { describe, it, expect, vi, beforeEach } from 'vitest'
import worker from '../worker.js'
import { jwtVerify, errors } from 'jose'

// Real _auth.js + real router, with only jose mocked. Proves every JWT
// verification failure surfaces as 401 (never 500) through the actual worker
// request path, and that infrastructure failures still surface as 500.
vi.mock('jose', () => {
  class JOSEError extends Error {
    code = 'ERR_JOSE_GENERIC'
  }
  class JWTInvalid extends JOSEError {}
  class JWTExpired extends JOSEError {}
  class JWTClaimValidationFailed extends JOSEError {}
  class JWSSignatureVerificationFailed extends JOSEError {}
  class JWKSNoMatchingKey extends JOSEError {}
  class JWKSTimeout extends JOSEError {}
  const jwtVerify = vi.fn()
  const createRemoteJWKSet = vi.fn(() => vi.fn())
  return {
    jwtVerify,
    createRemoteJWKSet,
    errors: { JOSEError, JWTInvalid, JWTExpired, JWTClaimValidationFailed, JWSSignatureVerificationFailed, JWKSNoMatchingKey, JWKSTimeout },
  }
})

function makeEnv(overrides = {}) {
  return {
    SUPABASE_URL: 'https://undakhccjrbcpzryfmot.supabase.co',
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 0 } }),
          first: async () => null,
        }),
      }),
    },
    IMAGES: { get: async () => null },
    ...overrides,
  }
}

function req(path, { method = 'GET', headers = {} } = {}) {
  return new Request(`https://medstudy.app${path}`, {
    method,
    headers: { ...headers },
  })
}

const PROTECTED = '/api/rotation-planner/plans'

describe('worker auth fail-closed (invalid JWT → 401, never 500)', () => {
  beforeEach(() => {
    jwtVerify.mockReset()
  })

  const categories = [
    ['malformed bearer token', new errors.JWTInvalid('bad format')],
    ['invalid signature', new errors.JWSSignatureVerificationFailed()],
    ['expired JWT', new errors.JWTExpired('jwt expired', {})],
    ['wrong issuer (cross-environment JWT)', new errors.JWTClaimValidationFailed('iss validation failed', {}, 'iss', 'invalid')],
    ['wrong audience (cross-environment JWT)', new errors.JWTClaimValidationFailed('aud validation failed', {}, 'aud', 'invalid')],
    ['missing required claims', new errors.JWTClaimValidationFailed('claim validation failed', {}, 'exp', 'missing')],
    ['key not present in this environment JWKS (cross-environment JWT)', new errors.JWKSNoMatchingKey()],
  ]

  it.each(categories)('returns 401 for %s', async (_label, error) => {
    jwtVerify.mockRejectedValue(error)
    const res = await worker.fetch(req(PROTECTED, { headers: { Authorization: 'Bearer some-token' } }), makeEnv(), {})
    expect(res.status).toBe(401)
  })

  it('returns 401 when no bearer token is supplied', async () => {
    const res = await worker.fetch(req(PROTECTED), makeEnv(), {})
    expect(res.status).toBe(401)
  })

  it('does not leak jose error details in the 401 body', async () => {
    jwtVerify.mockRejectedValue(new errors.JWTExpired('jwt expired', {}))
    const res = await worker.fetch(req(PROTECTED, { headers: { Authorization: 'Bearer x' } }), makeEnv(), {})
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(JSON.stringify(body)).not.toMatch(/ERR_JOSE|JWTExpired|jose/i)
    expect(body.error).toBe('Unauthorized')
  })

  it('still returns 500 for infrastructure failures (JWKS timeout)', async () => {
    jwtVerify.mockRejectedValue(new errors.JWKSTimeout())
    const res = await worker.fetch(req(PROTECTED, { headers: { Authorization: 'Bearer x' } }), makeEnv(), {})
    expect(res.status).toBe(500)
  })

  it('still returns 500 for network failures fetching JWKS', async () => {
    jwtVerify.mockRejectedValue(new TypeError('fetch failed'))
    const res = await worker.fetch(req(PROTECTED, { headers: { Authorization: 'Bearer x' } }), makeEnv(), {})
    expect(res.status).toBe(500)
  })

  it('continues to the handler when verification succeeds', async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: 'real-user', email: 'real@test.local', role: 'authenticated' },
    })
    const res = await worker.fetch(req(PROTECTED, { headers: { Authorization: 'Bearer valid-jwt' } }), makeEnv(), {})
    expect(res.status).toBe(200)
  })
})
