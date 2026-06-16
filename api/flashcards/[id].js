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
    high_yield: Boolean(r.high_yield),
    image_url: r.image_url || null,
    // FSRS fields
    difficulty: Number(r.difficulty ?? 0),
    stability: Number(r.stability ?? 0),
    state: Number(r.state ?? 0),
    // Legacy SM-2 fields
    ease_factor: Number(r.ease_factor),
    interval: Number(r.interval ?? r.interval_days),
    repetitions: Number(r.repetitions ?? r.times_reviewed),
    last_review: (r.last_review ?? r.last_reviewed) || null,
    next_review: (r.next_review ?? r.next_review_date) || null,
    created_at: r.created_at,
  }
}

export async function PUT(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    const body = await req.json()

    // Build SET clause dynamically
    const sets = []
    const args = []

    // FSRS fields
    if (body.difficulty !== undefined) { sets.push('difficulty = ?'); args.push(body.difficulty) }
    if (body.stability !== undefined) { sets.push('stability = ?'); args.push(body.stability) }
    if (body.state !== undefined) { sets.push('state = ?'); args.push(body.state) }

    // Legacy SM-2 fields
    if (body.ease_factor !== undefined) { sets.push('ease_factor = ?'); args.push(body.ease_factor) }
    if (body.interval !== undefined || body.interval_days !== undefined) {
      const iv = body.interval ?? body.interval_days ?? 0
      sets.push('interval_days = ?'); args.push(iv)
      sets.push('interval = ?'); args.push(iv)
    }
    if (body.repetitions !== undefined || body.times_reviewed !== undefined) {
      const rep = body.repetitions ?? body.times_reviewed ?? 0
      sets.push('times_reviewed = ?'); args.push(rep)
      sets.push('repetitions = ?'); args.push(rep)
    }
    if (body.next_review !== undefined || body.next_review_date !== undefined) {
      const nr = (body.next_review ?? body.next_review_date) || null
      sets.push('next_review_date = ?'); args.push(nr)
      sets.push('next_review = ?'); args.push(nr)
    }
    if (body.last_review !== undefined || body.last_reviewed !== undefined) {
      const lr = (body.last_review ?? body.last_reviewed) || null
      sets.push('last_reviewed = ?'); args.push(lr)
      sets.push('last_review = ?'); args.push(lr)
    }

    // Other fields
    if (body.front !== undefined) { sets.push('front = ?'); args.push(body.front) }
    if (body.back !== undefined) { sets.push('back = ?'); args.push(body.back) }
    if (body.high_yield !== undefined) { sets.push('high_yield = ?'); args.push(body.high_yield ? 1 : 0) }
    if (body.image_url !== undefined) { sets.push('image_url = ?'); args.push(body.image_url) }

    if (!sets.length) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    args.push(id, user.id)

    await turso.execute({
      sql: `UPDATE anki_cards SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    })

    const result = await turso.execute({
      sql: 'SELECT id, user_id, deck_id, front, back, high_yield, image_url, difficulty, stability, state, ease_factor, interval_days, times_reviewed, last_reviewed, next_review_date, interval, repetitions, last_review, next_review, created_at FROM anki_cards WHERE id = ? AND user_id = ?',
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
