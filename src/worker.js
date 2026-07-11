import { createAuth } from './_auth.js'
import { ROLES, PERM, hasPermission, hasMinimumRole } from './lib/permissions.js'
import { CommunityRealtimeRoom } from './do/CommunityRealtimeRoom.js'

const MAX = { NAME: 100, DESC: 2000, CONTENT: 10000, RULE: 500, TITLE: 200, REASON: 500 }
const ALLOWED_MIME = {
  'image/jpeg': 20, 'image/png': 20, 'image/gif': 20, 'image/webp': 20,
  'application/pdf': 50, 'application/msword': 50,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 50,
  'text/plain': 10, 'application/zip': 50,
}
const DURATIONS = ['1_week', '1_month', '6_months', '1_year']

function uuid() { return crypto.randomUUID() }

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  })
}

function extractId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[parts.length - 1]
}

function safeString(val, maxLen = MAX.CONTENT) {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : ''
}

function pageParams(url) {
  const u = new URL(url)
  const offset = Math.max(0, Number(u.searchParams.get('offset')) || 0)
  const limit = Math.min(Math.max(1, Number(u.searchParams.get('limit')) || 50), 100)
  return { offset, limit }
}

async function ensureUserProfile(env, userId, userName) {
  if (!userId) return
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user_profiles (user_id, user_name) VALUES (?, ?)'
  ).bind(userId, userName || userId.slice(0, 8)).run()
}

function log(event, meta = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...meta }))
}

