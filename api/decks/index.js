const { createClient } = require("@libsql/client")
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

module.exports = async function handler(req, res) {
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: "Unauthorized" })
  const uid = user.id
  if (req.method === "GET") {
    try {
      const r = await turso.execute({ sql: "SELECT * FROM anki_decks WHERE user_id = ? ORDER BY created_at DESC", args: [uid] })
      return res.json(r.rows)
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }
  if (req.method === "POST") {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: "Deck name required" })
    try {
      const id = crypto.randomUUID()
      await turso.execute({ sql: "INSERT INTO anki_decks (id, user_id, name) VALUES (?, ?, ?)", args: [id, uid, name] })
      return res.status(201).json({ id, user_id: uid, name })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }
  return res.status(405).json({ error: "Method not allowed" })
}