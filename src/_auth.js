import { jwtVerify, createRemoteJWKSet, errors as joseErrors } from 'jose'

let JWKS = null
let cachedUrl = ''

export function createAuth(env) {
  return async function verifyAuth(token) {
    const url = (env.SUPABASE_URL || '').replace(/\/+$/, '')
    if (!url) throw new Error('Missing SUPABASE_URL')

    if (!JWKS || cachedUrl !== url) {
      cachedUrl = url
      JWKS = createRemoteJWKSet(new URL(url + '/auth/v1/.well-known/jwks.json'), {
        cooldownDuration: 300000,
        timeoutDuration: 5000,
        cacheMaxAge: 3600000,
      })
    }

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: url + '/auth/v1',
        audience: 'authenticated',
      })

      return { sub: payload.sub, email: payload.email, role: payload.role }
    } catch (err) {
      // Fail closed: every JWT verification failure (malformed, expired, wrong
      // signature, wrong issuer/audience, missing claims, no matching key for
      // this environment) means "invalid authentication" and maps to 401 by
      // returning null — never a 500, and jose internals are never leaked.
      //
      // Infrastructure failures (JWKS fetch/parse/timeout) are NOT auth
      // failures and must keep surfacing as 500 so the operator sees them.
      const isInfra = err instanceof joseErrors.JWKSTimeout
        || (err instanceof joseErrors.JOSEError && err.constructor === joseErrors.JOSEError)
      if (err instanceof joseErrors.JOSEError && !isInfra) return null
      throw err
    }
  }
}
