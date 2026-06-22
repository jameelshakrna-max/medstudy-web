export const runtime = 'nodejs'

function resp(data, status) {
  const body = JSON.stringify(Object.assign(data, { _ts: Date.now() }))
  return new Response(body, {
    status: status || 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'expires': '0',
    },
  })
}

export async function GET() {
  return resp({ ok: true, v: '3' })
}

export async function POST() {
  return resp({ ok: true, v: '3' }, 201)
}
