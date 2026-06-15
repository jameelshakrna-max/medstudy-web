// api/_auth.js — JWT verification using Supabase JWKS endpoint
// Uses createRemoteJWKSet to fetch public keys from Supabase
// Supports both HS256 and ES256 signing algorithms automatically
// No SUPABASE_JWT_SECRET needed — uses the public JWKS endpoint instead

import { jwtVerify, createRemoteJWKSet } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL(process.env.SUPABASE_URL + '/auth/v1/jwks')
)

export async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, JWKS)
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) {
    return null
  }
}