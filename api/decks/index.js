import { createClient } from '@libsql/client'
import { jwtVerify, createRemoteJWKSet } from 'jose'

export const config = { regions: ['sin1'] }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

let JWKS = null
function getJWKS() {
  if (!JWKS) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (!url) throw new Error('Missing SUPABASE_URL')
    JWKS = createRemoteJWKSet(new URL(url + '/auth/v1/jwks'))
  }
  return JWKS
}

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, getJWKS())
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) { return null }
}

export async function GET(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM anki_decks WHERE user_id = ? ORDER BY name ASC',
      args: [user.id],
    })
    const decks = result.rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      description: r.description || '',
      created_at: r.created_at,
    }))
    return Response.json(decks)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { name, description } = await req.json()
    if (!name || !name.trim()) return Response.json({ error: 'Name required' }, { status: 400 })
    const id = crypto.randomUUID()
    await turso.execute({
      sql: `INSERT INTO anki_decks (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      args: [id, user.id, name.trim(), description ? description.trim() : ''],
    })
    return Response.json(
      { id: id, user_id: user.id, name: name.trim(), description: description ? description.trim() : '' },
      { status: 201 }
    )
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
