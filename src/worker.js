import { createAuth } from './_auth.js'
import { ROLES, PERM, hasPermission } from './lib/permissions.js'
import { CommunityRealtimeRoom } from './do/CommunityRealtimeRoom.js'
import {
  uuid, json, corsHeaders, extractId, safeString, pageParams, MAX, ALLOWED_MIME,
  ensureUserProfile, log, checkRate, mapCard, mapResource,
} from './lib/worker-utils.js'

import {
  handleListRooms, handleCreateRoom, handleJoinRoom, handleLeaveRoom, handleEndRoom,
  handleGetTimer, handleStartTimer, handlePauseTimer, handleResumeTimer, handleStopTimer,
  handleUpdateFocusStatus,
} from './handlers/rooms.js'

import {
  handleListCommunities, handleCreateCommunity, handleCreateCommunityFromTemplate,
  handleGetCommunityFull, handleGetCommunity, handleUpdateCommunity, handleDeleteCommunity,
  handleJoinCommunity, handleLeaveCommunity, handleResolveInviteCode, handleJoinByCode,
  handleRegenerateInviteCode, handleListMembers, handleRemoveMember, handleChangeMemberRole,
  handleAssignLevel, handleUpdateReadState, handleSetMemberTitle,
  handleBanMember, handleListBans, handleRemoveBan, handleRestoreBan, handleListAuditLog,
  handleListJoinRequests, handleUpdateJoinRequest,
  handleListRules, handleAddRule, handleRemoveRule, handleSuggestedRules,
  handleGetSettings, handleUpdateSettings,
  handleGetMessages, handleGetMessageHistory, handleSendMessage, handleSendFileMessage,
  handleListCommunityFiles, handleGetMessageFile, handleSendFlashcardMessage,
  handleEditMessage, handleDeleteMessage, handleAddFlashcardToDeck,
  handleToggleReaction, handleListPins, handlePinMessage, handleUnpinMessage,
  handleListAnnouncements, handleCreateAnnouncement, handleUpdateAnnouncement, handleDeleteAnnouncement,
  handleListLevels, handleCreateLevel, handleUpdateLevel, handleDeleteLevel,
  handleListCompetitions, handleCreateCompetition, handleApproveCompetition, handleRejectCompetition,
  handleJoinCompetition, handleLeaveCompetition, handleGetCompetitionLeaderboard, handleEndCompetition,
  handleMuteMember, handleGetMutes, handleUnmuteMember,
  handleWebSocketUpgrade, handleGetModDashboard,
} from './handlers/communities.js'

import {
  handleSyncStudyHours, handleMonthlyLeaderboard, handleLeaderboardPosition,
  handleSetLeaderboardTitle, handleAllTimeLeaderboard, handleUserBadges,
  handleHeatmap, handleSessionTimeline, handleRoomStats,
} from './handlers/stats.js'

