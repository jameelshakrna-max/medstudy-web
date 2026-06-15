// api/_auth.js — Local JWT verification using jose
// ⚠️ IMPORTANT: In Vercel's flat file convention, each function is bundled independently.
// You CANNOT import this file from other api-*.js files.
// Instead, COPY the getUser function below into each API file that needs auth.
// This file exists only as a reference / for local testing.

import { jwtVerify } from 'jose'

export async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null

  const token = auth.replace('Bearer ', '')

  try {
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    }
  } catch (e) {
    return null
  }
}
