import { createClient } from '@libsql/client'
import { parseApkg } from '../_apkgParser.js'
import { getUser } from '../_auth.js'

export const config = { runtime: 'nodejs' }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export async function POST(req) {
  try {
    const user = await getUser(req)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file')
    const deckId = formData.get('deck_id')

    if (!file || !deckId) {
      return Response.json({ error: 'Missing file or deck_id' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const cards = await parseApkg(buffer)

    if (!cards.length) return Response.json({ error: 'No cards found' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]
    let inserted = 0

    for (let i = 0; i < cards.length; i += 50) {
      const batch = cards.slice(i, i + 50)
      const tx = batch.map(c => {
        const id = crypto.randomUUID()
        return {
          sql: `INSERT INTO anki_cards (id, user_id, deck_id, front, back, image_url, high_yield, ease_factor, interval_days, times_reviewed, last_reviewed, next_review_date, interval, repetitions, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 2.5, 0, 0, NULL, ?, 0, 0, NULL, ?, datetime('now'))`,
          args: [id, user.id, deckId, c.front, c.back, c.image_url || null, today, today],
        }
      })
      await turso.batch(tx)
      inserted += batch.length
    }

    return Response.json({ count: inserted })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
