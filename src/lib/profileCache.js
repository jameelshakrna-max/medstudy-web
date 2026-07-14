import { apiGet } from './api'

const cache = new Map()
const TTL_MS = 5 * 60 * 1000

export function getCachedProfile(userId) {
  const entry = cache.get(userId)
  if (entry && Date.now() - entry.timestamp < TTL_MS) {
    return entry.data
  }
  cache.delete(userId)
  return null
}

export function setCachedProfile(userId, data) {
  cache.set(userId, { data, timestamp: Date.now() })
}

export async function fetchProfile(userId) {
  const cached = getCachedProfile(userId)
  if (cached) return cached

  const [profile, activityData, followData, achievementsData] = await Promise.all([
    apiGet(`/users/${userId}/profile`),
    apiGet(`/users/${userId}/activity?limit=5`).catch(() => []),
    apiGet(`/users/${userId}/follow-status`).catch(() => ({ following: false })),
    apiGet(`/users/${userId}/achievements`).catch(() => []),
  ])

  const result = {
    profile,
    activity: Array.isArray(activityData) ? activityData : [],
    isFollowing: followData?.following || false,
    achievements: Array.isArray(achievementsData) ? achievementsData : [],
  }

  setCachedProfile(userId, result)
  return result
}

export function invalidateProfile(userId) {
  cache.delete(userId)
}
