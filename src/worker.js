import { createAuth } from './_auth.js'
import { ROLES, PERM, hasPermission } from './lib/permissions.js'
import { CommunityRealtimeRoom } from './do/CommunityRealtimeRoom.js'
import { DMRealtimeRoom } from './do/DMRealtimeRoom.js'
import {
  uuid, json, corsHeaders, extractId, safeString, pageParams, MAX, ALLOWED_MIME,
  ensureUserProfile, log, checkRate, mapCard, mapResource,
  isValidUsername, sanitizeUsername, calculateProfileCompletion,
} from './lib/worker-utils.js'

import {
  handleListRooms, handleCreateRoom, handleJoinRoom, handleLeaveRoom, handleEndRoom,
  handleGetTimer, handleStartTimer, handlePauseTimer, handleResumeTimer, handleStopTimer,
  handleUpdateFocusStatus,
} from './handlers/rooms.js'

import {
  handleListCommunities, handleCreateCommunity, handleCreateCommunityFromTemplate,
  handleGetCommunityFull, handleGetCommunity, handleUpdateCommunity, handleUploadCommunityAvatar, handleUploadCommunityBanner, handleDeleteCommunity,
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
  handleInviteUser, handleAcceptCommunityInvitation,
  handleDeclineCommunityInvitation, handleGetMyInvitations,
} from './handlers/communities.js'

import {
  handleSyncStudyHours, handleMonthlyLeaderboard, handleLeaderboardPosition,
  handleSetLeaderboardTitle, handleAllTimeLeaderboard, handleUserBadges,
  handleHeatmap, handleSessionTimeline, handleRoomStats,
  handleGlobalLeaderboard,
  handleGlobalMonthlyLeaderboard, handleCommunitiesMonthlyLeaderboard,
  handleGlobalLeaderboardStats, handleLeaderboardSearch, handleCommunityHallOfFame,
  logUserActivity, refreshUserStatsAndNotify, refreshUserStats, incrementUserStats,
} from './handlers/stats.js'

import {
  handleListNotifications, handleCreateNotification,
  handleMarkAllRead, handleMarkNotificationRead, handleCleanupNotifications,
  handleGetUnreadCounts, handleGetNotificationPreferences, handleUpdateNotificationPreferences,
  notifyGoalCompleted, notifyFlashcardMilestone, createNotificationIfAllowed,
} from './handlers/notifications.js'

import {
  handleListConversations, handleCreateConversation, handleGetDMMessages,
  handleSendDM, handleDeleteDM, handleMarkDMRead, handleStartDMWithUser,
  handleDMWebSocketUpgrade,
} from './handlers/dm.js'

import {
  handleUpdatePresence, handleGetBulkPresence, handleGetPresence,
} from './handlers/presence.js'

import {
  parseMentions, handleMentionSearch,
} from './handlers/mentions.js'

import {
  handleUserCard,
} from './handlers/usercards.js'

import {
  handleGetPins, handlePinResource, handleUnpinResource,
} from './handlers/pins.js'

import {
  handleGetForestInventory, handleUpdateSelectedTree,
  handleEarnCoins, handlePurchaseTree, handleGetForestStats,
} from './handlers/forest.js'

import {
  handleSubscribe, handleSchedulePush, handleCancelPushes, handlePushCron,
} from './handlers/push.js'

import {
  handleGetUserAchievements, handleCheckAchievements,
} from './handlers/achievements.js'

import {
  handleSearchUsers, handleSuggestedConnections,
} from './handlers/people.js'

import {
  handleListResearchPosts, handleCreateResearchPost, handleGetResearchPost,
  handleUpdateResearchPost, handleDeleteResearchPost, handleVoteOnPost,
  handleGetResearchComments, handleAddResearchComment, handleDeleteResearchComment,
  handleMarkHelped, handleGetHelpedMarks,
  handleToggleBookmark, handleGetBookmarks,
  handleReportPost,
  handleGetResearchProfile, handleUpdateResearchProfile,
  handleGetResearchSkills, handleAddResearchSkill, handleDeleteResearchSkill,
  handleGetPredefinedSkills,
  handleGetResearchStats, handleGetResearchEvents,
  handleGetPortfolio, handleAddPortfolioEntry, handleUpdatePortfolioEntry, handleDeletePortfolioEntry,
} from './handlers/research.js'

import {
  handleGetPlans, handleCreatePlan, handleGetPlan, handleUpdatePlan, handleDeletePlan,
  handleGenerateSchedule, handleUpdateEntry, handleGetProgress, handleUpdateProgress,
  handleActivatePlan, handleFlashcardSummary,
} from './handlers/rotations.js'

import {
  getPlannerRotations, getPlannerSources,
  getPlannerSourceRotations, getPlannerSourceRotationTopics,
} from './handlers/rotationPlanner.js'

import {
  handlePreviewRotationPlan, handleCreateRotationPlan,
  handleListRotationPlans, handleGetRotationPlan, handleDeleteRotationPlan,
  handleRenameRotationPlan, handleUpdateTask, handleRecalculatePlan, handleGetPlanForecast,
  handleUpdatePlanStatus, handleGetPlanDecks, handleReplacePlanDecks, handleGetPlanTrackingSchedule,
} from './handlers/rotationPlannerPlans.js'

import {
  listUserDecks,
  listUserDeckMappings,
  upsertDeckMapping,
  deleteDeckMapping,
  verifyPlanOwnership,
  resolveCanonicalTopicForMapping,
  verifyDeckExists,
  cleanupOrphanMapping,
  calculateMappingFingerprint,
  checkMappingIdempotency,
  persistMappingMutation,
  signalFlashcardMappingsStaleness,
  EXISTING_REVIEW_IMPACT,
} from './services/flashcardMappings.js'

import { buildFlashcardReconciliationStatements } from './services/rotationPlannerPlans/flashcardReconciliation.js'

