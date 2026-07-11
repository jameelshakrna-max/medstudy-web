import { supabase } from './supabase'

const API = import.meta.env.VITE_API_URL || '/api'

export async function apiJson(res) {
  if (!res.ok) {
    const text = await res.text()
    let msg
    try { msg = JSON.parse(text).error || text } catch { msg = text.slice(0, 300) }
    throw new Error(msg || `Request failed (${res.status})`)
  }
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

export async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return apiJson(res)
}

export async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body)
  })
  return apiJson(res)
}

export async function apiPut(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body)
  })
  return apiJson(res)
}

export async function apiDelete(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return apiJson(res)
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
