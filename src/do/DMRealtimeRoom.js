export class DMRealtimeRoom {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/ws')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 })
      }
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.state.acceptWebSocket(server)
      server.send(JSON.stringify({ type: 'connected', payload: {} }))
      server.addEventListener('close', () => {})
      server.addEventListener('error', () => {})

      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname.endsWith('/broadcast') && request.method === 'POST') {
      const event = await request.json()
      const msg = JSON.stringify(event)

      const sockets = this.state.getWebSockets()
      for (const ws of sockets) {
        try { ws.send(msg) } catch {}
      }
      return new Response('OK')
    }

    return new Response('Not found', { status: 404 })
  }
}
