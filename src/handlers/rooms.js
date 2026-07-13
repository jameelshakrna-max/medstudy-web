import { ROLES, PERM, hasPermission, hasMinimumRole } from '../lib/permissions.js'
import {
  json, uuid, log, corsHeaders, extractCommunityId, getMember,
} from '../lib/worker-utils.js'

async function callRealtimeKit(env, method, path, body = null) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/realtime/kit/${env.REALTIMEKIT_APP_ID}`
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${base}${path}`, opts)
  const data = await res.json()
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'RealtimeKit API error')
  return data.data
}

export async function handleListRooms(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.VIEW_CONTENT)) return json({ error: 'Not authorized' }, 403)

  const { results } = await env.DB.prepare(
    `SELECT cr.*, u.user_name as created_by_name FROM community_rooms cr
     LEFT JOIN user_profiles u ON cr.created_by = u.user_id
     WHERE cr.community_id = ? AND cr.status = 'active'
     ORDER BY cr.created_at DESC`
  ).bind(communityId).all()

  if (results.length > 0) {
    const ids = results.map(r => "'" + r.id + "'").join(',')
    const { results: participantCounts } = await env.DB.prepare(
      `SELECT room_id, COUNT(*) as cnt FROM community_room_participants WHERE left_at IS NULL AND room_id IN (${ids}) GROUP BY room_id`
    ).all()
    const countMap = Object.fromEntries(participantCounts.map(r => [r.room_id, r.cnt]))
    for (const room of results) {
      room.participants = countMap[room.id] || 0
    }
  }

  return json(results)
}

