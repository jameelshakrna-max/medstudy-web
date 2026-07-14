import { json, safeString } from '../lib/worker-utils.js'

const VALID_STATUSES = ['online', 'studying', 'reviewing', 'in_voice', 'away', 'offline']
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000

function applyLazyOffline(presence) {
  if (!presence || presence.status === 'offline') return presence
  const lastActive = new Date(presence.last_active_at).getTime()
  if (Date.now() - lastActive > OFFLINE_THRESHOLD_MS) {
    return { ...presence, status: 'offline' }
  }
  return presence
}

export async function handleUpdatePresence(request, env, user) {
  const body = await request.json()
  const { status, status_text } = body

  if (!VALID_STATUSES.includes(status)) {
    return json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
  }

  const now = new Date().toISOString()
  const sanitizedText = safeString(status_text, 100)

  await env.DB.prepare(
    `INSERT INTO user_presence (user_id, status, status_text, last_active_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       status = excluded.status,
       status_text = excluded.status_text,
       last_active_at = excluded.last_active_at,
       updated_at = excluded.updated_at`
  ).bind(user.sub, status, sanitizedText, now, now).run()

  return json({ success: true })
}

export async function handleGetBulkPresence(request, env, user) {
  const body = await request.json()
  const { user_ids } = body

  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return json({ presences: {} })
  }

  const ids = user_ids.slice(0, 100)

  const { results } = await env.DB.prepare(
    `SELECT user_id, status, status_text, last_active_at
     FROM user_presence WHERE user_id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all()

  const presences = {}
  for (const row of results) {
    const applied = applyLazyOffline(row)
    presences[row.user_id] = {
      status: applied.status,
      status_text: applied.status_text,
      last_active_at: applied.last_active_at,
    }
  }

  for (const id of ids) {
    if (!presences[id]) {
      presences[id] = { status: 'offline', status_text: '', last_active_at: null }
    }
  }

  return json({ presences })
}

export async function handleGetPresence(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[parts.length - 1]

  const { results } = await env.DB.prepare(
    'SELECT status, status_text, last_active_at FROM user_presence WHERE user_id = ?'
  ).bind(targetUserId).all()

  if (results.length === 0) {
    return json({ status: 'offline', status_text: '', last_active_at: null })
  }

  const presence = applyLazyOffline(results[0])
  return json({
    status: presence.status,
    status_text: presence.status_text,
    last_active_at: presence.last_active_at,
  })
}
