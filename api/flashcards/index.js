import { createClient } from '@libsql/client'
import { getUser } from '../_auth.js'

export const runtime = 'nodejs'

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
    const limit = Math.min(Number(url.searchParams.get('limit')) || 10000, 100000)
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

    const now = new Date().toISOString()
    const rows = items.map(c => {
      const id = crypto.randomUUID()
      return {
        id, deckId: c.deck_id || null, front: c.front, back: c.back,
        image_url: c.image_url || null, high_yield: c.high_yield ? 1 : 0,
        difficulty: c.difficulty ?? 0, stability: c.stability ?? 0,
        state: c.state ?? 0, interval: c.interval ?? 0,
        repetitions: c.repetitions ?? 0,
      }
    })

    const chunkSize = 250
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      await turso.batch(chunk.map(r => ({
        sql: `INSERT INTO anki_cards (id, user_id, deck_id, front, back, image_url, high_yield, difficulty, stability, state, interval, repetitions, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [r.id, user.id, r.deckId, r.front, r.back, r.image_url, r.high_yield, r.difficulty, r.stability, r.state, r.interval, r.repetitions, null, null, now],
      })))
    }

    return Response.json({ success: true, count: items.length, ids: rows.map(r => r.id) }, { status: 201 })
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}