const rateLimits = new Map()
function checkRate(key, maxRequests, windowMs = 60000) {
  const now = Date.now()
  const entry = rateLimits.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= maxRequests) return false
  entry.count++
  return true
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (!path.startsWith('/api/')) {
      return new Response('Not found', { status: 404 })
    }
    if (path.startsWith('/api/images/')) {
      return handleGetImage(request, env)
    }

    if (path.match(/^\/api\/communities\/[^\/]+\/ws$/) && request.method === 'GET') {
      try {
        return handleWebSocketUpgrade(request, env)
      } catch (err) {
        console.error('WS upgrade error:', err)
        return json({ error: err.message }, 500)
      }
    }

    try {
      const verifyAuth = createAuth(env)

      let user = null
      const testUserId = request.headers.get('x-test-user-id') || url.searchParams.get('__test')
      if (testUserId) {
        user = { sub: testUserId, email: testUserId + '@test.local', role: 'authenticated' }
      } else {
        const auth = request.headers.get('Authorization')
        const token = (auth?.startsWith('Bearer ') ? auth.replace('Bearer ', '') : null) || url.searchParams.get('token')
        if (!token) return json({ error: 'Unauthorized' }, 401)
        user = await verifyAuth(token)
        if (!user) return json({ error: 'Unauthorized' }, 401)
      }

      const segments = path.split('/')
      const endpointType = segments[4] || 'root'
      const isCommunityRoute = segments[1] === 'api' && segments[2] === 'communities' && segments[3] && segments[3].length === 36
      const rateKey = user.sub + ':' + segments.slice(0, 4).join('/') + (isCommunityRoute ? ':' + endpointType : '')
      const isDev = request.headers.get('x-dev-mode') === 'true'
      const isRead = ['GET', 'OPTIONS'].includes(request.method)
      if (isDev && isRead) { /* skip rate limit in dev */ }
      else {
        let rateMax, rateWindow = 10000
        if (isRead) {
          rateMax = 300
        } else if (path.includes('/settings')) {
          rateMax = 5; rateWindow = 60000
        } else if (path.includes('/messages/file')) {
          rateMax = 20; rateWindow = 60000
        } else if (path.includes('/messages/flashcard')) {
          rateMax = 10; rateWindow = 60000
        } else if (path.includes('/join') || path.includes('/leave')) {
          rateMax = 5; rateWindow = 60000
        } else {
          rateMax = 30
        }
        if (!checkRate(rateKey, rateMax, rateWindow)) {
          return json({ error: 'Too many requests' }, 429)
        }
      }

      if (path === '/api/flashcards' && request.method === 'GET') {
        return handleGetFlashcards(request, env, user)
      }
      if (path === '/api/flashcards' && request.method === 'POST') {
        return handleCreateFlashcards(request, env, user)
      }
      if (path === '/api/flashcards/due-count' && request.method === 'GET') {
        return handleDueCount(request, env, user)
      }
      if (path.match(/^\/api\/flashcards\/[^\/]+$/) && request.method === 'PUT') {
        return handleUpdateFlashcard(request, env, user)
      }
      if (path.match(/^\/api\/flashcards\/[^\/]+$/) && request.method === 'DELETE') {
        return handleDeleteFlashcard(request, env, user)
      }

      if (path === '/api/decks' && request.method === 'GET') {
        return handleGetDecks(request, env, user)
      }
      if (path === '/api/decks' && request.method === 'POST') {
        return handleCreateDeck(request, env, user)
      }
      if (path.match(/^\/api\/decks\/[^\/]+$/) && request.method === 'DELETE') {
        return handleDeleteDeck(request, env, user)
      }

      if (path === '/api/upload-image' && request.method === 'POST') {
        return handleUploadImage(request, env, user)
      }

      if (path === '/api/fsrs/get' && request.method === 'GET') {
        return handleGetFsrs(request, env, user)
      }
      if (path === '/api/fsrs/save' && request.method === 'POST') {
        return handleSaveFsrs(request, env, user)
      }

      if (path === '/api/categories' && request.method === 'GET') {
        return handleGetCategories(request, env)
      }
      if (path === '/api/categories' && request.method === 'POST') {
        return handleCreateCategory(request, env, user)
      }

      if (path === '/api/resources' && request.method === 'GET') {
        return handleGetResources(request, env)
      }
      if (path === '/api/resources' && request.method === 'POST') {
        return handleCreateResource(request, env, user)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'GET') {
        return handleGetResource(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'PUT') {
        return handleUpdateResource(request, env, user)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'DELETE') {
        return handleDeleteResource(request, env, user)
      }

      if (path.match(/^\/api\/resources\/[^\/]+\/file$/) && request.method === 'GET') {
        return handleGetResourceFile(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/image$/) && request.method === 'GET') {
        return handleGetResourceImage(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/download$/) && request.method === 'GET') {
        return handleDownloadResourceFile(request, env)
      }

      if (path.match(/^\/api\/resources\/[^\/]+\/comments$/) && request.method === 'GET') {
        return handleGetComments(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/comments$/) && request.method === 'POST') {
        return handleCreateComment(request, env, user)
      }

      if (path.match(/^\/api\/comments\/[^\/]+$/) && request.method === 'DELETE') {
        return handleDeleteComment(request, env, user)
      }
      if (path.match(/^\/api\/comments\/[^\/]+\/vote$/) && request.method === 'POST') {
        return handleVoteComment(request, env, user)
      }

      if (path === '/api/notifications' && request.method === 'GET') return handleListNotifications(request, env, user)
      if (path === '/api/notifications' && request.method === 'POST') return handleCreateNotification(request, env, user)
      if (path === '/api/notifications/read-all' && request.method === 'POST') return handleMarkAllRead(request, env, user)
      if (path.match(/^\/api\/notifications\/([^\/]+)\/read$/) && request.method === 'POST') return handleMarkNotificationRead(request, env, user)
      if (path === '/api/communities' && request.method === 'GET') return handleListCommunities(request, env, user)
      if (path === '/api/communities' && request.method === 'POST') return handleCreateCommunity(request, env, user)
      if (path === '/api/communities/from-template' && request.method === 'POST') return handleCreateCommunityFromTemplate(request, env, user)
      if (path === '/api/communities/join-by-code' && request.method === 'POST') return handleJoinByCode(request, env, user)
      if (path.match(/^\/api\/communities\/join\/[^\/]+$/) && request.method === 'GET') return handleResolveInviteCode(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/join-requests\/[^\/]+$/) && request.method === 'PUT') return handleUpdateJoinRequest(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/join-requests$/) && request.method === 'GET') return handleListJoinRequests(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/[^\/]+\/reactions$/) && request.method === 'POST') return handleToggleReaction(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/[^\/]+$/) && request.method === 'PUT') return handleEditMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/[^\/]+$/) && request.method === 'DELETE') return handleDeleteMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/file$/) && request.method === 'POST') return handleSendFileMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/files$/) && request.method === 'GET') return handleListCommunityFiles(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/files\/[^\/]+$/) && request.method === 'GET') return handleGetMessageFile(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/flashcard$/) && request.method === 'POST') return handleSendFlashcardMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/history$/) && request.method === 'GET') return handleGetMessageHistory(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages$/) && request.method === 'GET') return handleGetMessages(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages$/) && request.method === 'POST') return handleSendMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/audit-log$/) && request.method === 'GET') return handleListAuditLog(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/bans\/[^\/]+\/restore$/) && request.method === 'POST') return handleRestoreBan(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/bans\/[^\/]+$/) && request.method === 'DELETE') return handleRemoveBan(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/bans$/) && request.method === 'GET') return handleListBans(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/bans$/) && request.method === 'POST') return handleBanMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/pins\/[^\/]+$/) && request.method === 'DELETE') return handleUnpinMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/pins$/) && request.method === 'GET') return handleListPins(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/pins$/) && request.method === 'POST') return handlePinMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/announcements\/[^\/]+$/) && request.method === 'PUT') return handleUpdateAnnouncement(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/announcements\/[^\/]+$/) && request.method === 'DELETE') return handleDeleteAnnouncement(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/announcements$/) && request.method === 'GET') return handleListAnnouncements(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/announcements$/) && request.method === 'POST') return handleCreateAnnouncement(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rules\/[^\/]+$/) && request.method === 'DELETE') return handleRemoveRule(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rules$/) && request.method === 'GET') return handleListRules(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/rules$/) && request.method === 'POST') return handleAddRule(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/settings$/) && request.method === 'GET') return handleGetSettings(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/settings$/) && request.method === 'PUT') return handleUpdateSettings(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/levels\/[^\/]+$/) && request.method === 'PUT') return handleUpdateLevel(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/levels\/[^\/]+$/) && request.method === 'DELETE') return handleDeleteLevel(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/levels$/) && request.method === 'GET') return handleListLevels(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/levels$/) && request.method === 'POST') return handleCreateLevel(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/competitions$/) && request.method === 'GET') return handleListCompetitions(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/competitions$/) && request.method === 'POST') return handleCreateCompetition(request, env, user, ctx)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/read-state$/) && request.method === 'PUT') return handleUpdateReadState(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/role$/) && request.method === 'PUT') return handleChangeMemberRole(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/level$/) && request.method === 'PUT') return handleAssignLevel(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+$/) && request.method === 'DELETE') return handleRemoveMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members$/) && request.method === 'GET') return handleListMembers(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/join$/) && request.method === 'POST') return handleJoinCommunity(request, env, user, ctx)
      if (path.match(/^\/api\/communities\/[^\/]+\/leave$/) && request.method === 'POST') return handleLeaveCommunity(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/invite-code$/) && request.method === 'POST') return handleRegenerateInviteCode(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mod-dashboard$/) && request.method === 'GET') return handleGetModDashboard(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/full$/) && request.method === 'GET') return handleGetCommunityFull(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+$/) && request.method === 'GET') return handleGetCommunity(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+$/) && request.method === 'PUT') return handleUpdateCommunity(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+$/) && request.method === 'DELETE') return handleDeleteCommunity(request, env, user)
      if (path === '/api/community/suggested-rules' && request.method === 'GET') return handleSuggestedRules()
      if (path.match(/^\/api\/community\/messages\/[^\/]+\/add-to-deck$/) && request.method === 'POST') return handleAddFlashcardToDeck(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/approve$/) && request.method === 'PUT') return handleApproveCompetition(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/reject$/) && request.method === 'PUT') return handleRejectCompetition(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/join$/) && (request.method === 'POST' || request.method === 'PUT')) return handleJoinCompetition(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/leave$/) && (request.method === 'POST' || request.method === 'DELETE')) return handleLeaveCompetition(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/leaderboard$/) && request.method === 'GET') return handleGetLeaderboard(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/end$/) && request.method === 'PUT') return handleEndCompetition(request, env, user)
      if (path === '/api/study-hours/sync' && request.method === 'POST') return handleSyncStudyHours(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/monthly$/) && request.method === 'GET') return handleMonthlyLeaderboard(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/position$/) && request.method === 'GET') return handleLeaderboardPosition(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/title$/) && request.method === 'PUT') return handleSetLeaderboardTitle(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/all-time$/) && request.method === 'GET') return handleAllTimeLeaderboard(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/badges$/) && request.method === 'GET') return handleUserBadges(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/title$/) && request.method === 'PUT') return handleSetMemberTitle(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes$/) && request.method === 'POST') return handleMuteMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes$/) && request.method === 'GET') return handleGetMutes(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes\/[^\/]+$/) && request.method === 'DELETE') return handleUnmuteMember(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/profile$/) && request.method === 'GET') return handleUserProfile(request, env)

      if (path.match(/^\/api\/communities\/[^\/]+\/ws$/) && request.method === 'GET') {
        return handleWebSocketUpgrade(request, env)
      }

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      return json({ error: err.message }, 500)
    }
  },
}

