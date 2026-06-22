import { createClient } from '@libsql/client/web'
import { getUser } from '../_auth.js'

export const runtime = 'edge'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

function extractId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[parts.length - 1]
}

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
    created_at: r.created_at,
  }
}

const CARD_COLS = 'id, user_id, deck_id, front, back, image_url, high_yield, difficulty, stability, state, interval, repetitions, last_review, next_review, created_at'

export async function PUT(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    const body = await req.json()
    const image_url = body.image_url || null
    await turso.execute({
      sql: `UPDATE anki_cards SET difficulty = ?, stability = ?, state = ?, interval = ?, next_review = ?, last_review = ?, image_url = ? WHERE id = ? AND user_id = ?`,
      args: [body.difficulty ?? 0, body.stability ?? 0, body.state ?? 0, body.interval ?? 0, body.next_review || null, body.last_review || null, image_url, id, user.id],
    })
    const result = await turso.execute({
      sql: `SELECT ${CARD_COLS} FROM anki_cards WHERE id = ? AND user_id = ?`,
      args: [id, user.id],
    })
    if (result.rows.length) return Response.json(mapCard(result.rows[0]))
    return Response.json({ error: 'Card not found' }, { status: 404 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    await turso.execute({
      sql: 'DELETE FROM anki_cards WHERE id = ? AND user_id = ?',
      args: [id, user.id],
    })
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
