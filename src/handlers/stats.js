import { ROLES, hasMinimumRole } from '../lib/permissions.js'
import {
  json, uuid, log, corsHeaders, extractCommunityId, getMember, pageParams,
} from '../lib/worker-utils.js'
import { checkStreakMilestones } from './notifications.js'
import { checkAndAwardAchievements } from './achievements.js'

function badgeEmoji(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

/* ── Study Hours Sync ── */

export async function handleSyncStudyHours(request, env, user) {
  const { session_minutes } = await request.json()
  if (!session_minutes || typeof session_minutes !== 'number' || session_minutes <= 0) {
    return json({ error: 'session_minutes must be a positive number' }, 400)
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const isoNow = now.toISOString()
  const sessionId = uuid()

  const { results: memberships } = await env.DB.prepare(
    'SELECT community_id FROM community_members WHERE user_id = ?'
  ).bind(user.sub).all()

  for (const m of memberships) {
    const communityId = m.community_id

    await env.DB.prepare(
      'INSERT INTO study_sessions_log (id, community_id, user_id, minutes, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(sessionId + '_' + communityId, communityId, user.sub, session_minutes, isoNow).run()

    await env.DB.prepare(
      `INSERT INTO community_monthly_hours (id, community_id, user_id, year, month, total_hours, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(community_id, user_id, year, month)
       DO UPDATE SET total_hours = total_hours + ?, updated_at = ?`
    ).bind(
      uuid(), communityId, user.sub, year, month, session_minutes / 60, isoNow,
      session_minutes / 60, isoNow
    ).run()

    await env.DB.prepare(
      'UPDATE community_members SET total_study_hours = COALESCE(total_study_hours, 0) + ? WHERE community_id = ? AND user_id = ?'
    ).bind(session_minutes / 60, communityId, user.sub).run()
  }

  await env.DB.prepare(
    `UPDATE communities SET total_study_hours = (
      SELECT COALESCE(SUM(total_study_hours), 0) FROM community_members WHERE community_id = communities.id
    )`
  ).run()

  const { results: activeComps } = await env.DB.prepare(
    `SELECT cp.id as participant_id, cp.competition_id FROM competition_participants cp
     JOIN competitions c ON cp.competition_id = c.id
     WHERE cp.user_id = ? AND c.status IN ('active', 'pending')`
  ).bind(user.sub).all()

  for (const p of activeComps) {
    await env.DB.prepare(
      'UPDATE competition_participants SET total_hours = total_hours + ? WHERE id = ?'
    ).bind(session_minutes / 60, p.participant_id).run()
  }

  return json({ success: true })
}

/* ── Leaderboard ── */

export async function handleMonthlyLeaderboard(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear()
  const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1
  const filter = url.searchParams.get('filter') || 'this_month'

  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  let baseHoursQuery, baseHoursParams

  if (filter === 'all_time') {
    baseHoursQuery = `SELECT user_id, total_study_hours as hours FROM community_members WHERE community_id = ?`
    baseHoursParams = [communityId]
  } else if (filter === 'this_week') {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    baseHoursQuery = `SELECT user_id, SUM(minutes)/60.0 as hours FROM study_sessions_log WHERE community_id = ? AND created_at >= ? GROUP BY user_id`
    baseHoursParams = [communityId, weekAgo.toISOString()]
  } else {
    baseHoursQuery = `SELECT user_id, total_hours as hours FROM community_monthly_hours WHERE community_id = ? AND year = ? AND month = ?`
    baseHoursParams = [communityId, year, month]
  }

  let q = baseHoursQuery
  let params = [...baseHoursParams]

  if (filter === 'mentors') {
    q = `SELECT cm.user_id, COALESCE(ch.total_hours, 0) as hours FROM community_members cm
         LEFT JOIN community_monthly_hours ch ON ch.community_id = cm.community_id AND ch.user_id = cm.user_id AND ch.year = ? AND ch.month = ?
         WHERE cm.community_id = ? AND cm.role IN ('mentor', 'moderator', 'administrator')
         ORDER BY hours DESC`
    params = [year, month, communityId]
  } else if (filter === 'scholars') {
    q = `SELECT cm.user_id, COALESCE(ch.total_hours, 0) as hours FROM community_members cm
         LEFT JOIN community_monthly_hours ch ON ch.community_id = cm.community_id AND ch.user_id = cm.user_id AND ch.year = ? AND ch.month = ?
         WHERE cm.community_id = ? AND cm.role IN ('scholar', 'mentor', 'moderator', 'administrator')
         ORDER BY hours DESC`
    params = [year, month, communityId]
  } else if (filter === 'this_month') {
    q = baseHoursQuery + ' ORDER BY total_hours DESC'
  } else if (filter === 'all_time') {
    q = baseHoursQuery + ' ORDER BY total_study_hours DESC'
  } else if (filter === 'this_week') {
    q = baseHoursQuery + ' ORDER BY hours DESC'
  }

  const { results: hours } = await env.DB.prepare(q).bind(...params).all()

  const nameMap = {}
  if (hours.length > 0) {
    const { results: nameRows } = await env.DB.prepare(
      `SELECT user_id, user_name, profile_visibility FROM user_profiles
       WHERE user_id IN (${hours.map(h => '?').join(',')})`
    ).bind(...hours.map(h => h.user_id)).all()
    for (const r of nameRows) {
      nameMap[r.user_id] = { name: r.user_name, hidden: r.profile_visibility === 'private' }
    }
  }

  const { results: badges } = await env.DB.prepare(
    'SELECT * FROM community_monthly_badges WHERE community_id = ? AND year = ? AND month = ? ORDER BY rank'
  ).bind(communityId, year, month).all()
  const badgeMap = {}
  for (const b of badges) { badgeMap[b.user_id] = b }

  const now = new Date()
  const thisMonthEnded = (year < now.getFullYear()) || (year === now.getFullYear() && month < now.getMonth() + 1)
  if (thisMonthEnded && badges.length === 0 && hours.length >= 1) {
    const newBadges = []
    const ranks = [{ rank: 1 }, { rank: 2 }, { rank: 3 }]
    for (let i = 0; i < Math.min(3, hours.length); i++) {
      if (hours[i].hours > 0) {
        const badgeId = uuid()
        await env.DB.prepare(
          'INSERT OR IGNORE INTO community_monthly_badges (id, community_id, user_id, year, month, rank) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(badgeId, communityId, hours[i].user_id, year, month, ranks[i].rank).run()
        newBadges.push({ id: badgeId, user_id: hours[i].user_id, rank: ranks[i].rank, title: '' })
      }
    }
    for (const b of newBadges) { badgeMap[b.user_id] = b }
  }

  const visible = hours.filter(h => !nameMap[h.user_id]?.hidden || h.user_id === user?.sub)

  const ranked = visible.map((h, i) => ({
    rank: i + 1,
    user_id: h.user_id,
    user_name: nameMap[h.user_id]?.hidden ? '[Private]' : (nameMap[h.user_id]?.name || h.user_id?.slice(0, 8) || 'Unknown'),
    hours: Math.round(h.hours * 10) / 10,
    badge: badgeMap[h.user_id] ? { emoji: badgeEmoji(badgeMap[h.user_id].rank), rank: badgeMap[h.user_id].rank, title: badgeMap[h.user_id].title || '' } : null,
    is_me: h.user_id === user?.sub,
  }))

  return json(ranked)
}

export async function handleLeaderboardPosition(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const todayStr = now.toISOString().slice(0, 10)

  const { results: all } = await env.DB.prepare(
    `SELECT user_id, total_hours FROM community_monthly_hours
     WHERE community_id = ? AND year = ? AND month = ?
     ORDER BY total_hours DESC`
  ).bind(communityId, year, month).all()

  const myIdx = all.findIndex(h => h.user_id === user.sub)
  const myHours = myIdx >= 0 ? all[myIdx].total_hours : 0
  const myRank = myIdx >= 0 ? myIdx + 1 : null
  const totalParticipants = all.length

  let hoursToNext = null
  if (myIdx > 0) {
    hoursToNext = Math.round((all[myIdx - 1].total_hours - myHours) * 10) / 10
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  const { results: snapshots } = await env.DB.prepare(
    `SELECT ranking FROM community_leaderboard_snapshots
     WHERE community_id = ? AND snapshot_date = ?
     LIMIT 1`
  ).bind(communityId, yesterdayStr).all()

  let placesChanged = 0
  if (snapshots.length > 0) {
    const oldRanking = JSON.parse(snapshots[0].ranking)
    const oldIdx = oldRanking.findIndex(r => r.user_id === user.sub)
    const oldRank = oldIdx >= 0 ? oldIdx + 1 : null
    if (myRank && oldRank) {
      placesChanged = oldRank - myRank
    }
  }

  const { results: todaySnap } = await env.DB.prepare(
    'SELECT id FROM community_leaderboard_snapshots WHERE community_id = ? AND snapshot_date = ?'
  ).bind(communityId, todayStr).all()
  if (todaySnap.length === 0) {
    const snapshotData = all.map(h => ({ user_id: h.user_id, hours: h.total_hours }))
    await env.DB.prepare(
      'INSERT INTO community_leaderboard_snapshots (id, community_id, snapshot_date, ranking) VALUES (?, ?, ?, ?)'
    ).bind(uuid(), communityId, todayStr, JSON.stringify(snapshotData)).run()
  }

  const { results: todayHours } = await env.DB.prepare(
    `SELECT COALESCE(SUM(minutes), 0)/60.0 as today_hours FROM study_sessions_log
     WHERE community_id = ? AND user_id = ? AND created_at >= ?`
  ).bind(communityId, user.sub, todayStr).run()

  return json({
    rank: myRank,
    total_participants: totalParticipants,
    hours: Math.round(myHours * 10) / 10,
    today_hours: Math.round((todayHours[0]?.today_hours || 0) * 10) / 10,
    hours_to_next: hoursToNext,
    places_changed: placesChanged,
  })
}

export async function handleSetLeaderboardTitle(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) {
    return json({ error: 'Only admins can assign titles' }, 403)
  }

  const { user_id, year, month, title } = await request.json()
  if (!user_id || !year || !month) return json({ error: 'user_id, year, month required' }, 400)
  if (typeof title !== 'string' || title.length > 100) return json({ error: 'Title too long' }, 400)

  const sanitized = title.trim().slice(0, 100)

  await env.DB.prepare(
    `UPDATE community_monthly_badges SET title = ? WHERE community_id = ? AND user_id = ? AND year = ? AND month = ?`
  ).bind(sanitized, communityId, user_id, year, month).run()

  return json({ success: true, title: sanitized })
}

export async function handleAllTimeLeaderboard(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  const { results: allTime } = await env.DB.prepare(
    `SELECT cm.user_id, cm.total_study_hours as hours
     FROM community_members cm
     WHERE cm.community_id = ?
     ORDER BY cm.total_study_hours DESC
     LIMIT 100`
  ).bind(communityId).all()

  const nameMap = {}
  if (allTime.length > 0) {
    const { results: nameRows } = await env.DB.prepare(
      `SELECT user_id, user_name, profile_visibility FROM user_profiles
       WHERE user_id IN (${allTime.map(h => '?').join(',')})`
    ).bind(...allTime.map(h => h.user_id)).all()
    for (const r of nameRows) {
      nameMap[r.user_id] = { name: r.user_name, hidden: r.profile_visibility === 'private' }
    }
  }

  const visible = allTime.filter(h => !nameMap[h.user_id]?.hidden || h.user_id === user?.sub)

  const ranked = visible.map((h, i) => ({
    rank: i + 1,
    user_id: h.user_id,
    user_name: nameMap[h.user_id]?.hidden ? '[Private]' : (nameMap[h.user_id]?.name || h.user_id?.slice(0, 8)),
    hours: Math.round((h.hours || 0) * 10) / 10,
    is_me: h.user_id === user?.sub,
  }))

  return json(ranked)
}

/* ── Heatmap ── */

export async function handleHeatmap(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  const url = new URL(request.url)
  const year = url.searchParams.get('year') || String(new Date().getFullYear())
  const userId = url.searchParams.get('user_id') || null

  const yearStart = `${year}-01-01`
  const yearEnd = `${Number(year) + 1}-01-01`

  let q = `SELECT DATE(created_at) as date, ROUND(SUM(minutes) / 60.0, 2) as hours
    FROM study_sessions_log
    WHERE community_id = ? AND strftime('%Y', created_at) = ? AND created_at >= ? AND created_at < ?`
  const params = [communityId, year, yearStart, yearEnd]

  if (userId) {
    q += ` AND user_id = ?`
    params.push(userId)
  }

  q += ` GROUP BY DATE(created_at) ORDER BY date ASC`

  const { results } = await env.DB.prepare(q).bind(...params).all()

  const totalHours = Math.round(results.reduce((sum, r) => sum + r.hours, 0) * 10) / 10

  return json({
    data: results,
    total_hours: totalHours,
    active_days: results.length,
    year: Number(year),
  })
}

/* ── Session Timeline ── */

export async function handleSessionTimeline(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]

  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  const { results: participants } = await env.DB.prepare(
    'SELECT * FROM community_room_timer_participants WHERE room_id = ?'
  ).bind(roomId).all()
  const hasJoined = participants.some(p => p.user_id === user.sub)
  if (!hasJoined) return json({ error: 'You have not joined this room' }, 403)

  const dateParam = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const dayStart = `${dateParam}T00:00:00.000Z`
  const dayEnd = `${dateParam}T23:59:59.999Z`

  const { results: timers } = await env.DB.prepare(
    `SELECT * FROM community_room_timers WHERE room_id = ?`
  ).bind(roomId).all()

  const { results: dayParticipants } = await env.DB.prepare(
    `SELECT * FROM community_room_timer_participants
     WHERE room_id = ? AND ((joined_at <= ? AND (left_at >= ? OR left_at IS NULL)) OR (joined_at >= ? AND joined_at <= ?))`
  ).bind(roomId, dayEnd, dayStart, dayStart, dayEnd).all()

  const events = []

  if (timers.length > 0) {
    const timer = timers[0]
    if (timer.started_at && timer.started_at >= dayStart && timer.started_at <= dayEnd) {
      events.push({ time: timer.started_at.slice(11, 19), type: 'timer_start', mode: timer.mode })
    }
    for (const p of dayParticipants) {
      if (p.joined_at && p.joined_at >= dayStart && p.joined_at <= dayEnd) {
        events.push({ time: p.joined_at.slice(11, 19), type: 'participant_join', user_id: p.user_id })
      }
      if (p.left_at && p.left_at >= dayStart && p.left_at <= dayEnd) {
        events.push({ time: p.left_at.slice(11, 19), type: 'participant_leave', user_id: p.user_id })
      }
    }
  }

  events.sort((a, b) => a.time.localeCompare(b.time))

  const totalFocusMinutes = Math.round(dayParticipants.reduce((sum, p) => sum + (p.study_seconds || 0), 0) / 60)
  const defaultFocusRatio = 0.8
  const totalBreakMinutes = Math.round(totalFocusMinutes * (1 - defaultFocusRatio) / defaultFocusRatio)

  return json({
    date: dateParam,
    total_focus_minutes: totalFocusMinutes,
    total_break_minutes: totalBreakMinutes,
    events,
    participants: dayParticipants.map(p => ({
      user_id: p.user_id,
      joined_at: p.joined_at,
      left_at: p.left_at,
      study_seconds: p.study_seconds || 0,
    })),
  })
}

/* ── Room Stats Dashboard ── */

export async function handleRoomStats(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]

  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  const { results: allParticipants } = await env.DB.prepare(
    'SELECT * FROM community_room_timer_participants WHERE room_id = ?'
  ).bind(roomId).all()

  const completed = allParticipants.filter(p => p.left_at != null)
  const totalStudySeconds = completed.reduce((sum, p) => sum + (p.study_seconds || 0), 0)

  const { results: sessionDates } = await env.DB.prepare(
    `SELECT DISTINCT DATE(joined_at) as d FROM community_room_timer_participants
     WHERE room_id = ? AND joined_at IS NOT NULL`
  ).bind(roomId).all()

  const distinctUsers = new Set(allParticipants.map(p => p.user_id))
  const currentParticipants = allParticipants.filter(p => p.left_at == null).length

  const hourCounts = {}
  for (const p of allParticipants) {
    if (p.joined_at) {
      const hour = p.joined_at.slice(11, 13) + ':00'
      hourCounts[hour] = (hourCounts[hour] || 0) + 1
    }
  }
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  const userStats = {}
  for (const p of completed) {
    if (!userStats[p.user_id]) userStats[p.user_id] = { user_id: p.user_id, study_seconds: 0, sessions: 0 }
    userStats[p.user_id].study_seconds += p.study_seconds || 0
    userStats[p.user_id].sessions += 1
  }
  const topParticipants = Object.values(userStats)
    .sort((a, b) => b.study_seconds - a.study_seconds)
    .slice(0, 10)

  return json({
    total_study_seconds: totalStudySeconds,
    total_sessions: sessionDates.length,
    active_participants: distinctUsers.size,
    current_participants: currentParticipants,
    peak_hour: peakHour,
    top_participants: topParticipants,
  })
}

/* ── Badges ── */

export async function handleUserBadges(request, env) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[4]

  const { results: visRows } = await env.DB.prepare(
    `SELECT profile_visibility FROM user_profiles WHERE user_id = ?`
  ).bind(targetUserId).all()
  if (visRows.length && visRows[0].profile_visibility === 'private') {
    return json([])
  }

  const { results: badges } = await env.DB.prepare(
    `SELECT cmb.*, c.name as community_name
     FROM community_monthly_badges cmb
     JOIN communities c ON cmb.community_id = c.id
     WHERE cmb.user_id = ?
     ORDER BY cmb.year DESC, cmb.month DESC, cmb.rank`
  ).bind(targetUserId).all()

  return json(badges.map(b => ({
    community_id: b.community_id,
    community_name: b.community_name,
    year: b.year,
    month: b.month,
    rank: b.rank,
    emoji: badgeEmoji(b.rank),
    title: b.title || '',
    awarded_at: b.awarded_at,
  })))
}

// ── Global Leaderboard ──

export async function handleGlobalLeaderboard(request, env, user) {
  const url = new URL(request.url)
  const metric = url.searchParams.get('metric') || 'study_hours'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)

  let q, orderCol
  if (metric === 'questions') {
    q = `SELECT user_id, questions_answered as value FROM user_stats WHERE questions_answered > 0 ORDER BY questions_answered DESC LIMIT ?`
    orderCol = 'value'
  } else if (metric === 'cards') {
    q = `SELECT user_id, cards_reviewed as value FROM user_stats WHERE cards_reviewed > 0 ORDER BY cards_reviewed DESC LIMIT ?`
    orderCol = 'value'
  } else if (metric === 'streak') {
    q = `SELECT user_id, current_streak as value FROM user_stats WHERE current_streak > 0 ORDER BY current_streak DESC LIMIT ?`
    orderCol = 'value'
  } else {
    q = `SELECT user_id, study_hours as value FROM user_stats WHERE study_hours > 0 ORDER BY study_hours DESC LIMIT ?`
    orderCol = 'value'
  }

  const { results } = await env.DB.prepare(q).bind(limit).all()
  if (!results.length) return json([])

  const nameMap = {}
  const { results: nameRows } = await env.DB.prepare(
    `SELECT user_id, user_name, avatar_url, profile_visibility FROM user_profiles WHERE user_id IN (${results.map(() => '?').join(',')})`
  ).bind(...results.map(r => r.user_id)).all()
  for (const r of nameRows) {
    nameMap[r.user_id] = { name: r.user_name, avatar: r.avatar_url, hidden: r.profile_visibility === 'private' }
  }

  const visible = results.filter(r => !nameMap[r.user_id]?.hidden || r.user_id === user?.sub)

  return json(visible.map((r, i) => ({
    rank: i + 1,
    user_id: r.user_id,
    user_name: nameMap[r.user_id]?.hidden ? '[Private]' : (nameMap[r.user_id]?.name || r.user_id?.slice(0, 8)),
    avatar_url: nameMap[r.user_id]?.hidden ? null : (nameMap[r.user_id]?.avatar || null),
    value: Math.round((r.value || 0) * 10) / 10,
    is_me: r.user_id === user?.sub,
  })))
}

