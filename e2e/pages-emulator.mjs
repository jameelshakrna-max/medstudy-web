import http from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const root = process.argv[2]
const port = Number(process.argv[3])
const redirectsPath = process.argv[4]

const MIME = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
}

function contentType(filePath) {
  return MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

const redirects = readFileSync(redirectsPath, 'utf8')
const catchAllFallback = /\/\*[ \t]+\/index\.html[ \t]+200/.test(redirects)
const mode = catchAllFallback ? 'legacy-redirect' : 'worker-html-only'

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://emulator')
  const path = decodeURIComponent(url.pathname)

  if (path.startsWith('/api/')) {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('api not emulated')
    return
  }

  const rel = path.replace(/^\/+/, '')
  const filePath = join(root, rel)

  if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-cache' })
    res.end(readFileSync(filePath))
    return
  }

  const accept = req.headers.accept || ''
  if (mode === 'legacy-redirect') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-cache' })
    res.end(readFileSync(join(root, 'index.html')))
    return
  }

  if (req.method === 'GET' && accept.includes('text/html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-cache' })
    res.end(readFileSync(join(root, 'index.html')))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`emulator listening on http://127.0.0.1:${port} (${mode})`)
})