function ensureCORS(response) {
  const h = response.headers
  if (!h.get('access-control-allow-origin')) {
    h.set('access-control-allow-origin', '*')
    h.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    h.set('access-control-allow-headers', 'Content-Type, Authorization, Idempotency-Key')
  }
  return response
}

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID().slice(0, 8)
    try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (!path.startsWith('/api/')) {
      return ensureCORS(json({ error: 'Not found' }, 404))
    }
    if (path.startsWith('/api/images/')) {
      try { return ensureCORS(await handleGetImage(request, env)) }
      catch (err) { console.error(`[${requestId}] images:`, err); return ensureCORS(json({ error: err.message, requestId }, 500)) }
    }

    if (path.match(/^\/api\/communities\/[^\/]+\/ws$/) && request.method === 'GET') {
      try {
        return await handleWebSocketUpgrade(request, env)
      } catch (err) {
        console.error(`[${requestId}] ws:`, err)
        return ensureCORS(json({ error: err.message, requestId }, 500))
      }
    }

    if (path.match(/^\/api\/dm\/[^\/]+\/ws$/) && request.method === 'GET') {
      try {
        return await handleDMWebSocketUpgrade(request, env)
      } catch (err) {
        console.error(`[${requestId}] dm-ws:`, err)
        return ensureCORS(json({ error: err.message, requestId }, 500))
      }
    }

    try {
      const verifyAuth = createAuth(env)

      let user = null
      const syntheticAuthEnabled = env.ENVIRONMENT === 'test'
      const testUserId = syntheticAuthEnabled
        ? (request.headers.get('x-test-user-id') || url.searchParams.get('__test'))
        : null
      if (testUserId) {
        user = { sub: testUserId, email: testUserId + '@test.local', role: 'authenticated' }
      } else if (request.headers.has('x-test-user-id') || url.searchParams.has('__test')) {
        return ensureCORS(json({ error: 'Not found' }, 404))
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
        return await handleGetFlashcards(request, env, user)
      }
      if (path === '/api/flashcards' && request.method === 'POST') {
        return await handleCreateFlashcards(request, env, user)
      }
      if (path === '/api/flashcards/due-count' && request.method === 'GET') {
        return await handleDueCount(request, env, user)
      }
      if (path.match(/^\/api\/flashcards\/[^\/]+$/) && request.method === 'PUT') {
        return await handleUpdateFlashcard(request, env, user)
      }
      if (path.match(/^\/api\/flashcards\/[^\/]+$/) && request.method === 'DELETE') {
        return await handleDeleteFlashcard(request, env, user)
      }

      if (path === '/api/decks' && request.method === 'GET') {
        return await handleGetDecks(request, env, user)
      }
      if (path === '/api/decks' && request.method === 'POST') {
        return await handleCreateDeck(request, env, user)
      }
      if (path.match(/^\/api\/decks\/[^\/]+$/) && request.method === 'DELETE') {
        return await handleDeleteDeck(request, env, user)
      }

      if (path === '/api/flashcards/decks' && request.method === 'GET') {
        return await handleListDecks(request, env, user)
      }

      if (path === '/api/deck-mappings' && request.method === 'GET') {
        return await handleListDeckMappings(request, env, user)
      }
      if (path === '/api/deck-mappings' && request.method === 'POST') {
        return await handleCreateDeckMapping(request, env, user)
      }
      if (path.match(/^\/api\/deck-mappings\/[^\/]+$/) && request.method === 'DELETE') {
        return await handleDeleteDeckMapping(request, env, user)
      }

      if (path === '/api/upload-image' && request.method === 'POST') {
        return await handleUploadImage(request, env, user)
      }

      if (path === '/api/fsrs/get' && request.method === 'GET') {
        return await handleGetFsrs(request, env, user)
      }
      if (path === '/api/fsrs/save' && request.method === 'POST') {
        return await handleSaveFsrs(request, env, user)
      }

      if (path === '/api/categories' && request.method === 'GET') {
        return await handleGetCategories(request, env)
      }
      if (path === '/api/categories' && request.method === 'POST') {
        return await handleCreateCategory(request, env, user)
      }

      if (path === '/api/resources' && request.method === 'GET') {
        return await handleGetResources(request, env)
      }
      if (path === '/api/resources' && request.method === 'POST') {
        return await handleCreateResource(request, env, user)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'GET') {
        return await handleGetResource(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'PUT') {
        return await handleUpdateResource(request, env, user)
      }
      if (path.match(/^\/api\/resources\/[^\/]+$/) && request.method === 'DELETE') {
        return await handleDeleteResource(request, env, user)
      }

      if (path.match(/^\/api\/resources\/[^\/]+\/file$/) && request.method === 'GET') {
        return await handleGetResourceFile(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/image$/) && request.method === 'GET') {
        return await handleGetResourceImage(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/download$/) && request.method === 'GET') {
        return await handleDownloadResourceFile(request, env)
      }

      if (path.match(/^\/api\/resources\/[^\/]+\/comments$/) && request.method === 'GET') {
        return await handleGetComments(request, env)
      }
      if (path.match(/^\/api\/resources\/[^\/]+\/comments$/) && request.method === 'POST') {
        return await handleCreateComment(request, env, user)
      }

      if (path.match(/^\/api\/comments\/[^\/]+$/) && request.method === 'DELETE') {
        return await handleDeleteComment(request, env, user)
      }
      if (path.match(/^\/api\/comments\/[^\/]+\/vote$/) && request.method === 'POST') {
        return await handleVoteComment(request, env, user)
      }

      if (path === '/api/notifications/unread-counts' && request.method === 'GET') return await handleGetUnreadCounts(request, env, user)
      if (path === '/api/notifications/preferences' && request.method === 'GET') return await handleGetNotificationPreferences(request, env, user)
      if (path === '/api/notifications/preferences' && request.method === 'PUT') return await handleUpdateNotificationPreferences(request, env, user)
      if (path === '/api/notifications' && request.method === 'GET') return await handleListNotifications(request, env, user)
      if (path === '/api/notifications' && request.method === 'POST') return await handleCreateNotification(request, env, user)
      if (path === '/api/notifications/read-all' && request.method === 'POST') return await handleMarkAllRead(request, env, user)
      if (path === '/api/notifications/cleanup' && request.method === 'POST') return await handleCleanupNotifications(request, env, user)
      if (path.match(/^\/api\/notifications\/([^\/]+)\/read$/) && request.method === 'POST') return await handleMarkNotificationRead(request, env, user)
      if (path === '/api/communities' && request.method === 'GET') return await handleListCommunities(request, env, user)
      if (path === '/api/communities' && request.method === 'POST') return await handleCreateCommunity(request, env, user)
      if (path === '/api/communities/from-template' && request.method === 'POST') return await handleCreateCommunityFromTemplate(request, env, user)
      if (path === '/api/communities/join-by-code' && request.method === 'POST') return await handleJoinByCode(request, env, user)
      if (path.match(/^\/api\/communities\/join\/[^\/]+$/) && request.method === 'GET') return await handleResolveInviteCode(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/join-requests\/[^\/]+$/) && request.method === 'PUT') return await handleUpdateJoinRequest(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/join-requests$/) && request.method === 'GET') return await handleListJoinRequests(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/[^\/]+\/reactions$/) && request.method === 'POST') return await handleToggleReaction(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/[^\/]+$/) && request.method === 'PUT') return await handleEditMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/file$/) && request.method === 'POST') return await handleSendFileMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/files$/) && request.method === 'GET') return await handleListCommunityFiles(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/files\/[^\/]+$/) && request.method === 'GET') return await handleGetMessageFile(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/flashcard$/) && request.method === 'POST') return await handleSendFlashcardMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages\/history$/) && request.method === 'GET') return await handleGetMessageHistory(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages$/) && request.method === 'GET') return await handleGetMessages(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/messages$/) && request.method === 'POST') return await handleSendMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/audit-log$/) && request.method === 'GET') return await handleListAuditLog(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/bans\/[^\/]+\/restore$/) && request.method === 'POST') return await handleRestoreBan(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/bans\/[^\/]+$/) && request.method === 'DELETE') return await handleRemoveBan(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/bans$/) && request.method === 'GET') return await handleListBans(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/bans$/) && request.method === 'POST') return await handleBanMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/pins\/[^\/]+$/) && request.method === 'DELETE') return await handleUnpinMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/pins$/) && request.method === 'GET') return await handleListPins(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/pins$/) && request.method === 'POST') return await handlePinMessage(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/avatar$/) && request.method === 'POST') return await handleUploadCommunityAvatar(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/banner$/) && request.method === 'POST') return await handleUploadCommunityBanner(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/announcements\/[^\/]+$/) && request.method === 'PUT') return await handleUpdateAnnouncement(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/announcements\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteAnnouncement(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/announcements$/) && request.method === 'GET') return await handleListAnnouncements(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/announcements$/) && request.method === 'POST') return await handleCreateAnnouncement(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rules\/[^\/]+$/) && request.method === 'DELETE') return await handleRemoveRule(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rules$/) && request.method === 'GET') return await handleListRules(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/rules$/) && request.method === 'POST') return await handleAddRule(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/settings$/) && request.method === 'GET') return await handleGetSettings(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/settings$/) && request.method === 'PUT') return await handleUpdateSettings(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/levels\/[^\/]+$/) && request.method === 'PUT') return await handleUpdateLevel(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/levels\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteLevel(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/levels$/) && request.method === 'GET') return await handleListLevels(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/levels$/) && request.method === 'POST') return await handleCreateLevel(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/competitions$/) && request.method === 'GET') return await handleListCompetitions(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/competitions$/) && request.method === 'POST') return await handleCreateCompetition(request, env, user, ctx)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/read-state$/) && request.method === 'PUT') return await handleUpdateReadState(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/role$/) && request.method === 'PUT') return await handleChangeMemberRole(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/level$/) && request.method === 'PUT') return await handleAssignLevel(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+$/) && request.method === 'DELETE') return await handleRemoveMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members$/) && request.method === 'GET') return await handleListMembers(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/join$/) && request.method === 'POST') {
        const res = await handleJoinCommunity(request, env, user, ctx)
        if (res.status === 200 || res.status === undefined) {
          const communityId = path.split('/')[3]
          logUserActivity(env, user.sub, 'joined_community', communityId, 'community', {}).catch(() => {})
          refreshUserStatsAndNotify(env, user.sub).catch(() => {})
        }
        return res
      }
      if (path.match(/^\/api\/communities\/[^\/]+\/leave$/) && request.method === 'POST') return await handleLeaveCommunity(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/invite-code$/) && request.method === 'POST') return await handleRegenerateInviteCode(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mod-dashboard$/) && request.method === 'GET') return await handleGetModDashboard(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/full$/) && request.method === 'GET') return await handleGetCommunityFull(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+$/) && request.method === 'GET') return await handleGetCommunity(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+$/) && request.method === 'PUT') return await handleUpdateCommunity(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteCommunity(request, env, user)
      if (path === '/api/community/suggested-rules' && request.method === 'GET') return await handleSuggestedRules()
      if (path.match(/^\/api\/community\/messages\/[^\/]+\/add-to-deck$/) && request.method === 'POST') return await handleAddFlashcardToDeck(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/approve$/) && request.method === 'PUT') return await handleApproveCompetition(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/reject$/) && request.method === 'PUT') return await handleRejectCompetition(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/join$/) && (request.method === 'POST' || request.method === 'PUT')) {
        const res = await handleJoinCompetition(request, env, user)
        if (res.status === 200 || res.status === undefined) {
          const compId = path.split('/')[3]
          logUserActivity(env, user.sub, 'joined_competition', compId, 'competition', {}).catch(() => {})
          refreshUserStatsAndNotify(env, user.sub).catch(() => {})
        }
        return res
      }
      if (path.match(/^\/api\/competitions\/[^\/]+\/leave$/) && (request.method === 'POST' || request.method === 'DELETE')) return await handleLeaveCompetition(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/leaderboard$/) && request.method === 'GET') return await handleGetCompetitionLeaderboard(request, env, user)
      if (path.match(/^\/api\/competitions\/[^\/]+\/end$/) && request.method === 'PUT') return await handleEndCompetition(request, env, user)
      if (path === '/api/study-hours/sync' && request.method === 'POST') {
        const res = await handleSyncStudyHours(request, env, user)
        logUserActivity(env, user.sub, 'studied', null, 'session', {}).catch(() => {})
        refreshUserStatsAndNotify(env, user.sub).catch(() => {})
        return res
      }
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/monthly$/) && request.method === 'GET') return await handleMonthlyLeaderboard(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/position$/) && request.method === 'GET') return await handleLeaderboardPosition(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/title$/) && request.method === 'PUT') return await handleSetLeaderboardTitle(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/leaderboard\/all-time$/) && request.method === 'GET') return await handleAllTimeLeaderboard(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/badges$/) && request.method === 'GET') return await handleUserBadges(request, env)
      if (path.match(/^\/api\/communities\/[^\/]+\/stats\/heatmap$/) && request.method === 'GET') return await handleHeatmap(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/members\/[^\/]+\/title$/) && request.method === 'PUT') return await handleSetMemberTitle(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes$/) && request.method === 'POST') return await handleMuteMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes$/) && request.method === 'GET') return await handleGetMutes(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/mutes\/[^\/]+$/) && request.method === 'DELETE') return await handleUnmuteMember(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms$/) && request.method === 'GET') return await handleListRooms(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms$/) && request.method === 'POST') return await handleCreateRoom(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/join$/) && request.method === 'POST') return await handleJoinRoom(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/leave$/) && request.method === 'POST') return await handleLeaveRoom(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/end$/) && request.method === 'POST') return await handleEndRoom(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer$/) && request.method === 'GET') return await handleGetTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer\/start$/) && request.method === 'POST') return await handleStartTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer\/pause$/) && request.method === 'POST') return await handlePauseTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer\/resume$/) && request.method === 'POST') return await handleResumeTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timer\/stop$/) && request.method === 'POST') return await handleStopTimer(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/status$/) && (request.method === 'PUT' || request.method === 'POST')) return await handleUpdateFocusStatus(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/stats$/) && request.method === 'GET') return await handleRoomStats(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/rooms\/[^\/]+\/timeline$/) && request.method === 'GET') return await handleSessionTimeline(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/profile$/) && request.method === 'GET') return await handleUserProfile(request, env, user, ctx)
      if (path.match(/^\/api\/users\/[^\/]+\/profile$/) && request.method === 'PUT') return await handleUpdateUserProfile(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/avatar$/) && request.method === 'POST') return await handleUploadUserAvatar(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/banner$/) && request.method === 'POST') return await handleUploadUserBanner(request, env, user)
      if (path.match(/^\/api\/users\/username\/[^\/]+$/) && request.method === 'GET') return await handleGetUserByUsername(request, env)
      if (path.match(/^\/api\/users\/check-username\/[^\/]+$/) && request.method === 'GET') return await handleCheckUsername(request, env)
      if (path.match(/^\/api\/users\/[^\/]+\/activity$/) && request.method === 'GET') return await handleGetUserActivity(request, env)
      if (path.match(/^\/api\/users\/[^\/]+\/follow$/) && request.method === 'POST') return await handleFollowUser(request, env, user, ctx)
      if (path.match(/^\/api\/users\/[^\/]+\/follow$/) && request.method === 'DELETE') return await handleUnfollowUser(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/follow-status$/) && request.method === 'GET') return await handleFollowStatus(request, env, user)

      // ── DM Routes ──
      if (path === '/api/dm/conversations' && request.method === 'GET') return await handleListConversations(request, env, user)
      if (path === '/api/dm/conversations' && request.method === 'POST') return await handleCreateConversation(request, env, user)
      if (path.match(/^\/api\/dm\/[^\/]+\/messages$/) && request.method === 'GET') return await handleGetDMMessages(request, env, user)
      if (path.match(/^\/api\/dm\/[^\/]+\/messages$/) && request.method === 'POST') return await handleSendDM(request, env, user)
      if (path.match(/^\/api\/dm\/[^\/]+\/messages\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteDM(request, env, user)
      if (path.match(/^\/api\/dm\/[^\/]+\/read$/) && request.method === 'POST') return await handleMarkDMRead(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/dm$/) && request.method === 'POST') return await handleStartDMWithUser(request, env, user)

      // ── Presence Routes ──
      if (path === '/api/presence/status' && request.method === 'POST') return await handleUpdatePresence(request, env, user)
      if (path === '/api/presence/bulk' && request.method === 'POST') return await handleGetBulkPresence(request, env, user)
      if (path.match(/^\/api\/presence\/[^\/]+$/) && request.method === 'GET') return await handleGetPresence(request, env, user)

      // ── Heatmap ──
      if (path.match(/^\/api\/users\/[^\/]+\/heatmap$/) && request.method === 'GET') return await handleUserHeatmap(request, env, user)

      // ── User Card ──
      if (path.match(/^\/api\/users\/[^\/]+\/card$/) && request.method === 'GET') return await handleUserCard(request, env, user)

      // ── Mention Search ──
      if (path === '/api/users/mention/search' && request.method === 'GET') return await handleMentionSearch(request, env, user)

      // ── Pinned Resources ──
      if (path.match(/^\/api\/users\/[^\/]+\/pins$/) && request.method === 'GET') return await handleGetPins(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/pins$/) && request.method === 'POST') return await handlePinResource(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/pins\/[^\/]+$/) && request.method === 'DELETE') return await handleUnpinResource(request, env, user)

      // ── Goal Completion Notification ──
      if (path === '/api/goals/complete' && request.method === 'POST') {
        const { title } = await request.json()
        if (!title) return json({ error: 'title required' }, 400)
        await notifyGoalCompleted(env, user.sub, title)
        return json({ success: true })
      }

      // ── Flashcard Milestone Notification ──
      if (path === '/api/flashcards/milestone' && request.method === 'POST') {
        const { count } = await request.json()
        if (!count) return json({ error: 'count required' }, 400)
        await notifyFlashcardMilestone(env, user.sub, count)
        return json({ success: true })
      }

      // ── Achievements ──
      if (path === '/api/achievements/check' && request.method === 'POST') return await handleCheckAchievements(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/achievements$/) && request.method === 'GET') return await handleGetUserAchievements(request, env)

      // ── Global Leaderboard ──
      if (path === '/api/leaderboard/global' && request.method === 'GET') return await handleGlobalLeaderboard(request, env, user)

      // ── Leaderboard Rankings ──
      if (path === '/api/leaderboard/users/monthly' && request.method === 'GET') return await handleGlobalMonthlyLeaderboard(request, env, user)
      if (path === '/api/leaderboard/communities/monthly' && request.method === 'GET') return await handleCommunitiesMonthlyLeaderboard(request, env, user)
      if (path === '/api/leaderboard/stats' && request.method === 'GET') return await handleGlobalLeaderboardStats(request, env, user)
      if (path === '/api/leaderboard/search' && request.method === 'GET') return await handleLeaderboardSearch(request, env, user)

      // ── Invitations ──
      if (path === '/api/invitations' && request.method === 'GET') return await handleGetMyInvitations(request, env, user)
      if (path.match(/^\/api\/communities\/[^\/]+\/invite-user$/) && request.method === 'POST') return await handleInviteUser(request, env, user)
      if (path.match(/^\/api\/invitations\/[^\/]+\/accept$/) && request.method === 'POST') return await handleAcceptCommunityInvitation(request, env, user)
      if (path.match(/^\/api\/invitations\/[^\/]+\/decline$/) && request.method === 'POST') return await handleDeclineCommunityInvitation(request, env, user)

      // ── Hall of Fame ──
      if (path.match(/^\/api\/communities\/[^\/]+\/hall-of-fame$/) && request.method === 'GET') return await handleCommunityHallOfFame(request, env, user)

      // ── People Search & Discovery ──
      if (path === '/api/users/search' && request.method === 'GET') return await handleSearchUsers(request, env, user)
      if (path === '/api/users/suggested' && request.method === 'GET') return await handleSuggestedConnections(request, env, user)

      // ── Research Hub ──
      if (path === '/api/research' && request.method === 'GET') return await handleListResearchPosts(request, env, user)
      if (path === '/api/research' && request.method === 'POST') return await handleCreateResearchPost(request, env, user)
      if (path === '/api/research/bookmarks' && request.method === 'GET') return await handleGetBookmarks(request, env, user)
      if (path === '/api/research/skills/predefined' && request.method === 'GET') return await handleGetPredefinedSkills(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+\/vote$/) && request.method === 'POST') return await handleVoteOnPost(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+\/comments$/) && request.method === 'GET') return await handleGetResearchComments(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+\/comments$/) && request.method === 'POST') return await handleAddResearchComment(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+\/comments\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteResearchComment(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+\/help$/) && request.method === 'POST') return await handleMarkHelped(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+\/helped$/) && request.method === 'GET') return await handleGetHelpedMarks(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+\/bookmark$/) && request.method === 'POST') return await handleToggleBookmark(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+\/report$/) && request.method === 'POST') return await handleReportPost(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+$/) && request.method === 'GET') return await handleGetResearchPost(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+$/) && request.method === 'PUT') return await handleUpdateResearchPost(request, env, user)
      if (path.match(/^\/api\/research\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteResearchPost(request, env, user)

      // ── Research Profile & Skills ──
      if (path.match(/^\/api\/users\/[^\/]+\/research-profile$/) && request.method === 'GET') return await handleGetResearchProfile(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/research-profile$/) && request.method === 'PUT') return await handleUpdateResearchProfile(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/research-skills$/) && request.method === 'GET') return await handleGetResearchSkills(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/research-skills$/) && request.method === 'POST') return await handleAddResearchSkill(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/research-skills\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteResearchSkill(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/research-stats$/) && request.method === 'GET') return await handleGetResearchStats(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/research-events$/) && request.method === 'GET') return await handleGetResearchEvents(request, env, user)

      // ── Research Portfolio ──
      if (path.match(/^\/api\/users\/[^\/]+\/portfolio$/) && request.method === 'GET') return await handleGetPortfolio(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/portfolio$/) && request.method === 'POST') return await handleAddPortfolioEntry(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/portfolio\/[^\/]+$/) && request.method === 'PUT') return await handleUpdatePortfolioEntry(request, env, user)
      if (path.match(/^\/api\/users\/[^\/]+\/portfolio\/[^\/]+$/) && request.method === 'DELETE') return await handleDeletePortfolioEntry(request, env, user)

      // ── Forest Timer ──
      if (path === '/api/forest/inventory' && request.method === 'GET') return await handleGetForestInventory(request, env, user)
      if (path === '/api/forest/selected-tree' && request.method === 'PUT') return await handleUpdateSelectedTree(request, env, user)
      if (path === '/api/forest/earn-coins' && request.method === 'POST') return await handleEarnCoins(request, env, user)
      if (path === '/api/forest/purchase-tree' && request.method === 'POST') return await handlePurchaseTree(request, env, user)
      if (path === '/api/forest/stats' && request.method === 'GET') return await handleGetForestStats(request, env, user)

      // ── Push Notifications ──
      if (path === '/api/push/subscribe' && request.method === 'POST') return await handleSubscribe(request, env, user)
      if (path === '/api/push/schedule' && request.method === 'POST') return await handleSchedulePush(request, env, user)
      if (path === '/api/push/cancel' && request.method === 'POST') return await handleCancelPushes(request, env, user)


      // ── Rotation Planner ──
      if (path === '/api/rotations/plans' && request.method === 'GET') return await handleGetPlans(request, env, user)
      if (path === '/api/rotations/plans' && request.method === 'POST') return await handleCreatePlan(request, env, user)
      if (path.match(/^\/api\/rotations\/plans\/[^\/]+$/) && request.method === 'GET') return await handleGetPlan(request, env, user)
      if (path.match(/^\/api\/rotations\/plans\/[^\/]+$/) && request.method === 'PUT') return await handleUpdatePlan(request, env, user)
      if (path.match(/^\/api\/rotations\/plans\/[^\/]+$/) && request.method === 'DELETE') return await handleDeletePlan(request, env, user)
      if (path.match(/^\/api\/rotations\/plans\/[^\/]+\/generate$/) && request.method === 'POST') return await handleGenerateSchedule(request, env, user)
      if (path.match(/^\/api\/rotations\/plans\/[^\/]+\/activate$/) && request.method === 'POST') return await handleActivatePlan(request, env, user)
      if (path.match(/^\/api\/rotations\/plans\/[^\/]+\/progress$/) && request.method === 'GET') return await handleGetProgress(request, env, user)
      if (path.match(/^\/api\/rotations\/schedule\/[^\/]+$/) && request.method === 'PUT') return await handleUpdateEntry(request, env, user)
      if (path.match(/^\/api\/rotations\/progress\/[^\/]+$/) && request.method === 'PUT') return await handleUpdateProgress(request, env, user)
      if (path === '/api/rotations/flashcard-summary' && request.method === 'GET') return await handleFlashcardSummary(request, env, user)

      // ── Rotation Planner (read-only) ──
      if (path.match(/^\/api\/rotation-planner\/sources\/[^\/]+\/rotations\/[^\/]+\/topics$/) && request.method === 'GET') return await getPlannerSourceRotationTopics(request, env, user)
      if (path.match(/^\/api\/rotation-planner\/sources\/[^\/]+\/rotations$/) && request.method === 'GET') return await getPlannerSourceRotations(request, env, user)
      if (path === '/api/rotation-planner/sources' && request.method === 'GET') return await getPlannerSources(request, env, user)
      if (path === '/api/rotation-planner/rotations' && request.method === 'GET') return await getPlannerRotations(request, env, user)
      if (path === '/api/rotation-planner/tracking/schedule' && request.method === 'GET') return await handleGetPlanTrackingSchedule(request, env, user)

      // ── Rotation Planner (plans) ──
      if (path === '/api/rotation-planner/plans/preview' && request.method === 'POST') return await handlePreviewRotationPlan(request, env, user)
      if (path === '/api/rotation-planner/plans' && request.method === 'POST') return await handleCreateRotationPlan(request, env, user)
      if (path === '/api/rotation-planner/plans' && request.method === 'GET') return await handleListRotationPlans(request, env, user)
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+$/) && request.method === 'GET') return await handleGetRotationPlan(request, env, user)
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+$/) && request.method === 'DELETE') return await handleDeleteRotationPlan(request, env, user)
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+$/) && request.method === 'PATCH') return await handleRenameRotationPlan(request, env, user)

      // Plan lifecycle: POST /plans/:planId/status
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+\/status$/) && request.method === 'POST') return await handleUpdatePlanStatus(request, env, user)

      // Task update: PATCH /plans/:planId/tasks/:taskId
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+\/tasks\/[^\/]+$/) && request.method === 'PATCH') return await handleUpdateTask(request, env, user)

      // Recalculate: POST /plans/:planId/recalculate
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+\/recalculate$/) && request.method === 'POST') return await handleRecalculatePlan(request, env, user)

      // Forecast: GET /plans/:planId/forecast
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+\/forecast$/) && request.method === 'GET') return await handleGetPlanForecast(request, env, user)

      // Linked decks: GET/PUT /plans/:planId/decks
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+\/decks$/) && request.method === 'GET') return await handleGetPlanDecks(request, env, user)
      if (path.match(/^\/api\/rotation-planner\/plans\/[^\/]+\/decks$/) && request.method === 'PUT') return await handleReplacePlanDecks(request, env, user)

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      console.error(`[${requestId}]`, err)
      return ensureCORS(json({ error: 'Internal Server Error', requestId }, 500))
    }
    } catch (outerErr) {
      console.error(`[${requestId}] outer:`, outerErr)
      return ensureCORS(json({ error: 'Internal Server Error', requestId }, 500))
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handlePushCron(env))
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
  logUserActivity(env, user.sub, 'created_cards', null, 'flashcard', { count: items.length }).catch(() => {})
  return json({ success: true, count: items.length, ids }, 201)
}

