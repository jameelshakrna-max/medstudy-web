export const MAX = { NAME: 100, DESC: 2000, CONTENT: 10000, RULE: 500, TITLE: 200, REASON: 500 }
export const ALLOWED_MIME = {
  'image/jpeg': 20, 'image/png': 20, 'image/gif': 20, 'image/webp': 20,
  'application/pdf': 50, 'application/msword': 50,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 50,
  'text/plain': 10, 'application/zip': 50,
}
export const DURATIONS = ['1_week', '1_month', '6_months', '1_year']

export function uuid() { return crypto.randomUUID() }

export function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  })
}

export function extractId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[parts.length - 1]
}

export function safeString(val, maxLen = MAX.CONTENT) {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : ''
}

export function pageParams(url) {
  const u = new URL(url)
  const offset = Math.max(0, Number(u.searchParams.get('offset')) || 0)
  const limit = Math.min(Math.max(1, Number(u.searchParams.get('limit')) || 50), 100)
  return { offset, limit }
}

export async function ensureUserProfile(env, userId, userName) {
  if (!userId) return
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user_profiles (user_id, user_name, display_name) VALUES (?, ?, ?)'
  ).bind(userId, userName || userId.slice(0, 8), userName || userId.slice(0, 8)).run()
}

export function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false
  return /^[a-z0-9][a-z0-9-]{2,19}$/.test(username)
}

export function sanitizeUsername(username) {
  return (username || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function calculateProfileCompletion(profile) {
  if (!profile) return { percentage: 0, checks: {} }
  const checks = {
    avatar: !!profile.avatar_url,
    display_name: !!profile.display_name && profile.display_name !== profile.user_id?.slice(0, 8),
    bio: !!profile.bio && profile.bio.length > 0,
    username: !!profile.username,
    banner: !!profile.banner_url,
    website: !!profile.website,
    location: !!profile.location,
    title: !!profile.active_title,
  }
  const filled = Object.values(checks).filter(Boolean).length
  const total = Object.keys(checks).length
  return { percentage: Math.round((filled / total) * 100), checks }
}

export function log(event, meta = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...meta }))
}

const rateLimits = new Map()
export function checkRate(key, maxRequests, windowMs = 60000) {
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

export function extractCommunityId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[3]
}

export function extractNestedId(url, index) {
  const parts = new URL(url).pathname.split('/')
  return parts[index]
}

export function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function getMember(env, communityId, userId) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM community_members WHERE community_id = ? AND user_id = ?'
  ).bind(communityId, userId).all()
  return results.length ? results[0] : null
}

export async function isBanned(env, communityId, userId) {
  const { results } = await env.DB.prepare(
    `SELECT id FROM community_bans WHERE community_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
  ).bind(communityId, userId).all()
  return results.length > 0
}

export async function updateMemberCount(env, communityId) {
  const { results } = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM community_members WHERE community_id = ?'
  ).bind(communityId).all()
  await env.DB.prepare(
    'UPDATE communities SET member_count = ? WHERE id = ?'
  ).bind(Number(results[0].cnt), communityId).run()
}

export function mapMessage(r) {
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

export function mapCard(r) {
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

export function mapResource(r) {
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

/* ── Profile Visibility ── */

export async function getProfileVisibility(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT profile_visibility FROM user_profiles WHERE user_id = ?`
  ).bind(userId).all()
  return results[0]?.profile_visibility || 'public'
}

export function isProfileVisible(visibility, viewerId, targetId) {
  if (viewerId === targetId) return true
  return visibility !== 'private'
}

export async function filterVisibleUsers(env, userIds, viewerId) {
  if (!userIds.length) return []
  const { results } = await env.DB.prepare(
    `SELECT user_id, profile_visibility FROM user_profiles WHERE user_id IN (${userIds.map(() => '?').join(',')})`
  ).bind(...userIds).all()
  return results
    .filter(r => isProfileVisible(r.profile_visibility, viewerId, r.user_id))
    .map(r => r.user_id)
}
