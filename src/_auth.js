import { jwtVerify, createRemoteJWKSet } from 'jose'

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

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: url + '/auth/v1',
      audience: 'authenticated',
    })

    return { sub: payload.sub, email: payload.email, role: payload.role }
  }
}
