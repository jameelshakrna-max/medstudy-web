import { createClient } from '@libsql/client'
import { jwtVerify } from 'jose'

export const config = { regions: ['sin1'] }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const JWT_SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (!payload.sub) return null
    return { id: payload.sub }
  } catch { return null }
}

export async function GET(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await turso.execute({
      sql: 'SELECT id, user_id, name, description, created_at FROM anki_decks WHERE user_id = ? ORDER BY name ASC',
      args: [user.id],
    })
    const decks = result.rows.map(r => ({
      id: r.id, user_id: r.user_id, name: r.name,
      description: r.description || '', created_at: r.created_at,
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
    if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 })
    const id = crypto.randomUUID()
    await turso.execute({
      sql: `INSERT INTO anki_decks (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      args: [id, user.id, name.trim(), description?.trim() || ''],
    })
    return Response.json(
      { id, user_id: user.id, name: name.trim(), description: description?.trim() || '' },
      { status: 201 }
    )
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}