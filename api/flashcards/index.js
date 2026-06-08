import { createClient } from "@libsql/client"

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
})

async function getUser(req) {
  const auth = req.headers["authorization"] || ""
  const token = auth.replace("Bearer ", "")
  if (!token) return null
  try {
    const url = process.env.VITE_SUPABASE_URL
    const key = process.env.VITE_SUPABASE_ANON_KEY
    const res = await fetch(url + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + token, apikey: key }
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export default async function handler(req, res) {
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: "Unauthorized" })
  const uid = user.id
  if (req.method === "GET") {
    const deck_id = req.query.deck_id
    try {
      const r = await turso.execute({ sql: "SELECT * FROM anki_cards WHERE user_id = ? AND deck_id = ? ORDER BY created_at DESC", args: [uid, deck_id] })
      return res.json(r.rows)
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }
  if (req.method === "POST") {
    const body = req.body
    if (body.cards && Array.isArray(body.cards)) {
      try {
        const rows = []
        for (const card of body.cards) {
          const id = crypto.randomUUID()
          await turso.execute({ sql: "INSERT INTO anki_cards (id, user_id, deck_id, front, back) VALUES (?, ?, ?, ?, ?)", args: [id, uid, card.deck_id, card.front, card.back] })
          rows.push({ id, user_id: uid, deck_id: card.deck_id, front: card.front, back: card.back })
        }
        return res.status(201).json(rows)
      } catch (e) { return res.status(500).json({ error: e.message }) }
    } else {
      const { deck_id, front, back } = body
      if (!deck_id || !front || !back) return res.status(400).json({ error: "deck_id, front, back required" })
      try {
        const id = crypto.randomUUID()
        await turso.execute({ sql: "INSERT INTO anki_cards (id, user_id, deck_id, front, back) VALUES (?, ?, ?, ?, ?)", args: [id, uid, deck_id, front, back] })
        return res.status(201).json({ id, user_id: uid, deck_id, front, back })
      } catch (e) { return res.status(500).json({ error: e.message }) }
    }
  }
  return res.status(405).json({ error: "Method not allowed" })
}