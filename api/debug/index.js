import { getUser } from '../_auth.js'

export const runtime = 'nodejs'

export async function GET(req) {
  const user = await getUser(req)
  const body = JSON.stringify({
    method: req.method,
    url: req.url,
    hasUser: !!user,
    runtime: 'nodejs',
    ok: true,
  })
  return new Response(body, {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req) {
  const user = await getUser(req)
  const text = await req.text()
  const body = JSON.stringify({
    method: req.method,
    url: req.url,
    hasUser: !!user,
    contentLength: text.length,
    runtime: 'nodejs',
    ok: true,
  })
  return new Response(body, {
    headers: { 'Content-Type': 'application/json' },
  })
}
