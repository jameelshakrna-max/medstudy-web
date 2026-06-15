import { jwtVerify, createRemoteJWKSet } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL(process.env.VITE_SUPABASE_URL + '/auth/v1/jwks')
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