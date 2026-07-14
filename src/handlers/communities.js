import { ROLES, PERM, hasPermission, hasMinimumRole } from '../lib/permissions.js'
import { createAuth } from '../_auth.js'
import {
  json, uuid, log, corsHeaders, safeString, pageParams, MAX, DURATIONS, ALLOWED_MIME,
  extractCommunityId, extractNestedId, generateInviteCode,
  getMember, isBanned, updateMemberCount, ensureUserProfile, mapMessage,
} from '../lib/worker-utils.js'
import { notifyCommunityAnnouncement, createNotificationIfAllowed } from './notifications.js'

function broadcastEvent(env, communityId, event) {
  try {
    const id = env.COMMUNITY_REALTIME_ROOM.idFromName(`${communityId}:v2`)
    const stub = env.COMMUNITY_REALTIME_ROOM.get(id)
    return stub.fetch('http://dummy/broadcast', {
      method: 'POST',
      body: JSON.stringify(event),
    })
  } catch {}
}

export async function handleWebSocketUpgrade(request, env) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]

  const jwt = url.searchParams.get('jwt') || request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const verifyAuth = createAuth(env)
  const user = await verifyAuth(jwt)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  try {
    const member = await getMember(env, communityId, user.sub)
    if (!member) return json({ error: 'Not a member' }, 403)
  } catch {
    return json({ error: 'Server error' }, 500)
  }

  const id = env.COMMUNITY_REALTIME_ROOM.idFromName(`${communityId}:v2`)
  const stub = env.COMMUNITY_REALTIME_ROOM.get(id)
  return stub.fetch(request)
}

/* ── Communities CRUD ── */

export async function handleListCommunities(request, env, user) {
  const url = new URL(request.url)
  const search = url.searchParams.get('search')
  const category = url.searchParams.get('category')
  const sort = url.searchParams.get('sort') || 'members'
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1)
  const limit = 20
  const offset = (page - 1) * limit

  const conditions = [`visibility = 'public'`]
  const binds = []

  if (search) {
    conditions.push(`name LIKE ?`)
    binds.push(`%${search}%`)
  }
  if (category && category !== 'all') {
    conditions.push(`category = ?`)
    binds.push(category)
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const order = sort === 'created' ? 'created_at DESC' : sort === 'activity' ? 'total_study_hours DESC' : 'member_count DESC'

  const sql = `SELECT * FROM communities ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
  binds.push(limit, offset)

  const { results } = await env.DB.prepare(sql).bind(...binds).all()

  const { results: mine } = await env.DB.prepare(
    `SELECT c.* FROM communities c JOIN community_members m ON c.id = m.community_id WHERE m.user_id = ?`
  ).bind(user.sub).all()

  const { results: categories } = await env.DB.prepare(
    `SELECT category, COUNT(*) as count FROM communities WHERE visibility = 'public' GROUP BY category ORDER BY count DESC`
  ).all()

  return json({ communities: results, mine, page, categories })
}

export async function handleCreateCommunityFromTemplate(request, env, user) {
  try {
    const body = await request.json()
    const { templateId, name, description } = body
    if (!templateId || !name) return json({ error: 'templateId and name required' }, 400)

    const templates = [
      { id: 'study-group', defaults: { rules: ['Be respectful to fellow members', 'No spam or self-promotion', 'Stay on topic — med study only', 'Use descriptive titles when asking questions'], settings: { allow_messaging: true, allow_file_sharing: true, allow_competitions: true, require_approval: false } } },
      { id: 'qbank-club', defaults: { rules: ['No sharing copyrighted question banks', 'Explain your reasoning when answering', 'Use spoiler tags for answers', 'Be constructive with corrections'], settings: { allow_messaging: true, allow_file_sharing: true, allow_competitions: false, require_approval: false } } },
      { id: 'anki-share', defaults: { rules: ['Credit original deck authors', 'No decks containing copyrighted material', 'Tag decks appropriately', 'Provide deck descriptions'], settings: { allow_messaging: true, allow_file_sharing: true, allow_competitions: false, require_approval: false } } },
      { id: 'study-buddy', defaults: { rules: ['Daily check-ins required', 'Share your goals at the start', 'No distractions — study first', 'Support your buddies'], settings: { allow_messaging: true, allow_file_sharing: false, allow_competitions: false, require_approval: true } } },
      { id: 'rotation-review', defaults: { rules: ['No patient identifiers', 'Share de-identified cases only', 'Focus on learning points', 'Include rotation type in posts'], settings: { allow_messaging: true, allow_file_sharing: true, allow_competitions: false, require_approval: false } } },
    ]

    const tmpl = templates.find(t => t.id === templateId)
    if (!tmpl) return json({ error: 'Unknown template' }, 400)

    const id = uuid()
    const now = new Date().toISOString()
    const code = generateInviteCode()
    const s = tmpl.defaults.settings
    const joinType = s.require_approval ? 'approval' : 'anyone'

    await env.DB.prepare(
      `INSERT INTO communities (id, name, description, visibility, join_type, invite_code, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'public', ?, ?, ?, ?, ?)`
    ).bind(id, name.trim(), description || '', joinType, code, user.sub, now, now).run()

    const memberId = uuid()
    await env.DB.prepare(
      'INSERT INTO community_members (id, community_id, user_id, role, joined_at) VALUES (?, ?, ?, \'administrator\', ?)'
    ).bind(memberId, id, user.sub, now).run()
    await ensureUserProfile(env, user.sub, user.email?.split('@')[0])

    const levelId = uuid()
    await env.DB.prepare(
      'INSERT INTO member_levels (id, community_id, level_name, level_number, min_hours) VALUES (?, ?, \'Member\', 1, 0)'
    ).bind(levelId, id).run()

    await env.DB.prepare(
      'UPDATE community_members SET level_id = ? WHERE id = ?'
    ).bind(levelId, memberId).run()

    await env.DB.prepare(
      `INSERT INTO community_settings (community_id, allow_file_uploads, allow_flashcards, allow_competitions, allow_member_invites, allow_announcements)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, s.allow_file_sharing ? 1 : 0, s.allow_file_sharing ? 1 : 0, s.allow_competitions ? 1 : 0, 1, 1).run()

    for (const rule of tmpl.defaults.rules) {
      await env.DB.prepare(
        'INSERT INTO community_rules (id, community_id, rule) VALUES (?, ?, ?)'
      ).bind(uuid(), id, rule).run()
    }

    await updateMemberCount(env, id)

    await env.DB.prepare(
      'INSERT INTO role_audit_log (id, community_id, target_user_id, changed_by_user_id, old_role, new_role) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(uuid(), id, user.sub, user.sub, null, 'administrator').run()

    log('community:created_from_template', { communityId: id, userId: user.sub, template: templateId })
    return json({ id, name })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function handleCreateCommunity(request, env, user) {
  const body = await request.json()
  let { name, description, visibility, join_type, category } = body
  name = safeString(name, MAX.NAME)
  description = safeString(description, MAX.DESC)
  if (!name) return json({ error: 'Name required' }, 400)
  const validCategories = ['general','clinical','exam_prep','anatomy','pharmacology','pathology','research','wellness']
  if (!validCategories.includes(category)) category = 'general'

  const id = uuid()
  const now = new Date().toISOString()
  const code = generateInviteCode()

  await env.DB.prepare(
    `INSERT INTO communities (id, name, description, visibility, join_type, invite_code, category, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, name, description, visibility || 'public', join_type || 'anyone', code, category, user.sub, now, now).run()

  const memberId = uuid()
  await env.DB.prepare(
     `INSERT INTO community_members (id, community_id, user_id, role, joined_at)
     VALUES (?, ?, ?, 'administrator', ?)`
  ).bind(memberId, id, user.sub, now).run()
  await ensureUserProfile(env, user.sub, user.email?.split('@')[0])

  const levelId = uuid()
  await env.DB.prepare(
    `INSERT INTO member_levels (id, community_id, level_name, level_number, min_hours)
     VALUES (?, ?, 'Member', 1, 0)`
  ).bind(levelId, id).run()

  await env.DB.prepare(
    `UPDATE community_members SET level_id = ? WHERE id = ?`
  ).bind(levelId, memberId).run()

  await env.DB.prepare(
    `INSERT INTO community_settings (community_id) VALUES (?)`
  ).bind(id).run()

  await updateMemberCount(env, id)

  log('community:created', { communityId: id, userId: user.sub })
  const { results } = await env.DB.prepare('SELECT * FROM communities WHERE id = ?').bind(id).all()
  return json(results[0], 201)
}

export async function handleGetCommunityFull(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const comm = await env.DB.prepare('SELECT * FROM communities WHERE id = ?').bind(communityId).all()
  if (!comm.results.length) return json({ error: 'Not found' }, 404)

  const member = await getMember(env, communityId, user?.sub)
  const isMod = member && hasMinimumRole(member.role, ROLES.MODERATOR)
  const userId = user?.sub || ''

  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE competitions SET status = 'active' WHERE community_id = ? AND status = 'pending' AND approved = 1 AND starts_at <= ?`
  ).bind(communityId, now).run()
  await env.DB.prepare(
    `UPDATE competitions SET status = 'completed' WHERE community_id = ? AND status = 'active' AND ends_at < ?`
  ).bind(communityId, now).run()

  const [membersRes, levelsRes, rulesRes, pinsRes, announcementsRes, settingsRes, compRes] = await Promise.all([
    env.DB.prepare(
      `SELECT m.*, l.level_name, u.user_name, u.avatar_url, u.username FROM community_members m
       LEFT JOIN member_levels l ON m.level_id = l.id
       LEFT JOIN user_profiles u ON m.user_id = u.user_id
       WHERE m.community_id = ? ORDER BY m.role ASC, m.total_study_hours DESC`
    ).bind(communityId).all(),

    env.DB.prepare('SELECT * FROM member_levels WHERE community_id = ? ORDER BY level_number ASC').bind(communityId).all(),

    env.DB.prepare('SELECT * FROM community_rules WHERE community_id = ? ORDER BY created_at ASC').bind(communityId).all(),

    env.DB.prepare(
      `SELECT p.*, m.content as message_content, m.user_name as message_user_name, m.created_at as message_created_at
       FROM community_pins p JOIN community_messages m ON p.message_id = m.id
       WHERE p.community_id = ? ORDER BY p.created_at DESC`
    ).bind(communityId).all(),

    env.DB.prepare('SELECT * FROM community_announcements WHERE community_id = ? ORDER BY created_at DESC').bind(communityId).all(),

    env.DB.prepare('SELECT * FROM community_settings WHERE community_id = ?').bind(communityId).all(),

    env.DB.prepare(
      `SELECT c.*,
       (SELECT COUNT(*) FROM competition_participants WHERE competition_id = c.id) as participant_count,
       (SELECT COUNT(*) FROM competition_participants WHERE competition_id = c.id AND user_id = ?) as has_joined
       FROM competitions c WHERE c.community_id = ? ORDER BY c.status ASC, c.ends_at ASC`
    ).bind(userId, communityId).all(),
  ])

  let settings = settingsRes.results[0]
  if (!settings) {
    await env.DB.prepare('INSERT INTO community_settings (community_id) VALUES (?)').bind(communityId).run()
    settings = {
      community_id: communityId, allow_file_uploads: 1, allow_flashcards: 1,
      allow_competitions: 1, allow_member_invites: 1, allow_announcements: 1, max_file_size_mb: 50
    }
  }

  let bans = []
  let joinRequests = []
  let auditLog = []
  if (isMod) {
    const [bansRes, jrRes] = await Promise.all([
      env.DB.prepare(
        `SELECT * FROM community_bans WHERE community_id = ? AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY created_at DESC`
      ).bind(communityId).all(),
      env.DB.prepare(
        `SELECT * FROM community_join_requests WHERE community_id = ? AND status = 'pending' ORDER BY created_at ASC`
      ).bind(communityId).all(),
    ])
    bans = bansRes.results
    joinRequests = jrRes.results
  }

  const isAdmin = member && hasMinimumRole(member.role, ROLES.ADMINISTRATOR)
  if (isAdmin) {
    const { results } = await env.DB.prepare(
      'SELECT * FROM role_audit_log WHERE community_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(communityId).all()
    auditLog = results
  }

  return json({
    community: comm.results[0],
    members: membersRes.results,
    levels: levelsRes.results,
    rules: rulesRes.results,
    pins: pinsRes.results,
    announcements: announcementsRes.results,
    settings,
    competitions: compRes.results,
    bans,
    joinRequests,
    auditLog,
  })
}

export async function handleGetModDashboard(request, env, user) {
  try {
    const communityId = extractCommunityId(request.url)
    if (!communityId) return json({ error: 'Missing communityId' }, 400)

    const member = await getMember(env, communityId, user.sub)
    if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR))
      return json({ error: 'Forbidden' }, 403)

    const { count: joinRequests } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM community_join_requests WHERE community_id = ? AND status = ?'
    ).bind(communityId, 'pending').first()

    const { recentBans } = await env.DB.prepare(
      'SELECT COUNT(*) as recentBans FROM community_bans WHERE community_id = ? AND created_at > datetime("now", "-7 days")'
    ).bind(communityId).first()

    const { totalMembers } = await env.DB.prepare(
      'SELECT COUNT(*) as totalMembers FROM community_members WHERE community_id = ?'
    ).bind(communityId).first()

    const { activeMembers } = await env.DB.prepare(
      'SELECT COUNT(DISTINCT user_id) as activeMembers FROM community_messages WHERE community_id = ? AND created_at > datetime("now", "-7 days")'
    ).bind(communityId).first()

    const { recentMessages } = await env.DB.prepare(
      'SELECT COUNT(*) as recentMessages FROM community_messages WHERE community_id = ? AND created_at > datetime("now", "-24 hours") AND deleted_at IS NULL'
    ).bind(communityId).first()

    return json({ joinRequests, recentBans, totalMembers, activeMembers, recentMessages })
  } catch (e) { return json({ error: e.message }, 500) }
}