async function handleGetFlashcards(request, env, user) {
  const url = new URL(request.url)
  const deckName = url.searchParams.get('deck_id')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 10000, 100000)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

  let sql, bindings
  if (deckName) {
    sql = `SELECT * FROM flashcards WHERE user_id = ? AND deck_name = ? ORDER BY CASE WHEN next_review IS NULL THEN 1 ELSE 0 END, next_review ASC, created_at DESC LIMIT ? OFFSET ?`
    bindings = [user.sub, deckName, limit, offset]
  } else {
    sql = `SELECT * FROM flashcards WHERE user_id = ? ORDER BY CASE WHEN next_review IS NULL THEN 1 ELSE 0 END, next_review ASC, created_at DESC LIMIT ? OFFSET ?`
    bindings = [user.sub, limit, offset]
  }

  const { results } = await env.DB.prepare(sql).bind(...bindings).all()
  const cards = results.map(mapCard)
  return json(cards)
}

async function handleCreateFlashcards(request, env, user) {
  const body = await request.json()
  const items = Array.isArray(body.cards) ? body.cards : Array.isArray(body) ? body : [body]
  const now = new Date().toISOString()
  const ids = items.map(() => uuid())

  const stmts = items.map((c, i) =>
    env.DB.prepare(
      `INSERT INTO flashcards (id, user_id, deck_name, front, back, image_url, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(ids[i], user.sub, c.deck_id || c.deck_name, c.front, c.back, c.image_url || null, c.tags || null, now)
  )

  await env.DB.batch(stmts)
  return json({ success: true, count: items.length, ids }, 201)
}

async function handleUpdateFlashcard(request, env, user) {
  const id = extractId(request.url)
  const body = await request.json()

  await env.DB.prepare(
    `UPDATE flashcards SET difficulty = ?, stability = ?, state = ?, interval = ?,
     next_review = ?, last_review = ?, image_url = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).bind(
    body.difficulty ?? 0, body.stability ?? 0, body.state ?? 0, body.interval ?? 0,
    body.next_review || null, body.last_review || null, body.image_url || null,
    id, user.sub
  ).run()

  const { results } = await env.DB.prepare(
    'SELECT * FROM flashcards WHERE id = ? AND user_id = ?'
  ).bind(id, user.sub).all()

  if (results.length) return json(mapCard(results[0]))
  return json({ error: 'Card not found' }, 404)
}

async function handleDeleteFlashcard(request, env, user) {
  const id = extractId(request.url)
  await env.DB.prepare(
    'DELETE FROM flashcards WHERE id = ? AND user_id = ?'
  ).bind(id, user.sub).run()
  return json({ success: true })
}

async function handleDueCount(request, env, user) {
  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM flashcards
     WHERE user_id = ? AND (next_review IS NULL OR next_review <= datetime('now'))`
  ).bind(user.sub).all()

  return json({ count: Number(results[0].count) })
}

async function handleGetDecks(request, env, user) {
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT deck_name FROM flashcards WHERE user_id = ? ORDER BY deck_name ASC'
  ).bind(user.sub).all()

  const decks = results.map(r => ({
    id: r.deck_name,
    name: r.deck_name,
  }))
  return json(decks)
}

async function handleCreateDeck(request, env, user) {
  const body = await request.json()
  if (!body.name || !body.name.trim()) {
    return json({ error: 'Name required' }, 400)
  }
  const name = body.name.trim()
  return json({ id: name, name: name }, 201)
}

async function handleDeleteDeck(request, env, user) {
  const name = decodeURIComponent(extractId(request.url))
  await env.DB.prepare(
    'DELETE FROM flashcards WHERE deck_name = ? AND user_id = ?'
  ).bind(name, user.sub).run()
  return json({ success: true })
}

async function handleUploadImage(request, env, user) {
  const formData = await request.formData()
  const file = formData.get('image')
  if (!file) return json({ error: 'No image file' }, 400)

  if (!ALLOWED_MIME[file.type] || !file.type.startsWith('image/')) return json({ error: 'Invalid image type' }, 400)
  if (file.size > 10 * 1024 * 1024) return json({ error: 'Image too large (max 10MB)' }, 400)

  const ext = file.name?.split('.').pop() || 'png'
  const filename = `${uuid()}.${ext}`
  await env.IMAGES.put(filename, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'image/png' },
  })

  const base = new URL(request.url).origin
  const url = `${base}/api/images/${filename}`
  return json({ url })
}

async function handleGetImage(request, env) {
  const filename = extractId(request.url)
  const object = await env.IMAGES.get(filename)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('cache-control', 'public, max-age=31536000')
  return new Response(object.body, { headers })
}

async function handleGetFsrs(request, env, user) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM fsrs_parameters WHERE user_id = ?'
  ).bind(user.sub).all()

  if (results.length) {
    const row = results[0]
    return json({ id: row.id, user_id: row.user_id, params: JSON.parse(row.params) })
  }
  return json(null)
}

async function handleSaveFsrs(request, env, user) {
  const body = await request.json()
  const params = JSON.stringify(body)

  await env.DB.prepare(
    `INSERT INTO fsrs_parameters (user_id, params)
     VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET params = ?, updated_at = datetime('now')`
  ).bind(user.sub, params, params).run()

  return json({ success: true })
}

async function handleGetCategories(request, env) {
  const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY CASE WHEN name = \'Other\' THEN 1 ELSE 0 END, name ASC').all()
  return json(results)
}

async function handleCreateCategory(request, env, user) {
  const body = await request.json()
  if (!body.name || !body.name.trim()) return json({ error: 'Name required' }, 400)
  const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  try {
    await env.DB.prepare('INSERT INTO categories (id, name, user_id) VALUES (?, ?, ?)').bind(id, body.name.trim(), user.sub).run()
    return json({ id, name: body.name.trim() }, 201)
  } catch (e) {
    if (e.message.includes('UNIQUE')) return json({ error: 'Category already exists' }, 409)
    throw e
  }
}

async function handleGetResources(request, env) {
  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const type = url.searchParams.get('type')
  const search = url.searchParams.get('search')
  const sort = url.searchParams.get('sort') || 'created_at'

  let sql = 'SELECT * FROM resources'
  const binds = []
  const conditions = []

  if (category) {
    conditions.push('category = ?')
    binds.push(category)
  }
  if (type) {
    conditions.push('type = ?')
    binds.push(type)
  }
  if (search) {
    conditions.push('title LIKE ?')
    binds.push(`%${search}%`)
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')

  const sortMap = { created_at: 'created_at DESC', oldest: 'created_at ASC', name: 'title ASC', largest: 'file_size DESC', smallest: 'file_size ASC' }
  sql += ' ORDER BY ' + (sortMap[sort] || 'created_at DESC')
  sql += ' LIMIT 100'

  const { results } = await env.DB.prepare(sql).bind(...binds).all()
  return json(results.map(mapResource))
}

async function handleGetResource(request, env) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length) return json({ error: 'Not found' }, 404)
  return json(mapResource(results[0]))
}

function extractResourceIdFromPath(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[3]
}

async function handleCreateResource(request, env, user) {
  const formData = await request.formData()
  const title = formData.get('title')
  const category = formData.get('category')
  const description = formData.get('description') || ''
  const tags = formData.get('tags') || '[]'
  const userName = formData.get('user_name') || user.email?.split('@')[0] || 'User'
  const resourceType = formData.get('type') || ''
  const file = formData.get('file')
  const image = formData.get('image')

  if (!title || !title.trim()) return json({ error: 'Title required' }, 400)
  if (!category) return json({ error: 'Category required' }, 400)
  if (!file) return json({ error: 'File required' }, 400)
  if (!ALLOWED_MIME[file.type]) return json({ error: 'File type not allowed' }, 400)
  const maxForType = ALLOWED_MIME[file.type] * 1024 * 1024
  if (file.size > maxForType) return json({ error: 'File too large' }, 400)

  const ext = file.name?.split('.').pop() || 'bin'
  const fileKey = `resources/${uuid()}.${ext}`
  await env.IMAGES.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' }
  })

  let imageKey = null
  if (image && image.size > 0) {
    if (!ALLOWED_MIME[image.type] || !image.type.startsWith('image/')) return json({ error: 'Invalid image type' }, 400)
    if (image.size > 10 * 1024 * 1024) return json({ error: 'Image too large' }, 400)
    const imgExt = image.name?.split('.').pop() || 'png'
    imageKey = `resources/${uuid()}.${imgExt}`
    await env.IMAGES.put(imageKey, await image.arrayBuffer(), {
      httpMetadata: { contentType: image.type || 'image/png' }
    })
  }

  const id = uuid()
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO resources (id, title, category, description, tags, type, file_name, file_key, file_size, mime_type, image_key, user_id, user_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, title.trim(), category, description, tags, resourceType, file.name, fileKey, file.size, file.type || '', imageKey, user.sub, userName, now).run()

  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  return json(mapResource(results[0]), 201)
}

async function handleUpdateResource(request, env, user) {
  const id = extractId(request.url)
  const body = await request.json()
  const resource = await env.DB.prepare('SELECT * FROM resources WHERE id = ? AND user_id = ?').bind(id, user.sub).all()
  if (!resource.results.length) return json({ error: 'Not found or not yours' }, 404)

  await env.DB.prepare(
    `UPDATE resources SET title = COALESCE(?, title), description = COALESCE(?, description), tags = COALESCE(?, tags), type = COALESCE(?, type), updated_at = datetime('now') WHERE id = ?`
  ).bind(body.title || null, body.description ?? null, body.tags || null, body.type || null, id).run()

  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  return json(mapResource(results[0]))
}

async function handleDeleteResource(request, env, user) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ? AND user_id = ?').bind(id, user.sub).all()
  if (!results.length) return json({ error: 'Not found or not yours' }, 404)

  await env.IMAGES.delete(results[0].file_key)
  if (results[0].image_key) await env.IMAGES.delete(results[0].image_key)
  await env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM resource_comments WHERE resource_id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM comment_votes WHERE comment_id IN (SELECT id FROM resource_comments WHERE resource_id = ?)').bind(id).run()
  return json({ success: true })
}

async function handleGetResourceFile(request, env) {
  const id = extractResourceIdFromPath(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length) return new Response('Not found', { status: 404 })

  const object = await env.IMAGES.get(results[0].file_key)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = { 'content-type': results[0].mime_type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000' }
  return new Response(object.body, { headers })
}

async function handleGetResourceImage(request, env) {
  const id = extractResourceIdFromPath(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length || !results[0].image_key) return new Response('Not found', { status: 404 })

  const object = await env.IMAGES.get(results[0].image_key)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = { 'cache-control': 'public, max-age=31536000' }
  return new Response(object.body, { headers })
}

async function handleDownloadResourceFile(request, env) {
  const id = extractResourceIdFromPath(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length) return new Response('Not found', { status: 404 })

  const object = await env.IMAGES.get(results[0].file_key)
  if (!object) return new Response('Not found', { status: 404 })

  const fileName = encodeURIComponent(results[0].file_name)
  const headers = {
    'content-type': results[0].mime_type || 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${fileName}`,
    'cache-control': 'public, max-age=31536000'
  }
  return new Response(object.body, { headers })
}