import {
  handleListNotifications, handleCreateNotification,
  handleMarkAllRead, handleMarkNotificationRead, handleCleanupNotifications,
} from './handlers/notifications.js'

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (!path.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404)
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
          rateMax = 30; rateWindow = 60000
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
      if (path === '/api/notifications/cleanup' && request.method === 'POST') return handleCleanupNotifications(request, env, user)
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
      if (path.match(/^\/api\/competitions\/[^\/]+\/leaderboard$/) && request.method === 'GET') return handleGetCompetitionLeaderboard(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/end$/) && request.method === 'PUT') return handleEndCompetition(request, env, user)
      if (path === '/api/study-hours/sync' && request.method === 'POST') return handleSyncStudyHours(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/monthly$/) && request.method === 'GET') return handleMonthlyLeaderboard(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/position$/) && request.method === 'GET') return handleLeaderboardPosition(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/title$/) && request.method === 'PUT') return handleSetLeaderboardTitle(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/all-time$/) && request.method === 'GET') return handleAllTimeLeaderboard(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/badges$/) && request.method === 'GET') return handleUserBadges(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/stats\/heatmap$/) && request.method === 'GET') return handleHeatmap(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/title$/) && request.method === 'PUT') return handleSetMemberTitle(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes$/) && request.method === 'POST') return handleMuteMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes$/) && request.method === 'GET') return handleGetMutes(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes\/[^\/]+$/) && request.method === 'DELETE') return handleUnmuteMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms$/) && request.method === 'GET') return handleListRooms(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms$/) && request.method === 'POST') return handleCreateRoom(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/join$/) && request.method === 'POST') return handleJoinRoom(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/leave$/) && request.method === 'POST') return handleLeaveRoom(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/end$/) && request.method === 'POST') return handleEndRoom(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer$/) && request.method === 'GET') return handleGetTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer\/start$/) && request.method === 'POST') return handleStartTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer\/pause$/) && request.method === 'POST') return handlePauseTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer\/resume$/) && request.method === 'POST') return handleResumeTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer\/stop$/) && request.method === 'POST') return handleStopTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/status$/) && (request.method === 'PUT' || request.method === 'POST')) return handleUpdateFocusStatus(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/stats$/) && request.method === 'GET') return handleRoomStats(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timeline$/) && request.method === 'GET') return handleSessionTimeline(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/profile$/) && request.method === 'GET') return handleUserProfile(request, env)

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      return json({ error: err.message }, 500)
    }
  },
}

/* ── Non-community handlers ── */

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
  return json({ success: true })
}

async function handleDeleteFlashcard(request, env, user) {
  const id = extractId(request.url)
  await env.DB.prepare('DELETE FROM flashcards WHERE id = ? AND user_id = ?').bind(id, user.sub).run()
  return json({ success: true })
}

async function handleDueCount(request, env, user) {
  const now = new Date().toISOString()
  const { results } = await env.DB.prepare(
    'SELECT deck_name, COUNT(*) as count FROM flashcards WHERE user_id = ? AND (next_review IS NULL OR next_review <= ?) GROUP BY deck_name ORDER BY deck_name'
  ).bind(user.sub, now).all()
  return json(results)
}

async function handleGetDecks(request, env, user) {
  const { results } = await env.DB.prepare(
    'SELECT deck_name, COUNT(*) as card_count FROM flashcards WHERE user_id = ? GROUP BY deck_name ORDER BY deck_name'
  ).bind(user.sub).all()
  return json(results)
}

async function handleCreateDeck(request, env, user) {
  const { deck_name } = await request.json()
  if (!deck_name || typeof deck_name !== 'string' || deck_name.trim().length > 100) return json({ error: 'Deck name required (max 100 chars)' }, 400)
  return json({ success: true, deck_name: deck_name.trim() })
}

async function handleDeleteDeck(request, env, user) {
  const deckName = decodeURIComponent(extractId(request.url))
  await env.DB.prepare('DELETE FROM flashcards WHERE user_id = ? AND deck_name = ?').bind(user.sub, deckName).run()
  return json({ success: true })
}

async function handleUploadImage(request, env, user) {
  const formData = await request.formData()
  const file = formData.get('image')
  if (!file) return json({ error: 'Image required' }, 400)
  if (!file.type.startsWith('image/')) return json({ error: 'Only images allowed' }, 400)
  if (file.size > 10 * 1024 * 1024) return json({ error: 'Image too large (max 10MB)' }, 400)

  const ext = file.name?.split('.').pop() || 'png'
  const key = `uploads/${uuid()}.${ext}`
  await env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })

  const imageUrl = `${new URL(request.url).origin}/api/images/${key}`
  return json({ url: imageUrl, key })
}

async function handleGetImage(request, env) {
  const key = extractId(request.url)
  const obj = await env.IMAGES.get(key)
  if (!obj) return json({ error: 'Not found' }, 404)

  const headers = new Headers()
  headers.set('content-type', obj.httpMetadata?.contentType || 'image/png')
  headers.set('cache-control', 'public, max-age=31536000')
  headers.set('access-control-allow-origin', '*')
  return new Response(obj.body, { headers })
}

