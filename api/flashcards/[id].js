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

function mapCard(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    deck_id: r.deck_id || null,
    front: r.front,
    back: r.back,
    high_yield: Boolean(r.high_yield),
    difficulty: Number(r.difficulty) || 0,
    stability: Number(r.stability) || 0,
    state: Number(r.state) || 0,
    reps: Number(r.reps) || 0,
    lapses: Number(r.lapses) || 0,
    elapsed_days: Number(r.elapsed_days) || 0,
    scheduled_days: Number(r.scheduled_days) || 0,
    ease_factor: Number(r.ease_factor) || 2.5,
    interval: Number(r.interval ?? r.interval_days) ?? 0,
    repetitions: Number(r.repetitions ?? r.times_reviewed) ?? 0,
    last_review: (r.last_review ?? r.last_reviewed) || null,
    next_review: (r.next_review ?? r.next_review_date) || null,
    created_at: r.created_at
  }
}

export async function PUT(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    const body = await req.json()

    const ease_factor = body.ease_factor ?? 2.5
    const interval_val = (body.interval ?? body.interval_days) ?? 0
    const repetitions_val = (body.repetitions ?? body.times_reviewed) ?? 0
    const next_review_val = (body.next_review ?? body.next_review_date) || null
    const last_review_val = (body.last_review ?? body.last_reviewed) || null

    // FSRS fields
    const difficulty = body.difficulty ?? 0
    const stability = body.stability ?? 0
    const state = body.state ?? 0
    const reps = body.reps ?? 0
    const lapses = body.lapses ?? 0
    const elapsed_days = body.elapsed_days ?? 0
    const scheduled_days = body.scheduled_days ?? 0

    await turso.execute({
      sql: `UPDATE anki_cards SET ease_factor = ?, interval_days = ?, times_reviewed = ?, next_review_date = ?, last_reviewed = ?, interval = ?, repetitions = ?, next_review = ?, last_review = ?, difficulty = ?, stability = ?, state = ?, reps = ?, lapses = ?, elapsed_days = ?, scheduled_days = ? WHERE id = ? AND user_id = ?`,
      args: [ease_factor, interval_val, repetitions_val, next_review_val, last_review_val, interval_val, repetitions_val, next_review_val, last_review_val, difficulty, stability, state, reps, lapses, elapsed_days, scheduled_days, id, user.id],
    })

    const result = await turso.execute({
      sql: 'SELECT id, user_id, deck_id, front, back, high_yield, ease_factor, interval_days, times_reviewed, last_reviewed, next_review_date, interval, repetitions, last_review, next_review, difficulty, stability, state, reps, lapses, elapsed_days, scheduled_days, created_at FROM anki_cards WHERE id = ? AND user_id = ?',
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