async function handleUpdateFlashcard(request, env, user) {
  const id = extractId(request.url)
  const body = await request.json()

  const flashcardUpdateStmt = env.DB.prepare(
    `UPDATE flashcards SET difficulty = ?, stability = ?, state = ?, interval = ?,
     next_review = ?, last_review = ?, image_url = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).bind(
    body.difficulty ?? 0, body.stability ?? 0, body.state ?? 0, body.interval ?? 0,
    body.next_review || null, body.last_review || null, body.image_url || null,
    id, user.sub
  )

  if (typeof body.last_review === 'string' && body.last_review.length > 0) {
    await env.DB.batch([
      flashcardUpdateStmt,
      ...buildFlashcardReconciliationStatements({ env, userId: user.sub, cardId: id, reviewedAt: body.last_review }),
    ])
  } else {
    await flashcardUpdateStmt.run()
  }
  signalFlashcardMappingsStaleness(env, user.sub, EXISTING_REVIEW_IMPACT).catch(() => {})
  return json({ success: true })
}

async function handleDeleteFlashcard(request, env, user) {
  const id = extractId(request.url)
  const row = await env.DB.prepare('SELECT deck_name FROM flashcards WHERE id = ? AND user_id = ?').bind(id, user.sub).first()
  if (!row) return json({ success: true })
  await env.DB.prepare('DELETE FROM flashcards WHERE id = ? AND user_id = ?').bind(id, user.sub).run()
  await cleanupOrphanMapping(env, user.sub, row.deck_name)
  signalFlashcardMappingsStaleness(env, user.sub, EXISTING_REVIEW_IMPACT).catch(() => {})
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
    `SELECT deck_name, SUM(cnt) AS card_count FROM (
       SELECT deck_name, COUNT(*) AS cnt FROM flashcards WHERE user_id = ? GROUP BY deck_name
       UNION ALL
       SELECT deck_name, 0 AS cnt FROM deck_settings WHERE user_id = ?
     ) GROUP BY deck_name ORDER BY deck_name`
  ).bind(user.sub, user.sub).all()
  return json(results.map(r => ({ id: r.deck_name, name: r.deck_name, card_count: Number(r.card_count) || 0 })))
}

async function handleCreateDeck(request, env, user) {
  const { deck_name } = await request.json()
  if (!deck_name || typeof deck_name !== 'string' || !deck_name.trim() || deck_name.trim().length > 100) return json({ error: 'Deck name required (max 100 chars)' }, 400)
  const name = deck_name.trim()
  const now = new Date().toISOString()
  await env.DB.prepare(
    'INSERT OR IGNORE INTO deck_settings (user_id, deck_name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.sub, name, '{}', now, now).run()
  return json({ success: true, deck_name: name })
}

async function handleDeleteDeck(request, env, user) {
  const deckName = decodeURIComponent(extractId(request.url))
  await env.DB.prepare('DELETE FROM flashcards WHERE user_id = ? AND deck_name = ?').bind(user.sub, deckName).run()
  await env.DB.prepare('DELETE FROM deck_settings WHERE user_id = ? AND deck_name = ?').bind(user.sub, deckName).run()
  await env.DB.prepare('DELETE FROM rotation_planner_plan_decks WHERE deck_name = ? AND plan_id IN (SELECT id FROM rotation_planner_plans WHERE user_id = ?)').bind(deckName, user.sub).run()
  await cleanupOrphanMapping(env, user.sub, deckName)
  signalFlashcardMappingsStaleness(env, user.sub, EXISTING_REVIEW_IMPACT).catch(() => {})
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
  const url = new URL(request.url)
  const key = url.pathname.slice('/api/images/'.length)
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

async function handleListDecks(request, env, user) {
  const decks = await listUserDecks(env, user.sub)
  return json({ decks })
}

async function handleListDeckMappings(request, env, user) {
  const mappings = await listUserDeckMappings(env, user.sub)
  return json({ mappings })
}

async function handleCreateDeckMapping(request, env, user) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' } }, 400)
  }

  const { planId, deckName, planTopicId, clientRequestId } = body || {}

  if (!planId || typeof planId !== 'string') return json({ error: { code: 'VALIDATION_ERROR', message: 'planId is required.' } }, 400)
  if (!planTopicId || typeof planTopicId !== 'string') return json({ error: { code: 'VALIDATION_ERROR', message: 'planTopicId is required.' } }, 400)
  if (!deckName || typeof deckName !== 'string' || deckName.length === 0 || deckName.length > 200) return json({ error: { code: 'VALIDATION_ERROR', message: 'deckName is required (max 200 chars).' } }, 400)
  if (!clientRequestId || typeof clientRequestId !== 'string') return json({ error: { code: 'VALIDATION_ERROR', message: 'clientRequestId is required.' } }, 400)

  const fingerprint = await calculateMappingFingerprint(user.sub, planId, deckName, planTopicId)

  const idemCheck = await checkMappingIdempotency(env, user.sub, clientRequestId)
  if (idemCheck.status === 'found') {
    if (idemCheck.existingFingerprint === fingerprint) {
      return json(idemCheck.existingResult)
    }
    return json({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Same idempotency key with different input.' } }, 409)
  }

  const ownsPlan = await verifyPlanOwnership(env, planId, user.sub)
  if (!ownsPlan) return json({ error: { code: 'VALIDATION_ERROR', message: 'Plan not found or does not belong to user.' } }, 404)

  const canonicalTopicId = await resolveCanonicalTopicForMapping(env, planId, planTopicId)
  if (!canonicalTopicId) return json({ error: { code: 'VALIDATION_ERROR', message: 'planTopicId not found or has no canonicalTopicId.' } }, 404)

  const deckExists = await verifyDeckExists(env, user.sub, deckName)
  if (!deckExists) return json({ error: { code: 'VALIDATION_ERROR', message: 'Deck not found for this user.' } }, 404)

  const mapping = await upsertDeckMapping(env, user.sub, deckName, canonicalTopicId)
  if (!mapping) return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create mapping.' } }, 500)

  const result = { mapping, recalculationRequired: false }
  await persistMappingMutation(env, user.sub, clientRequestId, fingerprint, result)
  return json(result)
}

async function handleDeleteDeckMapping(request, env, user) {
  const mappingId = extractId(request.url)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' } }, 400)
  }

  const { clientRequestId } = body || {}

  if (!clientRequestId || typeof clientRequestId !== 'string') return json({ error: { code: 'VALIDATION_ERROR', message: 'clientRequestId is required.' } }, 400)

  const deleteFingerprint = await calculateMappingFingerprint(user.sub, 'delete', mappingId, 'delete')

  const idemCheck = await checkMappingIdempotency(env, user.sub, clientRequestId)
  if (idemCheck.status === 'found') {
    if (idemCheck.existingFingerprint === deleteFingerprint) {
      return json(idemCheck.existingResult)
    }
    return json({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Same idempotency key with different input.' } }, 409)
  }

  const deleted = await deleteDeckMapping(env, mappingId, user.sub)
  if (!deleted) return json({ error: { code: 'NOT_FOUND', message: 'Mapping not found.' } }, 404)

  const result = { deleted: true, mappingId, recalculationRequired: false }
  await persistMappingMutation(env, user.sub, clientRequestId, deleteFingerprint, result)
  return json(result)
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

const RESOURCE_SORT_CLAUSES = {
  created_at: 'created_at DESC, id ASC',
  newest: 'created_at DESC, id ASC',
  oldest: 'created_at ASC, id ASC',
  name: 'title COLLATE NOCASE ASC, id ASC',
  largest: 'file_size DESC, id ASC',
  smallest: 'file_size ASC, id ASC',
}

async function handleGetResources(request, env) {
  const url = new URL(request.url)
  const cat = url.searchParams.get('category')
  const tag = url.searchParams.get('tag')
  const type = url.searchParams.get('type')
  const search = (url.searchParams.get('search') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()
  const query = search || q
  const { offset, limit } = pageParams(request.url)
  const sortKey = (url.searchParams.get('sort') || '').trim().toLowerCase()
  const orderBy = RESOURCE_SORT_CLAUSES[sortKey] || RESOURCE_SORT_CLAUSES.created_at

  let sql = 'SELECT * FROM resources WHERE 1=1'
  const binds = []
  if (cat) { sql += ' AND category = ?'; binds.push(cat) }
  if (tag) { sql += ' AND tags LIKE ?'; binds.push(`%"${tag}"%`) }
  if (type) { sql += ' AND type = ?'; binds.push(type) }
  if (query) { sql += ' AND (title LIKE ? OR description LIKE ?)'; binds.push(`%${query}%`, `%${query}%`) }
  sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
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

const ALLOWED_RESOURCE_MIME = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'application/zip',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp4',
]
const MAX_FILE_SIZE = 100 * 1024 * 1024

async function handleCreateResource(request, env, user) {
  const ct = request.headers.get('content-type') || ''
  let title, category, type, description, tags, user_name
  let file = null, image = null

  try {
    if (ct.includes('multipart/form-data')) {
      const fd = await request.formData()
      title = fd.get('title')
      category = fd.get('category')
      type = fd.get('type') || ''
      description = fd.get('description') || ''
      tags = fd.get('tags') || '[]'
      user_name = fd.get('user_name') || user.email?.split('@')[0] || 'User'
      file = fd.get('file')
      image = fd.get('image')

      if (file) {
        if (file.size > MAX_FILE_SIZE)
          return json({ error: 'File exceeds 100 MB limit' }, 413)
        if (!ALLOWED_RESOURCE_MIME.includes(file.type))
          return json({ error: 'Unsupported file type' }, 415)
      }
    } else {
      const body = await request.json()
      title = body.title; category = body.category; type = body.type || ''
      description = body.description || ''; tags = JSON.stringify(body.tags || [])
      user_name = body.user_name || user.email?.split('@')[0] || 'User'
    }
  } catch (err) {
    console.error('parse error:', err)
    return json({ error: 'Invalid request body' }, 400)
  }

  if (!title || !category)
    return json({ error: 'Title and category required' }, 400)

  const id = uuid()
  let fileKey = '', fileName = '', fileSize = 0, mimeType = ''
  let imageKey = ''

  try {
    if (file) {
      const ext = file.name.split('.').pop() || 'bin'
      fileKey = `resources/${user.sub}/${uuid()}.${ext}`
      fileName = file.name
      fileSize = file.size
      mimeType = file.type
      await env.IMAGES.put(fileKey, file.stream(), {
        httpMetadata: { contentType: file.type },
      })
    }

    if (image) {
      const ext = image.name?.split('.').pop() || 'png'
      imageKey = `resources/${user.sub}/${uuid()}.${ext}`
      await env.IMAGES.put(imageKey, image.stream(), {
        httpMetadata: { contentType: image.type },
      })
    }

    await env.DB.prepare(
      `INSERT INTO resources (id, title, category, description, tags, type, file_name, file_key, file_size, mime_type, image_key, user_id, user_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, title, category, description, tags, type, fileName, fileKey, fileSize, mimeType, imageKey || null, user.sub, user_name).run()

    await ensureUserProfile(env, user.sub, user.email?.split('@')[0])
  } catch (err) {
    console.error('Resource upload failed', { user: user.sub, file: fileName, size: fileSize, error: err.message })
    if (fileKey) env.IMAGES.delete(fileKey).catch(() => {})
    if (imageKey) env.IMAGES.delete(imageKey).catch(() => {})
    return json({ error: 'Upload failed: ' + err.message }, 500)
  }

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
  return await handleGetResourceFile(request, env)
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

async function handleUpdateUserProfile(request, env, user) {
  const url = new URL(request.url)
  const targetUserId = url.pathname.split('/')[3]
  if (user.sub !== targetUserId) return json({ error: 'Forbidden' }, 403)

  const body = await request.json()
  const { display_name, bio, website, location, active_title, pinned_badges, username, profile_visibility, activity_visibility, university, graduation_year, specialty, languages } = body

  if (username !== undefined && username !== null && username !== '') {
    if (!isValidUsername(username)) {
      return json({ error: 'Username must be 3-20 characters, lowercase letters, numbers, and hyphens only' }, 400)
    }
    const { results: existing } = await env.DB.prepare(
      'SELECT user_id FROM user_profiles WHERE username = ? AND user_id != ?'
    ).bind(username, targetUserId).all()
    if (existing.length > 0) {
      return json({ error: 'Username is already taken' }, 409)
    }
  }

  const safeDisplayName = safeString(display_name, 50)
  const safeBio = safeString(bio, 300)
  const safeWebsite = safeString(website, 200)
  const safeLocation = safeString(location, 100)
  const safeTitle = safeString(active_title, 100)
  const safeUsername = username ? sanitizeUsername(username) : null
  const safePinned = pinned_badges ? JSON.stringify(pinned_badges) : null

  const safeUniversity = safeString(university, 200)
  const safeSpecialty = safeString(specialty, 100)
  const safeLanguages = safeString(languages, 200)
  const safeGradYear = graduation_year ? Number(graduation_year) : null

  await env.DB.prepare(`
    INSERT INTO user_profiles (user_id, display_name, username, bio, website, location, active_title, pinned_badges, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = CASE WHEN ? != '' THEN ? ELSE user_profiles.display_name END,
      username = CASE WHEN ? IS NOT NULL THEN ? ELSE user_profiles.username END,
      bio = CASE WHEN ? != '' THEN ? ELSE user_profiles.bio END,
      website = CASE WHEN ? != '' THEN ? ELSE user_profiles.website END,
      location = CASE WHEN ? != '' THEN ? ELSE user_profiles.location END,
      active_title = CASE WHEN ? != '' THEN ? ELSE user_profiles.active_title END,
      pinned_badges = CASE WHEN ? IS NOT NULL THEN ? ELSE user_profiles.pinned_badges END,
      profile_visibility = CASE WHEN ? IS NOT NULL THEN ? ELSE user_profiles.profile_visibility END,
      activity_visibility = CASE WHEN ? IS NOT NULL THEN ? ELSE user_profiles.activity_visibility END,
      university = CASE WHEN ? != '' THEN ? ELSE user_profiles.university END,
      graduation_year = CASE WHEN ? IS NOT NULL THEN ? ELSE user_profiles.graduation_year END,
      specialty = CASE WHEN ? != '' THEN ? ELSE user_profiles.specialty END,
      languages = CASE WHEN ? != '' THEN ? ELSE user_profiles.languages END,
      updated_at = datetime('now')
  `).bind(
    targetUserId, safeDisplayName, safeUsername, safeBio, safeWebsite, safeLocation, safeTitle, safePinned,
    safeDisplayName, safeDisplayName,
    safeUsername, safeUsername,
    safeBio, safeBio,
    safeWebsite, safeWebsite,
    safeLocation, safeLocation,
    safeTitle, safeTitle,
    safePinned, safePinned,
    profile_visibility || null, profile_visibility || null,
    activity_visibility || null, activity_visibility || null,
    safeUniversity, safeUniversity,
    safeGradYear, safeGradYear,
    safeSpecialty, safeSpecialty,
    safeLanguages, safeLanguages
  ).run()

  return json({ success: true })
}

async function handleUploadUserAvatar(request, env, user) {
  const url = new URL(request.url)
  const targetUserId = url.pathname.split('/')[3]
  if (user.sub !== targetUserId) return json({ error: 'Forbidden' }, 403)

  const formData = await request.formData()
  const file = formData.get('image')
  if (!file) return json({ error: 'Image required' }, 400)
  if (!file.type.startsWith('image/')) return json({ error: 'Only images allowed' }, 400)
  if (file.size > 5 * 1024 * 1024) return json({ error: 'Image too large (max 5MB)' }, 400)

  const { results: existing } = await env.DB.prepare(
    'SELECT avatar_url FROM user_profiles WHERE user_id = ?'
  ).bind(targetUserId).all()
  if (existing[0]?.avatar_url) {
    const oldKey = existing[0].avatar_url.split('/api/images/')[1]
    if (oldKey) {
      try { await env.IMAGES.delete(oldKey) } catch {}
    }
  }

  const ext = file.name?.split('.').pop() || 'png'
  const key = `user-assets/${targetUserId}/avatar.${ext}`
  await env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })

  const avatarUrl = `${new URL(request.url).origin}/api/images/${key}`

  await env.DB.prepare(`
    INSERT INTO user_profiles (user_id, avatar_url, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET avatar_url = ?, updated_at = datetime('now')
  `).bind(targetUserId, avatarUrl, avatarUrl).run()

  return json({ success: true, url: avatarUrl, key })
}

