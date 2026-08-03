function isHtmlNavigation(request) {
  if (request.method !== 'GET') return false
  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      const apiUrl = 'https://medstudy-api.medstudy.workers.dev' + url.pathname + url.search
      return fetch(apiUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      })
    }
    const response = await env.ASSETS.fetch(request)
    if (response.status === 404 && isHtmlNavigation(request)) {
      const notFound = await env.ASSETS.fetch(new URL('/index.html', url))
      return new Response(notFound.body, { status: 200, headers: notFound.headers })
    }
    return response
  }
}
