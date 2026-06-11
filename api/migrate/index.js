import { createClient } from '@libsql/client'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const config = { regions: ['sin1'] }

export async function GET() {
  try {
    try {
      await turso.execute('ALTER TABLE anki_decks ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0')
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e
    }
    try {
      await turso.execute('ALTER TABLE anki_decks ADD COLUMN share_code TEXT')
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e
    }
    return Response.json({ success: true, message: 'Columns added: is_shared, share_code' })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
