import { json, uuid, safeString } from '../lib/worker-utils.js'

const MAX_PINS = 6

export async function handleGetPins(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[parts.length - 2]

  const { results } = await env.DB.prepare(
    'SELECT * FROM user_pinned_resources WHERE user_id = ? ORDER BY position ASC'
  ).bind(targetUserId).all()

  return json(results.map(r => ({
    id: r.id,
    user_id: r.user_id,
    resource_type: r.resource_type,
    resource_id: r.resource_id,
    resource_name: r.resource_name,
    resource_meta: JSON.parse(r.resource_meta || '{}'),
    position: r.position,
    created_at: r.created_at,
  })))
}

export async function handlePinResource(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[parts.length - 2]

  if (user.sub !== targetUserId) {
    return json({ error: 'Can only pin to your own profile' }, 403)
  }

  const body = await request.json()
  const { resource_type, resource_id, resource_name, resource_meta } = body

  if (!resource_type || !resource_id) {
    return json({ error: 'resource_type and resource_id are required' }, 400)
  }

  const { results: existing } = await env.DB.prepare(
    'SELECT id FROM user_pinned_resources WHERE user_id = ? ORDER BY position DESC LIMIT 1'
  ).bind(targetUserId).all()

  if (existing.length >= MAX_PINS) {
    return json({ error: `Maximum ${MAX_PINS} pinned resources allowed` }, 400)
  }

  const { results: countResult } = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM user_pinned_resources WHERE user_id = ?'
  ).bind(targetUserId).all()

  const nextPosition = countResult[0]?.cnt || 0
  const pinId = uuid()
  const now = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO user_pinned_resources (id, user_id, resource_type, resource_id, resource_name, resource_meta, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    pinId,
    targetUserId,
    safeString(resource_type, 50),
    safeString(resource_id, 200),
    safeString(resource_name, 200),
    JSON.stringify(resource_meta || {}),
    nextPosition,
    now
  ).run()

  return json({
    id: pinId,
    user_id: targetUserId,
    resource_type,
    resource_id,
    resource_name: resource_name || '',
    resource_meta: resource_meta || {},
    position: nextPosition,
    created_at: now,
  })
}

export async function handleUnpinResource(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[parts.length - 3]
  const pinId = parts[parts.length - 1]

  if (user.sub !== targetUserId) {
    return json({ error: 'Can only unpin from your own profile' }, 403)
  }

  const { results } = await env.DB.prepare(
    'DELETE FROM user_pinned_resources WHERE id = ? AND user_id = ?'
  ).bind(pinId, targetUserId).run()

  return json({ success: true })
}
