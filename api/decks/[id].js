import { createClient } from '@libsql/client'
import { jwtVerify, createRemoteJWKSet } from 'jose'

export const config = { regions: ['sin1'] }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const JWKS = createRemoteJWKSet(
  new URL(process.env.SUPABASE_URL + '/auth/v1/jwks')
)

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  try {
    const { payload } = await jwtVerify(token, JWKS)
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch (e) { return null }
}

/* Extract deck id from URL: /api/decks/<id> */
function extractId(url) {
  const parts = new URL(url).pathname.split('/')
  return parts[parts.length - 1]
}

export async function DELETE(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = extractId(req.url)
    /* Delete all cards in this deck first */
    await turso.execute({
      sql: 'DELETE FROM anki_cards WHERE deck_id = ? AND user_id = ?',
      args: [id, user.id],
    })
    /* Then delete the deck */
    await turso.execute({
      sql: 'DELETE FROM anki_decks WHERE id = ? AND user_id = ?',
      args: [id, user.id],
    })
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