// ── User Profile Stats ──

export async function incrementUserStats(env, userId, field, amount = 1) {
  if (!userId || !field) return
  const allowedFields = [
    'study_hours', 'questions_answered', 'cards_reviewed', 'pomodoros_completed',
    'competitions_joined', 'communities_count', 'followers_count', 'following_count',
    'current_streak', 'longest_streak'
  ]
  if (!allowedFields.includes(field)) return

  await env.DB.prepare(`
    INSERT INTO user_stats (user_id, ${field}, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      ${field} = MAX(0, ${field} + ?),
      updated_at = datetime('now')
  `).bind(userId, amount, amount).run()
}

export async function refreshUserStats(env, userId) {
  if (!userId) return

  const { results: hours } = await env.DB.prepare(
    'SELECT COALESCE(SUM(total_study_hours), 0) as total FROM community_members WHERE user_id = ?'
  ).bind(userId).all()

  const { results: questions } = await env.DB.prepare(
    'SELECT COALESCE(SUM(correct), 0) as total FROM uworld_blocks WHERE user_id = ?'
  ).bind(userId).all()

  const { results: cards } = await env.DB.prepare(
    'SELECT COALESCE(COUNT(*), 0) as total FROM flashcards WHERE user_id = ?'
  ).bind(userId).all()

  const { results: communities } = await env.DB.prepare(
    'SELECT COALESCE(COUNT(*), 0) as total FROM community_members WHERE user_id = ?'
  ).bind(userId).all()

  const { results: competitions } = await env.DB.prepare(
    'SELECT COALESCE(COUNT(*), 0) as total FROM competition_participants WHERE user_id = ?'
  ).bind(userId).all()

  let currentStreak = 0
  let longestStreak = 0
  const { results: sessionDays } = await env.DB.prepare(
    'SELECT DISTINCT DATE(created_at) as day FROM study_sessions_log WHERE user_id = ? ORDER BY day DESC'
  ).bind(userId).all()

  if (sessionDays.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const latestDay = new Date(sessionDays[0].day + 'T00:00:00')

    if (latestDay >= yesterday) {
      currentStreak = 1
      for (let i = 1; i < sessionDays.length; i++) {
        const prev = new Date(sessionDays[i - 1].day + 'T00:00:00')
        const cur = new Date(sessionDays[i].day + 'T00:00:00')
        const diff = (prev - cur) / 86400000
        if (diff === 1) currentStreak++
        else break
      }
    }

    let tempStreak = 1
    for (let i = 1; i < sessionDays.length; i++) {
      const prev = new Date(sessionDays[i - 1].day + 'T00:00:00')
      const cur = new Date(sessionDays[i].day + 'T00:00:00')
      const diff = (prev - cur) / 86400000
      if (diff === 1) {
        tempStreak++
        longestStreak = Math.max(longestStreak, tempStreak)
      } else {
        tempStreak = 1
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak, currentStreak)
  }

  const { results: followers } = await env.DB.prepare(
    'SELECT COALESCE(COUNT(*), 0) as total FROM user_followers WHERE following_id = ?'
  ).bind(userId).all()

  const { results: following } = await env.DB.prepare(
    'SELECT COALESCE(COUNT(*), 0) as total FROM user_followers WHERE follower_id = ?'
  ).bind(userId).all()

  const { results: pomodoros } = await env.DB.prepare(
    "SELECT COALESCE(COUNT(*), 0) as total FROM study_activity WHERE user_id = ? AND module = 'pomodoro' AND action = 'completed'"
  ).bind(userId).all()

  await env.DB.prepare(`
    INSERT INTO user_stats (user_id, study_hours, questions_answered, cards_reviewed, pomodoros_completed, competitions_joined, communities_count, followers_count, following_count, current_streak, longest_streak, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      study_hours = ?, questions_answered = ?, cards_reviewed = ?, pomodoros_completed = ?,
      competitions_joined = ?, communities_count = ?, followers_count = ?, following_count = ?,
      current_streak = ?, longest_streak = ?, updated_at = datetime('now')
  `).bind(
    userId,
    Number(hours[0]?.total) || 0,
    Number(questions[0]?.total) || 0,
    Number(cards[0]?.total) || 0,
    Number(pomodoros[0]?.total) || 0,
    Number(competitions[0]?.total) || 0,
    Number(communities[0]?.total) || 0,
    Number(followers[0]?.total) || 0,
    Number(following[0]?.total) || 0,
    currentStreak,
    longestStreak,
    Number(hours[0]?.total) || 0,
    Number(questions[0]?.total) || 0,
    Number(cards[0]?.total) || 0,
    Number(pomodoros[0]?.total) || 0,
    Number(competitions[0]?.total) || 0,
    Number(communities[0]?.total) || 0,
    Number(followers[0]?.total) || 0,
    Number(following[0]?.total) || 0,
    currentStreak,
    longestStreak
  ).run()

  return {
    study_hours: Number(hours[0]?.total) || 0,
    questions_answered: Number(questions[0]?.total) || 0,
    cards_reviewed: Number(cards[0]?.total) || 0,
    pomodoros_completed: Number(pomodoros[0]?.total) || 0,
    competitions_joined: Number(competitions[0]?.total) || 0,
    communities_count: Number(communities[0]?.total) || 0,
    followers_count: Number(followers[0]?.total) || 0,
    following_count: Number(following[0]?.total) || 0,
    current_streak: currentStreak,
    longest_streak: longestStreak,
  }
}

// Check streak milestones after refresh and fire notifications (best-effort)
export async function refreshUserStatsAndNotify(env, userId) {
  const stats = await refreshUserStats(env, userId)
  if (stats?.current_streak > 0) {
    await checkStreakMilestones(env, userId, stats.current_streak)
  }
  // Check achievements (best-effort)
  checkAndAwardAchievements(env, userId).catch(() => {})
  return stats
}

export async function logUserActivity(env, userId, type, entityId, entityType, metadata = {}) {
  if (!userId || !type) return
  const { uuid } = await import('../lib/worker-utils.js')
  await env.DB.prepare(
    'INSERT INTO user_activity (id, user_id, type, entity_id, entity_type, metadata) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uuid(), userId, type, entityId || null, entityType || null, JSON.stringify(metadata)).run()
}

// ── Global Monthly Leaderboard ──

export async function handleGlobalMonthlyLeaderboard(request, env, user) {
  const url = new URL(request.url)
  const now = new Date()
  const year = parseInt(url.searchParams.get('year')) || now.getFullYear()
  const month = parseInt(url.searchParams.get('month')) || now.getMonth() + 1
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)

  const { results } = await env.DB.prepare(
    `SELECT cmh.user_id, SUM(cmh.total_hours) as hours
     FROM community_monthly_hours cmh
     WHERE cmh.year = ? AND cmh.month = ?
     GROUP BY cmh.user_id
     HAVING hours > 0
     ORDER BY hours DESC
     LIMIT ?`
  ).bind(year, month, limit).all()

  if (!results.length) return json({ entries: [], my_rank: null })

  const userIds = results.map(r => r.user_id)

  const { results: profiles } = await env.DB.prepare(
    `SELECT user_id, user_name, avatar_url, profile_visibility FROM user_profiles
     WHERE user_id IN (${userIds.map(() => '?').join(',')})`
  ).bind(...userIds).all()

  const profileMap = {}
  for (const p of profiles) {
    profileMap[p.user_id] = p
  }

  const { results: streaks } = await env.DB.prepare(
    `SELECT user_id, current_streak FROM user_stats
     WHERE user_id IN (${userIds.map(() => '?').join(',')})`
  ).bind(...userIds).all()

  const streakMap = {}
  for (const s of streaks) {
    streakMap[s.user_id] = s.current_streak || 0
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const todayStr = now.toISOString().slice(0, 10)

  const { results: yesterdaySnap } = await env.DB.prepare(
    'SELECT ranking FROM global_leaderboard_snapshots WHERE snapshot_date = ? LIMIT 1'
  ).bind(yesterdayStr).all()

  let oldRankMap = {}
  if (yesterdaySnap.length > 0) {
    const oldRanking = JSON.parse(yesterdaySnap[0].ranking)
    oldRanking.forEach((entry, idx) => {
      oldRankMap[entry.user_id] = idx + 1
    })
  }

  const { results: todaySnap } = await env.DB.prepare(
    'SELECT id FROM global_leaderboard_snapshots WHERE snapshot_date = ?'
  ).bind(todayStr).all()

  if (todaySnap.length === 0) {
    const top100 = results.slice(0, 100).map((r, i) => ({ user_id: r.user_id, rank: i + 1, hours: r.hours }))
    await env.DB.prepare(
      'INSERT INTO global_leaderboard_snapshots (id, snapshot_date, ranking) VALUES (?, ?, ?)'
    ).bind(uuid(), todayStr, JSON.stringify(top100)).run()
  }

  const { results: totalUsers } = await env.DB.prepare(
    `SELECT COUNT(DISTINCT user_id) as cnt FROM community_monthly_hours WHERE year = ? AND month = ? AND total_hours > 0`
  ).bind(year, month).all()

  const totalCount = totalUsers[0]?.cnt || 0

  let myRank = null
  let myHours = 0
  let myPercentile = 100

  if (user?.sub) {
    const myIdx = results.findIndex(r => r.user_id === user.sub)
    if (myIdx >= 0) {
      myRank = myIdx + 1
      myHours = results[myIdx].hours
    } else {
      const { results: myRow } = await env.DB.prepare(
        `SELECT SUM(cmh.total_hours) as hours,
                (SELECT COUNT(DISTINCT user_id) FROM community_monthly_hours WHERE year = ? AND month = ? AND total_hours > 0) as total_users
         FROM community_monthly_hours cmh
         WHERE cmh.year = ? AND cmh.month = ? AND cmh.user_id = ?`
      ).bind(year, month, year, month, user.sub).all()

      myHours = myRow[0]?.hours || 0
      if (myHours > 0) {
        const { results: rankRow } = await env.DB.prepare(
          `SELECT COUNT(*) + 1 as rank FROM community_monthly_hours
           WHERE year = ? AND month = ? AND total_hours > 0
           AND total_hours > (SELECT COALESCE(SUM(total_hours), 0) FROM community_monthly_hours WHERE year = ? AND month = ? AND user_id = ?)`
        ).bind(year, month, year, month, user.sub).all()
        myRank = rankRow[0]?.rank || totalCount
      }
    }
    if (myRank && totalCount) {
      myPercentile = Math.round((1 - myRank / totalCount) * 100)
    }
  }

  const entries = results.map((r, i) => {
    const profile = profileMap[r.user_id]
    const isPrivate = profile?.profile_visibility === 'private'
    const oldRank = oldRankMap[r.user_id] || null
    const placesChanged = oldRank ? oldRank - (i + 1) : 0
    return {
      rank: i + 1,
      user_id: r.user_id,
      user_name: isPrivate ? '[Private]' : (profile?.user_name || r.user_id?.slice(0, 8)),
      avatar_url: isPrivate ? null : (profile?.avatar_url || null),
      hours: Math.round(r.hours * 10) / 10,
      rank_change: placesChanged,
      streak: streakMap[r.user_id] || 0,
      is_me: r.user_id === user?.sub,
    }
  })

  const myRankObj = myRank ? {
    rank: myRank,
    hours: Math.round(myHours * 10) / 10,
    percentile: myPercentile,
    total_users: totalCount,
  } : null

  return json({ entries, my_rank: myRankObj })
}

// ── Communities Monthly Leaderboard ──

export async function handleCommunitiesMonthlyLeaderboard(request, env, user) {
  const url = new URL(request.url)
  const now = new Date()
  const year = parseInt(url.searchParams.get('year')) || now.getFullYear()
  const month = parseInt(url.searchParams.get('month')) || now.getMonth() + 1
  const category = url.searchParams.get('category') || 'all'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)

  let q = `SELECT cmh.community_id, SUM(cmh.total_hours) as total_hours, COUNT(DISTINCT cmh.user_id) as active_members
    FROM community_monthly_hours cmh
    JOIN communities c ON c.id = cmh.community_id
    WHERE cmh.year = ? AND cmh.month = ?`
  const params = [year, month]

  if (category && category !== 'all') {
    q += ` AND c.category = ?`
    params.push(category)
  }

  if (user?.sub) {
    q += ` AND (c.visibility = 'public' OR c.id IN (SELECT community_id FROM community_members WHERE user_id = ?))`
    params.push(user.sub)
  } else {
    q += ` AND c.visibility = 'public'`
  }

  q += ` GROUP BY cmh.community_id ORDER BY total_hours DESC LIMIT ?`
  params.push(limit)

  const { results } = await env.DB.prepare(q).bind(...params).all()

  if (!results.length) return json({ entries: [] })

  const communityIds = results.map(r => r.community_id)

  const { results: communities } = await env.DB.prepare(
    `SELECT id, name, avatar_url, category, member_count, visibility FROM communities
     WHERE id IN (${communityIds.map(() => '?').join(',')})`
  ).bind(...communityIds).all()

  const commMap = {}
  for (const c of communities) {
    commMap[c.id] = c
  }

  let memberSet = new Set()
  if (user?.sub) {
    const { results: myMemberships } = await env.DB.prepare(
      `SELECT community_id FROM community_members WHERE user_id = ? AND community_id IN (${communityIds.map(() => '?').join(',')})`
    ).bind(user.sub, ...communityIds).all()
    memberSet = new Set(myMemberships.map(m => m.community_id))
  }

  const topHours = results[0]?.total_hours || 1
  const topActive = results[0]?.active_members || 1
  const topAvg = topActive > 0 ? topHours / topActive : 1

  const entries = results.map((r, i) => {
    const comm = commMap[r.community_id]
    const hoursPct = r.total_hours / topHours
    const activePct = r.active_members / topActive
    const avgHours = r.active_members > 0 ? r.total_hours / r.active_members : 0
    const avgHoursPct = topAvg > 0 ? avgHours / topAvg : 0
    const communityScore = Math.round((hoursPct * 0.50 + activePct * 0.30 + avgHoursPct * 0.20) * 100)

    return {
      rank: i + 1,
      community_id: r.community_id,
      name: comm?.name || '',
      avatar_url: comm?.avatar_url || null,
      category: comm?.category || 'general',
      total_hours: Math.round(r.total_hours * 10) / 10,
      active_members: r.active_members,
      member_count: comm?.member_count || 0,
      avg_hours: Math.round(avgHours * 10) / 10,
      community_score: communityScore,
      is_member: memberSet.has(r.community_id),
    }
  })

  return json({ entries })
}

// ── Global Leaderboard Stats ──

export async function handleGlobalLeaderboardStats(request, env, user) {
  const url = new URL(request.url)
  const now = new Date()
  const year = parseInt(url.searchParams.get('year')) || now.getFullYear()
  const month = parseInt(url.searchParams.get('month')) || now.getMonth() + 1

  const [{ results: hoursRes }, { results: studentsRes }, { results: commsRes }] = await Promise.all([
    env.DB.prepare(
      'SELECT COALESCE(SUM(total_hours), 0) as total_hours FROM community_monthly_hours WHERE year = ? AND month = ?'
    ).bind(year, month).all(),
    env.DB.prepare(
      'SELECT COUNT(DISTINCT user_id) as active_students FROM community_monthly_hours WHERE year = ? AND month = ?'
    ).bind(year, month).all(),
    env.DB.prepare(
      'SELECT COUNT(DISTINCT community_id) as total_communities FROM community_monthly_hours WHERE year = ? AND month = ?'
    ).bind(year, month).all(),
  ])

  const totalHours = Math.round((hoursRes[0]?.total_hours || 0) * 10) / 10
  const activeStudents = studentsRes[0]?.active_students || 0
  const totalCommunities = commsRes[0]?.total_communities || 0
  const avgHours = activeStudents > 0 ? Math.round((totalHours / activeStudents) * 10) / 10 : 0

  return json({ total_hours: totalHours, active_students: activeStudents, total_communities: totalCommunities, avg_hours: avgHours })
}

// ── Leaderboard Search ──

export async function handleLeaderboardSearch(request, env, user) {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')
  const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear()
  const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1
  const type = url.searchParams.get('type') || 'user'

  if (!q || q.length < 2) return json({ results: [] })

  if (type === 'community') {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.name, c.avatar_url, COALESCE(cmh.total_hours, 0) as hours
       FROM communities c
       LEFT JOIN community_monthly_hours cmh ON cmh.community_id = c.id AND cmh.year = ? AND cmh.month = ?
       WHERE c.name LIKE ?
       ORDER BY hours DESC
       LIMIT 10`
    ).bind(year, month, `%${q}%`).all()

    const ranked = results.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      name: r.name,
      avatar_url: r.avatar_url || null,
      hours: Math.round(r.hours * 10) / 10,
    }))

    return json({ results: ranked })
  }

  const { results } = await env.DB.prepare(
    `SELECT up.user_id, up.user_name, up.avatar_url, COALESCE(SUM(cmh.total_hours), 0) as hours
     FROM user_profiles up
     LEFT JOIN community_monthly_hours cmh ON cmh.user_id = up.user_id AND cmh.year = ? AND cmh.month = ?
     WHERE up.user_name LIKE ?
     GROUP BY up.user_id
     ORDER BY hours DESC
     LIMIT 10`
  ).bind(year, month, `%${q}%`).all()

  const ranked = results.map((r, i) => ({
    rank: i + 1,
    id: r.user_id,
    name: r.user_name || r.user_id?.slice(0, 8),
    avatar_url: r.avatar_url || null,
    hours: Math.round(r.hours * 10) / 10,
  }))

  return json({ results: ranked })
}

// ── Community Hall of Fame ──

export async function handleCommunityHallOfFame(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const now = new Date()
  const monthsBack = 12

  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const startYear = startDate.getFullYear()
  const startMonth = startDate.getMonth() + 1

  const { results } = await env.DB.prepare(
    `SELECT cmb.year, cmb.month, cmb.rank, cmb.user_id, cmb.title, up.user_name, up.avatar_url
     FROM community_monthly_badges cmb
     LEFT JOIN user_profiles up ON cmb.user_id = up.user_id
     WHERE cmb.community_id = ? AND (cmb.year > ? OR (cmb.year = ? AND cmb.month >= ?))
     ORDER BY cmb.year DESC, cmb.month DESC, cmb.rank ASC`
  ).bind(communityId, startYear, startYear, startMonth).all()

  const entries = results.map(r => ({
    year: r.year,
    month: r.month,
    rank: r.rank,
    user_id: r.user_id,
    user_name: r.user_name || r.user_id?.slice(0, 8),
    avatar_url: r.avatar_url || null,
    title: r.title || '',
  }))

  return json(entries)
}
