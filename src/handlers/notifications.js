import { json } from '../lib/worker-utils.js'

export async function handleListNotifications(request, env, user) {
  const results = await env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(user.sub).all()
  return json(results.results || [])
}

export async function handleCreateNotification(request, env, user) {
  const body = await request.json()
  const { user_id, type, title, body: notifBody, data } = body
  if (!user_id || !type || !title) return json({ error: 'user_id, type, title required' }, 400)
  const id = crypto.randomUUID()
  const dataStr = data ? JSON.stringify(data) : null
  await env.DB.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user_id, type, title, notifBody || '', dataStr).run()
  return json({ id })
}

export async function handleMarkNotificationRead(request, env, user) {
  const match = request.url.match(/\/notifications\/([^\/]+)\/read/)
  if (!match) return json({ error: 'Invalid notification URL' }, 400)
  const id = match[1]
  await env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .bind(id, user.sub).run()
  return json({ success: true })
}

export async function handleMarkAllRead(request, env, user) {
  await env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0')
    .bind(user.sub).run()
  return json({ success: true })
}

export async function handleCleanupNotifications(request, env, user) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { results } = await env.DB.prepare(
    'DELETE FROM notifications WHERE user_id = ? AND read = 1 AND created_at < ?'
  ).bind(user.sub, cutoff).run()
  return json({ deleted: results?.meta?.changes || 0 })
}
