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
  // Research achievements
  { type: 'research_first_post', title: 'First Research Post', description: 'Shared your first research post', icon: '🟢', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT COUNT(*) as c FROM research_posts WHERE user_id = ?').bind(userId).all()
    return results[0]?.c > 0
  }},
  { type: 'research_survey_master', title: 'Survey Master', description: 'Shared 10 questionnaires', icon: '📊', check: async (env, userId) => {
    const { results } = await env.DB.prepare("SELECT COUNT(*) as c FROM research_posts WHERE user_id = ? AND category = 'questionnaire'").bind(userId).all()
    return results[0]?.c >= 10
  }},
  { type: 'research_literature_expert', title: 'Literature Expert', description: 'Shared 10 papers or literature', icon: '📚', check: async (env, userId) => {
    const { results } = await env.DB.prepare("SELECT COUNT(*) as c FROM research_posts WHERE user_id = ? AND category IN ('paper', 'literature')").bind(userId).all()
    return results[0]?.c >= 10
  }},
  { type: 'research_statistician', title: 'Statistician', description: 'Has 3+ statistics-related skills', icon: '📈', check: async (env, userId) => {
    const { results } = await env.DB.prepare("SELECT COUNT(*) as c FROM user_research_skills WHERE user_id = ? AND skill IN ('SPSS', 'R', 'Python', 'Biostatistics', 'Data Analysis', 'Meta-analysis', 'Data Visualization')").bind(userId).all()
    return results[0]?.c >= 3
  }},
  { type: 'research_clinical', title: 'Clinical Researcher', description: 'Has clinical trials skill', icon: '🧪', check: async (env, userId) => {
    const { results } = await env.DB.prepare("SELECT COUNT(*) as c FROM user_research_skills WHERE user_id = ? AND skill = 'Clinical Trials'").bind(userId).all()
    return results[0]?.c > 0
  }},
  { type: 'research_collaborator', title: 'Collaboration Expert', description: 'Joined 5 collaborations', icon: '🤝', check: async (env, userId) => {
    const { results } = await env.DB.prepare("SELECT COUNT(*) as c FROM research_helped_marks WHERE helper_id = ? AND help_type = 'collaborated'").bind(userId).all()
    return results[0]?.c >= 5
  }},
  { type: 'research_top_helper', title: 'Top Research Helper', description: 'Research score reached 500', icon: '⭐', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT score FROM user_research_stats WHERE user_id = ?').bind(userId).all()
    return (results[0]?.score || 0) >= 500
  }},
  { type: 'research_100_surveys', title: '100 Surveys Completed', description: 'Completed 100 surveys', icon: '🔥', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT surveys_completed FROM user_research_stats WHERE user_id = ?').bind(userId).all()
    return (results[0]?.surveys_completed || 0) >= 100
  }},
  { type: 'research_hospital_collab', title: 'Hospital Collaborator', description: 'Data collection skill with collaboration', icon: '🏥', check: async (env, userId) => {
    const { results: skills } = await env.DB.prepare("SELECT COUNT(*) as c FROM user_research_skills WHERE user_id = ? AND skill = 'Data Collection'").bind(userId).all()
    const { results: collabs } = await env.DB.prepare("SELECT COUNT(*) as c FROM research_helped_marks WHERE helper_id = ? AND help_type = 'collaborated'").bind(userId).all()
    return (skills[0]?.c || 0) > 0 && (collabs[0]?.c || 0) > 0
  }},
  { type: 'research_community_fav', title: 'Community Favorite', description: 'Received 50 helpful marks', icon: '🏅', check: async (env, userId) => {
    const { results } = await env.DB.prepare('SELECT helpful_marks FROM user_research_stats WHERE user_id = ?').bind(userId).all()
    return (results[0]?.helpful_marks || 0) >= 50
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
