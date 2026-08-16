export function buildCommunityInviteUrl(code, origin) {
  const base = String(
    origin == null ? (typeof window !== 'undefined' ? window.location.origin : '') : origin
  ).replace(/\/+$/, '')
  return `${base}/communities?invite=${encodeURIComponent(String(code))}`
}

export function readInviteCode(searchParams) {
  if (!searchParams || typeof searchParams.get !== 'function') return null
  const code = searchParams.get('invite')
  if (code == null) return null
  const trimmed = String(code).trim()
  return trimmed.length > 0 ? trimmed : null
}
