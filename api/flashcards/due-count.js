import { createClient } from '@libsql/client/web'
import { getUser } from '../_auth.js'

export const runtime = 'edge'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export async function GET(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await turso.execute({
      sql: `SELECT COUNT(*) as count FROM anki_cards WHERE user_id = ? AND (next_review_date IS NULL OR next_review_date <= date('now'))`,
      args: [user.id],
    })
    return Response.json({ count: Number(result.rows[0].count) })
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }) }
}