export async function handleGetCommunity(request, env) {
  const id = extractCommunityId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM communities WHERE id = ?').bind(id).all()
  if (!results.length) return json({ error: 'Not found' }, 404)
  return json(results[0])
}

export async function handleUpdateCommunity(request, env, user) {
  const id = extractCommunityId(request.url)
  const member = await getMember(env, id, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const body = await request.json()
  const now = new Date().toISOString()
  const updates = []
  const binds = []

  for (const field of ['name', 'description', 'avatar_url', 'banner_url', 'visibility', 'join_type', 'category']) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`)
      binds.push(body[field])
    }
  }
  if (updates.length === 0) return json({ error: 'No fields to update' }, 400)
  updates.push(`updated_at = ?`)
  binds.push(now)
  binds.push(id)

  await env.DB.prepare(`UPDATE communities SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run()
  const { results } = await env.DB.prepare('SELECT * FROM communities WHERE id = ?').bind(id).all()
  return json(results[0])
}

export async function handleUploadCommunityAvatar(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file) return json({ error: 'File required' }, 400)
  if (!file.type.startsWith('image/')) return json({ error: 'Only images allowed' }, 400)
  if (file.size > 5 * 1024 * 1024) return json({ error: 'Image too large (max 5MB)' }, 400)

  const ext = file.name?.split('.').pop() || 'png'
  const key = `community-assets/${communityId}/avatar.${ext}`
  await env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })

  const avatarUrl = `${new URL(request.url).origin}/api/images/${key}`
  await env.DB.prepare('UPDATE communities SET avatar_url = ?, updated_at = ? WHERE id = ?')
    .bind(avatarUrl, new Date().toISOString(), communityId).run()

  log('community:avatar', { communityId, by: user.sub })
  return json({ success: true, avatar_url: avatarUrl })
}

export async function handleUploadCommunityBanner(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file) return json({ error: 'File required' }, 400)
  if (!file.type.startsWith('image/')) return json({ error: 'Only images allowed' }, 400)
  if (file.size > 10 * 1024 * 1024) return json({ error: 'Image too large (max 10MB)' }, 400)

  const ext = file.name?.split('.').pop() || 'png'
  const key = `community-assets/${communityId}/banner.${ext}`
  await env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })

  const bannerUrl = `${new URL(request.url).origin}/api/images/${key}`
  await env.DB.prepare('UPDATE communities SET banner_url = ?, updated_at = ? WHERE id = ?')
    .bind(bannerUrl, new Date().toISOString(), communityId).run()

  log('community:banner', { communityId, by: user.sub })
  return json({ success: true, banner_url: bannerUrl })
}

