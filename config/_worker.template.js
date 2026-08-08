// Cloudflare Pages advanced-mode Function (the site's proxy).
//
// The API origin is injected at build time by the Vite plugin
// `medstudy-pages-worker` (see vite.config.js) from config/api-origins.mjs.
// If a build ever ships without an injected origin the proxy FAILS CLOSED
// (503) instead of forwarding /api/* anywhere, so a misconfigured build can
// never silently write to the wrong environment.
const API_ORIGIN = '__MEDSTUDY_API_ORIGIN__'

const API_ORIGIN_RE = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/

function isHtmlNavigation(request) {
  if (request.method !== 'GET') return false
  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      if (!API_ORIGIN_RE.test(API_ORIGIN)) {
        return new Response(JSON.stringify({ error: 'API origin not configured' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      }
      const apiUrl = API_ORIGIN + url.pathname + url.search
      return fetch(apiUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })
    }
    const response = await env.ASSETS.fetch(request)
    if (response.status === 404 && isHtmlNavigation(request)) {
      const notFound = await env.ASSETS.fetch(new URL('/index.html', url))
      return new Response(notFound.body, { status: 200, headers: notFound.headers })
    }
    return response
  },
}