async function handleUploadUserBanner(request, env, user) {
  const url = new URL(request.url)
  const targetUserId = url.pathname.split('/')[3]
  if (user.sub !== targetUserId) return json({ error: 'Forbidden' }, 403)

  const formData = await request.formData()
  const file = formData.get('image')
  if (!file) return json({ error: 'Image required' }, 400)
  if (!file.type.startsWith('image/')) return json({ error: 'Only images allowed' }, 400)
  if (file.size > 10 * 1024 * 1024) return json({ error: 'Image too large (max 10MB)' }, 400)

  const { results: existing } = await env.DB.prepare(
    'SELECT banner_url FROM user_profiles WHERE user_id = ?'
  ).bind(targetUserId).all()
  if (existing[0]?.banner_url) {
    const oldKey = existing[0].banner_url.split('/api/images/')[1]
    if (oldKey) {
      try { await env.IMAGES.delete(oldKey) } catch {}
    }
  }

  const ext = file.name?.split('.').pop() || 'png'
  const key = `user-assets/${targetUserId}/banner.${ext}`
  await env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })

  const bannerUrl = `${new URL(request.url).origin}/api/images/${key}`

  await env.DB.prepare(`
    INSERT INTO user_profiles (user_id, banner_url, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET banner_url = ?, updated_at = datetime('now')
  `).bind(targetUserId, bannerUrl, bannerUrl).run()

  return json({ success: true, url: bannerUrl, key })
}