export async function handleDeleteCommunity(request, env, user) {
  const id = extractCommunityId(request.url)
  const member = await getMember(env, id, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM communities WHERE id = ?').bind(id).run()
  log('community:deleted', { communityId: id, userId: user.sub })
  return json({ success: true })
}

/* ── Join / Leave ── */

export async function handleJoinCommunity(request, env, user, ctx) {
  const communityId = extractCommunityId(request.url)

  if (await isBanned(env, communityId, user.sub)) return json({ error: 'You are banned from this community' }, 403)

  const { results: comm } = await env.DB.prepare('SELECT * FROM communities WHERE id = ?').bind(communityId).all()
  if (!comm.length) return json({ error: 'Community not found' }, 404)
  const community = comm[0]

  const existing = await getMember(env, communityId, user.sub)
  if (existing) return json({ error: 'Already a member' }, 409)

  if (community.join_type === 'approval') {
    const existingReq = await env.DB.prepare(
      'SELECT * FROM community_join_requests WHERE community_id = ? AND user_id = ?'
    ).bind(communityId, user.sub).all()
    if (existingReq.results.length) return json({ error: 'Already requested' }, 409)

    await env.DB.prepare(
      'INSERT INTO community_join_requests (id, community_id, user_id) VALUES (?, ?, ?)'
    ).bind(uuid(), communityId, user.sub).run()
    return json({ success: true, requires_approval: true })
  }

  if (community.join_type === 'invite_only') return json({ error: 'This community is invite only' }, 403)

  const memberId = uuid()
  const now = new Date().toISOString()

  let levelId = null
  const { results: levels } = await env.DB.prepare(
    'SELECT id FROM member_levels WHERE community_id = ? ORDER BY level_number ASC LIMIT 1'
  ).bind(communityId).all()
  if (levels.length) levelId = levels[0].id

  await env.DB.prepare(
    'INSERT INTO community_members (id, community_id, user_id, level_id, joined_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(memberId, communityId, user.sub, levelId, now).run()
  await ensureUserProfile(env, user.sub, user.email?.split('@')[0])

  await updateMemberCount(env, communityId)

  await env.DB.prepare(
    `INSERT INTO community_messages (id, community_id, user_id, user_name, content, message_type, created_at)
     VALUES (?, ?, ?, ?, ?, 'system', ?)`
  ).bind(uuid(), communityId, user.sub, user.email || 'Someone', `${user.email?.split('@')[0] || 'Someone'} joined the community`, now).run()

  ctx.waitUntil((async () => {
    const ownerMember = await env.DB.prepare(
      'SELECT user_id FROM community_members WHERE community_id = ? AND role = ?'
    ).bind(communityId, 'owner').first()
    if (ownerMember && ownerMember.user_id !== user.sub) {
      const nid = crypto.randomUUID()
      await env.DB.prepare(
        'INSERT INTO notifications (id, user_id, type, title, body, data, priority, category, action_url, action_label, group_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(nid, ownerMember.user_id, 'member_joined', (user.email?.split('@')[0] || 'Someone') + ' joined', '', JSON.stringify({ community_id: communityId }), 'info', 'community', '/communities/' + communityId, 'View Community', null).run()
    }
  })())

  return json({ success: true })
}

export async function handleJoinByCode(request, env, user) {
  const { code } = await request.json()
  if (!code) return json({ error: 'Code required' }, 400)

  const { results } = await env.DB.prepare(
    'SELECT * FROM communities WHERE invite_code = ?'
  ).bind(code.toUpperCase()).all()
  if (!results.length) return json({ error: 'Invalid invite code' }, 404)

  const community = results[0]
  if (await isBanned(env, community.id, user.sub)) return json({ error: 'You are banned from this community' }, 403)

  const existing = await getMember(env, community.id, user.sub)
  if (existing) return json({ error: 'Already a member' }, 409)

  const memberId = uuid()
  const now = new Date().toISOString()

  let levelId = null
  const { results: levels } = await env.DB.prepare(
    'SELECT id FROM member_levels WHERE community_id = ? ORDER BY level_number ASC LIMIT 1'
  ).bind(community.id).all()
  if (levels.length) levelId = levels[0].id

  await env.DB.prepare(
    'INSERT INTO community_members (id, community_id, user_id, level_id, joined_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(memberId, community.id, user.sub, levelId, now).run()
  await ensureUserProfile(env, user.sub, user.email?.split('@')[0])

  await updateMemberCount(env, community.id)

  await env.DB.prepare(
    `INSERT INTO community_messages (id, community_id, user_id, user_name, content, message_type, created_at)
     VALUES (?, ?, ?, ?, ?, 'system', ?)`
  ).bind(uuid(), community.id, user.sub, user.email || 'Someone', `${user.email?.split('@')[0] || 'Someone'} joined the community`, now).run()

  return json({ community })
}

export async function handleResolveInviteCode(request, env) {
  const code = extractCommunityId(request.url)
  const { results } = await env.DB.prepare(
    'SELECT id, name, description, avatar_url, member_count FROM communities WHERE invite_code = ?'
  ).bind(code.toUpperCase()).all()
  if (!results.length) return json({ error: 'Invalid code' }, 404)
  return json(results[0])
}

export async function handleLeaveCommunity(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 404)
  if (hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) {
    const { results } = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM community_members WHERE community_id = ? AND role = \'administrator\''
    ).bind(communityId).all()
    if (Number(results[0].cnt) <= 1) return json({ error: 'Transfer ownership before leaving' }, 400)
  }

  await env.DB.prepare('DELETE FROM community_members WHERE id = ?').bind(member.id).run()
  await updateMemberCount(env, communityId)
  return json({ success: true })
}

export async function handleRegenerateInviteCode(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const code = generateInviteCode()
  await env.DB.prepare(
    'UPDATE communities SET invite_code = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(code, communityId).run()
  return json({ invite_code: code })
}

/* ── Members ── */

export async function handleListMembers(request, env) {
  const communityId = extractCommunityId(request.url)
  const url = new URL(request.url)
  const q = url.searchParams.get('q')
  const { offset, limit } = pageParams(request.url)
  let sql, binds
  if (q) {
    sql = `SELECT m.*, l.level_name, u.user_name, u.avatar_url FROM community_members m
     LEFT JOIN member_levels l ON m.level_id = l.id
     LEFT JOIN user_profiles u ON m.user_id = u.user_id
     WHERE m.community_id = ? AND u.user_name LIKE ? ORDER BY m.role ASC, m.total_study_hours DESC LIMIT ? OFFSET ?`
    binds = [communityId, `%${q}%`, limit, offset]
  } else {
    sql = `SELECT m.*, l.level_name, u.user_name, u.avatar_url FROM community_members m
     LEFT JOIN member_levels l ON m.level_id = l.id
     LEFT JOIN user_profiles u ON m.user_id = u.user_id
     WHERE m.community_id = ? ORDER BY m.role ASC, m.total_study_hours DESC LIMIT ? OFFSET ?`
    binds = [communityId, limit, offset]
  }
  const { results } = await env.DB.prepare(sql).bind(...binds).all()
  return json(results)
}

export async function handleRemoveMember(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const targetUserId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)
  if (user.sub === targetUserId) return json({ error: 'Cannot remove yourself' }, 400)

  await env.DB.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').bind(communityId, targetUserId).run()
  await updateMemberCount(env, communityId)
  return json({ success: true })
}

export async function handleChangeMemberRole(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const targetUserId = extractNestedId(request.url, 5)
  const { role } = await request.json()

  const ALLOWED = [ROLES.MEMBER, ROLES.SCHOLAR, ROLES.MENTOR, ROLES.MODERATOR, ROLES.ADMINISTRATOR]
  if (!ALLOWED.includes(role)) {
    return json({ error: 'Invalid role' }, 400)
  }

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  const target = await getMember(env, communityId, targetUserId)
  const oldRole = target?.role || null

  await env.DB.prepare('UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?').bind(role, communityId, targetUserId).run()

  await env.DB.prepare(
    'INSERT INTO role_audit_log (id, community_id, target_user_id, changed_by_user_id, old_role, new_role) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uuid(), communityId, targetUserId, user.sub, oldRole, role).run()

  log('member:role_changed', { communityId, targetId: targetUserId, oldRole, newRole: role, by: user.sub })
  return json({ success: true })
}

export async function handleAssignLevel(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const targetUserId = extractNestedId(request.url, 5)
  const { level_id } = await request.json()

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  if (level_id) {
    const { results } = await env.DB.prepare('SELECT id FROM member_levels WHERE id = ? AND community_id = ?').bind(level_id, communityId).all()
    if (!results.length) return json({ error: 'Level not found' }, 404)
  }

  await env.DB.prepare('UPDATE community_members SET level_id = ? WHERE community_id = ? AND user_id = ?').bind(level_id || null, communityId, targetUserId).run()
  return json({ success: true })
}

export async function handleUpdateReadState(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const targetUserId = extractNestedId(request.url, 5)
  if (targetUserId !== user.sub) return json({ error: 'Not authorized' }, 403)
  const { last_read_message_id } = await request.json()

  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 404)

  await env.DB.prepare(
    `INSERT INTO community_member_state (member_id, last_read_message_id, last_seen_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(member_id) DO UPDATE SET last_read_message_id = ?, last_seen_at = datetime('now')`
  ).bind(member.id, last_read_message_id || null, last_read_message_id || null).run()
  return json({ success: true })
}

/* ── Bans ── */

export async function handleBanMember(request, env, user) {
  const communityId = extractCommunityId(request.url)
  let { user_id, reason, expires_at } = await request.json()
  if (!user_id) return json({ error: 'user_id required' }, 400)
  reason = safeString(reason, MAX.REASON)

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').bind(communityId, user_id).run()
  await env.DB.prepare(
    'INSERT INTO community_bans (id, community_id, user_id, reason, banned_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uuid(), communityId, user_id, reason, user.sub, expires_at || null).run()
  await updateMemberCount(env, communityId)
  log('member:banned', { communityId, targetId: user_id, by: user.sub })
  return json({ success: true })
}

export async function handleListBans(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    `SELECT cb.*, u.user_name FROM community_bans cb
     LEFT JOIN user_profiles u ON cb.user_id = u.user_id
     WHERE cb.community_id = ? AND (cb.expires_at IS NULL OR cb.expires_at > datetime('now'))
     ORDER BY cb.created_at DESC LIMIT ? OFFSET ?`
  ).bind(communityId, limit, offset).all()
  return json(results)
}

export async function handleRemoveBan(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const banId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM community_bans WHERE id = ? AND community_id = ?').bind(banId, communityId).run()
  return json({ success: true })
}

export async function handleRestoreBan(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const banId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const { results } = await env.DB.prepare('SELECT * FROM community_bans WHERE id = ? AND community_id = ?').bind(banId, communityId).all()
  if (!results.length) return json({ error: 'Ban not found' }, 404)
  const ban = results[0]

  await env.DB.prepare(
    'INSERT OR IGNORE INTO community_members (id, community_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).bind(uuid(), communityId, ban.user_id, ROLES.MEMBER).run()
  await ensureUserProfile(env, ban.user_id, null)

  await env.DB.prepare('DELETE FROM community_bans WHERE id = ? AND community_id = ?').bind(banId, communityId).run()
  await updateMemberCount(env, communityId)
  log('member:restored', { communityId, targetId: ban.user_id, by: user.sub })
  return json({ success: true })
}

export async function handleListAuditLog(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    'SELECT * FROM role_audit_log WHERE community_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(communityId, limit, offset).all()
  return json(results)
}

/* ── Join Requests ── */

export async function handleListJoinRequests(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const { results } = await env.DB.prepare(
    'SELECT * FROM community_join_requests WHERE community_id = ? AND status = \'pending\' ORDER BY created_at ASC'
  ).bind(communityId).all()
  return json(results)
}

export async function handleUpdateJoinRequest(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const reqId = extractNestedId(request.url, 5)
  const { status } = await request.json()
  if (!['approved', 'rejected'].includes(status)) return json({ error: 'Invalid status' }, 400)

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const { results } = await env.DB.prepare(
    'SELECT * FROM community_join_requests WHERE id = ? AND community_id = ?'
  ).bind(reqId, communityId).all()
  if (!results.length) return json({ error: 'Request not found' }, 404)

  if (status === 'approved') {
    const now = new Date().toISOString()
    let levelId = null
    const { results: levels } = await env.DB.prepare(
      'SELECT id FROM member_levels WHERE community_id = ? ORDER BY level_number ASC LIMIT 1'
    ).bind(communityId).all()
    if (levels.length) levelId = levels[0].id

    await env.DB.prepare(
      'INSERT INTO community_members (id, community_id, user_id, level_id, joined_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(uuid(), communityId, results[0].user_id, levelId, now).run()
    await ensureUserProfile(env, results[0].user_id, null)
    await updateMemberCount(env, communityId)
  }

  await env.DB.prepare('UPDATE community_join_requests SET status = ? WHERE id = ?').bind(status, reqId).run()
  return json({ success: true })
}

/* ── Rules ── */

export async function handleListRules(request, env) {
  const communityId = extractCommunityId(request.url)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM community_rules WHERE community_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?').bind(communityId, limit, offset).all()
  return json(results)
}

export async function handleAddRule(request, env, user) {
  const communityId = extractCommunityId(request.url)
  let { rule } = await request.json()
  rule = safeString(rule, MAX.RULE)
  if (!rule) return json({ error: 'Rule text required' }, 400)

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('INSERT INTO community_rules (id, community_id, rule) VALUES (?, ?, ?)').bind(uuid(), communityId, rule).run()
  const { results } = await env.DB.prepare('SELECT * FROM community_rules WHERE community_id = ? ORDER BY created_at ASC').bind(communityId).all()
  return json(results, 201)
}

export async function handleRemoveRule(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const ruleId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM community_rules WHERE id = ? AND community_id = ?').bind(ruleId, communityId).run()
  return json({ success: true })
}

export function handleSuggestedRules() {
  return json([
    { id: 'public', label: 'Public — anyone can find and join', field: 'visibility', value: 'public' },
    { id: 'private', label: 'Private — only visible to members', field: 'visibility', value: 'private' },
    { id: 'approval', label: 'Require admin approval to join', field: 'join_type', value: 'approval' },
    { id: 'invite_code', label: 'Require invite code to join', field: 'join_type', value: 'code' },
    { id: 'respect', label: 'Be respectful and professional to all members' },
    { id: 'no_spam', label: 'No spamming or self-promotion' },
    { id: 'appropriate', label: 'No inappropriate content or language' },
    { id: 'honest_hours', label: 'Study hours must be tracked honestly' },
  ])
}

/* ── Settings ── */

export async function handleGetSettings(request, env) {
  const communityId = extractCommunityId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM community_settings WHERE community_id = ?').bind(communityId).all()
  if (!results.length) {
    await env.DB.prepare('INSERT INTO community_settings (community_id) VALUES (?)').bind(communityId).run()
    return json({
      community_id: communityId, allow_file_uploads: 1, allow_flashcards: 1,
      allow_competitions: 1, allow_member_invites: 1, allow_announcements: 1, max_file_size_mb: 50
    })
  }
  return json(results[0])
}

export async function handleUpdateSettings(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  const body = await request.json()
  const fields = ['allow_file_uploads', 'allow_flashcards', 'allow_competitions', 'allow_member_invites', 'allow_announcements', 'max_file_size_mb']
  const updates = []
  const binds = []

  for (const f of fields) {
    if (body[f] !== undefined) {
      updates.push(`${f} = ?`)
      binds.push(body[f])
    }
  }
  if (updates.length === 0) return json({ error: 'No fields to update' }, 400)
  updates.push("updated_at = datetime('now')")
  binds.push(communityId)

  await env.DB.prepare(`UPDATE community_settings SET ${updates.join(', ')} WHERE community_id = ?`).bind(...binds).run()
  const { results } = await env.DB.prepare('SELECT * FROM community_settings WHERE community_id = ?').bind(communityId).all()
  return json(results[0])
}

/* ── Messages ── */

export async function handleGetMessages(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not authorized', reason: 'membership_required' }, 403)
  const url = new URL(request.url)
  const after = url.searchParams.get('after')
  const q = url.searchParams.get('q')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)

  let sql, binds
  if (q) {
    sql = `SELECT m.*, mem.role as user_role FROM community_messages m LEFT JOIN community_members mem ON m.user_id = mem.user_id AND m.community_id = mem.community_id WHERE m.community_id = ? AND m.deleted_at IS NULL AND m.content LIKE ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?`
    binds = [communityId, `%${q}%`, limit]
  } else if (after) {
    sql = `SELECT m.*, mem.role as user_role FROM community_messages m LEFT JOIN community_members mem ON m.user_id = mem.user_id AND m.community_id = mem.community_id WHERE m.community_id = ? AND m.created_at > (SELECT created_at FROM community_messages WHERE id = ?) AND m.deleted_at IS NULL ORDER BY m.created_at ASC, m.id ASC LIMIT ?`
    binds = [communityId, after, limit]
  } else {
    sql = `SELECT m.*, mem.role as user_role FROM community_messages m LEFT JOIN community_members mem ON m.user_id = mem.user_id AND m.community_id = mem.community_id WHERE m.community_id = ? AND m.deleted_at IS NULL ORDER BY m.created_at ASC, m.id ASC LIMIT ?`
    binds = [communityId, limit]
  }

  const { results } = await env.DB.prepare(sql).bind(...binds).all()
  return json(results.map(mapMessage))
}

export async function handleGetMessageHistory(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not authorized', reason: 'membership_required' }, 403)
  const url = new URL(request.url)
  const before = url.searchParams.get('before')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)

  let sql, binds
  if (before) {
    sql = `SELECT m.*, mem.role as user_role FROM community_messages m LEFT JOIN community_members mem ON m.user_id = mem.user_id AND m.community_id = mem.community_id WHERE m.community_id = ? AND m.id < ? AND m.deleted_at IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT ?`
    binds = [communityId, before, limit]
  } else {
    sql = `SELECT m.*, mem.role as user_role FROM community_messages m LEFT JOIN community_members mem ON m.user_id = mem.user_id AND m.community_id = mem.community_id WHERE m.community_id = ? AND m.deleted_at IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT ?`
    binds = [communityId, limit]
  }

  const { results } = await env.DB.prepare(sql).bind(...binds).all()
  return json(results.reverse().map(mapMessage))
}

export async function handleSendMessage(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member', reason: 'membership_required' }, 403)

  let { content } = await request.json()
  content = safeString(content, MAX.CONTENT)
  if (!content) return json({ error: 'Content required' }, 400)

  const id = uuid()
  const now = new Date().toISOString()
  const userName = user.email?.split('@')[0] || 'User'

  await env.DB.prepare(
    'INSERT INTO community_messages (id, community_id, user_id, user_name, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, communityId, user.sub, userName, content, now).run()

  log('message:sent', { communityId, userId: user.sub, msgId: id })
  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'message:new',
    payload: { message: { id, community_id: communityId, user_id: user.sub, user_name: userName, content, created_at: now, message_type: 'text', is_edited: 0, user_role: member.role } }
  }).catch(() => {})
  return json({ id, success: true }, 201)
}

export async function handleSendFileMessage(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member', reason: 'membership_required' }, 403)
  if (!hasPermission(member.role, PERM.UPLOAD_FILES)) return json({ error: 'Your role does not allow file uploads' }, 403)

  const { results: settings } = await env.DB.prepare('SELECT * FROM community_settings WHERE community_id = ?').bind(communityId).all()
  if (settings.length && !settings[0].allow_file_uploads) return json({ error: 'File uploads disabled' }, 403)

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file) return json({ error: 'File required' }, 400)

  const maxMB = settings.length ? settings[0].max_file_size_mb : 50
  const maxBytes = maxMB * 1024 * 1024
  if (file.size > maxBytes) return json({ error: `File too large (max ${maxMB}MB)` }, 400)

  const maxForMime = ALLOWED_MIME[file.type]
  if (!maxForMime) return json({ error: 'File type not allowed' }, 400)

  const ext = file.name?.split('.').pop() || 'bin'
  const fileKey = `community-files/${uuid()}.${ext}`
  await env.IMAGES.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' }
  })

  const id = uuid()
  const now = new Date().toISOString()
  const userName = user.email?.split('@')[0] || 'User'

  await env.DB.prepare(
    `INSERT INTO community_messages (id, community_id, user_id, user_name, content, message_type, file_key, file_name, file_size, mime_type, created_at)
     VALUES (?, ?, ?, ?, ?, 'file', ?, ?, ?, ?, ?)`
  ).bind(id, communityId, user.sub, userName, file.name, fileKey, file.name, file.size, file.type, now).run()

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'message:new',
    payload: { message: { id, community_id: communityId, user_id: user.sub, user_name: userName, content: file.name, created_at: now, message_type: 'file', is_edited: 0 } }
  }).catch(() => {})
  return json({ id, success: true }, 201)
}

