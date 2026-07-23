import { supabase } from './supabase'

const API = import.meta.env.VITE_API_URL || '/api'

export function joinApiPath(base, path) {
  const b = base.replace(/\/+$/, '')
  let p = path.replace(/^\/+/, '')
  if (b.endsWith('/api') && p.startsWith('api/')) {
    p = p.slice(4)
  }
  return `${b}/${p}`
}

export class ApiError extends Error {
  constructor({
    code = 'API_ERROR',
    message = 'Request failed',
    details = null,
    status = null,
    payload = null,
  } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.status = status
    this.payload = payload
  }
}

export async function apiJson(res) {
  const text = await res.text()

  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = null }

  if (!res.ok) {
    const nestedError = payload?.error

    if (nestedError && typeof nestedError === 'object') {
      throw new ApiError({
        code: nestedError.code || 'API_ERROR',
        message: nestedError.message || `Request failed with ${res.status}`,
        details: nestedError.details || null,
        status: res.status,
        payload,
      })
    }

    if (typeof nestedError === 'string') {
      throw new ApiError({
        code: payload?.code || 'API_ERROR',
        message: nestedError,
        details: payload?.details || null,
        status: res.status,
        payload,
      })
    }

    throw new ApiError({
      message: text ? text.slice(0, 500) : `Request failed with ${res.status}`,
      status: res.status,
      payload,
    })
  }

  return payload
}

export async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(joinApiPath(API, path), {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return apiJson(res)
}

/** queryFn adapter for useQuery — wraps apiGet */
export const queryFn = (path) => () => apiGet(path)

export async function apiPost(path, body, { headers: extraHeaders } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(joinApiPath(API, path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
      ...extraHeaders,
    },
    body: JSON.stringify(body)
  })
  return apiJson(res)
}

export async function apiPatch(path, body, { headers: extraHeaders } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(joinApiPath(API, path), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
      ...extraHeaders,
    },
    body: JSON.stringify(body)
  })
  return apiJson(res)
}

export async function apiPut(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(joinApiPath(API, path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body)
  })
  return apiJson(res)
}

export async function apiDelete(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(joinApiPath(API, path), {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return apiJson(res)
}

export function imageUrl(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  const base = API.replace(/\/api\/?$/, '')
  return base + url
}

export function formatDate(iso) {
  if (!iso) return ''
  const normalized = iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : 'Z')
  const d = new Date(normalized)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  return d.toLocaleDateString()
}

export function formatCountdown(iso) {
  if (!iso) return ''
  const target = new Date(iso.replace(' ', 'T') + 'Z').getTime()
  const now = Date.now()
  const diff = target - now
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days}d ${hours}h left`
  const mins = Math.floor((diff % 3600000) / 60000)
  return `${hours}h ${mins}m left`
}
