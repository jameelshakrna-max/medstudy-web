// api/_auth.js — JWT verification using Supabase JWKS endpoint
// Lazy-initializes JWKS to avoid crashes when env vars aren't available at module load time

import { jwtVerify, createRemoteJWKSet } from 'jose'

let JWKS = null

function getJWKS() {
  if (!JWKS) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (!url) throw new Error('Missing SUPABASE_URL')
    JWKS = createRemoteJWKSet(new URL(url + '/auth/v1/jwks'))
  }
  return JWKS
}

export async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, getJWKS())
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) {
    return null
  }
}