async function handleGetUserByUsername(request, env) {
  const url = new URL(request.url)
  const username = url.pathname.split('/').pop()

  const { results } = await env.DB.prepare(
    'SELECT user_id FROM user_profiles WHERE username = ?'
  ).bind(username).all()

  if (results.length === 0) return json({ error: 'User not found' }, 404)
  return json({ user_id: results[0].user_id })
}

async function handleCheckUsername(request, env) {
  const url = new URL(request.url)
  const username = url.pathname.split('/').pop()

  if (!isValidUsername(username)) {
    return json({ available: false, error: 'Invalid format. Use 3-20 lowercase letters, numbers, and hyphens.' })
  }

  const { results } = await env.DB.prepare(
    'SELECT user_id FROM user_profiles WHERE username = ?'
  ).bind(username).all()

  return json({ available: results.length === 0 })
}

async function handleGetUserActivity(request, env) {
  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]
  const { offset, limit } = pageParams(request.url)

  const { results } = await env.DB.prepare(
    'SELECT * FROM user_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(userId, limit, offset).all()

  return json(results.map(a => ({
    id: a.id,
    type: a.type,
    entity_id: a.entity_id,
    entity_type: a.entity_type,
    metadata: JSON.parse(a.metadata || '{}'),
    created_at: a.created_at,
  })))
}

