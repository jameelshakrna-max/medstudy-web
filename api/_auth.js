import { jwtVerify } from 'jose'

export async function getUser(req) {
  const auth = req.headers.get('authorization')
  console.log('AUTH HEADER:', auth ? auth.substring(0, 20) + '...' : 'NONE')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const secretVal = process.env.SUPABASE_JWT_SECRET
    console.log('JWT SECRET exists:', !!secretVal, 'length:', secretVal ? secretVal.length : 0)
    const secret = new TextEncoder().encode(secretVal)
    const { payload } = await jwtVerify(token, secret)
    console.log('JWT VERIFIED, user:', payload.sub)
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) {
    console.log('JWT VERIFY FAILED:', e.message)
    return null
  }
}