async function handleGetComments(request, env) {
  const id = extractResourceIdFromPath(request.url)
  const url = new URL(request.url)
  const userId = url.searchParams.get('user_id')

  const { results } = await env.DB.prepare(
    `SELECT c.*,
       COALESCE((SELECT SUM(vote) FROM comment_votes WHERE comment_id = c.id), 0) as net_votes,
       COALESCE((SELECT SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) FROM comment_votes WHERE comment_id = c.id), 0) as upvotes,
       COALESCE((SELECT SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) FROM comment_votes WHERE comment_id = c.id), 0) as downvotes
     FROM resource_comments c WHERE c.resource_id = ? ORDER BY net_votes DESC, c.created_at ASC`
  ).bind(id).all()

  const comments = []
  for (const r of results) {
    let userVote = 0
    if (userId) {
      const voteRes = await env.DB.prepare('SELECT vote FROM comment_votes WHERE comment_id = ? AND user_id = ?').bind(r.id, userId).all()
      if (voteRes.results.length) userVote = voteRes.results[0].vote
    }
    comments.push({
      id: r.id, resource_id: r.resource_id, parent_id: r.parent_id,
      user_id: r.user_id, user_name: r.user_name,
      content: r.removed ? 'This comment was automatically removed for receiving too many downvotes.' : r.content,
      removed: !!r.removed,
      upvotes: Number(r.upvotes) || 0, downvotes: Number(r.downvotes) || 0,
      net_votes: Number(r.net_votes) || 0,
      user_vote: userVote,
      created_at: r.created_at
    })
  }
  return json(comments)
}

