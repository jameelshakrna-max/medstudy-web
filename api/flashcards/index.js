export const runtime = 'nodejs'

export async function GET() {
  return new Response(JSON.stringify({ ok: true, v: '1' }), { headers: { 'content-type': 'application/json' } })
}

export async function POST() {
  return new Response(JSON.stringify({ ok: true, v: '1' }), { status: 201, headers: { 'content-type': 'application/json' } })
}
