// api/_auth.js — JWT verification using Supabase JWKS endpoint (ES256)
// Uses createRemoteJWKSet to fetch public keys from Supabase
// Lazy-init with proper issuer/audience validation

import { jwtVerify, createRemoteJWKSet } from 'jose'

let JWKS = null

function getJWKS() {
  if (!JWKS) {
    let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (!url) throw new Error('Missing SUPABASE_URL')
    url = url.replace(/\/+$/, '')
    JWKS = createRemoteJWKSet(new URL(url + '/auth/v1/.well-known/jwks.json'), {
  cooldownDuration: 300000,
  timeoutDuration: 5000,
  cacheMaxAge: 3600000,
    })
  }
  return JWKS
}

function getIssuer() {
  let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!url) return undefined
  url = url.replace(/\/+$/, '')
  return url + '/auth/v1'
}

export async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: getIssuer(),
      audience: 'authenticated',
    })
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) {
    return null
  }
}
