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
    const ease_factor = body.ease_factor ?? 2.5
    const interval_days = body.interval ?? body.interval_days ?? 0
    const times_reviewed = body.repetitions ?? body.times_reviewed ?? 0
    const next_review_date = body.next_review ?? body.next_review_date || null
    const last_reviewed = body.last_review ?? body.last_reviewed || null
    await turso.execute({
      sql: `UPDATE anki_cards SET ease_factor = ?, interval_days = ?, times_reviewed = ?, next_review_date = ?, last_reviewed = ? WHERE id = ? AND user_id = ?`,
      args: [ease_factor, interval_days, times_reviewed, next_review_date, last_reviewed, id, user.id],
    })
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