async function handleUserHeatmap(request, env, viewerUser) {
  const url = new URL(request.url)
  const userId = url.pathname.split('/')[3]

  const { results: visRows } = await env.DB.prepare(
    `SELECT profile_visibility FROM user_profiles WHERE user_id = ?`
  ).bind(userId).all()
  if (visRows.length && visRows[0].profile_visibility === 'private' && viewerUser?.sub !== userId) {
    return json({ hidden: true })
  }

  const year = new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const { results: activityRows } = await env.DB.prepare(
    `SELECT DATE(created_at) as day, type, COUNT(*) as cnt
     FROM user_activity
     WHERE user_id = ? AND created_at >= ? AND created_at <= ?
     GROUP BY DATE(created_at), type`
  ).bind(userId, yearStart, yearEnd).all()

  const { results: sessionRows } = await env.DB.prepare(
    `SELECT DATE(created_at) as day, SUM(COALESCE(minutes, 0)) as total_minutes
     FROM study_sessions_log
     WHERE user_id = ? AND created_at >= ? AND created_at <= ?
     GROUP BY DATE(created_at)`
  ).bind(userId, yearStart, yearEnd).all()

  const dayMap = {}

  for (const row of activityRows) {
    if (!dayMap[row.day]) dayMap[row.day] = { date: row.day, count: 0, minutes: 0, questions: 0, topics: 0, cases: 0 }
    dayMap[row.day].count += row.cnt
    if (row.type === 'question_review') dayMap[row.day].questions += row.cnt
    else if (row.type === 'topic_progress') dayMap[row.day].topics += row.cnt
    else if (row.type === 'case_review') dayMap[row.day].cases += row.cnt
  }

  for (const row of sessionRows) {
    if (!dayMap[row.day]) dayMap[row.day] = { date: row.day, count: 0, minutes: 0, questions: 0, topics: 0, cases: 0 }
    dayMap[row.day].minutes += row.total_minutes
  }

  const data = Object.values(dayMap).map(d => {
    const totalMin = d.minutes
    let level = 0
    if (totalMin > 0 || d.count > 0) {
      const score = d.count * 2 + totalMin / 15
      if (score >= 20) level = 4
      else if (score >= 10) level = 3
      else if (score >= 5) level = 2
      else level = 1
    }
    return { ...d, level }
  })

  const totalMinutes = data.reduce((s, d) => s + d.minutes, 0)
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10
  const activeDays = data.filter(d => d.count > 0 || d.minutes > 0).length

  return json({
    data,
    stats: { totalHours, activeDays, year },
  })
}

