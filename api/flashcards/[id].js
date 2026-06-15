import { createClient } from '@libsql/client'
import { jwtVerify, createRemoteJWKSet } from 'jose'

export const config = { regions: ['sin1'] }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const JWKS = createRemoteJWKSet(
  new URL(process.env.SUPABASE_URL + '/auth/v1/jwks')
)

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, JWKS)
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) { return null }
}

/* Extract card id from URL: /api/flashcards/<id> */
function extractId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[parts.length - 1]
}

/* Map Turso columns → names Anki.jsx expects */
function mapCard(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    deck_id: r.deck_id || null,
    front: r.front,
    back: r.back,
    high_yield: Boolean(r.high_yield),
    ease_factor: Number(r.ease_factor),
    interval: Number(r.interval_days),
    repetitions: Number(r.times_reviewed),
    last_review: r.last_reviewed || null,
    next_review: r.next_review_date || null,
    created_at: r.created_at,
  }
}

export async function PUT(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    const body = await req.json()

    /* Anki.jsx sends: ease_factor, interval, repetitions, next_review, last_review */
    /* Turso columns:  ease_factor, interval_days, times_reviewed, next_review_date, last_reviewed */
    const ease_factor = body.ease_factor ?? 2.5
    const interval_days = body.interval ?? body.interval_days ?? 0
    const times_reviewed = body.repetitions ?? body.times_reviewed ?? 0
    const next_review_date = body.next_review ?? body.next_review_date || null
    const last_reviewed = body.last_review ?? body.last_reviewed || null

    await turso.execute({
      sql: `UPDATE anki_cards SET ease_factor = ?, interval_days = ?, times_reviewed = ?, next_review_date = ?, last_reviewed = ? WHERE id = ? AND user_id = ?`,
      args: [ease_factor, interval_days, times_reviewed, next_review_date, last_reviewed, id, user.id],
    })

    /* Return the updated card */
    const result = await turso.execute({
      sql: 'SELECT * FROM anki_cards WHERE id = ? AND user_id = ?',
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
