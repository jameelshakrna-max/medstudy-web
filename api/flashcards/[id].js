/**
 * api/flashcards/[id].js
 * PUT: Update a flashcard with FSRS scheduling data
 * DELETE: Delete a flashcard
 *
 * FSRS fields sent from the client:
 *   difficulty, stability, state, interval, next_review, last_review
 */

import { createClient } from '@libsql/client'

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_AUTH_TOKEN,
})

export default async function handler(req, res) {
  const { id } = req.query

  if (!id) {
    return res.status(400).json({ error: 'Missing card ID' })
  }

  // Verify auth
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // ── PUT: Update card ─────────────────────────────────
  if (req.method === 'PUT') {
    const {
      front, back, high_yield, image_url,
      // FSRS fields
      difficulty, stability, state, interval,
      next_review, last_review,
      // Legacy SM-2 fields (still supported for backward compat)
      ease_factor, repetitions
    } = req.body

    // Build SET clause dynamically
    const sets = []
    const vals = []

    if (front !== undefined) { sets.push('front = ?'); vals.push(front) }
    if (back !== undefined) { sets.push('back = ?'); vals.push(back) }
    if (high_yield !== undefined) { sets.push('high_yield = ?'); vals.push(high_yield ? 1 : 0) }
    if (image_url !== undefined) { sets.push('image_url = ?'); vals.push(image_url) }

    // FSRS fields
    if (difficulty !== undefined) { sets.push('difficulty = ?'); vals.push(difficulty) }
    if (stability !== undefined) { sets.push('stability = ?'); vals.push(stability) }
    if (state !== undefined) { sets.push('state = ?'); vals.push(state) }
    if (interval !== undefined) { sets.push('interval = ?'); vals.push(interval) }
    if (next_review !== undefined) { sets.push('next_review = ?'); vals.push(next_review) }
    if (last_review !== undefined) { sets.push('last_review = ?'); vals.push(last_review) }

    // Legacy SM-2 fields (still write them for compatibility)
    if (ease_factor !== undefined) { sets.push('ease_factor = ?'); vals.push(ease_factor) }
    if (repetitions !== undefined) { sets.push('repetitions = ?'); vals.push(repetitions) }

    if (!sets.length) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    vals.push(id)

    try {
      await db.execute(
        `UPDATE anki_cards SET ${sets.join(', ')} WHERE id = ?`,
        vals
      )
      return res.json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── DELETE: Remove card ──────────────────────────────
  if (req.method === 'DELETE') {
    tr