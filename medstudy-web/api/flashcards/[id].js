import { createClient } from '@libsql/client'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const supabase = createSupabaseClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}

export async function PUT(req, { params }) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const body = await req.json()
    const fields = [], values = []
    if (body.front !== undefined) { fields.push('front = ?'); values.push(body.front) }
    if (body.back !== undefined) { fields.push('back = ?'); values.push(body.back) }
    if (body.deck_id !== undefined) { fields.push('deck_id = ?'); values.push(body.deck_id || null) }
    if (body.high_yield !== undefined) { fields.push('high_yield = ?'); values.push(body.high_yield ? 1 : 0) }
    if (body.ease_factor !== undefined) { fields.push('ease_factor = ?'); values.push(body.ease_factor) }
    if (body.interval_days !== undefined) { fields.push('interval_days = ?'); values.push(body.interval_days) }
    if (body.times_reviewed !== undefined) { fields.push('times_reviewed = ?'); values.push(body.times_reviewed) }
    if (body.last_reviewed !== undefined) { fields.push('last_reviewed = ?'); values.push(body.last_reviewed || null) }
    if (body.next_review_date !== undefined) { fields.push('next_review_date = ?'); values.push(body.next_review_date || null) }
    if (!fields.length) return Response.json({ error: 'Nothing to update' }, { status: 400 })
    values.push(id, user.id)
    await turso.execute({ sql: UPDATE anki_cards SET  WHERE id = ? AND user_id = ?, args: values })
    return Response.json({ success: true })
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}

export async function DELETE(req, { params }) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await turso.execute({ sql: 'DELETE FROM anki_cards WHERE id = ? AND user_id = ?', args: [id, user.id] })
    return Response.json({ success: true })
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}
