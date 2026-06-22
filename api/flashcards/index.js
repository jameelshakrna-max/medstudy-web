import { createClient } from '@libsql/client/web'
import { getUser } from '../_auth.js'

export const runtime = 'edge'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const CARD_COLS = 'id, user_id, deck_id, front, back, image_url, high_yield, difficulty, stability, state, interval, repetitions, last_review, next_review, created_at'

function mapCard(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    deck_id: r.deck_id || null,
    front: r.front,
    back: r.back,
    image_url: r.image_url || null,
    high_yield: Boolean(r.high_yield),
    difficulty: Number(r.difficulty) || 0,
    stability: Number(r.stability) || 0,
    state: Number(r.state) || 0,
    interval: Number(r.interval) || 0,
    repetitions: Number(r.repetitions) || 0,
    last_review: r.last_review || null,
    next_review: r.next_review || null,
    created_at: r.created_at
  }
}

export async function GET(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const url = new URL(req.url)
    const deckId = url.searchParams.get('deck_id')
    const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 5000)
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
    let sql, args
    if (deckId) {
      sql = `SELECT ${CARD_COLS} FROM anki_cards WHERE user_id = ? AND deck_id = ? ORDER BY CASE WHEN next_review IS NULL THEN 1 ELSE 0 END, next_review ASC, created_at DESC LIMIT ? OFFSET ?`
      args = [user.id, deckId, limit, offset]
    } else {
      sql = `SELECT ${CARD_COLS} FROM anki_cards WHERE user_id = ? ORDER BY CASE WHEN next_review IS NULL THEN 1 ELSE 0 END, next_review ASC, created_at DESC LIMIT ? OFFSET ?`
      args = [user.id, limit, offset]
    }
    const result = await turso.execute({ sql, args })
    return Response.json(result.rows.map(mapCard))
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}

export async function POST(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    let items
    if (Array.isArray(body.cards)) { items = body.cards }
    else if (Array.isArray(body)) { items = body }
    else { items = [body] }
    const inserted = []
    for (const c of items) {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await turso.execute({
        sql: `INSERT INTO anki_cards (id, user_id, deck_id, front, back, image_url, high_yield, difficulty, stability, state, interval, repetitions, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, user.id, c.deck_id || null, c.front, c.back, c.image_url || null, c.high_yield ? 1 : 0, c.difficulty ?? 0, c.stability ?? 0, c.state ?? 0, c.interval ?? 0, c.repetitions ?? 0, null, null, now],
      })
      inserted.push({
        id, user_id: user.id, deck_id: c.deck_id || null, front: c.front, back: c.back,
        image_url: c.image_url || null, high_yield: Boolean(c.high_yield),
        difficulty: Number(c.difficulty) || 0, stability: Number(c.stability) || 0,
        state: Number(c.state) || 0, interval: Number(c.interval) || 0,
        repetitions: Number(c.repetitions) || 0,
        last_review: null, next_review: null, created_at: now
      })
    }
    return Response.json(inserted.length === 1 ? inserted[0] : inserted, { status: 201 })
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}
