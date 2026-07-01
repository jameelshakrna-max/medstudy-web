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
      const token = (auth?.startsWith('Bearer ') ? auth.replace('Bearer ', '') : null) || url.searchParams.get('token')
      if (!token) return json({ error: 'Unauthorized' }, 401)
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

      if (path === '/api/categories' && request.method === 'GET') {
        return handleGetCategories(request, env)
      }
      if (path === '/api/categories' && request.method === 'POST') {
        return handleCreateCategory(request, env, user)
      }

      if (path === '/api/resources' && request.method === 'GET') {
        return handleGetResources(request, env)
      }
      if (path === '/api/resources' && request.method === 'POST') {
        return handleCreateResource(request, env, user)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'GET') {
        return handleGetResource(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'PUT') {
        return handleUpdateResource(request, env, user)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'DELETE') {
        return handleDeleteResource(request, env, user)
      }

      if (path.match(/^\/api\/resources\/[^\/]+\/file$/) && request.method === 'GET') {
        return handleGetResourceFile(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/image$/) && request.method === 'GET') {
        return handleGetResourceImage(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/download$/) && request.method === 'GET') {
        return handleDownloadResourceFile(request, env)
      }

      if (path.match(/^\/api\/resources\/[^\/]+\/comments$/) && request.method === 'GET') {
        return handleGetComments(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/comments$/) && request.method === 'POST') {
        return handleCreateComment(request, env, user)
      }

      if (path.match(/^\/api\/comments\/[^\/]+$/) && request.method === 'DELETE') {
        return handleDeleteComment(request, env, user)
      }
      if (path.match(/^\/api\/comments\/[^\/]+\/vote$/) && request.method === 'POST') {
        return handleVoteComment(request, env, user)
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

async function handleGetCategories(request, env) {
  const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY CASE WHEN name = \'Other\' THEN 1 ELSE 0 END, name ASC').all()
  return json(results)
}

async function handleCreateCategory(request, env, user) {
  const body = await request.json()
  if (!body.name || !body.name.trim()) return json({ error: 'Name required' }, 400)
  const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  try {
    await env.DB.prepare('INSERT INTO categories (id, name, user_id) VALUES (?, ?, ?)').bind(id, body.name.trim(), user.sub).run()
    return json({ id, name: body.name.trim() }, 201)
  } catch (e) {
    if (e.message.includes('UNIQUE')) return json({ error: 'Category already exists' }, 409)
    throw e
  }
}

async function handleGetResources(request, env) {
  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const type = url.searchParams.get('type')
  const search = url.searchParams.get('search')
  const sort = url.searchParams.get('sort') || 'created_at'

  let sql = 'SELECT * FROM resources'
  const binds = []
  const conditions = []

  if (category) {
    conditions.push('category = ?')
    binds.push(category)
  }
  if (type) {
    conditions.push('type = ?')
    binds.push(type)
  }
  if (search) {
    conditions.push('title LIKE ?')
    binds.push(`%${search}%`)
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')

  const sortMap = { created_at: 'created_at DESC', oldest: 'created_at ASC', name: 'title ASC', largest: 'file_size DESC', smallest: 'file_size ASC' }
  sql += ' ORDER BY ' + (sortMap[sort] || 'created_at DESC')
  sql += ' LIMIT 100'

  const { results } = await env.DB.prepare(sql).bind(...binds).all()
  return json(results.map(mapResource))
}

async function handleGetResource(request, env) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length) return json({ error: 'Not found' }, 404)
  return json(mapResource(results[0]))
}

function extractResourceIdFromPath(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[3]
}

