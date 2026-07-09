const WORKER_URL = 'https://medstudy-api.medstudy.workers.dev'

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, WORKER_URL)

  const headers = new Headers(request.headers)
  headers.set('host', new URL(WORKER_URL).host)

  const proxy = new Request(target, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : undefined,
    redirect: 'follow',
  })

  return fetch(proxy)
}
