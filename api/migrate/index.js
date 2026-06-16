/**
 * api/migrate/index.js
 * Adds FSRS columns + image_url to anki_cards table.
 * Run once by visiting /api/migrate after deploying.
 *
 * FSRS columns:
 *   difficulty REAL DEFAULT 0  — 1-10 scale (higher = harder)
 *   stability  REAL DEFAULT 0  — memory stability in days
 *   state      INTEGER DEFAULT 0 — 0=New, 1=Learning, 2=Review, 3=Relearning
 *
 * Also adds image_url TEXT if missing.
 * Migrates existing SM-2 cards to FSRS state.
 */

import { createClient } from '@libsql/client'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const db = createClient({
    url: process.env.TURSO_DB_URL,
    authToken: process.env.TURSO_DB_AUTH_TOKEN,
  })

  const migrations = []

  // ── Add FSRS columns ──────────────────────────────────

  // difficulty: FSRS difficulty rating (1-10), 0 = not yet rated (new card)
  try {
    await db.execute(`ALTER TABLE anki_cards ADD COLUMN difficulty REAL DEFAULT 0`)
    migrations.push('✓ added difficulty (REAL DEFAULT 0)')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      migrations.push('— difficulty already exists')
    } else {
      migrations.push('✗ difficulty error: ' + e.message)
    }
  }

  // stability: FSRS memory stability in days, 0 = new card
  try {
    await db.execute(`ALTER TABLE anki_cards ADD COLUMN stability REAL DEFAULT 0`)
    migrations.push('✓ added stability (REAL DEFAULT 0)')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      migrations.push('— stability already exists')
    } else {
      migrations.push('✗ stability error: ' + e.message)
    }
  }

  // state: FSRS card state — 0=New, 1=Learning, 2=Review, 3=Relearning
  try {
    await db.execute(`ALTER TABLE anki_cards ADD COLUMN state INTEGER DEFAULT 0`)
    migrations.push('✓ added state (INTEGER DEFAULT 0)')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      migrations.push('— state already exists')
    } else {
      migrations.push('✗ state error: ' + e.message)
    }
  }

  // ── Add image_url column (from previous migration, idempotent) ──

  try {
    await db.execute(`ALTER TABLE anki_cards ADD COLUMN image_url TEXT`)
    migrations.push('✓ added image_url (TEXT)')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      migrations.push('— image_url already exists')
    } else {
      migrations.push('✗ image_url error: ' + e.message)
    }
  }

  // ── Migrate existing SM-2 cards to FSRS state ─────────

  // Cards that have been reviewed (have last_review) but are still in state=0 (New)
  // Convert them to state=2 (Review) and derive initial FSRS values from SM-2 data
  try {
    const result = await db.execute(`
      UPDATE anki_cards
      SET state = 2,
          difficulty = CASE
            WHEN ease_factor IS NOT NULL AND ease_factor > 0
            THEN MIN(10, MAX(1, 10 - ((ease_factor - 1.3) / (5 - 1.3)) * 9))
            ELSE 5
          END,
          stability = CASE
            WHEN interval IS NOT NULL AND interval > 0
            THEN MAX(1, interval)
            ELSE 1
          END
      WHERE last_review IS NOT NULL AND (state IS NULL OR state = 0)
    `)
    migrations.push(`✓ migrated ${result.rowsAffected || 0} existing cards to FSRS (state=Review, derived D/S from SM-2)`)
  } catch (e) {
    migrations.push('✗ SM-2→FSRS migration warning: ' + e.message)
  }

  // Cards that have never been reviewed → make sure state=0 (New) with FSRS defaults
  try {
    const result = await db.execute(`
      UPDATE anki_cards
      SET state = 0,
          difficulty = 0,
          stability = 0
      WHERE last_review IS NULL AND (state IS NULL OR state != 0)
    `)
    migrations.push(`✓ set ${result.rowsAffected || 0} unreviewed cards to FSRS state=New`)
  } catch (e) {
    migrations.push('✗ new cards migration warning: ' + e.message)
  }

  // ── Verify schema ─────────────────────────────────────

  try {
    const schema = await db.execute(`PRAGMA table_info(anki_cards)`)
    const columns = schema.rows.map(r => `${r.name} (${r.type})`)
    migrations.push('Schema: ' + columns.join(', '))
  } catch (e) {
    migrations.push('Schema check error: ' + e.message)
  }

  return res.json({ ok: true, migrations })
}
