import { json, uuid } from '../lib/worker-utils.js'

export async function handleSearchUsers(request, env, user) {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1)
  const limit = 20
  const offset = (page - 1) * limit

  if (!q || q.length < 2) return json({ users: [], page })

  const { results } = await env.DB.prepare(
    `SELECT user_id, user_name, display_name, avatar_url, bio, profile_visibility
     FROM user_profiles
     WHERE user_name LIKE ? AND user_id != ? AND profile_visibility != 'private'
     ORDER BY user_name ASC
     LIMIT ? OFFSET ?`
  ).bind(`%${q}%`, user.sub, limit, offset).all()

  return json({ users: results, page })
}

export async function handleSuggestedConnections(request, env, user) {
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 10, 20)

  // Users who share communities with me but I don't follow
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT up.user_id, up.user_name, up.display_name, up.avatar_url, up.bio,
            COUNT(DISTINCT cm1.community_id) as shared_communities
     FROM community_members cm1
     JOIN community_members cm2 ON cm1.community_id = cm2.community_id AND cm2.user_id = ?
     JOIN user_profiles up ON up.user_id = cm1.user_id
     WHERE cm1.user_id != ? AND up.profile_visibility != 'private'
     GROUP BY cm1.user_id
     ORDER BY shared_communities DESC
     LIMIT ?`
  ).bind(user.sub, user.sub, limit).all()

  return json({ users: results })
}