export async function handleListCommunityFiles(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, user_name, file_name, file_size, mime_type, created_at FROM community_messages WHERE community_id = ? AND message_type = 'file' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(communityId, limit, offset).all()

  return json(results)
}

export async function handleGetMessageFile(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const msgId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not authorized', reason: 'membership_required' }, 403)

  const { results } = await env.DB.prepare(
    'SELECT * FROM community_messages WHERE id = ? AND community_id = ? AND message_type = ? AND deleted_at IS NULL'
  ).bind(msgId, communityId, 'file').all()
  if (!results.length) return json({ error: 'File not found' }, 404)

  const msg = results[0]
  if (!msg.file_key) return json({ error: 'No file key' }, 404)

  const obj = await env.IMAGES.get(msg.file_key)
  if (!obj) return json({ error: 'File not found in storage' }, 404)

  const headers = new Headers()
  headers.set('content-type', msg.mime_type || 'application/octet-stream')
  headers.set('content-disposition', `inline; filename="${msg.file_name}"`)
  headers.set('cache-control', 'public, max-age=31536000')

  return new Response(obj.body, { headers })
}

export async function handleSendFlashcardMessage(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member', reason: 'membership_required' }, 403)

  const { results: settings } = await env.DB.prepare('SELECT * FROM community_settings WHERE community_id = ?').bind(communityId).all()
  if (settings.length && !settings[0].allow_flashcards) return json({ error: 'Flashcard sharing disabled' }, 403)

  let { front, back, image_url, tags, deck_name } = await request.json()
  front = safeString(front, MAX.CONTENT)
  back = safeString(back, MAX.CONTENT)
  if (!front || !back) return json({ error: 'Front and back required' }, 400)
  deck_name = safeString(deck_name, MAX.NAME)

  const msgId = uuid()
  const now = new Date().toISOString()
  const userName = user.email?.split('@')[0] || 'User'

  await env.DB.prepare(
    `INSERT INTO community_messages (id, community_id, user_id, user_name, content, message_type, created_at)
     VALUES (?, ?, ?, ?, ?, 'flashcard', ?)`
  ).bind(msgId, communityId, user.sub, userName, deck_name || '', now).run()

  const cardId = uuid()
  await env.DB.prepare(
    `INSERT INTO community_message_flashcards (id, message_id, front, back, image_url, tags)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(cardId, msgId, front, back, image_url || null, tags || null).run()

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'message:new',
    payload: { message: { id: msgId, community_id: communityId, user_id: user.sub, user_name: userName, content: deck_name || '', created_at: now, message_type: 'flashcard', is_edited: 0 } }
  }).catch(() => {})
  return json({ id: msgId, flashcard_id: cardId, success: true }, 201)
}

export async function handleEditMessage(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const msgId = extractNestedId(request.url, 5)
  let { content } = await request.json()
  content = safeString(content, MAX.CONTENT)
  if (!content) return json({ error: 'Content required' }, 400)

  const { results } = await env.DB.prepare(
    'SELECT * FROM community_messages WHERE id = ? AND community_id = ? AND deleted_at IS NULL'
  ).bind(msgId, communityId).all()
  if (!results.length) return json({ error: 'Message not found' }, 404)

  const msg = results[0]
  if (msg.user_id !== user.sub && msg.message_type !== 'system') return json({ error: 'Not authorized', reason: 'not_owner' }, 403)

  const created = new Date(msg.created_at.replace(' ', 'T') + 'Z').getTime()
  const now = Date.now()
  if (now - created > 15 * 60 * 1000) return json({ error: 'Edit window expired (15 min)' }, 400)

  await env.DB.prepare(
    'UPDATE community_messages SET content = ?, is_edited = 1 WHERE id = ?'
  ).bind(content, msgId).run()

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'message:edit',
    payload: { id: msgId, new_content: content }
  }).catch(() => {})
  return json({ success: true })
}

export async function handleDeleteMessage(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const msgId = extractNestedId(request.url, 5)

  const { results } = await env.DB.prepare(
    'SELECT * FROM community_messages WHERE id = ? AND community_id = ? AND deleted_at IS NULL'
  ).bind(msgId, communityId).all()
  if (!results.length) return json({ error: 'Message not found' }, 404)

  const member = await getMember(env, communityId, user.sub)
  const isOwner = results[0].user_id === user.sub
  const isMod = member && hasMinimumRole(member.role, ROLES.MODERATOR)
  if (!isOwner && !isMod) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare(
    'UPDATE community_messages SET deleted_at = datetime(\'now\'), deleted_by = ?, content = NULL WHERE id = ?'
  ).bind(user.sub, msgId).run()

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'message:delete',
    payload: { id: msgId }
  }).catch(() => {})
  log('message:deleted', { communityId, msgId, userId: user.sub })
  return json({ success: true })
}

export async function handleAddFlashcardToDeck(request, env, user) {
  const msgId = extractNestedId(request.url, 4)

  const { results: fc } = await env.DB.prepare(
    'SELECT * FROM community_message_flashcards WHERE message_id = ?'
  ).bind(msgId).all()
  if (!fc.length) return json({ error: 'Flashcard not found' }, 404)

  const { results: msg } = await env.DB.prepare(
    'SELECT * FROM community_messages WHERE id = ? AND deleted_at IS NULL'
  ).bind(msgId).all()
  if (!msg.length) return json({ error: 'Message not found' }, 404)

  const deckName = msg[0].content || 'Community Shared'
  const now = new Date().toISOString()
  const cardId = uuid()

  await env.DB.prepare(
    `INSERT INTO flashcards (id, user_id, deck_name, front, back, image_url, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(cardId, user.sub, deckName, fc[0].front, fc[0].back, fc[0].image_url, fc[0].tags, now).run()

  return json({ success: true, flashcard_id: cardId })
}

/* ── Reactions ── */

export async function handleToggleReaction(request, env, user) {
  const parts = new URL(request.url).pathname.split('/')
  const msgId = parts[5]
  const { emoji } = await request.json()
  if (!emoji) return json({ error: 'Emoji required' }, 400)

  const { results: existing } = await env.DB.prepare(
    'SELECT id FROM community_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
  ).bind(msgId, user.sub, emoji).all()

  if (existing.length) {
    await env.DB.prepare('DELETE FROM community_message_reactions WHERE id = ?').bind(existing[0].id).run()
    return json({ action: 'removed' })
  }

  await env.DB.prepare(
    'INSERT INTO community_message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)'
  ).bind(uuid(), msgId, user.sub, emoji).run()

  return json({ action: 'added' })
}

/* ── Pins ── */

export async function handleListPins(request, env) {
  const communityId = extractCommunityId(request.url)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    `SELECT p.*, m.content as message_content, m.user_name as message_user_name, m.created_at as message_created_at
     FROM community_pins p JOIN community_messages m ON p.message_id = m.id
     WHERE p.community_id = ? ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).bind(communityId, limit, offset).all()
  return json(results)
}

export async function handlePinMessage(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const { message_id } = await request.json()
  if (!message_id) return json({ error: 'message_id required' }, 400)

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const pinId = uuid()
  await env.DB.prepare(
    'INSERT INTO community_pins (id, community_id, message_id, pinned_by) VALUES (?, ?, ?, ?)'
  ).bind(pinId, communityId, message_id, user.sub).run()

  const { results: msgInfo } = await env.DB.prepare(
    'SELECT content, user_name FROM community_messages WHERE id = ?'
  ).bind(message_id).all()

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'pin:new',
    payload: { pin: { id: pinId, community_id: communityId, message_id, pinned_by: user.sub, created_at: new Date().toISOString(), message_content: msgInfo[0]?.content || '', message_user_name: msgInfo[0]?.user_name || '' } }
  }).catch(() => {})

  return json({ success: true, pin_id: pinId }, 201)
}

export async function handleUnpinMessage(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const pinId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM community_pins WHERE id = ? AND community_id = ?').bind(pinId, communityId).run()

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'pin:remove',
    payload: { pin_id: pinId }
  }).catch(() => {})

  return json({ success: true })
}

/* ── Announcements ── */

export async function handleListAnnouncements(request, env) {
  const communityId = extractCommunityId(request.url)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    'SELECT * FROM community_announcements WHERE community_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(communityId, limit, offset).all()
  return json(results)
}

export async function handleCreateAnnouncement(request, env, user) {
  const communityId = extractCommunityId(request.url)
  let { title, content } = await request.json()
  title = safeString(title, MAX.TITLE)
  content = safeString(content, MAX.CONTENT)
  if (!title || !content) return json({ error: 'Title and content required' }, 400)

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const annId = uuid()
  await env.DB.prepare(
    'INSERT INTO community_announcements (id, community_id, title, content, created_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(annId, communityId, title, content, user.sub).run()

  const announcement = {
    id: annId, community_id: communityId, title, content,
    created_by: user.sub,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'announcement:new',
    payload: { announcement }
  }).catch(() => {})

  // Notify all community members
  const { results: commRow } = await env.DB.prepare('SELECT name FROM communities WHERE id = ?').bind(communityId).all()
  const { results: authorRow } = await env.DB.prepare('SELECT user_name FROM user_profiles WHERE user_id = ?').bind(user.sub).all()
  notifyCommunityAnnouncement(env, communityId, commRow[0]?.name || 'Community', title, annId, authorRow[0]?.user_name || 'Someone').catch(() => {})

  return json(announcement, 201)
}

export async function handleUpdateAnnouncement(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const annId = extractNestedId(request.url, 5)
  let { title, content } = await request.json()

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const updates = []
  const binds = []
  if (title !== undefined) { title = safeString(title, MAX.TITLE); updates.push('title = ?'); binds.push(title) }
  if (content !== undefined) { content = safeString(content, MAX.CONTENT); updates.push('content = ?'); binds.push(content) }
  if (updates.length === 0) return json({ error: 'No fields to update' }, 400)

  updates.push("updated_at = datetime('now')")
  binds.push(annId, communityId)

  await env.DB.prepare(`UPDATE community_announcements SET ${updates.join(', ')} WHERE id = ? AND community_id = ?`).bind(...binds).run()

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'announcement:update',
    payload: { announcement: { id: annId, community_id: communityId, title, content } }
  }).catch(() => {})

  return json({ success: true })
}

export async function handleDeleteAnnouncement(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const annId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM community_announcements WHERE id = ? AND community_id = ?').bind(annId, communityId).run()

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'announcement:delete',
    payload: { announcement_id: annId }
  }).catch(() => {})

  return json({ success: true })
}

/* ── Member Levels ── */

export async function handleListLevels(request, env) {
  const communityId = extractCommunityId(request.url)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    'SELECT * FROM member_levels WHERE community_id = ? ORDER BY level_number ASC LIMIT ? OFFSET ?'
  ).bind(communityId, limit, offset).all()
  return json(results)
}

export async function handleCreateLevel(request, env, user) {
  const communityId = extractCommunityId(request.url)
  let { level_name, level_number, min_hours, permissions } = await request.json()
  level_name = safeString(level_name, MAX.NAME)
  if (!level_name || !level_number) return json({ error: 'Name and level number required' }, 400)

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  const id = uuid()
  const p = permissions || {}
  await env.DB.prepare(
    `INSERT INTO member_levels (id, community_id, level_name, level_number, min_hours, can_invite, can_create_competition, can_pin_messages, can_upload_files, can_remove_members)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, communityId, level_name, level_number, min_hours || 0,
    p.can_invite ? 1 : 0, p.can_create_competition ? 1 : 0, p.can_pin_messages ? 1 : 0,
    p.can_upload_files !== false ? 1 : 0, p.can_remove_members ? 1 : 0).run()

  const { results } = await env.DB.prepare('SELECT * FROM member_levels WHERE id = ?').bind(id).all()
  return json(results[0], 201)
}

export async function handleUpdateLevel(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const levelId = extractNestedId(request.url, 5)
  const body = await request.json()

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  const fields = ['level_name', 'level_number', 'min_hours', 'can_invite', 'can_create_competition', 'can_pin_messages', 'can_upload_files', 'can_remove_members']
  const updates = []
  const binds = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      const val = f === 'level_name' ? safeString(body[f], MAX.NAME) : body[f]
      updates.push(`${f} = ?`); binds.push(val)
    }
  }
  if (updates.length === 0) return json({ error: 'No fields to update' }, 400)
  updates.push("updated_at = datetime('now')")
  binds.push(levelId, communityId)

  await env.DB.prepare(`UPDATE member_levels SET ${updates.join(', ')} WHERE id = ? AND community_id = ?`).bind(...binds).run()
  return json({ success: true })
}

