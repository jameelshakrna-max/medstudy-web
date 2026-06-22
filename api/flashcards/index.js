import { getUser } from '../_auth.js'

export const runtime = 'nodejs'

function apiUrl() {
  return process.env.TURSO_DATABASE_URL.replace('libsql://', 'https://') + '/v2/pipeline'
}

function apiAuth() {
  return 'Bearer ' + process.env.TURSO_AUTH_TOKEN
}

function cast(v) {
  if (v === null || v === undefined) return { type: 'null' }
  return { type: 'text', value: String(v) }
}

async function exec(sql, args) {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: { Authorization: apiAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args: args.map(cast) } }] }),
  })
  if (!res.ok) throw new Error('DB ' + res.status + ': ' + (await res.text()).slice(0, 200))
  const data = await res.json()
  const r = data.results[0]
  if (r.type === 'error') throw new Error(r.error.message)
  const er = r.response.result
  const cols = er.cols || er.columns || []
  return {
    columns: cols.map(c => c.name || c),
    rows: (er.rows || []).map(row => {
      const o = {}
      cols.forEach((c, i) => { o[c.name || c] = row[i] ? row[i].value : null })
      return o
    }),
  }
}

async function batchExec(stmts) {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: { Authorization: apiAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: stmts.map(s => ({ type: 'execute', stmt: { sql: s.sql, args: s.args.map(cast) } })) }),
  })
  if (!res.ok) throw new Error('DB ' + res.status + ': ' + (await res.text()).slice(0, 200))
  const data = await res.json()
  data.results.forEach(r => { if (r.type === 'error') throw new Error(r.error.message) })
}

const CARD_COLS = 'id, user_id, deck_id, front, back, image_url, high_yield, difficulty, stability, state, interval, repetitions, last_review, next_review, created_at'

function mapCard(r) {
  return {
    id: r.id, user_id: r.user_id, deck_id: r.deck_id || null,
    front: r.front, back: r.back, image_url: r.image_url || null,
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

function resp(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'expires': '0',
    },
  })
}

export async function GET(req) {
  const user = await getUser(req)
  if (!user) return resp({ error: 'Unauthorized' }, 401)
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
    const result = await exec(sql, args)
    return resp(result.rows.map(mapCard))
  } catch (e) { return resp({ error: e.message }, 500) }
}

export async function POST(req) {
  const user = await getUser(req)
  if (!user) return resp({ error: 'Unauthorized' }, 401)
  try {
    const body = await req.json()
    let items
    if (Array.isArray(body.cards)) items = body.cards
    else if (Array.isArray(body)) items = body
    else items = [body]

    const now = new Date().toISOString()
    const ids = items.map(() => crypto.randomUUID())
    const stmts = items.map((c, i) => ({
      sql: `INSERT INTO anki_cards (id, user_id, deck_id, front, back, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [ids[i], user.id, c.deck_id, c.front, c.back, c.image_url || null, now],
    }))

    await batchExec(stmts)

    return resp({ success: true, count: items.length, ids }, 201)
  } catch (e) { return resp({ error: e.message }, 500) }
}
