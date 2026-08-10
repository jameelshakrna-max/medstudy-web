export const FOCUS_PATHS = ['/focus', '/pomodoro', '/forest']
export const PROGRESS_PATHS = ['/progress', '/uworld', '/sessions']

export function isFocusPath(pathname) {
  return FOCUS_PATHS.some((p) => pathname === p)
}

export function isProgressPath(pathname) {
  return PROGRESS_PATHS.some((p) => pathname === p)
}

export function matchesPath(pathname, to) {
  if (pathname === to) return true
  return pathname.startsWith(`${to}/`)
}

/* Shared profile destination:
   /u/:username when a username exists, otherwise /profile/:userId.
   Returns null when there is no authenticated user to target. */
export function getProfilePath(userProfile, user) {
  if (userProfile?.username) return `/u/${userProfile.username}`
  if (user?.id) return `/profile/${user.id}`
  return null
}