async function handleCreateResource(request, env, user) {
  const formData = await request.formData()
  const title = formData.get('title')
  const category = formData.get('category')
  const description = formData.get('description') || ''
  const tags = formData.get('tags') || '[]'
  const userName = formData.get('user_name') || user.email?.split('@')[0] || 'User'
  const resourceType = formData.get('type') || ''
  const file = formData.get('file')
  const image = formData.get('image')

  if (!title || !title.trim()) return json({ error: 'Title required' }, 400)
  if (!category) return json({ error: 'Category required' }, 400)
  if (!file) return json({ error: 'File required' }, 400)

  const ext = file.name?.split('.').pop() || 'bin'
  const fileKey = `resources/${uuid()}.${ext}`
  await env.IMAGES.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' }
  })

  let imageKey = null
  if (image && image.size > 0) {
    const imgExt = image.name?.split('.').pop() || 'png'
    imageKey = `resources/${uuid()}.${imgExt}`
    await env.IMAGES.put(imageKey, await image.arrayBuffer(), {
      httpMetadata: { contentType: image.type || 'image/png' }
    })
  }

  const id = uuid()
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO resources (id, title, category, description, tags, type, file_name, file_key, file_size, mime_type, image_key, user_id, user_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, title.trim(), category, description, tags, resourceType, file.name, fileKey, file.size, file.type || '', imageKey, user.sub, userName, now).run()

  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  return json(mapResource(results[0]), 201)
}

async function handleUpdateResource(request, env, user) {
  const id = extractId(request.url)
  const body = await request.json()
  const resource = await env.DB.prepare('SELECT * FROM resources WHERE id = ? AND user_id = ?').bind(id, user.sub).all()
  if (!resource.results.length) return json({ error: 'Not found or not yours' }, 404)

  await env.DB.prepare(
    `UPDATE resources SET title = COALESCE(?, title), description = COALESCE(?, description), tags = COALESCE(?, tags), type = COALESCE(?, type), updated_at = datetime('now') WHERE id = ?`
  ).bind(body.title || null, body.description ?? null, body.tags || null, body.type || null, id).run()

  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  return json(mapResource(results[0]))
}

async function handleDeleteResource(request, env, user) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ? AND user_id = ?').bind(id, user.sub).all()
  if (!results.length) return json({ error: 'Not found or not yours' }, 404)

  await env.IMAGES.delete(results[0].file_key)
  if (results[0].image_key) await env.IMAGES.delete(results[0].image_key)
  await env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM resource_comments WHERE resource_id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM comment_votes WHERE comment_id IN (SELECT id FROM resource_comments WHERE resource_id = ?)').bind(id).run()
  return json({ success: true })
}

