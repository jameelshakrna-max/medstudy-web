import { json } from '../lib/worker-utils.js'

export async function handleListNotifications(request, env, user) {
  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const unread = url.searchParams.get('unread') === 'true'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  let where = 'WHERE user_id = ?'
  const params = [user.sub]
  if (category) { where += ' AND category = ?'; params.push(category) }
  if (unread) { where += ' AND read = 0' }

  const query = `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)
  const { results } = await env.DB.prepare(query).bind(...params).all()

  const { results: unreadAll } = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
  ).bind(user.sub).all()

  const { results: unreadByCategory } = await env.DB.prepare(
    'SELECT category, COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0 GROUP BY category'
  ).bind(user.sub).all()

  const unreadCounts = { all: unreadAll[0]?.count || 0 }
  for (const row of unreadByCategory) {
    unreadCounts[row.category] = row.count
  }

  return json({ notifications: results || [], unreadCounts })
}

export async function handleGetUnreadCounts(request, env, user) {
  const { results: unreadAll } = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
  ).bind(user.sub).all()

  const { results: unreadByCategory } = await env.DB.prepare(
    'SELECT category, COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0 GROUP BY category'
  ).bind(user.sub).all()

  const counts = { all: unreadAll[0]?.count || 0 }
  for (const row of unreadByCategory) {
    counts[row.category] = row.count
  }
  return json(counts)
}

export async function handleCreateNotification(request, env, user) {
  const body = await request.json()
  const { user_id, type, title, body: notifBody, data, priority, category, action_url, action_label, group_key } = body
  if (!user_id || !type || !title) return json({ error: 'user_id, type, title required' }, 400)
  const id = crypto.randomUUID()
  const dataStr = data ? JSON.stringify(data) : null
  await env.DB.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, data, priority, category, action_url, action_label, group_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, user_id, type, title, notifBody || '', dataStr, priority || 'info', category || 'system', action_url || '/dashboard', action_label || null, group_key || null).run()
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
