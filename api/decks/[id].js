import { createClient } from '@libsql/client'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const config = { regions: ['sin1'] }

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

function extractId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[parts.length - 1]
}

function generateCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

/* PUT — toggle sharing on/off */
export async function PUT(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    const body = await req.json()

    if (body.toggle_share) {
      /* Check deck belongs to user */
      const check = await turso.execute({
        sql: 'SELECT * FROM anki_decks WHERE id = ? AND user_id = ?',
        args: [id, user.id]
      })
      if (!check.rows.length) return Response.json({ error: 'Deck not found' }, { status: 404 })

      const deck = check.rows[0]
      const isCurrentlyShared = Boolean(deck.is_shared)
      const newShared = isCurrentlyShared ? 0 : 1
      const shareCode = newShared ? (deck.share_code || generateCode()) : deck.share_code

      await turso.execute({
        sql: 'UPDATE anki_decks SET is_shared = ?, share_code = ? WHERE id = ? AND user_id = ?',
        args: [newShared, shareCode, id, user.id]
      })

      return Response.json({
        id, is_shared: Boolean(newShared), share_code: shareCode
      })
    }

    /* Update name/description */
    const { name, description } = body
    if (name) {
      await turso.execute({
        sql: 'UPDATE anki_decks SET name = ?, description = ? WHERE id = ? AND user_id = ?',
        args: [name.trim(), description?.trim() || '', id, user.id]
      })
    }
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

/* DELETE — delete deck and all its cards */
export async function DELETE(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    await turso.execute({
      sql: 'DELETE FROM anki_cards WHERE deck_id = ? AND user_id = ?',
      args: [id, user.id],
    })
    await turso.execute({
      sql: 'DELETE FROM anki_decks WHERE id = ? AND user_id = ?',
      args: [id, user.id],
    })
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}