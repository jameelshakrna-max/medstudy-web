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

export async function GET(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const url = new URL(req.url)
    const deckId = url.searchParams.get('deck_id')
    let sql, args
    if (deckId) {
      sql = 'SELECT * FROM anki_cards WHERE user_id = ? AND deck_id = ? ORDER BY CASE WHEN next_review_date IS NULL THEN 1 ELSE 0 END, next_review_date ASC, created_at DESC'
      args = [user.id, deckId]
    } else {
      sql = 'SELECT * FROM anki_cards WHERE user_id = ? ORDER BY CASE WHEN next_review_date IS NULL THEN 1 ELSE 0 END, next_review_date ASC, created_at DESC'
      args = [user.id]
    }
    const result = await turso.execute({ sql, args })
    const cards = result.rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      deck_id: r.deck_id || null,
      front: r.front,
      back: r.back,
      high_yield: Boolean(r.high_yield),
      ease_factor: Number(r.ease_factor),
      interval_days: Number(r.interval_days),
      times_reviewed: Number(‚.times_reviewed),
      last_reviewed: r.last_reviewed || null,
      next_review_date: r.next_review_date || null,
      created_at: r.created_at
    }))
    return Response.json(cards)
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}

export async function POST(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const items = Array.isArray(body) ? body : [body]
    const today = new Date().toISOString().split('T')[0]
    const inserted = []
    for (const c of items) {
      const id = crypto.randomUUID()
      await turso.execute({
        sql: `INSERT INTO anki_cards (id, user_id, deck_id, front, back, high_yield, ease_factor, interval_days, times_reviewed, next_review_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [id, user.id, c.deck_id || null, c.front, c.back, c.high_yield ? 1 : 0, c.ease_factor ?? 2.5, c.interval_days ?? 0, c.times_reviewed ?? 0, c.next_review_date || today],
      })
      inserted.push({
        id, user_id: user.id, deck_id: c.deck_id || null, front: c.front, back: c.back,
        high_yield: Boolean(c.high_yield), ease_factor: c.ease_factor ?? 2.5,
        interval_days: c.interval_days ?? 0, times_reviewed: c.times_reviewed ?? 0,
        last_reviewed: null, next_review_date: c.next_review_date || today,
        created_at: new Date().toISOString()
      })
    }
    return Response.json(inserted.length === 1 ? inserted[0] : inserted, { status: 201 })
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}
