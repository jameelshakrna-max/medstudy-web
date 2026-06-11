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

function mapCard(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    deck_id: r.deck_id || null,
    front: r.front,
    back: r.back,
    high_yield: Boolean(r.high_yield),
    ease_factor: Number(r.ease_factor),
    interval: Number(r.interval ?? r.interval_days),
    repetitions: Number(r.repetitions ?? r.times_reviewed),
    last_review: (r.last_review ?? r.last_reviewed) || null,
    next_review: (r.next_review ?? r.next_review_date) || null,
    created_at: r.created_at
  }
}

export async function GET(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const [deckResult, cardResult] = await Promise.all([
      turso.execute({ sql: 'SELECT id, user_id, name, description, created_at FROM anki_decks WHERE user_id = ? ORDER BY name ASC', args: [user.id] }),
      turso.execute({ sql: "SELECT id, user_id, deck_id, front, back, high_yield, ease_factor, interval_days, times_reviewed, last_reviewed, next_review_date, interval, repetitions, last_review, next_review, created_at FROM anki_cards WHERE user_id = ? ORDER BY CASE WHEN next_review IS NULL AND next_review_date IS NULL THEN 1 ELSE 0 END, COALESCE(next_review, next_review_date) ASC, created_at DESC", args: [user.id] })
    ])
    const decks = deckResult.rows.map(r => ({
      id: r.id, user_id: r.user_id, name: r.name,
      description: r.description || '', created_at: r.created_at
    }))
    const cards = cardResult.rows.map(mapCard)
    return Response.json({ decks, cards })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}