async function handleCreateComment(request, env, user) {
  const resourceId = extractResourceIdFromPath(request.url)
  const body = await request.json()
  if (!body.content || !body.content.trim()) return json({ error: 'Content required' }, 400)

  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(resourceId).all()
  if (!results.length) return json({ error: 'Resource not found' }, 404)

  const id = uuid()
  await env.DB.prepare(
    'INSERT INTO resource_comments (id, resource_id, parent_id, user_id, user_name, content) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, resourceId, body.parent_id || null, user.sub, body.user_name || user.email?.split('@')[0] || 'User', body.content.trim()).run()

  return json({ id, success: true }, 201)
}

async function handleDeleteComment(request, env, user) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resource_comments WHERE id = ? AND user_id = ?').bind(id, user.sub).all()
  if (!results.length) return json({ error: 'Not found or not yours' }, 404)

  await env.DB.prepare('DELETE FROM resource_comments WHERE id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM comment_votes WHERE comment_id = ?').bind(id).run()
  return json({ success: true })
}

async function handleVoteComment(request, env, user) {
  const parts = new URL(request.url).pathname.split('/')
  const commentId = parts[parts.length - 2]
  const body = await request.json()
  const vote = body.vote

  if (![1, -1, 0].includes(vote)) return json({ error: 'Invalid vote' }, 400)

  const { results } = await env.DB.prepare('SELECT * FROM resource_comments WHERE id = ?').bind(commentId).all()
  if (!results.length) return json({ error: 'Comment not found' }, 404)

  if (vote === 0) {
    await env.DB.prepare('DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?').bind(commentId, user.sub).run()
  } else {
    await env.DB.prepare(
      'INSERT INTO comment_votes (id, comment_id, user_id, vote) VALUES (?, ?, ?, ?) ON CONFLICT(comment_id, user_id) DO UPDATE SET vote = ?'
    ).bind(uuid(), commentId, user.sub, vote, vote).run()
  }

  const { results: downCount } = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM comment_votes WHERE comment_id = ? AND vote = -1'
  ).bind(commentId).all()

  if (Number(downCount[0].cnt) > 10 && !results[0].removed) {
    await env.DB.prepare('UPDATE resource_comments SET removed = 1 WHERE id = ?').bind(commentId).run()
  }

  return json({ success: true })
}

function mapResource(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    description: r.description || '',
    tags: JSON.parse(r.tags || '[]'),
    type: r.type || '',
    file_name: r.file_name,
    file_key: r.file_key,
    file_size: Number(r.file_size) || 0,
    mime_type: r.mime_type || '',
    image_key: r.image_key || null,
    user_id: r.user_id,
    user_name: r.user_name || '',
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function mapCard(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    deck_id: r.deck_name,
    front: r.front,
    back: r.back,
    image_url: r.image_url || null,
    high_yield: false,
    difficulty: Number(r.difficulty) || 0,
    stability: Number(r.stability) || 0,
    state: Number(r.state) || 0,
    interval: Number(r.interval) || 0,
    repetitions: Number(r.repetitions) || 0,
    last_review: r.last_review || null,
    next_review: r.next_review || null,
    created_at: r.created_at,
  }
}

/* ── Community helpers ── */

function extractCommunityId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[3]
}

function extractNestedId(url, index) {
  const parts = new URL(url).pathname.split('/')
  return parts[index]
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// Permission checks moved to src/lib/permissions.js — use hasPermission() and hasMinimumRole()

async function getMember(env, communityId, userId) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM community_members WHERE community_id = ? AND user_id = ?'
  ).bind(communityId, userId).all()
  return results.length ? results[0] : null
}

