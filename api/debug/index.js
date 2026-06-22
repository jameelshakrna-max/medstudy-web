export const runtime = 'nodejs'

export async function GET(req) {
  const body = JSON.stringify({
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers),
    runtime: 'nodejs',
    ok: true,
  })
  return new Response(body, {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req) {
  const text = await req.text()
  const body = JSON.stringify({
    method: req.method,
    url: req.url,
    contentLength: text.length,
    runtime: 'nodejs',
    ok: true,
  })
  return new Response(body, {
    headers: { 'Content-Type': 'application/json' },
  })
}
