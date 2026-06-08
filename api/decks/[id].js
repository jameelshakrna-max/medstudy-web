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
  const id = req.query.id
  if (req.method === "DELETE") {
    try {
      await turso.execute({ sql: "DELETE FROM anki_cards WHERE deck_id = ?", args: [id] })
      await turso.execute({ sql: "DELETE FROM anki_decks WHERE id = ? AND user_id = ?", args: [id, uid] })
      return res.json({ success: true })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }
  return res.status(405).json({ error: "Method not allowed" })
}