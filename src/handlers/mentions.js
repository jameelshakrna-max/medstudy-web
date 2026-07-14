import { json, uuid, safeString, isProfileVisible } from '../lib/worker-utils.js'

const MENTION_REGEX = /@([a-z0-9][a-z0-9-]{2,19})/g

export async function parseMentions(content, env) {
  if (!content || typeof content !== 'string') return { mentions: [], sanitizedContent: content }

  const matches = [...new Set([...content.matchAll(MENTION_REGEX)].map(m => m[1]))]
  if (matches.length === 0) return { mentions: [], sanitizedContent: content }

  const { results: profiles } = await env.DB.prepare(
    `SELECT user_id, username FROM user_profiles WHERE username IN (${matches.map(() => '?').join(',')})`
  ).bind(...matches).all()

  const usernameMap = {}
  for (const p of profiles) {
    usernameMap[p.username] = p.user_id
  }

  const mentions = []
  const now = new Date().toISOString()

  for (const username of matches) {
    const targetUserId = usernameMap[username]
    if (!targetUserId || targetUserId === null) continue
    if (!mentions.some(m => m.user_id === targetUserId)) {
      mentions.push({ user_id: targetUserId, username })
    }

    const notifId = uuid()
    const mentionId = uuid()

    await env.DB.prepare(
      'INSERT INTO notifications (id, user_id, type, title, body, data, category, action_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      notifId,
      targetUserId,
      'mention',
      'You were mentioned',
      `${username} mentioned you in a post`,
      JSON.stringify({ username }),
      'social',
      null
    ).run()

    await env.DB.prepare(
      'INSERT INTO user_mentions (id, source_user_id, target_user_id, entity_type, entity_id, read) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(mentionId, null, targetUserId, 'post', null).run()
  }

  return { mentions, sanitizedContent: content }
}

export async function handleMentionSearch(request, env, user) {
  const url = new URL(request.url)
  const q = safeString(url.searchParams.get('q'), 50).toLowerCase()
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 8), 20)

  if (!q || q.length < 1) {
    return json([])
  }

  const pattern = `%${q}%`

  const { results } = await env.DB.prepare(
    `SELECT user_id, username, display_name, avatar_url, profile_visibility
     FROM user_profiles
     WHERE username LIKE ? OR display_name LIKE ?
     LIMIT ?`
  ).bind(pattern, pattern, limit).all()

  return json(results
    .filter(r => isProfileVisible(r.profile_visibility, user?.sub, r.user_id))
    .map(r => ({
      user_id: r.user_id,
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
    })))
}
