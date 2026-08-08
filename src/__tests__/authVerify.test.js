import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuth } from '../_auth.js'
import { jwtVerify, errors } from 'jose'

vi.mock('jose', () => {
  class JOSEError extends Error {
    code = 'ERR_JOSE_GENERIC'
  }
  class JWTInvalid extends JOSEError {}
  class JWTExpired extends JOSEError {}
  class JWTClaimValidationFailed extends JOSEError {}
  class JWSSignatureVerificationFailed extends JOSEError {}
  class JWKSNoMatchingKey extends JOSEError {}
  class JWKSTimeout extends JOSEError {
    constructor(message = 'request timed out') { super(message) }
  }
  const jwtVerify = vi.fn()
  const createRemoteJWKSet = vi.fn(() => vi.fn())
  return {
    jwtVerify,
    createRemoteJWKSet,
    errors: { JOSEError, JWTInvalid, JWTExpired, JWTClaimValidationFailed, JWSSignatureVerificationFailed, JWKSNoMatchingKey, JWKSTimeout },
  }
})

const env = { SUPABASE_URL: 'https://undakhccjrbcpzryfmot.supabase.co' }

describe('verifyAuth fail-closed classification', () => {
  beforeEach(() => {
    jwtVerify.mockReset()
  })

  const cases = [
    ['malformed token', new errors.JWTInvalid('bad format')],
    ['invalid signature', new errors.JWSSignatureVerificationFailed()],
    ['expired JWT', new errors.JWTExpired('jwt expired', {})],
    ['wrong issuer', new errors.JWTClaimValidationFailed('iss validation failed', {}, 'iss', 'invalid')],
    ['wrong audience', new errors.JWTClaimValidationFailed('aud validation failed', {}, 'aud', 'invalid')],
    ['missing required claims', new errors.JWTClaimValidationFailed('claim validation failed', {}, 'exp', 'missing')],
    ['key not in this environment JWKS (wrong environment)', new errors.JWKSNoMatchingKey()],
  ]

  it.each(cases)('maps %s to null (caller returns 401), never throws', async (_label, error) => {
    jwtVerify.mockRejectedValue(error)
    const verifyAuth = createAuth(env)
    const result = await verifyAuth('any-token')
    expect(result).toBeNull()
  })

  it('maps a valid token to the user claims', async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'u@test.local', role: 'authenticated' },
    })
    const verifyAuth = createAuth(env)
    const result = await verifyAuth('valid-token')
    expect(result).toEqual({ sub: 'user-1', email: 'u@test.local', role: 'authenticated' })
  })

  it('propagates JWKS timeout (infrastructure) as an error → 500', async () => {
    jwtVerify.mockRejectedValue(new errors.JWKSTimeout())
    const verifyAuth = createAuth(env)
    await expect(verifyAuth('any-token')).rejects.toThrow('request timed out')
  })

  it('propagates generic JOSEError from JWKS fetch/parse (infrastructure) as an error → 500', async () => {
    jwtVerify.mockRejectedValue(new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'))
    const verifyAuth = createAuth(env)
    await expect(verifyAuth('any-token')).rejects.toThrow('Expected 200 OK')
  })

  it('propagates non-JOSE failures (network) as an error → 500', async () => {
    jwtVerify.mockRejectedValue(new TypeError('fetch failed'))
    const verifyAuth = createAuth(env)
    await expect(verifyAuth('any-token')).rejects.toThrow('fetch failed')
  })

  it('propagates missing SUPABASE_URL as an error → 500', async () => {
    const verifyAuth = createAuth({})
    await expect(verifyAuth('any-token')).rejects.toThrow('Missing SUPABASE_URL')
  })

  it('does not expose jose internals to callers for invalid tokens', async () => {
    jwtVerify.mockRejectedValue(new errors.JWTExpired('jwt expired', {}))
    const verifyAuth = createAuth(env)
    const result = await verifyAuth('expired-token')
    expect(result).toBeNull()
  })
})