export async function handleCreateRoom(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.CREATE_VOICE_ROOM)) return json({ error: 'Not authorized' }, 403)

  const { name } = await request.json()
  if (!name || typeof name !== 'string' || name.trim().length > 100) return json({ error: 'Name required (max 100 chars)' }, 400)

  const { results: activeCount } = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM community_rooms WHERE community_id = ? AND status = \'active\''
  ).bind(communityId).all()
  if (activeCount[0]?.cnt >= 5) return json({ error: 'Maximum 5 active rooms per community' }, 429)

  const meeting = await callRealtimeKit(env, 'POST', '/meetings', { title: name.trim() })

  const id = uuid()
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO community_rooms (id, community_id, room_name, type, provider, status, created_by, created_at, realtimekit_meeting_id)
     VALUES (?, ?, ?, 'voice', 'realtimekit', 'active', ?, ?, ?)`
  ).bind(id, communityId, name.trim(), user.sub, now, meeting.id).run()

  log('room:created', { communityId, roomId: id, by: user.sub })
  return json({ id, name: name.trim(), status: 'active', participants: 0 })
}

export async function handleJoinRoom(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.JOIN_VOICE_ROOM)) return json({ error: 'Not authorized' }, 403)

  const { results: rooms } = await env.DB.prepare(
    'SELECT * FROM community_rooms WHERE id = ? AND community_id = ? AND status = \'active\''
  ).bind(roomId, communityId).all()
  if (!rooms.length) return json({ error: 'Room not found or not active' }, 404)
  const room = rooms[0]

  const preset = hasMinimumRole(member.role, ROLES.MODERATOR) ? 'study-host' : 'study-participant'
  const participant = await callRealtimeKit(env, 'POST', `/meetings/${room.realtimekit_meeting_id}/participants`, {
    name: user.email?.split('@')[0] || 'Someone',
    preset_name: preset,
    custom_participant_id: user.sub,
  })

  await env.DB.prepare(
    'INSERT INTO community_room_participants (id, room_id, user_id) VALUES (?, ?, ?)'
  ).bind(uuid(), roomId, user.sub).run()

  await env.DB.prepare(
    'INSERT OR IGNORE INTO community_room_timer_participants (room_id, user_id, joined_at, last_seen_at) VALUES (?, ?, ?, ?)'
  ).bind(roomId, user.sub, new Date().toISOString(), new Date().toISOString()).run()

  return json({ authToken: participant.token, meetingId: room.realtimekit_meeting_id })
}

export async function handleLeaveRoom(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.JOIN_VOICE_ROOM)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare(
    'UPDATE community_room_participants SET left_at = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(roomId, user.sub).run()

  await env.DB.prepare(
    'UPDATE community_room_timer_participants SET left_at = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(new Date().toISOString(), roomId, user.sub).run()

  log('room:leave', { communityId, roomId, userId: user.sub })
  return json({ ok: true })
}

export async function handleEndRoom(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.END_VOICE_ROOM)) return json({ error: 'Not authorized' }, 403)

  const { results: rooms } = await env.DB.prepare(
    'SELECT * FROM community_rooms WHERE id = ? AND community_id = ? AND status = \'active\''
  ).bind(roomId, communityId).all()
  if (!rooms.length) return json({ error: 'Room not found or not active' }, 404)
  const room = rooms[0]

  await env.DB.prepare(
    'UPDATE community_rooms SET status = \'ended\', ended_at = ? WHERE id = ?'
  ).bind(new Date().toISOString(), roomId).run()

  await env.DB.prepare(
    'UPDATE community_room_participants SET left_at = ? WHERE room_id = ? AND left_at IS NULL'
  ).bind(new Date().toISOString(), roomId).run()

  await env.DB.prepare(
    'UPDATE community_room_timer_participants SET left_at = ? WHERE room_id = ? AND left_at IS NULL'
  ).bind(new Date().toISOString(), roomId).run()

  log('room:ended', { communityId, roomId, by: user.sub })
  return json({ success: true })
}

function timerElapsedSeconds(timer, nowMs) {
  if (!timer.started_at) return 0
  const startedAt = new Date(timer.started_at).getTime()
  const pausedMs = (timer.total_paused_seconds || 0) * 1000
  return Math.max(0, (nowMs - startedAt - pausedMs) / 1000)
}

function timerCurrentDuration(timer) {
  if (timer.mode === 'focus') return timer.focus_duration
  if (timer.mode === 'long_break') return timer.long_break_duration
  return timer.short_break_duration
}

async function advanceTimerMode(env, roomId, now) {
  const { results: timers } = await env.DB.prepare(
    'SELECT * FROM community_room_timers WHERE room_id = ?'
  ).bind(roomId).all()
  if (!timers.length) return null
  const timer = timers[0]

  if (timer.mode === 'focus') {
    const { results: active } = await env.DB.prepare(
      'SELECT user_id FROM community_room_timer_participants WHERE room_id = ? AND left_at IS NULL'
    ).bind(roomId).all()

    for (const p of active) {
      await env.DB.prepare(
        'UPDATE community_room_timer_participants SET study_seconds = study_seconds + ? WHERE room_id = ? AND user_id = ?'
      ).bind(timer.focus_duration, roomId, p.user_id).run()
    }

    const { results: room } = await env.DB.prepare(
      'SELECT community_id FROM community_rooms WHERE id = ?'
    ).bind(roomId).all()
    const communityId = room[0].community_id
    const hours = Math.round(timer.focus_duration / 60) / 60
    const nowDate = new Date(now)
    const year = nowDate.getFullYear()
    const month = nowDate.getMonth() + 1

    for (const p of active) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO study_sessions_log (id, community_id, user_id, minutes, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(uuid(), communityId, p.user_id, Math.round(timer.focus_duration / 60), now).run()

      await env.DB.prepare(
        `INSERT INTO community_monthly_hours (id, community_id, user_id, year, month, total_hours, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(community_id, user_id, year, month)
         DO UPDATE SET total_hours = total_hours + ?, updated_at = ?`
      ).bind(uuid(), communityId, p.user_id, year, month, hours, now, hours, now).run()

      await env.DB.prepare(
        'UPDATE community_members SET total_study_hours = COALESCE(total_study_hours, 0) + ? WHERE community_id = ? AND user_id = ?'
      ).bind(hours, communityId, p.user_id).run()
    }

    const nextRound = (timer.round_number || 0) + 1
    const nextMode = nextRound % timer.long_break_every === 0 ? 'long_break' : 'short_break'

    await env.DB.prepare(
      'UPDATE community_room_timers SET mode = ?, round_number = ?, started_at = ?, updated_at = ? WHERE room_id = ?'
    ).bind(nextMode, nextRound, now, now, roomId).run()
  } else {
    await env.DB.prepare(
      'UPDATE community_room_timers SET mode = \'focus\', started_at = ?, updated_at = ? WHERE room_id = ?'
    ).bind(now, now, roomId).run()
  }

  const { results: updated } = await env.DB.prepare(
    'SELECT * FROM community_room_timers WHERE room_id = ?'
  ).bind(roomId).all()
  return updated[0]
}

export async function handleGetTimer(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  const now = new Date().toISOString()
  const nowMs = Date.now()

  await env.DB.prepare(
    `INSERT INTO community_room_timer_participants (room_id, user_id, joined_at, last_seen_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(room_id, user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at,
       left_at = CASE WHEN community_room_timer_participants.left_at IS NOT NULL THEN NULL ELSE community_room_timer_participants.left_at END,
       joined_at = CASE WHEN community_room_timer_participants.left_at IS NOT NULL THEN excluded.joined_at ELSE community_room_timer_participants.joined_at END`
  ).bind(roomId, user.sub, now, now).run()

  const staleCutoff = new Date(Date.now() - 60000).toISOString()
  await env.DB.prepare(
    'UPDATE community_room_timer_participants SET left_at = ? WHERE room_id = ? AND left_at IS NULL AND last_seen_at < ?'
  ).bind(now, roomId, staleCutoff).run()

  const { results: timers } = await env.DB.prepare(
    'SELECT * FROM community_room_timers WHERE room_id = ?'
  ).bind(roomId).all()

  let timer = timers[0]

  if (timer && timer.status === 'running') {
    const elapsed = timerElapsedSeconds(timer, nowMs)
    const duration = timerCurrentDuration(timer)
    if (elapsed >= duration) {
      timer = await advanceTimerMode(env, roomId, now)
    }
  }

  const { results: activeCount } = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM community_room_timer_participants WHERE room_id = ? AND left_at IS NULL'
  ).bind(roomId).all()
  const participantCount = activeCount[0]?.cnt || 0

  if (timer && participantCount === 0 && timer.status === 'running') {
    await env.DB.prepare(
      'UPDATE community_room_timers SET status = \'stopped\', mode = \'focus\', round_number = 0, started_at = NULL, total_paused_seconds = 0, last_pause_started_at = NULL, updated_at = ? WHERE room_id = ?'
    ).bind(now, roomId).run()
    const { results: reset } = await env.DB.prepare(
      'SELECT * FROM community_room_timers WHERE room_id = ?'
    ).bind(roomId).all()
    timer = reset[0]
  }

  let remaining = 0
  if (timer && timer.status === 'running') {
    const elapsed = timerElapsedSeconds(timer, nowMs)
    const duration = timerCurrentDuration(timer)
    remaining = Math.max(0, duration - elapsed)
  } else if (timer && timer.status === 'paused') {
    const elapsed = timerElapsedSeconds(timer, new Date(timer.last_pause_started_at).getTime())
    const duration = timerCurrentDuration(timer)
    remaining = Math.max(0, duration - elapsed)
  }

  const { results: participants } = await env.DB.prepare(
    'SELECT user_id, study_seconds, focus_status FROM community_room_timer_participants WHERE room_id = ? AND left_at IS NULL ORDER BY study_seconds DESC'
  ).bind(roomId).all()

  return json({
    timer: timer ? {
      status: timer.status,
      mode: timer.mode,
      round_number: timer.round_number,
      focus_duration: timer.focus_duration,
      short_break_duration: timer.short_break_duration,
      long_break_duration: timer.long_break_duration,
      long_break_every: timer.long_break_every,
      controlled_by: timer.controlled_by,
    } : null,
    remaining,
    ends_at: new Date(nowMs + remaining * 1000).toISOString(),
    server_time: now,
    participants: participants.map(p => ({ user_id: p.user_id, study_seconds: p.study_seconds, focus_status: p.focus_status })),
    participant_count: participantCount,
  })
}

export async function handleStartTimer(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.MANAGE_ROOM_TIMER)) return json({ error: 'Not authorized' }, 403)

  const { results: existing } = await env.DB.prepare(
    'SELECT status FROM community_room_timers WHERE room_id = ?'
  ).bind(roomId).all()

  if (existing.length && existing[0].status !== 'stopped') {
    return json({ error: 'Timer already running or paused. Stop it first.' }, 409)
  }

  const body = await request.json()
  const now = new Date().toISOString()

  const focus_duration = Math.max(60, Math.min(7200, Number(body.focus_duration) || 1500))
  const short_break_duration = Math.max(60, Math.min(3600, Number(body.short_break_duration) || 300))
  const long_break_duration = Math.max(60, Math.min(3600, Number(body.long_break_duration) || 900))
  const long_break_every = Math.max(1, Math.min(10, Number(body.long_break_every) || 4))

  await env.DB.prepare(
    `INSERT INTO community_room_timers (room_id, status, mode, focus_duration, short_break_duration, long_break_duration, long_break_every, round_number, started_at, controlled_by, created_at, updated_at)
     VALUES (?, 'running', 'focus', ?, ?, ?, ?, 0, ?, ?, ?, ?)
     ON CONFLICT(room_id) DO UPDATE SET status = 'running', mode = 'focus', focus_duration = excluded.focus_duration,
       short_break_duration = excluded.short_break_duration, long_break_duration = excluded.long_break_duration,
       long_break_every = excluded.long_break_every, round_number = 0, started_at = excluded.started_at,
       total_paused_seconds = 0, last_pause_started_at = NULL, controlled_by = excluded.controlled_by, updated_at = excluded.updated_at`
  ).bind(roomId, focus_duration, short_break_duration, long_break_duration, long_break_every, now, user.sub, now, now).run()

  log('timer:start', { communityId, roomId, by: user.sub })
  return json({ ok: true })
}

export async function handlePauseTimer(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.MANAGE_ROOM_TIMER)) return json({ error: 'Not authorized' }, 403)

  const { results: timers } = await env.DB.prepare(
    'SELECT status FROM community_room_timers WHERE room_id = ?'
  ).bind(roomId).all()
  if (!timers.length || timers[0].status !== 'running') return json({ error: 'Timer is not running' }, 409)

  const now = new Date().toISOString()
  await env.DB.prepare(
    'UPDATE community_room_timers SET status = \'paused\', last_pause_started_at = ?, updated_at = ? WHERE room_id = ?'
  ).bind(now, now, roomId).run()

  log('timer:pause', { communityId, roomId, by: user.sub })
  return json({ ok: true })
}

export async function handleResumeTimer(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.MANAGE_ROOM_TIMER)) return json({ error: 'Not authorized' }, 403)

  const { results: timers } = await env.DB.prepare(
    'SELECT * FROM community_room_timers WHERE room_id = ?'
  ).bind(roomId).all()
  if (!timers.length || timers[0].status !== 'paused') return json({ error: 'Timer is not paused' }, 409)

  const timer = timers[0]
  const now = new Date().toISOString()
  const nowMs = Date.now()
  const pauseStarted = new Date(timer.last_pause_started_at).getTime()
  const pauseDuration = Math.round((nowMs - pauseStarted) / 1000)

  await env.DB.prepare(
    'UPDATE community_room_timers SET status = \'running\', total_paused_seconds = total_paused_seconds + ?, last_pause_started_at = NULL, updated_at = ? WHERE room_id = ?'
  ).bind(pauseDuration, now, roomId).run()

  log('timer:resume', { communityId, roomId, by: user.sub, pauseDuration })
  return json({ ok: true })
}

const FOCUS_STATUSES = ['focusing', 'on_break', 'away', 'studying']

export async function handleUpdateFocusStatus(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const { status } = body
  if (!FOCUS_STATUSES.includes(status)) {
    return json({ error: 'Invalid status. Must be one of: focusing, on_break, away, studying' }, 400)
  }

  const { results: rows } = await env.DB.prepare(
    'SELECT 1 FROM community_room_timer_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(roomId, user.sub).all()
  if (!rows.length) return json({ error: 'Not in room' }, 404)

  await env.DB.prepare(
    'UPDATE community_room_timer_participants SET focus_status = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(status, roomId, user.sub).run()

  return json({ ok: true })
}

export async function handleStopTimer(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const roomId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)
  if (!hasPermission(member.role, PERM.MANAGE_ROOM_TIMER)) return json({ error: 'Not authorized' }, 403)

  const now = new Date().toISOString()
  await env.DB.prepare(
    'UPDATE community_room_timers SET status = \'stopped\', mode = \'focus\', round_number = 0, started_at = NULL, total_paused_seconds = 0, last_pause_started_at = NULL, updated_at = ? WHERE room_id = ?'
  ).bind(now, roomId).run()

  log('timer:stop', { communityId, roomId, by: user.sub })
  return json({ ok: true })
}