async function handleUserProfile(request, env, viewerUser, ctx) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const targetUserId = parts[3]
  const isOtherUser = viewerUser && viewerUser.sub !== targetUserId

  // Batch 1: profile + stats + live follower/following counts (4 queries in 1 round-trip)
  const [profileRes, statsRes, followersRes, followingRes] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM user_profiles WHERE user_id = ?').bind(targetUserId),
    env.DB.prepare('SELECT * FROM user_stats WHERE user_id = ?').bind(targetUserId),
    env.DB.prepare('SELECT COALESCE(COUNT(*), 0) as total FROM user_followers WHERE following_id = ?').bind(targetUserId),
    env.DB.prepare('SELECT COALESCE(COUNT(*), 0) as total FROM user_followers WHERE follower_id = ?').bind(targetUserId),
  ])
  const profile = profileRes.results[0] || null
  const stats = statsRes.results[0] || null
  const liveFollowers = Number(followersRes.results[0]?.total) || 0
  const liveFollowing = Number(followingRes.results[0]?.total) || 0

  if (profile && profile.profile_visibility === 'private' && isOtherUser) {
    return json({ hidden: true, display_name: 'Private Account', user_id: targetUserId })
  }

  let computedStats = stats
  if (!stats) {
    // Batch 1b: fallback stats when user_stats row missing (3 queries in 1 round-trip)
    const [hoursRes, questionsRes, sessionDaysRes] = await env.DB.batch([
      env.DB.prepare('SELECT COALESCE(SUM(total_study_hours), 0) as total FROM community_members WHERE user_id = ?').bind(targetUserId),
      env.DB.prepare('SELECT COALESCE(SUM(correct), 0) as solved FROM uworld_blocks WHERE user_id = ?').bind(targetUserId),
      env.DB.prepare('SELECT DISTINCT DATE(created_at) as day FROM study_sessions_log WHERE user_id = ? ORDER BY day DESC').bind(targetUserId),
    ])

    let streak = 0
    const sessionDays = sessionDaysRes.results
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

    computedStats = {
      study_hours: Number(hoursRes.results[0]?.total) || 0,
      questions_answered: Number(questionsRes.results[0]?.solved) || 0,
      current_streak: streak,
      cards_reviewed: 0,
      pomodoros_completed: 0,
      competitions_joined: 0,
      longest_streak: streak,
      followers_count: 0,
      following_count: 0,
    }
  }

  // Batch 2: badges + communities [+ shared_communities if viewing another user] (2-3 queries in 1 round-trip)
  const batch2Stmts = [
    env.DB.prepare(`SELECT cmb.*, c.name as community_name FROM community_monthly_badges cmb JOIN communities c ON cmb.community_id = c.id WHERE cmb.user_id = ? ORDER BY cmb.year DESC, cmb.month DESC`).bind(targetUserId),
    env.DB.prepare(`SELECT cm.role, cm.title, cm.total_study_hours, cm.joined_at, c.id, c.name, c.avatar_url FROM community_members cm JOIN communities c ON cm.community_id = c.id WHERE cm.user_id = ? ORDER BY cm.joined_at DESC`).bind(targetUserId),
  ]
  if (isOtherUser) {
    batch2Stmts.push(
      env.DB.prepare(`SELECT c.id, c.name, c.avatar_url FROM community_members cm1 JOIN community_members cm2 ON cm1.community_id = cm2.community_id AND cm2.user_id = ? JOIN communities c ON cm1.community_id = c.id WHERE cm1.user_id = ? ORDER BY cm1.joined_at DESC LIMIT 10`).bind(viewerUser.sub, targetUserId)
    )
  }

  let shared_communities = []
  let badges, communities
  try {
    const batch2Results = await env.DB.batch(batch2Stmts)
    badges = batch2Results[0].results
    communities = batch2Results[1].results
    if (isOtherUser) shared_communities = batch2Results[2]?.results || []
  } catch {
    // Fallback: run queries individually if batch fails
    const { results: b } = await env.DB.prepare(`SELECT cmb.*, c.name as community_name FROM community_monthly_badges cmb JOIN communities c ON cmb.community_id = c.id WHERE cmb.user_id = ? ORDER BY cmb.year DESC, cmb.month DESC`).bind(targetUserId).all()
    badges = b
    const { results: c } = await env.DB.prepare(`SELECT cm.role, cm.title, cm.total_study_hours, cm.joined_at, c.id, c.name, c.avatar_url FROM community_members cm JOIN communities c ON cm.community_id = c.id WHERE cm.user_id = ? ORDER BY cm.joined_at DESC`).bind(targetUserId).all()
    communities = c
  }

  const completion = calculateProfileCompletion(profile)

  // Fire-and-forget: log profile view (not on critical path)
  if (isOtherUser && ctx) {
    ctx.waitUntil(
      env.DB.prepare(
        `INSERT INTO user_activity (id, user_id, type, entity_id, entity_type, created_at) VALUES (?, ?, 'profile_view', ?, 'user', datetime('now'))`
      ).bind('act_' + uuid(), targetUserId, viewerUser.sub).run().catch(() => {})
    )
  }

  return json({
    user_id: targetUserId,
    username: profile?.username || null,
    display_name: profile?.display_name || profile?.user_name || targetUserId.slice(0, 8),
    avatar_url: profile?.avatar_url || '',
    banner_url: profile?.banner_url || '',
    bio: profile?.bio || '',
    website: profile?.website || '',
    location: profile?.location || '',
    active_title: profile?.active_title || '',
    pinned_badges: JSON.parse(profile?.pinned_badges || '[]'),
    joined_at: profile?.joined_at || null,
    university: profile?.university || '',
    graduation_year: profile?.graduation_year || null,
    specialty: profile?.specialty || '',
    languages: profile?.languages || '',
    favorite_subjects: JSON.parse(profile?.favorite_subjects || '[]'),
    reputation: computedStats?.reputation || profile?.reputation || 0,
    profile_visibility: profile?.profile_visibility || 'public',
    activity_visibility: profile?.activity_visibility || 'public',
    profile_completion: completion,
    stats: {
      study_hours: computedStats?.study_hours || 0,
      questions_answered: computedStats?.questions_answered || 0,
      cards_reviewed: computedStats?.cards_reviewed || 0,
      pomodoros_completed: computedStats?.pomodoros_completed || 0,
      competitions_joined: computedStats?.competitions_joined || 0,
      communities_count: communities.length,
      current_streak: computedStats?.current_streak || 0,
      longest_streak: computedStats?.longest_streak || 0,
      followers_count: liveFollowers,
      following_count: liveFollowing,
    },
    badges: badges.map(b => ({
      community_id: b.community_id, community_name: b.community_name,
      year: b.year, month: b.month, rank: b.rank,
      emoji: b.rank === 1 ? '🥇' : b.rank === 2 ? '🥈' : '🥉',
      title: b.title || '',
    })),
    communities,
    shared_communities,
  })
}

