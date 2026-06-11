import { createClient } from '@libsql/client'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const config = { regions: ['sin1'] }

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const supabase = createSupabaseClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function getUser(req) {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}

function mapCard(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    deck_id: r.deck_id || null,
    front: r.front,
    back: r.back,
    high_yield: Boolean(r.high_yield),
    ease_factor: Number(r.ease_factor),
    interval: Number(r.interval ?? r.interval_days),
    repetitions: Number(r.repetitions ?? r.times_reviewed),
    last_review: (r.last_review ?? r.last_reviewed) || null,
    next_review: (r.next_review ?? r.next_review_date) || null,
    created_at: r.created_at
  }
}

/* GET /api/shared — list all shared decks with their cards, optional search */
export async function GET(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const url = new URL(req.url)
    const search = url.searchParams.get('q') || ''

    let deckSql, deckArgs
    if (search.trim()) {
      const term = '%' + search.trim().toLowerCase() + '%'
      deckSql = `SELECT d.id, d.user_id, d.name, d.description, d.share_code, d.created_at,
        (SELECT COUNT(*) FROM anki_cards c WHERE c.deck_id = d.id) as card_count
        FROM anki_decks d
        WHERE d.is_shared = 1 AND (LOWER(d.name) LIKE ? OR LOWER(d.description) LIKE ?)
        ORDER BY d.created_at DESC`
      deckArgs = [term, term]
    } else {
      deckSql = `SELECT d.id, d.user_id, d.name, d.description, d.share_code, d.created_at,
        (SELECT COUNT(*) FROM anki_cards c WHERE c.deck_id = d.id) as card_count
        FROM anki_decks d
        WHERE d.is_shared = 1
        ORDER BY d.created_at DESC`
      deckArgs = []
    }

    const deckResult = await turso.execute({ sql: deckSql, args: deckArgs })

    const decks = deckResult.rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      description: r.description || '',
      share_code: r.share_code,
      card_count: Number(r.card_count),
      is_own: r.user_id === user.id,
      created_at: r.created_at
    }))

    /* If searching cards specifically */
    if (search.trim()) {
      const term = '%' + search.trim().toLowerCase() + '%'
      const cardResult = await turso.execute({
        sql: `SELECT c.id, c.front, c.back, c.high_yield, c.deck_id, d.name as deck_name, d.share_code, d.user_id as deck_user_id
          FROM anki_cards c
          JOIN anki_decks d ON d.id = c.deck_id
          WHERE d.is_shared = 1 AND (LOWER(c.front) LIKE ? OR LOWER(c.back) LIKE ?)
          ORDER BY c.created_at DESC
          LIMIT 50`,
        args: [term, term]
      })
      const cards = cardResult.rows.map(r => ({
        id: r.id,
        front: r.front,
        back: r.back,
        high_yield: Boolean(r.high_yield),
        deck_id: r.deck_id,
        deck_name: r.deck_name,
        share_code: r.share_code,
        is_own: r.deck_user_id === user.id
      }))
      return Response.json({ decks, cards })
    }

    return Response.json({ decks, cards: [] })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

/* POST /api/shared — copy a shared deck (and its cards) to the user's collection */
export async function POST(req) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { share_code } = body
    if (!share_code) return Response.json({ error: 'share_code required' }, { status: 400 })

    /* Find the shared deck */
    const deckResult = await turso.execute({
      sql: 'SELECT * FROM anki_decks WHERE share_code = ? AND is_shared = 1',
      args: [share_code]
    })
    if (!deckResult.rows.length) return Response.json({ error: 'Deck not found' }, { status: 404 })

    const sourceDeck = deckResult.rows[0]

    /* Don't copy your own deck */
    if (sourceDeck.user_id === user.id) return Response.json({ error: 'This is your own deck' }, { status: 400 })

    /* Check if already copied */
    const existing = await turso.execute({
      sql: 'SELECT id FROM anki_decks WHERE user_id = ? AND name = ?',
      args: [user.id, sourceDeck.name + ' (Copy)']
    })
    if (existing.rows.length) return Response.json({ error: 'Already copied this deck' }, { status: 409 })

    /* Create the deck copy */
    const newDeckId = crypto.randomUUID()
    await turso.execute({
      sql: `INSERT INTO anki_decks (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      args: [newDeckId, user.id, sourceDeck.name + ' (Copy)', sourceDeck.description || '']
    })

    /* Copy all cards */
    const cards = await turso.execute({
      sql: 'SELECT * FROM anki_cards WHERE deck_id = ?',
      args: [sourceDeck.id]
    })

    const copiedCards = []
    for (const c of cards.rows) {
      const cardId = crypto.randomUUID()
      await turso.execute({
        sql: `INSERT INTO anki_cards (id, user_id, deck_id, front, back, high_yield, ease_factor, interval_days, times_reviewed, last_reviewed, next_review_date, interval, repetitions, last_review, next_review, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 2.5, 0, 0, NULL, NULL, 0, 0, NULL, NULL, datetime('now'))`,
        args: [cardId, user.id, newDeckId, c.front, c.back, c.high_yield ? 1 : 0]
      })
      copiedCards.push({
        id: cardId, user_id: user.id, deck_id: newDeckId,
        front: c.front, back: c.back,
        high_yield: Boolean(c.high_yield), ease_factor: 2.5,
        interval: 0, repetitions: 0, last_review: null, next_review: null,
        created_at: new Date().toISOString()
      })
    }

    return Response.json({
      deck: { id: newDeckId, user_id: user.id, name: sourceDeck.name + ' (Copy)', description: sourceDeck.description || '' },
      cards: copiedCards
    }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}