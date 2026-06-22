export const runtime = 'nodejs'

export async function POST() {
  return new Response(JSON.stringify({ ok: true, from: 'ping' }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  })
}
