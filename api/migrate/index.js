import { createClient } from '@libsql/client'

export const config = { regions: ['sin1'] }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export async function GET(req) {
  const migrations = []

  // Add FSRS difficulty column
  try {
    await turso.execute(`ALTER TABLE anki_cards ADD COLUMN difficulty REAL DEFAULT 0`)
    migrations.push('added difficulty (REAL DEFAULT 0)')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      migrations.push('difficulty already exists')
    } else {
      migrations.push('difficulty error: ' + e.message)
    }
  }

  // Add FSRS stability column
  try {
    await turso.execute(`ALTER TABLE anki_cards ADD COLUMN stability REAL DEFAULT 0`)
    migrations.push('added stability (REAL DEFAULT 0)')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      migrations.push('stability already exists')
    } else {
      migrations.push('stability error: ' + e.message)
    }
  }

  // Add FSRS state column
  try {
    await turso.execute(`ALTER TABLE anki_cards ADD COLUMN state INTEGER DEFAULT 0`)
    migrations.push('added state (INTEGER DEFAULT 0)')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      migrations.push('state already exists')
    } else {
      migrations.push('state error: ' + e.message)
    }
  }

  // Add image_url column if missing
  try {
    await turso.execute(`ALTER TABLE anki_cards ADD COLUMN image_url TEXT`)
    migrations.push('added image_url (TEXT)')
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      migrations.push('image_url already exists')
    } else {
      migrations.push('image_url error: ' + e.message)
    }
  }

  // Migrate existing reviewed cards to FSRS
  try {
    const result = await turso.execute(`
      UPDATE anki_cards
      SET state = 2,
          difficulty = CASE
            WHEN ease_factor IS NOT NULL AND ease_factor > 0
            THEN MIN(10, MAX(1, 10 - ((ease_factor - 1.3) / (5 - 1.3)) * 9))
            ELSE 5
          END,
          stability = CASE
            WHEN interval_days IS NOT NULL AND interval_days > 0
            THEN MAX(1, interval_days)
            WHEN interval IS NOT NULL AND interval > 0
            THEN MAX(1, interval)
            ELSE 1
          END
      WHERE last_reviewed IS NOT NULL AND (state IS NULL OR state = 0)
    `)
    migrations.push('migrated ' + (result.rowsAffected || 0) + ' existing cards to FSRS')
  } catch (e) {
    migrations.push('SM-2 to FSRS warning: ' + e.message)
  }

  // Make sure unreviewed cards have FSRS defaults
  try {
    const result = await turso.execute(`
      UPDATE anki_cards
      SET state = 0, difficulty = 0, stability = 0
      WHERE last_reviewed IS NULL AND (state IS NULL OR state != 0)
    `)
    migrations.push('set ' + (result.rowsAffected || 0) + ' unreviewed cards to state=New')
  } catch (e) {
    migrations.push('new cards warning: ' + e.message)
  }

  // Show schema
  try {
    const schema = await turso.execute(`PRAGMA table_info(anki_cards)`)
    const columns = schema.rows.map(r => r.name + ' (' + r.type + ')')
    migrations.push('Schema: ' + columns.join(', '))
  } catch (e) {
    migrations.push('Schema error: ' + e.message)
  }

  return Response.json({ ok: true, migrations })
}