/* ── Follow / Unfollow ── */

async function handleFollowUser(request, env, user, ctx) {
  const url = new URL(request.url)
  const targetUserId = url.pathname.split('/')[3]
  if (user.sub === targetUserId) return json({ error: 'Cannot follow yourself' }, 400)

  const { results: target } = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE user_id = ?').bind(targetUserId).all()
  if (!target.length) return json({ error: 'User not found' }, 404)

  const { results: existing } = await env.DB.prepare(
    'SELECT 1 FROM user_followers WHERE follower_id = ? AND following_id = ?'
  ).bind(user.sub, targetUserId).all()
  if (existing.length > 0) return json({ error: 'Already following' }, 409)

  await env.DB.prepare(
    'INSERT INTO user_followers (follower_id, following_id) VALUES (?, ?)'
  ).bind(user.sub, targetUserId).run()

  ctx.waitUntil(
    Promise.all([
      incrementUserStats(env, user.sub, 'following_count', 1).catch(() => {}),
      incrementUserStats(env, targetUserId, 'followers_count', 1).catch(() => {}),
      refreshUserStats(env, user.sub).catch(() => {}),
      refreshUserStats(env, targetUserId).catch(() => {}),
      createNotificationIfAllowed(env, targetUserId, {
        type: 'follow',
        title: 'New follower',
        body: `${user.email?.split('@')[0] || 'Someone'} started following you`,
        category: 'follows',
        priority: 'info',
        action_url: `/profile/${user.sub}`,
        data: { follower_id: user.sub },
      }).catch((err) => {
        console.error('[follow-notification]', {
          followerId: user.sub,
          followedUserId: targetUserId,
          error: err,
        })
      }),
    ])
  )

  return json({ success: true })
}

async function handleUnfollowUser(request, env, user, ctx) {
  const url = new URL(request.url)
  const targetUserId = url.pathname.split('/')[3]

  const result = await env.DB.prepare(
    'DELETE FROM user_followers WHERE follower_id = ? AND following_id = ?'
  ).bind(user.sub, targetUserId).run()

  if (result.meta?.changes > 0) {
    ctx.waitUntil(
      Promise.all([
        incrementUserStats(env, user.sub, 'following_count', -1).catch(() => {}),
        incrementUserStats(env, targetUserId, 'followers_count', -1).catch(() => {}),
        refreshUserStats(env, user.sub).catch(() => {}),
        refreshUserStats(env, targetUserId).catch(() => {}),
      ])
    )
  }

  return json({ success: true })
}

async function handleFollowStatus(request, env, user) {
  const url = new URL(request.url)
  const targetUserId = url.pathname.split('/')[3]

  const { results } = await env.DB.prepare(
    'SELECT 1 FROM user_followers WHERE follower_id = ? AND following_id = ?'
  ).bind(user.sub, targetUserId).all()

  return json({ following: results.length > 0 })
}

export { CommunityRealtimeRoom, DMRealtimeRoom }