async function handleGetFsrs(request, env, user) {
  const { results } = await env.DB.prepare('SELECT params FROM fsrs_parameters WHERE user_id = ?').bind(user.sub).all()
  if (!results.length) return json({ params: null })
  return json({ params: JSON.parse(results[0].params) })
}

async function handleSaveFsrs(request, env, user) {
  const { params } = await request.json()
  await env.DB.prepare(
    'INSERT INTO fsrs_parameters (user_id, params) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET params = ?'
  ).bind(user.sub, JSON.stringify(params), JSON.stringify(params)).run()
  return json({ success: true })
}

async function handleGetCategories(request, env) {
  const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY name').all()
  return json(results)
}

async function handleCreateCategory(request, env, user) {
  const { name } = await request.json()
  if (!name || typeof name !== 'string') return json({ error: 'Name required' }, 400)
  try {
    await env.DB.prepare('INSERT INTO categories (id, name, user_id) VALUES (?, ?, ?)').bind(uuid(), name.trim(), user.sub).run()
    return json({ success: true }, 201)
  } catch {
    return json({ error: 'Category already exists' }, 409)
  }
}

/* ── Resources ── */

async function handleGetResources(request, env) {
  const url = new URL(request.url)
  const cat = url.searchParams.get('category')
  const tag = url.searchParams.get('tag')
  const q = url.searchParams.get('q')
  const { offset, limit } = pageParams(request.url)

  let sql = 'SELECT * FROM resources WHERE 1=1'
  const binds = []
  if (cat) { sql += ' AND category = ?'; binds.push(cat) }
  if (tag) { sql += ' AND tags LIKE ?'; binds.push(`%"${tag}"%`) }
  if (q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; binds.push(`%${q}%`, `%${q}%`) }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  binds.push(limit, offset)

  const { results } = await env.DB.prepare(sql).bind(...binds).all()
  return json(results.map(mapResource))
}

async function handleGetResource(request, env) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  if (!results.length) return json({ error: 'Not found' }, 404)
  return json(mapResource(results[0]))
}

async function handleCreateResource(request, env, user) {
  let { title, category, description, tags, type, file_name, file_key, file_size, mime_type, image_key } = await request.json()
  if (!title || !category) return json({ error: 'Title and category required' }, 400)

  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO resources (id, title, category, description, tags, type, file_name, file_key, file_size, mime_type, image_key, user_id, user_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, title, category, description || '', JSON.stringify(tags || []), type || '', file_name || '', file_key || '', Number(file_size) || 0, mime_type || '', image_key || null, user.sub, user.email?.split('@')[0] || 'User').run()
  await ensureUserProfile(env, user.sub, user.email?.split('@')[0])

  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  return json(mapResource(results[0]), 201)
}

async function handleUpdateResource(request, env, user) {
  const id = extractId(request.url)
  let body
  try { body = await request.json() } catch { body = {} }
  const fields = []
  const binds = []
  for (const f of ['title', 'category', 'description', 'type', 'file_name', 'file_key', 'image_key']) {
    if (body[f] !== undefined) { fields.push(`${f} = ?`); binds.push(body[f]) }
  }
  if (body.tags) { fields.push('tags = ?'); binds.push(JSON.stringify(body.tags)) }
  if (body.file_size) { fields.push('file_size = ?'); binds.push(Number(body.file_size)) }
  if (body.mime_type) { fields.push('mime_type = ?'); binds.push(body.mime_type) }
  if (!fields.length) return json({ error: 'No fields to update' }, 400)
  fields.push("updated_at = datetime('now')")
  binds.push(id)

  await env.DB.prepare(`UPDATE resources SET ${fields.join(',')} WHERE id = ?`).bind(...binds).run()
  const { results } = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).all()
  return json(mapResource(results[0]))
}

