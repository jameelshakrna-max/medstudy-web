import { json, getProfileVisibility, isProfileVisible } from '../lib/worker-utils.js'

export async function handleUserCard(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[parts.length - 2]

  const { results: profiles } = await env.DB.prepare(
    `SELECT user_id, display_name, avatar_url, username, active_title, bio, profile_visibility
     FROM user_profiles WHERE user_id = ?`
  ).bind(targetUserId).all()

  if (profiles.length === 0) {
    return json({ error: 'User not found' }, 404)
  }

  const profile = profiles[0]

  if (!isProfileVisible(profile.profile_visibility, user?.sub, targetUserId)) {
    return json({ hidden: true, display_name: 'Private Account', avatar_url: null })
  }

  const { results: stats } = await env.DB.prepare(
    `SELECT study_hours, followers_count, following_count, communities_count, reputation
     FROM user_stats WHERE user_id = ?`
  ).bind(targetUserId).all()

  const stat = stats[0] || {
    study_hours: 0, followers_count: 0, following_count: 0, communities_count: 0, reputation: 0,
  }

  let isFollowing = false
  if (user && user.sub !== targetUserId) {
    const { results: followCheck } = await env.DB.prepare(
      'SELECT 1 FROM user_followers WHERE follower_id = ? AND following_id = ?'
    ).bind(user.sub, targetUserId).all()
    isFollowing = followCheck.length > 0
  }

  return json({
    user_id: profile.user_id,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    username: profile.username,
    active_title: profile.active_title,
    bio: profile.bio,
    study_hours: Number(stat.study_hours) || 0,
    followers_count: Number(stat.followers_count) || 0,
    following_count: Number(stat.following_count) || 0,
    communities_count: Number(stat.communities_count) || 0,
    reputation: Number(stat.reputation) || 0,
    is_following: isFollowing,
  })
}