export async function handleDeleteLevel(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const levelId = extractNestedId(request.url, 5)

  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  const { results } = await env.DB.prepare('SELECT COUNT(*) as cnt FROM community_members WHERE level_id = ?').bind(levelId).all()
  if (Number(results[0].cnt) > 0) return json({ error: 'Members assigned to this level; reassign them first' }, 400)

  await env.DB.prepare('DELETE FROM member_levels WHERE id = ? AND community_id = ?').bind(levelId, communityId).run()
  return json({ success: true })
}

/* ── Competitions ── */

export async function handleListCompetitions(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE competitions SET status = 'active' WHERE community_id = ? AND status = 'pending' AND approved = 1 AND starts_at <= ?`
  ).bind(communityId, now).run()
  await env.DB.prepare(
    `UPDATE competitions SET status = 'completed' WHERE community_id = ? AND status = 'active' AND ends_at < ?`
  ).bind(communityId, now).run()

  const member = await getMember(env, communityId, user?.sub)
  const isMod = member && hasMinimumRole(member.role, ROLES.MODERATOR)
  const userId = user?.sub || ''

  const { offset, limit } = pageParams(request.url)
  const search = new URL(request.url).searchParams.get('search') || ''
  let sql = `SELECT c.*,
    (SELECT COUNT(*) FROM competition_participants WHERE competition_id = c.id) as participant_count,
    (SELECT COUNT(*) FROM competition_participants WHERE competition_id = c.id AND user_id = ?) as has_joined
    FROM competitions c WHERE c.community_id = ?`
  const params = [userId, communityId]
  if (!isMod) {
    sql += ' AND (c.status != \'rejected\' OR c.created_by = ?)'
    params.push(userId)
  }
  if (search) { sql += ' AND c.title LIKE ?'; params.push('%' + search + '%') }
  sql += ' ORDER BY c.status ASC, c.ends_at ASC LIMIT ? OFFSET ?'
  params.push(limit, offset)
  const { results } = await env.DB.prepare(sql).bind(...params).all()
  return json(results)
}

export async function handleCreateCompetition(request, env, user, ctx) {
  const communityId = extractCommunityId(request.url)
  let { title, description, duration } = await request.json()
  title = safeString(title, MAX.TITLE)
  description = safeString(description, MAX.DESC)
  if (!title || !duration) return json({ error: 'Title and duration required' }, 400)
  if (!DURATIONS.includes(duration)) return json({ error: 'Invalid duration' }, 400)

  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member', reason: 'membership_required' }, 403)

  const durationMap = { '1_week': 7, '1_month': 30, '6_months': 182, '1_year': 365 }
  const days = durationMap[duration]
  const now = new Date().toISOString()
  const endsAt = new Date(new Date(now).getTime() + days * 24 * 60 * 60 * 1000).toISOString()

  if (hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) {
    const id = uuid()
    await env.DB.prepare(
      `INSERT INTO competitions (id, community_id, title, description, duration, starts_at, ends_at, status, created_by, is_admin_created, approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, 1)`
    ).bind(id, communityId, title.trim(), description || '', duration, now, endsAt, user.sub).run()

    ctx.waitUntil((async () => {
      const members = await env.DB.prepare(
        'SELECT user_id FROM community_members WHERE community_id = ? AND user_id != ?'
      ).bind(communityId, user.sub).all()
      for (const m of (members.results || [])) {
        const nid = crypto.randomUUID()
        await env.DB.prepare(
          'INSERT INTO notifications (id, user_id, type, title, body, data, priority, category, action_url, action_label, group_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(nid, m.user_id, 'new_competition', 'New competition: ' + title, '', JSON.stringify({ community_id: communityId, competition_id: id }), 'info', 'community', '/communities/' + communityId, 'Open Competition', 'comp_' + communityId).run()
      }
    })())

    const { results } = await env.DB.prepare('SELECT * FROM competitions WHERE id = ?').bind(id).all()
    broadcastEvent(env, communityId, {
      version: 1, id: uuid(),
      type: 'competition:new',
      payload: { competition: results[0] }
    }).catch(() => {})
    return json(results[0], 201)
  }

  if (!hasPermission(member.role, PERM.CREATE_COMPETITION)) {
    return json({ error: 'Your role does not allow creating competitions. Scholar or higher is required.' }, 403)
  }

  const { results: settings } = await env.DB.prepare('SELECT * FROM community_settings WHERE community_id = ?').bind(communityId).all()
  if (!settings.length || !settings[0].allow_competitions) return json({ error: 'Competitions disabled' }, 403)

  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO competitions (id, community_id, title, description, duration, starts_at, ends_at, status, created_by, is_admin_created, approved)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, 0)`
  ).bind(id, communityId, title.trim(), description || '', duration, now, endsAt, user.sub).run()

  ctx.waitUntil((async () => {
    const members = await env.DB.prepare(
      'SELECT user_id FROM community_members WHERE community_id = ? AND user_id != ?'
    ).bind(communityId, user.sub).all()
    for (const m of (members.results || [])) {
      const nid = crypto.randomUUID()
      await env.DB.prepare(
        'INSERT INTO notifications (id, user_id, type, title, body, data, priority, category, action_url, action_label, group_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(nid, m.user_id, 'new_competition', 'New competition: ' + title, '', JSON.stringify({ community_id: communityId, competition_id: id }), 'important', 'community', '/communities/' + communityId, 'Open Competition', 'comp_' + communityId).run()
    }
  })())

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'competition:new',
    payload: { competition: { id, community_id: communityId, title: title.trim(), description: description || '', duration, starts_at: now, ends_at: endsAt, status: 'pending', created_by: user.sub, is_admin_created: 0, approved: 0 } }
  }).catch(() => {})
  return json({ id, requires_approval: true, success: true }, 201)
}

