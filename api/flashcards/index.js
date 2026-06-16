import { createClient } from '@libsql/client'
import { jwtVerify, createRemoteJWKSet } from 'jose'

export const config = { regions: ['sin1'] }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

let JWKS = null
function getJWKS() {
  if (!JWKS) {
    let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (!url) throw new Error('Missing SUPABASE_URL')
    url = url.replace(/\/+$/, '')
    JWKS = createRemoteJWKSet(new URL(url + '/auth/v1/.well-known/jwks.json'))
  }
  return JWKS
}

function getIssuer() {
  let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!url) return undefined
  url = url.replace(/\/+$/, '')
  return url + '/auth/v1'
}

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: getIssuer(),
      audience: 'authenticated',
    })
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) { return null }
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
    const url = new URL(req.url)
    const deckId = url.searchParams.get('deck_id')
    let sql, args
    if (deckId) {
      sql = 'SELECT id, user_id, deck_id, front, back, image_url, high_yield, ease_factor, interval_days, times_reviewed, last_reviewed, next_review_date FROM anki_cards WHERE user_id = ? AND deck_id = ? ORDER BY CASE WHEN next_review_date IS NULL THEN 1 ELSE 0 END, next_review_date ASC, created_at DESC'
      args = [user.id, deckId]
    } else {
      sql = 'SELECT id, user_id, deck_id, front, back, image_url, high_yield, ease_factor, interval_days, times_reviewed, last_reviewed, next_review_date FROM anki_cards WHERE user_id = ? ORDER BY CASE WHEN next_review_date IS NULL THEN 1 ELSE 0 END, next_review_date ASC, created_at DESC'
      args = [user.id]
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
    const today = new Date().toISOString().split('T')[0]
    const inserted = []
    for (const c of items) {
      const id = crypto.randomUUID()
      const interval = c.interval ?? c.interval_days ?? 0
      const repetitions = c.repetitions ?? c.times_reviewed ?? 0
      const nextRev = (c.next_review ?? c.next_review_date) || today
      const lastRev = (c.last_review ?? c.last_reviewed) || null
      await turso.execute({
        sql: `INSERT INTO anki_cards (id, user_id, deck_id, front, back, image_url, high_yield, ease_factor, interval_days, times_reviewed, last_reviewed, next_review_date, interval, repetitions, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [id, user.id, c.deck_id || null, c.front, c.back, c.image_url || null, c.high_yield ? 1 : 0, c.ease_factor ?? 2.5, interval, repetitions, lastRev, nextRev, interval, repetitions, lastRev, nextRev],
      })
      inserted.push({
        id, user_id: user.id, deck_id: c.deck_id || null, front: c.front, back: c.back,
        image_url: c.image_url || null, high_yield: Boolean(c.high_yield), ease_factor: c.ease_factor ?? 2.5,
        interval, repetitions, last_review: lastRev, next_review: nextRev,
        created_at: new Date().toISOString()
      })
    }
    return Response.json(inserted.length === 1 ? inserted[0] : inserted, { status: 201 })
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}
