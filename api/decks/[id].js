import { createClient } from '@libsql/client'
import { jwtVerify, createRemoteJWKSet } from 'jose'

export const config = { regions: ['sin1'] }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

let JWKS = null
function getJWKS() {
  if (!JWKS) {
    let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (!url) throw new Error('Missing SUPABASE_URL')
    url = url.replace(/\/+$/, '')
    JWKS = createRemoteJWKSet(new URL(url + '/auth/v1/.well-known/jwks.json'))
  }
  return JWKS
}

function getIssuer() {
  let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!url) return undefined
  url = url.replace(/\/+$/, '')
  return url + '/auth/v1'
}

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: getIssuer(),
      audience: 'authenticated',
    })
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) { return null }
}

function extractId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[parts.length - 1]
}

export async function DELETE(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    await turso.execute({
      sql: 'DELETE FROM anki_cards WHERE deck_id = ? AND user_id = ?',
      args: [id, user.id],
    })
    await turso.execute({
      sql: 'DELETE FROM anki_decks WHERE id = ? AND user_id = ?',
      args: [id, user.id],
    })
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
