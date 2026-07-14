import { json, uuid } from '../lib/worker-utils.js'

const ACHIEVEMENTS = [
  { type: 'first_study_session', title: 'First Steps', description: 'Completed your first study session', icon: '🎯', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as c FROM study_sessions_log WHERE user_id = ?').bind(userId).all()
    return results[0]?.c > 0
  }},
  { type: 'study_10_hours', title: 'Dedicated Learner', description: 'Studied for 10 total hours', icon: '📚', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COALESCE(SUM(total_study_hours), 0) as h FROM community_members WHERE user_id = ?').bind(userId).all()
    return results[0]?.h >= 10
  }},
  { type: 'study_50_hours', title: 'Study Marathon', description: 'Studied for 50 total hours', icon: '🏃', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COALESCE(SUM(total_study_hours), 0) as h FROM community_members WHERE user_id = ?').bind(userId).all()
    return results[0]?.h >= 50
  }},
  { type: 'study_100_hours', title: 'Century Scholar', description: 'Studied for 100 total hours', icon: '💎', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COALESCE(SUM(total_study_hours), 0) as h FROM community_members WHERE user_id = ?').bind(userId).all()
    return results[0]?.h >= 100
  }},
  { type: 'streak_7', title: 'Week Warrior', description: 'Maintained a 7-day study streak', icon: '🔥', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT longest_streak FROM user_stats WHERE user_id = ?').bind(userId).all()
    return (results[0]?.longest_streak || 0) >= 7
  }},
  { type: 'streak_30', title: 'Monthly Master', description: 'Maintained a 30-day study streak', icon: '🏆', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT longest_streak FROM user_stats WHERE user_id = ?').bind(userId).all()
    return (results[0]?.longest_streak || 0) >= 30
  }},
  { type: 'streak_100', title: 'Unstoppable', description: 'Maintained a 100-day study streak', icon: '⚡', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT longest_streak FROM user_stats WHERE user_id = ?').bind(userId).all()
    return (results[0]?.longest_streak || 0) >= 100
  }},
  { type: 'first_community', title: 'Joiner', description: 'Joined your first community', icon: '🤝', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as c FROM community_members WHERE user_id = ?').bind(userId).all()
    return results[0]?.c > 0
  }},
  { type: 'five_communities', title: 'Social Butterfly', description: 'Joined 5 communities', icon: '🦋', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as c FROM community_members WHERE user_id = ?').bind(userId).all()
    return results[0]?.c >= 5
  }},
  { type: 'first_competition', title: 'Competitor', description: 'Joined your first competition', icon: '⚔️', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as c FROM competition_participants WHERE user_id = ?').bind(userId).all()
    return results[0]?.c > 0
  }},
  { type: 'first_follow', title: 'Connected', description: 'Followed your first user', icon: '👥', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as c FROM user_followers WHERE follower_id = ?').bind(userId).all()
    return results[0]?.c > 0
  }},
  { type: 'ten_followers', title: 'Popular', description: 'Reached 10 followers', icon: '🌟', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as c FROM user_followers WHERE following_id = ?').bind(userId).all()
    return results[0]?.c >= 10
  }},
  { type: 'first_dm', title: 'Chatterbox', description: 'Sent your first direct message', icon: '💬', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as c FROM dm_messages WHERE sender_id = ?').bind(userId).all()
    return results[0]?.c > 0
  }},
  { type: 'profile_complete', title: 'Identity', description: 'Completed your profile to 100%', icon: '✅', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT profile_completion FROM user_profiles WHERE user_id = ?').bind(userId).all()
    return (results[0]?.profile_completion || 0) >= 100
  }},
]

export async function checkAndAwardAchievements(env, userId) {
  const { results: existing } = await env.DB.prepare(
    'SELECT achievement_type FROM user_achievements WHERE user_id = ?'
  ).bind(userId).all()
  const earned = new Set(existing.map(r => r.achievement_type))

  const newlyEarned = []
  for (const ach of ACHIEVEMENTS) {
    if (earned.has(ach.type)) continue
    try {
      const isMet = await ach.check(env, userId)
      if (isMet) {
        const id = uuid()
        await env.DB.prepare(
          'INSERT INTO user_achievements (id, user_id, achievement_type, title, description, icon) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(id, userId, ach.type, ach.title, ach.description, ach.icon).run()
        newlyEarned.push({ ...ach, id })
      }
    } catch (err) {
      console.error(`Achievement check error for ${ach.type}:`, err)
    }
  }
  return newlyEarned
}

export async function handleGetUserAchievements(request, env) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const userId = parts[4]
  if (!userId) return json({ error: 'userId required' }, 400)

  const { results } = await env.DB.prepare(
    'SELECT * FROM user_achievements WHERE user_id = ? ORDER BY earned_at DESC'
  ).bind(userId).all()

  return json(results.map(r => ({
    id: r.id,
    achievement_type: r.achievement_type,
    title: r.title,
    description: r.description,
    icon: r.icon,
    earned_at: r.earned_at,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  })))
}

export async function handleCheckAchievements(request, env, user) {
  const newlyEarned = await checkAndAwardAchievements(env, user.sub)
  return json({ newly_earned: newlyEarned, count: newlyEarned.length })
}
