import { jwtVerify } from 'jose'

export async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) { return null }
}