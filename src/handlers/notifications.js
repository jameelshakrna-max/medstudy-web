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

const DEFAULT_PREFS = {
  mentions: 1, dms: 1, study_reminders: 1,
  community_messages: 1, community_mentions: 1, follows: 1,
  study_streaks: 0, flashcard_milestones: 0, uworld_milestones: 0,
  goal_completed: 0, announcements: 1, global: 1,
}

export async function handleGetNotificationPreferences(request, env, user) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM notification_preferences WHERE user_id = ?'
  ).bind(user.sub).all()
  if (!results.length) return json(DEFAULT_PREFS)
  const row = results[0]
  return json({
    mentions: row.mentions, dms: row.dms, study_reminders: row.study_reminders,
    community_messages: row.community_messages, community_mentions: row.community_mentions,
    follows: row.follows, study_streaks: row.study_streaks, flashcard_milestones: row.flashcard_milestones,
    uworld_milestones: row.uworld_milestones, goal_completed: row.goal_completed,
    announcements: row.announcements, global: row.global,
  })
}

export async function handleUpdateNotificationPreferences(request, env, user) {
  const body = await request.json()
  const fields = ['mentions','dms','study_reminders','community_messages','community_mentions','follows','study_streaks','flashcard_milestones','uworld_milestones','goal_completed','announcements','global']
  const updates = []
  const params = []
  for (const f of fields) {
    if (f in body) {
      updates.push(`${f} = ?`)
      params.push(body[f] ? 1 : 0)
    }
  }
  if (!updates.length) return json({ error: 'No fields to update' }, 400)
  params.push(user.sub)
  await env.DB.prepare(
    `INSERT INTO notification_preferences (user_id, ${fields.join(',')}) VALUES (?, ${fields.map(() => 0).join(',')})
     ON CONFLICT(user_id) DO UPDATE SET ${updates.join(', ')}`
  ).bind(...params).run()
  return json({ success: true })
}

// Helper: create a notification only if the user has that category enabled
// TEMP DEBUG: structured logging to diagnose follow notification failure — remove after root cause found
export async function createNotificationIfAllowed(env, userId, { type, title, body, category, priority, data, action_url, action_label, group_key }) {
  const log = (msg, extra) => console.log('[notifications]', msg, { userId, type, category, ...extra })
  try {
    if (!userId || !type || !title) {
      log('EARLY RETURN: missing fields', { userId, type, title })
      return
    }
    log('START', { title, body: body?.slice(0, 60) })

    const { results } = await env.DB.prepare(
      'SELECT * FROM notification_preferences WHERE user_id = ?'
    ).bind(userId).all()
    const prefs = results[0]

    if (!prefs) {
      log('NO PREFS ROW — proceeding (all categories enabled by default)')
    } else {
      const prefKey = category === 'study_streak' ? 'study_streaks'
        : category === 'flashcard_milestone' ? 'flashcard_milestones'
        : category === 'uworld_milestone' ? 'uworld_milestones'
        : category === 'goal' ? 'goal_completed'
        : category === 'announcement' ? 'announcements'
        : category
      log('PREFS ROW FOUND', { prefKey, value: prefs[prefKey], follows: prefs.follows })
      if (prefs[prefKey] === 0) {
        log('EARLY RETURN: preference disabled', { prefKey, value: prefs[prefKey] })
        return
      }
    }

    const id = crypto.randomUUID()
    log('INSERTING', { id, category, action_url })
    const result = await env.DB.prepare(
      'INSERT INTO notifications (id, user_id, type, title, body, data, priority, category, action_url, action_label, group_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, userId, type, title, body || '', data ? JSON.stringify(data) : null, priority || 'info', category || 'system', action_url || '/dashboard', action_label || null, group_key || null).run()
    log('INSERT OK', { id, changes: result?.meta?.changes })
    return id
  } catch (err) {
    log('EXCEPTION', { error: err?.message, stack: err?.stack })
    throw err
  }
}

// Check and create streak milestone notifications
export async function checkStreakMilestones(env, userId, newStreak) {
  const milestones = [7, 30, 100]
  for (const m of milestones) {
    if (newStreak === m) {
      await createNotificationIfAllowed(env, userId, {
        type: 'streak_milestone',
        title: `${m}-day study streak!`,
        body: `You've studied for ${m} days in a row. Keep it up!`,
        category: 'study_streak',
        priority: m >= 30 ? 'high' : 'info',
        action_url: '/tracking',
        data: { streak: m },
      })
    }
  }
}

// Notify all members of a community about a new announcement
export async function notifyCommunityAnnouncement(env, communityId, communityName, announcementTitle, announcementId, authorName) {
  const { results: members } = await env.DB.prepare(
    'SELECT user_id FROM community_members WHERE community_id = ?'
  ).bind(communityId).all()
  for (const m of members) {
    await createNotificationIfAllowed(env, m.user_id, {
      type: 'announcement',
      title: `New announcement in ${communityName}`,
      body: announcementTitle,
      category: 'announcement',
      priority: 'info',
      action_url: `/communities/${communityId}`,
      group_key: `announcement_${announcementId}`,
    })
  }
}

// Notify user when a goal is completed
export async function notifyGoalCompleted(env, userId, goalTitle) {
  await createNotificationIfAllowed(env, userId, {
    type: 'goal_completed',
    title: 'Goal completed!',
    body: `You've reached your goal: ${goalTitle}`,
    category: 'goal',
    priority: 'high',
    action_url: '/goals',
  })
}

// Notify user about flashcard milestone
export async function notifyFlashcardMilestone(env, userId, count) {
  const milestones = [50, 100, 250, 500, 1000]
  if (milestones.includes(count)) {
    await createNotificationIfAllowed(env, userId, {
      type: 'flashcard_milestone',
      title: `${count} flashcards reviewed!`,
      body: `You've reviewed ${count} flashcards. Great work!`,
      category: 'flashcard_milestone',
      priority: 'info',
      action_url: '/flashcards',
      data: { count },
    })
  }
}
