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

export async function DELETE(req, { params }) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await turso.execute({ sql: 'DELETE FROM anki_cards WHERE deck_id = ? AND user_id = ?', args: [id, user.id] })
    await turso.execute({ sql: 'DELETE FROM anki_decks WHERE id = ? AND user_id = ?', args: [id, user.id] })
    return Response.json({ success: true })
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}