export async function handleApproveCompetition(request, env, user) {
  const compId = extractNestedId(request.url, 3)

  const { results } = await env.DB.prepare('SELECT * FROM competitions WHERE id = ?').bind(compId).all()
  if (!results.length) return json({ error: 'Competition not found' }, 404)
  const comp = results[0]

  const member = await getMember(env, comp.community_id, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare(
    `UPDATE competitions SET approved = 1, status = 'active', starts_at = datetime('now'),
     updated_at = datetime('now'), reviewed_by = ?, reviewed_at = datetime('now'), rejection_reason = NULL WHERE id = ?`
  ).bind(user.sub, compId).run()

  broadcastEvent(env, comp.community_id, {
    version: 1, id: uuid(),
    type: 'competition:update',
    payload: { competition: { ...comp, approved: 1, status: 'active' } }
  }).catch(() => {})
  return json({ success: true })
}

export async function handleRejectCompetition(request, env, user) {
  const compId = extractNestedId(request.url, 3)
  let { reason } = await request.json()

  const { results } = await env.DB.prepare('SELECT * FROM competitions WHERE id = ?').bind(compId).all()
  if (!results.length) return json({ error: 'Competition not found' }, 404)
  const comp = results[0]

  const member = await getMember(env, comp.community_id, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  reason = reason ? safeString(reason, 500) : ''
  await env.DB.prepare(
    `UPDATE competitions SET approved = 0, status = 'rejected',
     updated_at = datetime('now'), reviewed_by = ?, reviewed_at = datetime('now'), rejection_reason = ? WHERE id = ?`
  ).bind(user.sub, reason, compId).run()

  broadcastEvent(env, comp.community_id, {
    version: 1, id: uuid(),
    type: 'competition:update',
    payload: { competition: { ...comp, approved: 0, status: 'rejected', rejection_reason: reason } }
  }).catch(() => {})
  return json({ success: true })
}

export async function handleJoinCompetition(request, env, user) {
  const compId = extractNestedId(request.url, 3)

  const { results } = await env.DB.prepare('SELECT * FROM competitions WHERE id = ?').bind(compId).all()
  if (!results.length) return json({ error: 'Competition not found' }, 404)

  const comp = results[0]
  if (comp.status !== 'active' && comp.status !== 'pending') return json({ error: 'Competition is not open' }, 400)

  const member = await getMember(env, comp.community_id, user.sub)
  if (!member) return json({ error: 'Not a community member' }, 403)

  await env.DB.prepare(
    'INSERT OR IGNORE INTO competition_participants (id, competition_id, user_id) VALUES (?, ?, ?)'
  ).bind(uuid(), compId, user.sub).run()

  broadcastEvent(env, comp.community_id, {
    version: 1, id: uuid(),
    type: 'competition:update',
    payload: { competition: comp }
  }).catch(() => {})
  return json({ success: true })
}

export async function handleLeaveCompetition(request, env, user) {
  const compId = extractNestedId(request.url, 3)
  const { results } = await env.DB.prepare('SELECT * FROM competitions WHERE id = ?').bind(compId).all()
  if (!results.length) return json({ error: 'Competition not found' }, 404)
  await env.DB.prepare('DELETE FROM competition_participants WHERE competition_id = ? AND user_id = ?').bind(compId, user.sub).run()
  broadcastEvent(env, results[0].community_id, {
    version: 1, id: uuid(),
    type: 'competition:update',
    payload: { competition: results[0] }
  }).catch(() => {})
  return json({ success: true })
}

export async function handleGetCompetitionLeaderboard(request, env, user) {
  const compId = extractNestedId(request.url, 3)
  const { results: compCheck } = await env.DB.prepare('SELECT community_id FROM competitions WHERE id = ?').bind(compId).all()
  if (!compCheck.length) return json({ error: 'Competition not found' }, 404)
  const member = await getMember(env, compCheck[0].community_id, user.sub)
  if (!member) return json({ error: 'Not authorized' }, 403)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    `SELECT p.* FROM competition_participants p
     WHERE p.competition_id = ?
     ORDER BY p.total_hours DESC LIMIT ? OFFSET ?`
  ).bind(compId, limit, offset).all()
  return json(results)
}

export async function handleEndCompetition(request, env, user) {
  const compId = extractNestedId(request.url, 3)

  const { results } = await env.DB.prepare('SELECT * FROM competitions WHERE id = ?').bind(compId).all()
  if (!results.length) return json({ error: 'Competition not found' }, 404)

  const member = await getMember(env, results[0].community_id, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare(
    "UPDATE competitions SET status = 'completed', ends_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).bind(compId).run()

  broadcastEvent(env, results[0].community_id, {
    version: 1, id: uuid(),
    type: 'competition:end',
    payload: { competition: { ...results[0], status: 'completed' } }
  }).catch(() => {})
  return json({ success: true })
}

/* ── Mutes ── */

export async function handleSetMemberTitle(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const targetUserId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const { title } = await request.json()
  if (title !== null && (typeof title !== 'string' || title.length > 100)) return json({ error: 'Title too long' }, 400)

  const sanitized = title !== null ? title.trim() : null
  await env.DB.prepare('UPDATE community_members SET title = ? WHERE community_id = ? AND user_id = ?')
    .bind(sanitized || null, communityId, targetUserId).run()

  return json({ success: true, title: sanitized || null })
}

export async function handleMuteMember(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not authorized', reason: 'membership_required' }, 403)
  if (!hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized', reason: 'role_insufficient' }, 403)

  const { user_id, reason } = await request.json()
  if (!user_id) return json({ error: 'user_id required' }, 400)

  const existing = await env.DB.prepare(
    'SELECT id FROM community_mutes WHERE community_id = ? AND user_id = ?'
  ).bind(communityId, user_id).first()
  if (existing) return json({ error: 'already_muted', message: 'This member is already muted.' }, 409)

  await env.DB.prepare(
    'INSERT INTO community_mutes (id, community_id, user_id, muted_by, reason) VALUES (?, ?, ?, ?, ?)'
  ).bind(uuid(), communityId, user_id, user.sub, reason || '').run()

  return json({ success: true })
}

export async function handleUnmuteMember(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const communityId = parts[3]
  const muteId = parts[5]
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not authorized', reason: 'membership_required' }, 403)
  if (!hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized', reason: 'role_insufficient' }, 403)

  await env.DB.prepare('DELETE FROM community_mutes WHERE id = ? AND community_id = ?').bind(muteId, communityId).run()
  return json({ success: true })
}

export async function handleGetMutes(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not authorized', reason: 'membership_required' }, 403)
  if (!hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized', reason: 'role_insufficient' }, 403)

  const { results } = await env.DB.prepare(
    'SELECT cm.*, u.user_name FROM community_mutes cm LEFT JOIN user_profiles u ON cm.user_id = u.user_id WHERE cm.community_id = ? ORDER BY cm.created_at DESC'
  ).bind(communityId).all()

  return json(results)
}

/* ── Invitations ── */

export async function handleInviteUser(request, env, user) {
  const { community_id, invitee_id } = await request.json()
  if (!community_id || !invitee_id) return json({ error: 'community_id and invitee_id required' }, 400)

  const inviterMember = await getMember(env, community_id, user.sub)
  if (!inviterMember) return json({ error: 'Not a member' }, 403)

  const { results: levelResults } = await env.DB.prepare(
    'SELECT can_invite FROM member_levels WHERE id = ?'
  ).bind(inviterMember.level_id).all()

  const canInvite = levelResults.length > 0 ? levelResults[0].can_invite : hasMinimumRole(inviterMember.role, ROLES.SCHOLAR)
  if (!canInvite) return json({ error: 'Your role does not allow inviting users' }, 403)

  const { results: invitee } = await env.DB.prepare(
    'SELECT user_id, user_name FROM user_profiles WHERE user_id = ?'
  ).bind(invitee_id).all()
  if (!invitee.length) return json({ error: 'User not found' }, 404)

  const existingMember = await getMember(env, community_id, invitee_id)
  if (existingMember) return json({ error: 'User is already a member' }, 409)

  const { results: existingInvite } = await env.DB.prepare(
    "SELECT id FROM community_invitations WHERE community_id = ? AND invitee_id = ? AND status = 'pending'"
  ).bind(community_id, invitee_id).all()
  if (existingInvite.length) return json({ error: 'Invitation already pending' }, 409)

  const inviterProfile = await env.DB.prepare(
    'SELECT user_name FROM user_profiles WHERE user_id = ?'
  ).bind(user.sub).first()

  const commRow = await env.DB.prepare(
    'SELECT name FROM communities WHERE id = ?'
  ).bind(community_id).first()

  const inviterName = inviterProfile?.user_name || user.email?.split('@')[0] || 'Someone'
  const communityName = commRow?.name || 'Community'

  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO community_invitations (id, community_id, inviter_id, invitee_id) VALUES (?, ?, ?, ?)'
  ).bind(id, community_id, user.sub, invitee_id).run()

  createNotificationIfAllowed(env, invitee_id, {
    type: 'community_invite',
    title: 'Community Invitation',
    body: `${inviterName} invited you to ${communityName}`,
    category: 'community',
    priority: 'info',
    action_url: `/communities/${community_id}`,
    data: { community_id, inviter_id: user.sub },
  }).catch(() => {})

  return json({ ok: true, invitation_id: id })
}

export async function handleAcceptCommunityInvitation(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const invitationId = parts[3]

  const { results } = await env.DB.prepare(
    "SELECT * FROM community_invitations WHERE id = ? AND status = 'pending'"
  ).bind(invitationId).all()
  if (!results.length) return json({ error: 'Invitation not found' }, 404)

  const invitation = results[0]
  if (invitation.invitee_id !== user.sub) return json({ error: 'Not authorized' }, 403)

  const now = new Date().toISOString()

  await env.DB.prepare(
    "UPDATE community_invitations SET status = 'accepted' WHERE id = ?"
  ).bind(invitationId).run()

  let levelId = null
  const { results: levels } = await env.DB.prepare(
    'SELECT id FROM member_levels WHERE community_id = ? ORDER BY level_number ASC LIMIT 1'
  ).bind(invitation.community_id).all()
  if (levels.length) levelId = levels[0].id

  const memberId = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO community_members (id, community_id, user_id, level_id, role, joined_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(memberId, invitation.community_id, user.sub, levelId, ROLES.MEMBER, now).run()

  await ensureUserProfile(env, user.sub, null)
  await updateMemberCount(env, invitation.community_id)

  const inviterProfile = await env.DB.prepare(
    'SELECT user_name FROM user_profiles WHERE user_id = ?'
  ).bind(invitation.inviter_id).first()

  createNotificationIfAllowed(env, invitation.inviter_id, {
    type: 'community_invite_accepted',
    title: 'Invitation Accepted',
    body: `${inviterProfile?.user_name || 'Someone'} accepted your invitation`,
    category: 'community',
    priority: 'info',
    action_url: `/communities/${invitation.community_id}`,
    data: { community_id: invitation.community_id, invitee_id: user.sub },
  }).catch(() => {})

  return json({ ok: true })
}

export async function handleDeclineCommunityInvitation(request, env, user) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const invitationId = parts[3]

  const { results } = await env.DB.prepare(
    "SELECT * FROM community_invitations WHERE id = ? AND status = 'pending'"
  ).bind(invitationId).all()
  if (!results.length) return json({ error: 'Invitation not found' }, 404)

  const invitation = results[0]
  if (invitation.invitee_id !== user.sub) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare(
    "UPDATE community_invitations SET status = 'declined' WHERE id = ?"
  ).bind(invitationId).run()

  return json({ ok: true })
}

export async function handleGetMyInvitations(request, env, user) {
  const { results } = await env.DB.prepare(
    `SELECT ci.*, c.name as community_name, c.avatar_url as community_avatar, c.member_count,
            up.user_name as inviter_name
     FROM community_invitations ci
     JOIN communities c ON ci.community_id = c.id
     LEFT JOIN user_profiles up ON ci.inviter_id = up.user_id
     WHERE ci.invitee_id = ? AND ci.status = 'pending'
     ORDER BY ci.created_at DESC`
  ).bind(user.sub).all()

  const entries = results.map(r => ({
    id: r.id,
    community_id: r.community_id,
    community_name: r.community_name,
    community_avatar: r.community_avatar || null,
    inviter_id: r.inviter_id,
    inviter_name: r.inviter_name || 'Someone',
    created_at: r.created_at,
  }))

  return json(entries)
}
