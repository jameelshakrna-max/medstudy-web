**
 * api/flashcards/index.js
 * GET: List all flashcards for the authenticated user
 * POST: Create one or many flashcards (with FSRS defaults)
 *
 * Single card: POST { front, back, deck_id, high_yield, image_url }
 * Bulk import: POST { cards: [{ front, back, deck_id, image_url }, ...] }
 */

import { createClient } from '@libsql/client'

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_AUTH_TOKEN,
})

export default async function handler(req, res) {
  // Verify auth
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // ── GET: List all cards ───────────────────────────────
  if (req.method === 'GET') {
    try {
      const result = await db.execute(
        `SELECT id, front, back, deck_id, high_yield, image_url,
                difficulty, stability, state, interval,
                ease_factor, repetitions,
                next_review, last_review, created_at
         FROM anki_cards
         ORDER BY created_at DESC`
      )
      return res.json(result.rows)
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: Create card(s) ─────────────────────────────
  if (req.method === 'POST') {
    const body = req.body

    // Bulk import: { cards: [...] }
    if (body.cards && Array.isArray(body.cards)) {
      try {
        const results = []
        for (const c of body.cards) {
          if (!c.front || !c.back) continue

          const id = crypto.randomUUID()
          await db.execute({
            sql: `INSERT INTO anki_cards
                    (id, front, back, deck_id, high_yield, image_url,
                     difficulty, stability, state, interval, ease_factor, repetitions,
                     next_review, last_review, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 2.5, 0, NULL, NULL, datetime('now'))`,
            args: [
              id,
              c.front,
              c.back,
              c.deck_id || null,
              c.high_yield ? 1 : 0,
              c.image_url || null,
            ]
          })
          results.push({ id })
        }
        return res.json({ ok: true, count: results.length })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }

    // Single card: { front, back, deck_id, high_yield, image_url }
    if (!body.front || !body.back) {
      return res.status(400).json({ error: 'front and back are required' })
    }

    try {
      const id = crypto.randomUUID()
      await db.execute({
        sql: `INSERT INTO anki_cards
                (id, front, back, deck_id, high_yield, image_url,
                 difficulty, stability, state, interval, ease_factor, repetitions,
                 next_review, last_review, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 2.5, 0, NULL, NULL, datetime('now'))`,
        args: [
          id,
          body.front,
          body.back,
          body.deck_id || null,
          body.high_yield ? 1 : 0,
          body.image_url || null,
        ]
      })

      const result = await db.execute({
        sql: `SELECT id, front, back, deck_id, high_yield, image_url,
                     difficulty, stability, state, interval,
                     next_review, last_review, created_at
              FROM anki_cards WHERE id = ?`,
        args: [id]
      })

      return res.json(result.rows[0] || { ok: true, id })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
