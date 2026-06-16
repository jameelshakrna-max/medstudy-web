import { createClient } from '@libsql/client'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const config = { regions: ['sin1'] }

export async function GET() {
  try {
    /* Add is_shared column */
    try {
      await turso.execute('ALTER TABLE anki_decks ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0')
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e
    }

    /* Add share_code column */
    try {
      await turso.execute('ALTER TABLE anki_decks ADD COLUMN share_code TEXT')
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e
    }

    /* Add image_url column to anki_cards */
    try {
      await turso.execute('ALTER TABLE anki_cards ADD COLUMN image_url TEXT')
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e
    }

    return Response.json({ success: true, message: 'Columns added: is_shared, share_code, image_url' })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