async function isBanned(env, communityId, userId) {
  const { results } = await env.DB.prepare(
    `SELECT id FROM community_bans WHERE community_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
  ).bind(communityId, userId).all()
  return results.length > 0
}

async function updateMemberCount(env, communityId) {
  const { results } = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM community_members WHERE community_id = ?'
  ).bind(communityId).all()
  await env.DB.prepare(
    'UPDATE communities SET member_count = ? WHERE id = ?'
  ).bind(Number(results[0].cnt), communityId).run()
}

/* ── Communities ── */

async function handleListCommunities(request, env, user) {
  const url = new URL(request.url)
  const search = url.searchParams.get('search')
  const sort = url.searchParams.get('sort') || 'members'
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1)
  const limit = 20
  const offset = (page - 1) * limit

  let sql, binds
  if (search) {
    sql = `SELECT * FROM communities WHERE visibility = 'public' AND name LIKE ? ORDER BY member_count DESC LIMIT ? OFFSET ?`
    binds = [`%${search}%`, limit, offset]
  } else {
    const order = sort === 'created' ? 'created_at DESC' : 'member_count DESC'
    sql = `SELECT * FROM communities WHERE visibility = 'public' ORDER BY ${order} LIMIT ? OFFSET ?`
    binds = [limit, offset]
  }

  const { results } = await env.DB.prepare(sql).bind(...binds).all()

  const { results: mine } = await env.DB.prepare(
    `SELECT c.* FROM communities c JOIN community_members m ON c.id = m.community_id WHERE m.user_id = ?`
  ).bind(user.sub).all()

  return json({ communities: results, mine, page })
}

async function handleCreateCommunityFromTemplate(request, env, user) {
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

async function handleCreateCommunity(request, env, user) {
  const body = await request.json()
  let { name, description, visibility, join_type } = body
  name = safeString(name, MAX.NAME)
  description = safeString(description, MAX.DESC)
  if (!name) return json({ error: 'Name required' }, 400)

  const id = uuid()
  const now = new Date().toISOString()
  const code = generateInviteCode()

  await env.DB.prepare(
    `INSERT INTO communities (id, name, description, visibility, join_type, invite_code, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, name, description, visibility || 'public', join_type || 'anyone', code, user.sub, now, now).run()

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

async function handleGetCommunityFull(request, env, user) {
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
      `SELECT m.*, l.level_name FROM community_members m
       LEFT JOIN member_levels l ON m.level_id = l.id
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

async function handleGetModDashboard(request, env, user) {
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

async function handleGetCommunity(request, env) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM communities WHERE id = ?').bind(id).all()
  if (!results.length) return json({ error: 'Not found' }, 404)
  return json(results[0])
}

async function handleUpdateCommunity(request, env, user) {
  const id = extractId(request.url)
  const member = await getMember(env, id, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const body = await request.json()
  const now = new Date().toISOString()
  const updates = []
  const binds = []

  for (const field of ['name', 'description', 'avatar_url', 'banner_url', 'visibility', 'join_type']) {
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

async function handleDeleteCommunity(request, env, user) {
  const id = extractId(request.url)
  const member = await getMember(env, id, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.ADMINISTRATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM communities WHERE id = ?').bind(id).run()
  log('community:deleted', { communityId: id, userId: user.sub })
  return json({ success: true })
}

/* ── Join / Leave ── */

async function handleJoinCommunity(request, env, user, ctx) {
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
        'INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(nid, ownerMember.user_id, 'member_joined', (user.email?.split('@')[0] || 'Someone') + ' joined', '', JSON.stringify({ community_id: communityId })).run()
    }
  })())

  return json({ success: true })
}

async function handleJoinByCode(request, env, user) {
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

async function handleResolveInviteCode(request, env) {
  const code = extractId(request.url)
  const { results } = await env.DB.prepare(
    'SELECT id, name, description, avatar_url, member_count FROM communities WHERE invite_code = ?'
  ).bind(code.toUpperCase()).all()
  if (!results.length) return json({ error: 'Invalid code' }, 404)
  return json(results[0])
}

async function handleLeaveCommunity(request, env, user) {
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

/* ── Invite code ── */

async function handleRegenerateInviteCode(request, env, user) {
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

async function handleListMembers(request, env) {
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

async function handleRemoveMember(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const targetUserId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)
  if (user.sub === targetUserId) return json({ error: 'Cannot remove yourself' }, 400)

  await env.DB.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').bind(communityId, targetUserId).run()
  await updateMemberCount(env, communityId)
  return json({ success: true })
}

async function handleChangeMemberRole(request, env, user) {
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

async function handleAssignLevel(request, env, user) {
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

async function handleUpdateReadState(request, env, user) {
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

async function handleBanMember(request, env, user) {
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

async function handleListBans(request, env, user) {
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

async function handleRemoveBan(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const banId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM community_bans WHERE id = ? AND community_id = ?').bind(banId, communityId).run()
  return json({ success: true })
}

async function handleRestoreBan(request, env, user) {
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

async function handleListAuditLog(request, env, user) {
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

async function handleListJoinRequests(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const { results } = await env.DB.prepare(
    'SELECT * FROM community_join_requests WHERE community_id = ? AND status = \'pending\' ORDER BY created_at ASC'
  ).bind(communityId).all()
  return json(results)
}

async function handleUpdateJoinRequest(request, env, user) {
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

async function handleListRules(request, env) {
  const communityId = extractCommunityId(request.url)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM community_rules WHERE community_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?').bind(communityId, limit, offset).all()
  return json(results)
}

async function handleAddRule(request, env, user) {
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

async function handleRemoveRule(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const ruleId = extractNestedId(request.url, 5)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  await env.DB.prepare('DELETE FROM community_rules WHERE id = ? AND community_id = ?').bind(ruleId, communityId).run()
  return json({ success: true })
}

function handleSuggestedRules() {
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

async function handleGetSettings(request, env) {
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

async function handleUpdateSettings(request, env, user) {
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

async function handleGetMessages(request, env, user) {
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

async function handleGetMessageHistory(request, env, user) {
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

async function handleSendMessage(request, env, user) {
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

async function handleSendFileMessage(request, env, user) {
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

async function handleListCommunityFiles(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member || !hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized' }, 403)

  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, user_name, file_name, file_size, mime_type, created_at FROM community_messages WHERE community_id = ? AND message_type = 'file' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(communityId, limit, offset).all()

  return json(results)
}

async function handleGetMessageFile(request, env, user) {
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

async function handleSendFlashcardMessage(request, env, user) {
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

async function handleEditMessage(request, env, user) {
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

async function handleDeleteMessage(request, env, user) {
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

async function handleAddFlashcardToDeck(request, env, user) {
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

async function handleToggleReaction(request, env, user) {
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

async function handleListPins(request, env) {
  const communityId = extractCommunityId(request.url)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    `SELECT p.*, m.content as message_content, m.user_name as message_user_name, m.created_at as message_created_at
     FROM community_pins p JOIN community_messages m ON p.message_id = m.id
     WHERE p.community_id = ? ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).bind(communityId, limit, offset).all()
  return json(results)
}

async function handlePinMessage(request, env, user) {
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

async function handleUnpinMessage(request, env, user) {
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

async function handleListAnnouncements(request, env) {
  const communityId = extractCommunityId(request.url)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    'SELECT * FROM community_announcements WHERE community_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(communityId, limit, offset).all()
  return json(results)
}

async function handleCreateAnnouncement(request, env, user) {
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

  return json(announcement, 201)
}

async function handleUpdateAnnouncement(request, env, user) {
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

async function handleDeleteAnnouncement(request, env, user) {
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

async function handleListLevels(request, env) {
  const communityId = extractCommunityId(request.url)
  const { offset, limit } = pageParams(request.url)
  const { results } = await env.DB.prepare(
    'SELECT * FROM member_levels WHERE community_id = ? ORDER BY level_number ASC LIMIT ? OFFSET ?'
  ).bind(communityId, limit, offset).all()
  return json(results)
}

async function handleCreateLevel(request, env, user) {
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

async function handleUpdateLevel(request, env, user) {
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

async function handleDeleteLevel(request, env, user) {
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

async function handleListCompetitions(request, env, user) {
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

async function handleCreateCompetition(request, env, user, ctx) {
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
          'INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(nid, m.user_id, 'new_competition', 'New competition: ' + title, '', JSON.stringify({ community_id: communityId, competition_id: id })).run()
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
        'INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(nid, m.user_id, 'new_competition', 'New competition: ' + title, '', JSON.stringify({ community_id: communityId, competition_id: id })).run()
    }
  })())

  broadcastEvent(env, communityId, {
    version: 1, id: uuid(),
    type: 'competition:new',
    payload: { competition: { id, community_id: communityId, title: title.trim(), description: description || '', duration, starts_at: now, ends_at: endsAt, status: 'pending', created_by: user.sub, is_admin_created: 0, approved: 0 } }
  }).catch(() => {})
  return json({ id, requires_approval: true, success: true }, 201)
}

async function handleApproveCompetition(request, env, user) {
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

async function handleRejectCompetition(request, env, user) {
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

async function handleJoinCompetition(request, env, user) {
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

async function handleLeaveCompetition(request, env, user) {
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

async function handleGetLeaderboard(request, env, user) {
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

async function handleEndCompetition(request, env, user) {
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

/* ── Study Hours Sync ── */

async function handleSyncStudyHours(request, env, user) {
  const { session_minutes } = await request.json()
  if (!session_minutes || typeof session_minutes !== 'number' || session_minutes <= 0) {
    return json({ error: 'session_minutes must be a positive number' }, 400)
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const isoNow = now.toISOString()
  const sessionId = uuid()

  // Find all communities the user belongs to
  const { results: memberships } = await env.DB.prepare(
    'SELECT community_id FROM community_members WHERE user_id = ?'
  ).bind(user.sub).all()

  for (const m of memberships) {
    const communityId = m.community_id

    // 1. Log granular session
    await env.DB.prepare(
      'INSERT INTO study_sessions_log (id, community_id, user_id, minutes, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(sessionId + '_' + communityId, communityId, user.sub, session_minutes, isoNow).run()

    // 2. Upsert monthly hours
    await env.DB.prepare(
      `INSERT INTO community_monthly_hours (id, community_id, user_id, year, month, total_hours, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(community_id, user_id, year, month)
       DO UPDATE SET total_hours = total_hours + ?, updated_at = ?`
    ).bind(
      uuid(), communityId, user.sub, year, month, session_minutes / 60, isoNow,
      session_minutes / 60, isoNow
    ).run()

    // 3. Update member cumulative total (incremental)
    await env.DB.prepare(
      'UPDATE community_members SET total_study_hours = COALESCE(total_study_hours, 0) + ? WHERE community_id = ? AND user_id = ?'
    ).bind(session_minutes / 60, communityId, user.sub).run()
  }

  // 4. Update community global totals
  await env.DB.prepare(
    `UPDATE communities SET total_study_hours = (
      SELECT COALESCE(SUM(total_study_hours), 0) FROM community_members WHERE community_id = communities.id
    )`
  ).run()

  // 5. Update hours for active competition participations (incremental)
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

function badgeEmoji(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

async function handleMonthlyLeaderboard(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear()
  const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1
  const filter = url.searchParams.get('filter') || 'this_month' // this_month, this_week, mentors, scholars

  // Verify membership
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
    // this_month or role-based
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

  // Get user names from user_profiles
  const nameMap = {}
  if (hours.length > 0) {
    const { results: nameRows } = await env.DB.prepare(
      `SELECT user_id, user_name FROM user_profiles
       WHERE user_id IN (${hours.map(h => '?').join(',')})`
    ).bind(...hours.map(h => h.user_id)).all()
    for (const r of nameRows) { nameMap[r.user_id] = r.user_name }
  }

  // Get badges for this month
  const { results: badges } = await env.DB.prepare(
    'SELECT * FROM community_monthly_badges WHERE community_id = ? AND year = ? AND month = ? ORDER BY rank'
  ).bind(communityId, year, month).all()
  const badgeMap = {}
  for (const b of badges) { badgeMap[b.user_id] = b }

  // Assign badges if month ended and no badges exist yet
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

  const ranked = hours.map((h, i) => ({
    rank: i + 1,
    user_id: h.user_id,
    user_name: nameMap[h.user_id] || h.user_id?.slice(0, 8) || 'Unknown',
    hours: Math.round(h.hours * 10) / 10,
    badge: badgeMap[h.user_id] ? { emoji: badgeEmoji(badgeMap[h.user_id].rank), rank: badgeMap[h.user_id].rank, title: badgeMap[h.user_id].title || '' } : null,
    is_me: h.user_id === user.sub,
  }))

  return json(ranked)
}

async function handleLeaderboardPosition(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not a member' }, 403)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const todayStr = now.toISOString().slice(0, 10)

  // Current rank in monthly leaderboard
  const { results: all } = await env.DB.prepare(
    `SELECT user_id, total_hours FROM community_monthly_hours
     WHERE community_id = ? AND year = ? AND month = ?
     ORDER BY total_hours DESC`
  ).bind(communityId, year, month).all()

  const myIdx = all.findIndex(h => h.user_id === user.sub)
  const myHours = myIdx >= 0 ? all[myIdx].total_hours : 0
  const myRank = myIdx >= 0 ? myIdx + 1 : null
  const totalParticipants = all.length

  // Hours needed to pass next rank
  let hoursToNext = null
  if (myIdx > 0) {
    hoursToNext = Math.round((all[myIdx - 1].total_hours - myHours) * 10) / 10
  }

  // Position change: compare with last snapshot or yesterday
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

  // Create today's snapshot if not exists
  const { results: todaySnap } = await env.DB.prepare(
    'SELECT id FROM community_leaderboard_snapshots WHERE community_id = ? AND snapshot_date = ?'
  ).bind(communityId, todayStr).all()
  if (todaySnap.length === 0) {
    const snapshotData = all.map(h => ({ user_id: h.user_id, hours: h.total_hours }))
    await env.DB.prepare(
      'INSERT INTO community_leaderboard_snapshots (id, community_id, snapshot_date, ranking) VALUES (?, ?, ?, ?)'
    ).bind(uuid(), communityId, todayStr, JSON.stringify(snapshotData)).run()
  }

  // Today's hours
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

async function handleSetLeaderboardTitle(request, env, user) {
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

async function handleAllTimeLeaderboard(request, env, user) {
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

  // Get names
  const nameMap = {}
  if (allTime.length > 0) {
    const { results: nameRows } = await env.DB.prepare(
      `SELECT user_id, user_name FROM user_profiles
       WHERE user_id IN (${allTime.map(h => '?').join(',')})`
    ).bind(...allTime.map(h => h.user_id)).all()
    for (const r of nameRows) { nameMap[r.user_id] = r.user_name }
  }

  const ranked = allTime.map((h, i) => ({
    rank: i + 1,
    user_id: h.user_id,
    user_name: nameMap[h.user_id] || h.user_id?.slice(0, 8),
    hours: Math.round((h.hours || 0) * 10) / 10,
    is_me: h.user_id === user.sub,
  }))

  return json(ranked)
}

async function handleUserBadges(request, env) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[4] // /api/users/:id/badges

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

/* ── Member Management ── */

async function handleSetMemberTitle(request, env, user) {
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

async function handleMuteMember(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  console.log('handleMuteMember:', JSON.stringify({ userId: user.sub, communityId, memberFound: !!member, memberRole: member?.role, requiredRole: ROLES.MODERATOR }))
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

async function handleUnmuteMember(request, env, user) {
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

async function handleGetMutes(request, env, user) {
  const communityId = extractCommunityId(request.url)
  const member = await getMember(env, communityId, user.sub)
  if (!member) return json({ error: 'Not authorized', reason: 'membership_required' }, 403)
  if (!hasMinimumRole(member.role, ROLES.MODERATOR)) return json({ error: 'Not authorized', reason: 'role_insufficient' }, 403)

  const { results } = await env.DB.prepare(
    'SELECT cm.*, u.user_name FROM community_mutes cm LEFT JOIN user_profiles u ON cm.user_id = u.user_id WHERE cm.community_id = ? ORDER BY cm.created_at DESC'
  ).bind(communityId).all()

  return json(results)
}

async function handleUserProfile(request, env) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[3]

  const { results: badges } = await env.DB.prepare(
    `SELECT cmb.*, c.name as community_name FROM community_monthly_badges cmb
     JOIN communities c ON cmb.community_id = c.id
     WHERE cmb.user_id = ? ORDER BY cmb.year DESC, cmb.month DESC`
  ).bind(targetUserId).all()

  const { results: hours } = await env.DB.prepare(
    'SELECT COALESCE(SUM(total_study_hours), 0) as total FROM community_members WHERE user_id = ?'
  ).bind(targetUserId).all()
  const totalHours = hours[0]?.total || 0

  const { results: communities } = await env.DB.prepare(
    `SELECT cm.role, cm.title, cm.total_study_hours, cm.joined_at, c.id, c.name, c.avatar_url
     FROM community_members cm JOIN communities c ON cm.community_id = c.id
     WHERE cm.user_id = ? ORDER BY cm.joined_at DESC`
  ).bind(targetUserId).all()

  const { results: questions } = await env.DB.prepare(
    'SELECT COALESCE(SUM(correct), 0) as solved FROM uworld_blocks WHERE user_id = ?'
  ).bind(targetUserId).all()
  const questionsSolved = questions[0]?.solved || 0

  let streak = 0
  const { results: sessionDays } = await env.DB.prepare(
    'SELECT DISTINCT DATE(created_at) as day FROM study_sessions_log WHERE user_id = ? ORDER BY day DESC'
  ).bind(targetUserId).all()

  if (sessionDays.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const latestDay = new Date(sessionDays[0].day + 'T00:00:00')
    if (latestDay >= yesterday) {
      streak = 1
      for (let i = 1; i < sessionDays.length; i++) {
        const prev = new Date(sessionDays[i - 1].day + 'T00:00:00')
        const cur = new Date(sessionDays[i].day + 'T00:00:00')
        const diff = (prev - cur) / 86400000
        if (diff === 1) streak++
        else break
      }
    }
  }

  return json({
    badges: badges.map(b => ({
      community_id: b.community_id, community_name: b.community_name,
      year: b.year, month: b.month, rank: b.rank,
      emoji: b.rank === 1 ? '🥇' : b.rank === 2 ? '🥈' : '🥉',
      title: b.title || '',
    })),
    totalHours,
    questionsSolved,
    streak,
    communities,
  })
}

/* ── Realtime ── */

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

async function handleWebSocketUpgrade(request, env) {
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

/* ── Notifications ── */

async function handleListNotifications(request, env, user) {
  const results = await env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(user.sub).all()
  return json(results.results || [])
}

async function handleCreateNotification(request, env, user) {
  const body = await request.json()
  const { user_id, type, title, body: notifBody, data } = body
  if (!user_id || !type || !title) return json({ error: 'user_id, type, title required' }, 400)
  const id = crypto.randomUUID()
  const dataStr = data ? JSON.stringify(data) : null
  await env.DB.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user_id, type, title, notifBody || '', dataStr).run()
  return json({ id })
}

async function handleMarkNotificationRead(request, env, user) {
  const id = request.url.match(/\/notifications\/([^\/]+)\/read/)[1]
  await env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .bind(id, user.sub).run()
  return json({ success: true })
}

async function handleMarkAllRead(request, env, user) {
  await env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0')
    .bind(user.sub).run()
  return json({ success: true })
}

export { CommunityRealtimeRoom }

function mapMessage(r) {
  const deleted = r.deleted_at !== null
  return {
    id: r.id,
    community_id: r.community_id,
    user_id: r.user_id,
    user_name: r.user_name,
    user_role: r.user_role || 'member',
    content: deleted ? null : r.content,
    message_type: r.message_type,
    file_key: r.file_key,
    file_name: r.file_name,
    file_size: Number(r.file_size) || 0,
    mime_type: r.mime_type || '',
    is_edited: !!r.is_edited,
    deleted: deleted,
    created_at: r.created_at,
  }
}