async function handleDeleteResource(request, env, user) {
  const id = extractId(request.url)
  await env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(id).run()
  return json({ success: true })
}

async function handleGetResourceFile(request, env) {
  const parts = new URL(request.url).pathname.split('/')
  const id = parts[3]
  const { results } = await env.DB.prepare('SELECT file_key, file_name, mime_type FROM resources WHERE id = ?').bind(id).all()
  if (!results.length || !results[0].file_key) return json({ error: 'Not found' }, 404)
  const obj = await env.IMAGES.get(results[0].file_key)
  if (!obj) return json({ error: 'Not found' }, 404)
  const headers = new Headers()
  headers.set('content-type', results[0].mime_type || 'application/octet-stream')
  headers.set('content-disposition', `inline; filename="${results[0].file_name}"`)
  headers.set('cache-control', 'public, max-age=31536000')
  return new Response(obj.body, { headers })
}

async function handleGetResourceImage(request, env) {
  const parts = new URL(request.url).pathname.split('/')
  const id = parts[3]
  const { results } = await env.DB.prepare('SELECT image_key FROM resources WHERE id = ?').bind(id).all()
  if (!results.length || !results[0].image_key) return json({ error: 'Not found' }, 404)
  const obj = await env.IMAGES.get(results[0].image_key)
  if (!obj) return json({ error: 'Not found' }, 404)
  const headers = new Headers()
  headers.set('content-type', obj.httpMetadata?.contentType || 'image/png')
  headers.set('cache-control', 'public, max-age=31536000')
  return new Response(obj.body, { headers })
}

async function handleDownloadResourceFile(request, env) {
  return handleGetResourceFile(request, env)
}

async function handleGetComments(request, env) {
  const parts = new URL(request.url).pathname.split('/')
  const resId = parts[3]
  const { results } = await env.DB.prepare(
    'SELECT * FROM resource_comments WHERE resource_id = ? AND removed = 0 ORDER BY created_at ASC'
  ).bind(resId).all()
  return json(results)
}

async function handleCreateComment(request, env, user) {
  const parts = new URL(request.url).pathname.split('/')
  const resId = parts[3]
  let { content, parent_id } = await request.json()
  content = safeString(content, MAX.CONTENT)
  if (!content) return json({ error: 'Content required' }, 400)

  const id = uuid()
  await env.DB.prepare(
    'INSERT INTO resource_comments (id, resource_id, parent_id, user_id, user_name, content) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, resId, parent_id || null, user.sub, user.email?.split('@')[0] || 'User', content).run()
  await ensureUserProfile(env, user.sub, user.email?.split('@')[0])
  return json({ id, success: true }, 201)
}

async function handleDeleteComment(request, env, user) {
  const id = extractId(request.url)
  const { results } = await env.DB.prepare(
    'SELECT user_id FROM resource_comments WHERE id = ? AND removed = 0'
  ).bind(id).all()
  if (!results.length) return json({ error: 'Not found' }, 404)
  if (results[0].user_id !== user.sub) return json({ error: 'Not authorized' }, 403)
  await env.DB.prepare('UPDATE resource_comments SET removed = 1 WHERE id = ?').bind(id).run()
  return json({ success: true })
}

async function handleVoteComment(request, env, user) {
  const commentId = extractId(request.url)
  const { vote } = await request.json()

  const { results } = await env.DB.prepare(
    'SELECT removed FROM resource_comments WHERE id = ?'
  ).bind(commentId).all()
  if (!results.length || results[0].removed) return json({ error: 'Not found' }, 404)

  const existing = await env.DB.prepare(
    'SELECT id, vote FROM comment_votes WHERE comment_id = ? AND user_id = ?'
  ).bind(commentId, user.sub).all()

  if (existing.length && existing[0].vote === vote) {
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

/* ── User Profile ── */

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

export { CommunityRealtimeRoom }