async function handleGetResourceFile(request, env) {
  const id = extractResourceIdFromPath(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length) return new Response('Not found', { status: 404 })

  const object = await env.IMAGES.get(results[0].file_key)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = { 'content-type': results[0].mime_type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000' }
  return new Response(object.body, { headers })
}

async function handleGetResourceImage(request, env) {
  const id = extractResourceIdFromPath(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length || !results[0].image_key) return new Response('Not found', { status: 404 })

  const object = await env.IMAGES.get(results[0].image_key)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = { 'cache-control': 'public, max-age=31536000' }
  return new Response(object.body, { headers })
}

async function handleDownloadResourceFile(request, env) {
  const id = extractResourceIdFromPath(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length) return new Response('Not found', { status: 404 })

  const object = await env.IMAGES.get(results[0].file_key)
  if (!object) return new Response('Not found', { status: 404 })

  const fileName = encodeURIComponent(results[0].file_name)
  const headers = {
    'content-type': results[0].mime_type || 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${fileName}`,
    'cache-control': 'public, max-age=31536000'
  }
  return new Response(object.body, { headers })
}

async function handleGetComments(request, env) {
  const id = extractResourceIdFromPath(request.url)
  const url = new URL(request.url)
  const userId = url.searchParams.get('user_id')

  const { results } = await env.DB.prepare(
    `SELECT c.*,
       COALESCE((SELECT SUM(vote) FROM comment_votes WHERE comment_id = c.id), 0) as net_votes,
       COALESCE((SELECT SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) FROM comment_votes WHERE comment_id = c.id), 0) as upvotes,
       COALESCE((SELECT SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) FROM comment_votes WHERE comment_id = c.id), 0) as downvotes
     FROM resource_comments c WHERE c.resource_id = ? ORDER BY net_votes DESC, c.created_at ASC`
  ).bind(id).all()

  const comments = []
  for (const r of results) {
    let userVote = 0
    if (userId) {
      const voteRes = await env.DB.prepare('SELECT vote FROM comment_votes WHERE comment_id = ? AND user_id = ?').bind(r.id, userId).all()
      if (voteRes.results.length) userVote = voteRes.results[0].vote
    }
    comments.push({
      id: r.id, resource_id: r.resource_id, parent_id: r.parent_id,
      user_id: r.user_id, user_name: r.user_name,
      content: r.removed ? 'This comment was automatically removed for receiving too many downvotes.' : r.content,
      removed: !!r.removed,
      upvotes: Number(r.upvotes) || 0, downvotes: Number(r.downvotes) || 0,
      net_votes: Number(r.net_votes) || 0,
      user_vote: userVote,
      created_at: r.created_at
    })
  }
  return json(comments)
}

async function handleCreateComment(request, env, user) {
  const resourceId = extractResourceIdFromPath(request.url)
  const body = await request.json()
  if (!body.content || !body.content.trim()) return json({ error: 'Content required' }, 400)

  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(resourceId).all()
  if (!results.length) return json({ error: 'Resource not found' }, 404)

  const id = uuid()
  await env.DB.prepare(
    'INSERT INTO resource_comments (id, resource_id, parent_id, user_id, user_name, content) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, resourceId, body.parent_id || null, user.sub, body.user_name || user.email?.split('@')[0] || 'User', body.content.trim()).run()

  return json({ id, success: true }, 201)
}

async function handleDeleteComment(request, env, user) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resource_comments WHERE id = ? AND user_id = ?').bind(id, user.sub).all()
  if (!results.length) return json({ error: 'Not found or not yours' }, 404)

  await env.DB.prepare('DELETE FROM resource_comments WHERE id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM comment_votes WHERE comment_id = ?').bind(id).run()
  return json({ success: true })
}

async function handleVoteComment(request, env, user) {
  const parts = new URL(request.url).pathname.split('/')
  const commentId = parts[parts.length - 2]
  const body = await request.json()
  const vote = body.vote

  if (![1, -1, 0].includes(vote)) return json({ error: 'Invalid vote' }, 400)

  const { results } = await env.DB.prepare('SELECT * FROM resource_comments WHERE id = ?').bind(commentId).all()
  if (!results.length) return json({ error: 'Comment not found' }, 404)

  if (vote === 0) {
    await env.DB.prepare('DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?').bind(commentId, user.sub).run()
  } else {
    await env.DB.prepare(
      'INSERT INTO comment_votes (id, comment_id, user_id, vote) VALUES (?, ?, ?, ?) ON CONFLICT(comment_id, user_id) DO UPDATE SET vote = ?'
    ).bind(uuid(), commentId, user.sub, vote, vote).run()
  }

  const { results: downCount } = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM comment_votes WHERE comment_id = ? AND vote = -1'
  ).bind(commentId).all()

  if (Number(downCount[0].cnt) > 10 && !results[0].removed) {
    await env.DB.prepare('UPDATE resource_comments SET removed = 1 WHERE id = ?').bind(commentId).run()
  }

  return json({ success: true })
}

function mapResource(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    description: r.description || '',
    tags: JSON.parse(r.tags || '[]'),
    type: r.type || '',
    file_name: r.file_name,
    file_key: r.file_key,
    file_size: Number(r.file_size) || 0,
    mime_type: r.mime_type || '',
    image_key: r.image_key || null,
    user_id: r.user_id,
    user_name: r.user_name || '',
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
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
