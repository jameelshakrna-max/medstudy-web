import { createAuth } from './_auth.js'

function uuid() {
  return crypto.randomUUID()
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  })
}

function extractId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[parts.length - 1]
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (path.startsWith('/api/images/')) {
      return handleGetImage(request, env)
    }

    try {
      const verifyAuth = createAuth(env)
      const auth = request.headers.get('Authorization')
      if (!auth || !auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
      const token = auth.replace('Bearer ', '')
      const user = await verifyAuth(token)
      if (!user) return json({ error: 'Unauthorized' }, 401)

      if (path === '/api/flashcards' && request.method === 'GET') {
        return handleGetFlashcards(request, env, user)
      }
      if (path === '/api/flashcards' && request.method === 'POST') {
        return handleCreateFlashcards(request, env, user)
      }
      if (path === '/api/flashcards/due-count' && request.method === 'GET') {
        return handleDueCount(request, env, user)
      }
      if (path.match(/^\/api\/flashcards\/[^\/]+$/) && request.method === 'PUT') {
        return handleUpdateFlashcard(request, env, user)
      }
      if (path.match(/^\/api\/flashcards\/[^\/]+$/) && request.method === 'DELETE') {
        return handleDeleteFlashcard(request, env, user)
      }

      if (path === '/api/decks' && request.method === 'GET') {
        return handleGetDecks(request, env, user)
      }
      if (path === '/api/decks' && request.method === 'POST') {
        return handleCreateDeck(request, env, user)
      }
      if (path.match(/^\/api\/decks\/[^\/]+$/) && request.method === 'DELETE') {
        return handleDeleteDeck(request, env, user)
      }

      if (path === '/api/upload-image' && request.method === 'POST') {
        return handleUploadImage(request, env, user)
      }

      if (path === '/api/fsrs/get' && request.method === 'GET') {
        return handleGetFsrs(request, env, user)
      }
      if (path === '/api/fsrs/save' && request.method === 'POST') {
        return handleSaveFsrs(request, env, user)
      }

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      return json({ error: err.message }, 500)
    }
  },
}

async function handleGetFlashcards(request, env, user) {
  const url = new URL(request.url)
  const deckName = url.searchParams.get('deck_id')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 10000, 100000)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

  let sql, bindings
  if (deckName) {
    sql = `SELECT * FROM flashcards WHERE user_id = ? AND deck_name = ? ORDER BY CASE WHEN next_review IS NULL THEN 1 ELSE 0 END, next_review ASC, created_at DESC LIMIT ? OFFSET ?`
    bindings = [user.sub, deckName, limit, offset]
  } else {
    sql = `SELECT * FROM flashcards WHERE user_id = ? ORDER BY CASE WHEN next_review IS NULL THEN 1 ELSE 0 END, next_review ASC, created_at DESC LIMIT ? OFFSET ?`
    bindings = [user.sub, limit, offset]
  }

  const { results } = await env.DB.prepare(sql).bind(...bindings).all()
  const cards = results.map(mapCard)
  return json(cards)
}

async function handleCreateFlashcards(request, env, user) {
  const body = await request.json()
  const items = Array.isArray(body.cards) ? body.cards : Array.isArray(body) ? body : [body]
  const now = new Date().toISOString()
  const ids = items.map(() => uuid())

  const stmts = items.map((c, i) =>
    env.DB.prepare(
      `INSERT INTO flashcards (id, user_id, deck_name, front, back, image_url, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(ids[i], user.sub, c.deck_id || c.deck_name, c.front, c.back, c.image_url || null, c.tags || null, now)
  )

  await env.DB.batch(stmts)
  return json({ success: true, count: items.length, ids }, 201)
}

async function handleUpdateFlashcard(request, env, user) {
  const id = extractId(request.url)
  const body = await request.json()

  await env.DB.prepare(
    `UPDATE flashcards SET difficulty = ?, stability = ?, state = ?, interval = ?,
     next_review = ?, last_review = ?, image_url = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).bind(
    body.difficulty ?? 0, body.stability ?? 0, body.state ?? 0, body.interval ?? 0,
    body.next_review || null, body.last_review || null, body.image_url || null,
    id, user.sub
  ).run()

  const { results } = await env.DB.prepare(
    'SELECT * FROM flashcards WHERE id = ? AND user_id = ?'
  ).bind(id, user.sub).all()

  if (results.length) return json(mapCard(results[0]))
  return json({ error: 'Card not found' }, 404)
}

async function handleDeleteFlashcard(request, env, user) {
  const id = extractId(request.url)
  await env.DB.prepare(
    'DELETE FROM flashcards WHERE id = ? AND user_id = ?'
  ).bind(id, user.sub).run()
  return json({ success: true })
}

async function handleDueCount(request, env, user) {
  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM flashcards
     WHERE user_id = ? AND (next_review IS NULL OR next_review <= datetime('now'))`
  ).bind(user.sub).all()

  return json({ count: Number(results[0].count) })
}

async function handleGetDecks(request, env, user) {
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT deck_name FROM flashcards WHERE user_id = ? ORDER BY deck_name ASC'
  ).bind(user.sub).all()

  const decks = results.map(r => ({
    id: r.deck_name,
    name: r.deck_name,
  }))
  return json(decks)
}

async function handleCreateDeck(request, env, user) {
  const body = await request.json()
  if (!body.name || !body.name.trim()) {
    return json({ error: 'Name required' }, 400)
  }
  const name = body.name.trim()
  return json({ id: name, name: name }, 201)
}

async function handleDeleteDeck(request, env, user) {
  const name = decodeURIComponent(extractId(request.url))
  await env.DB.prepare(
    'DELETE FROM flashcards WHERE deck_name = ? AND user_id = ?'
  ).bind(name, user.sub).run()
  return json({ success: true })
}

async function handleUploadImage(request, env, user) {
  const formData = await request.formData()
  const file = formData.get('image')
  if (!file) return json({ error: 'No image file' }, 400)

  const ext = file.name?.split('.').pop() || 'png'
  const filename = `${uuid()}.${ext}`
  await env.IMAGES.put(filename, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'image/png' },
  })

  const base = new URL(request.url).origin
  const url = `${base}/api/images/${filename}`
  return json({ url })
}

async function handleGetImage(request, env) {
  const filename = extractId(request.url)
  const object = await env.IMAGES.get(filename)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = { 'cache-control': 'public, max-age=31536000' }
  return new Response(object.body, { headers })
}

async function handleGetFsrs(request, env, user) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM fsrs_parameters WHERE user_id = ?'
  ).bind(user.sub).all()

  if (results.length) {
    const row = results[0]
    return json({ id: row.id, user_id: row.user_id, params: JSON.parse(row.params) })
  }
  return json(null)
}

async function handleSaveFsrs(request, env, user) {
  const body = await request.json()
  const params = JSON.stringify(body)

  await env.DB.prepare(
    `INSERT INTO fsrs_parameters (user_id, params)
     VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET params = ?, updated_at = datetime('now')`
  ).bind(user.sub, params, params).run()

  return json({ success: true })
}

function mapCard(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    deck_id: r.deck_name,
    front: r.front,
    back: r.back,
    image_url: r.image_url || null,
    high_yield: false,
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
