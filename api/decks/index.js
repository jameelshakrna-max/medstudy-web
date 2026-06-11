import { createClient } from '@libsql/client'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
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