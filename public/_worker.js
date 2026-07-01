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
    return env.ASSETS.fetch(request)
  }
}
