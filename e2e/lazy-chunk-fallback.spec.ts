import { test, expect } from '@playwright/test'
import { spawn, execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test.use({ serviceWorkers: 'block' })

const repo = process.cwd()
const dist = join(repo, 'dist')
const port = 8798
let emulator
let started = false

test.beforeAll(async () => {
  test.setTimeout(300_000)
  execSync('npm run build', { cwd: repo, stdio: 'pipe', timeout: 240_000 })
  emulator = spawn(
    process.execPath,
    [join(repo, 'e2e', 'pages-emulator.mjs'), dist, String(port), join(repo, 'public', '_redirects')],
    { stdio: 'pipe' }
  )
  started = false
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('emulator failed to start')), 20_000)
    emulator.stdout.on('data', (d) => {
      if (String(d).includes('listening')) {
        started = true
        clearTimeout(timer)
        resolve()
      }
    })
    emulator.stderr.on('data', (d) => process.stderr.write(d))
    emulator.on('exit', (code) => {
      if (!started) {
        clearTimeout(timer)
        reject(new Error(`emulator exited early: ${code}`))
      }
    })
  })
})

test.afterAll(async () => {
  if (emulator) emulator.kill()
})

const base = `http://127.0.0.1:${port}`

test('missing JS chunk returns a real 404, not index.html', async ({ request }) => {
  const res = await request.get(`${base}/assets/__MISSING__-abc123.js`)
  expect(res.status()).toBe(404)
  expect(res.headers()['content-type'] || '').not.toContain('text/html')
})

test('SPA fallback still serves index.html for HTML navigation', async ({ request }) => {
  const res = await request.get(`${base}/login`, {
    headers: { accept: 'text/html,application/xhtml+xml' },
  })
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/html')
})

test('a lazy chunk served as index.html produces a module import failure', async ({ page }) => {
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.route('**/assets/Login-*.js', async (route) => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8')
    await route.fulfill({ status: 200, contentType: 'text/html', body: html })
  })

  await page.goto(`${base}/login`)
  await page.waitForTimeout(2500)

  const hit = errors.some(
    (e) =>
      /Failed to fetch dynamically imported module|Unexpected token|dynamically imported/i.test(e) &&
      /Login/i.test(e)
  )
  expect(hit).toBe(true)
})
