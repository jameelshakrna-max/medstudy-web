import { test, expect, type Page, type Response } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Staging-only guards
// ---------------------------------------------------------------------------

const PREVIEW_URL = (process.env.STAGING_PREVIEW_URL || '').replace(/\/+$/, '')

function previewOrigin() {
  if (!PREVIEW_URL) throw new Error('STAGING_PREVIEW_URL must be set to a medstudy-web.pages.dev preview URL')
  const host = new URL(PREVIEW_URL).hostname
  if (!host.endsWith('.medstudy-web.pages.dev')) {
    throw new Error(`Refusing to run Finding G scenarios against non-staging host: ${host}`)
  }
  return new URL(PREVIEW_URL).origin
}

function loadStagingEnv() {
  try {
    const txt = readFileSync(join(process.cwd(), '.env.staging.local'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Za-z0-9_]+)="?(.*?)"?\s*$/)
      if (m && m[1] && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  } catch {
    // gitignored file missing: fall back to process env only
  }
}
loadStagingEnv()

const A_EMAIL = process.env.STAGING_TEST_USER_A_EMAIL || process.env.TEST_EMAIL || ''
const A_PASSWORD = process.env.STAGING_TEST_USER_A_PASSWORD || process.env.TEST_PASSWORD || ''

function assertStagingCreds() {
  if (!/^.+@medstudy-staging\.test$/.test(A_EMAIL)) {
    throw new Error('STAGING_TEST_USER_A_EMAIL must be a @medstudy-staging.test account')
  }
  if (!A_PASSWORD) throw new Error('STAGING_TEST_USER_A_PASSWORD is missing')
}
assertStagingCreds()

const ORIGIN = previewOrigin()

// ---------------------------------------------------------------------------
// Lazy route inventory (path -> expected page chunk filename stem)
// ---------------------------------------------------------------------------

const PUBLIC_ROUTES: Array<[string, string]> = [
  ['/', 'Landing-'],
  ['/login', 'Login-'],
  ['/signup', 'Signup-'],
  ['/reset-password', 'ResetPassword-'],
]

const PROTECTED_ROUTES: Array<[string, string]> = [
  ['/dashboard', 'Dashboard-'],
  ['/curriculum', 'Curriculum-'],
  ['/anki', 'Anki-'],
  ['/uworld', 'TrackingHub-'],
  ['/pomodoro', 'Pomodoro-'],
  ['/resources', 'Resources-'],
  ['/sessions', 'Sessions-'],
  ['/goals', 'Goals-'],
  ['/communities', 'Communities-'],
  ['/leaderboard', 'Leaderboard-'],
  ['/people', 'People-'],
  ['/settings', 'Settings-'],
  ['/messages', 'DMInbox-'],
  ['/forest', 'ForestPage-'],
  ['/rotations', 'RotationPlanner-'],
  ['/research', 'ResearchHub-'],
]

const PARAM_ROUTES: Array<[string, string]> = [
  ['/resources/nonexistent-res-xyz', 'ResourceDetail-'],
  ['/communities/nonexistent-comm-xyz', 'CommunityDetail-'],
  ['/messages/nonexistent-conv-xyz', 'DMConversation-'],
  ['/profile/nonexistent-user-xyz', 'ProfilePage-'],
]

// ---------------------------------------------------------------------------
// Evidence collection
// ---------------------------------------------------------------------------

type ChunkRecord = { route: string; url: string; status: number; contentType: string; sw: boolean }
const EVIDENCE: ChunkRecord[] = []

function watchChunks(page: Page, route: string): { out: ChunkRecord[]; dispose: () => void } {
  const out: ChunkRecord[] = []
  const handler = (resp: Response) => {
    const u = new URL(resp.url())
    if (u.origin !== ORIGIN) return
    if (!u.pathname.startsWith('/assets/') || !u.pathname.endsWith('.js')) return
    const ct = (resp.headers()['content-type'] || '').split(';')[0].trim()
    const rec: ChunkRecord = {
      route,
      url: u.pathname,
      status: resp.status(),
      contentType: ct,
      sw: resp.fromServiceWorker(),
    }
    out.push(rec)
    EVIDENCE.push(rec)
  }
  page.on('response', handler)
  return { out, dispose: () => page.off('response', handler) }
}

async function waitForChunk(page: Page, stem: string, timeout = 20_000) {
  await page.waitForResponse(
    (r) => {
      const u = new URL(r.url())
      return (
        u.origin === ORIGIN &&
        u.pathname.startsWith('/assets/') &&
        u.pathname.endsWith('.js') &&
        u.pathname.includes(stem) &&
        r.request().resourceType() === 'script'
      )
    },
    { timeout }
  )
}

function collectConsoleErrors(page: Page, errors: string[]) {
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') errors.push(msg.text())
  }
  const onPageError = (err: Error) => errors.push(`PAGEERROR: ${err.message}`)
  page.on('console', onConsole as never)
  page.on('pageerror', onPageError)
  return () => {
    page.off('console', onConsole as never)
    page.off('pageerror', onPageError)
  }
}

async function login(page: Page) {
  await page.goto(`${ORIGIN}/login`)
  await page.fill(
    'input[type="email"], input[name="email"], input[placeholder*="email" i]',
    A_EMAIL
  )
  await page.fill(
    'input[type="password"], input[name="password"], input[placeholder*="password" i]',
    A_PASSWORD
  )
  await page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")')
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

function chunkImportError(errors: string[]) {
  return errors.some(
    (e) =>
      /Failed to fetch dynamically imported module|Unexpected token|Failed to load module script|dynamically imported/i.test(
        e
      ) && !/PAGEERROR/.test(e)
  )
}

function saveEvidence() {
  try {
    const dir = process.env.TEMP_EVIDENCE_DIR || join(process.cwd(), 'test-results')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'finding-g-real-pages-evidence.json'), JSON.stringify(EVIDENCE, null, 2))
  } catch {
    // evidence is best-effort
  }
}

test.afterAll(() => saveEvidence())

// ---------------------------------------------------------------------------
// Profile 1: clean browser, no service worker — direct open every lazy route
// ---------------------------------------------------------------------------

test.describe('Finding G on real Cloudflare Pages', () => {
  test.use({ serviceWorkers: 'block' })

  test('P1 clean profile: every lazy chunk loads 200 + application/javascript (no 200-HTML fallback)', async ({
    page,
  }) => {
    test.setTimeout(300_000)

    await login(page)

    const allRoutes: Array<[string, string]> = [
      ...PROTECTED_ROUTES,
      ...PARAM_ROUTES,
    ]

    for (const [route, stem] of allRoutes) {
      const errors: string[] = []
      const detach = collectConsoleErrors(page, errors)
      const watch = watchChunks(page, route)
      const chunkLoaded = waitForChunk(page, stem)
      await page.goto(`${ORIGIN}${route}`)
      await chunkLoaded
      await page.waitForTimeout(600)
      detach()
      watch.dispose()

      const rec = watch.out.find((c) => c.url.includes(stem))
      expect(rec, `chunk ${stem} not requested for ${route}`).toBeTruthy()
      expect([200, 304], `chunk ${stem} status on ${route}`).toContain(rec!.status)
      if (rec!.status === 200) {
        expect(rec!.contentType, `chunk ${stem} MIME on ${route}`).toBe('application/javascript')
      }
      expect(chunkImportError(errors), `chunk import failure on ${route}: ${errors.join(' | ')}`).toBe(false)
    }

    // Every JS response in the session must be 200/304 + JS MIME (never 200 HTML)
    const bad = EVIDENCE.filter(
      (c) => (c.status === 200 && c.contentType !== 'application/javascript') || ![200, 304].includes(c.status)
    )
    expect(bad, `non-JS/200 chunk responses: ${JSON.stringify(bad)}`).toEqual([])
  })

  test('P1 public routes: landing/login/signup/reset-password chunks load 200 + JS MIME', async ({ page }) => {
    for (const [route, stem] of PUBLIC_ROUTES) {
      const errors: string[] = []
      const detach = collectConsoleErrors(page, errors)
      const watch = watchChunks(page, route)
      const chunkLoaded = waitForChunk(page, stem)
      await page.goto(`${ORIGIN}${route}`)
      await chunkLoaded
      await page.waitForTimeout(500)
      detach()
      watch.dispose()

      const rec = watch.out.find((c) => c.url.includes(stem))
      expect(rec, `chunk ${stem} not requested for ${route}`).toBeTruthy()
      expect([200, 304], `chunk ${stem} status on ${route}`).toContain(rec!.status)
      if (rec!.status === 200) {
        expect(rec!.contentType, `chunk ${stem} MIME on ${route}`).toBe('application/javascript')
      }
      expect(chunkImportError(errors), `chunk import failure on ${route}`).toBe(false)
    }
  })

  test('P3 stale chunk: a 404 chunk surfaces ErrorFallback + clean console error (diagnosable)', async ({
    page,
  }) => {
    const errors: string[] = []
    const detach = collectConsoleErrors(page, errors)

    await page.route(`${ORIGIN}/assets/Login-*.js`, (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' })
    )

    await page.goto(`${ORIGIN}/login`)
    await page.waitForTimeout(2000)

    expect(await page.getByRole('heading', { name: 'Something went wrong' }).isVisible()).toBe(true)
    expect(chunkImportError(errors), `expected a dynamic-import console error, got: ${errors.join(' | ')}`).toBe(true)
    detach()
  })

  test('P3 contrast (pre-fix behavior): 200 HTML chunk yields module MIME error, not a silent success', async ({
    page,
  }) => {
    const errors: string[] = []
    const detach = collectConsoleErrors(page, errors)
    const html = await (await page.request.get(`${ORIGIN}/`)).text()

    await page.route(`${ORIGIN}/assets/Login-*.js`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    )

    await page.goto(`${ORIGIN}/login`)
    await page.waitForTimeout(2000)

    const mimeError = errors.some(
      (e) => /MIME type|module script|Unexpected token|dynamically imported/i.test(e) && !/PAGEERROR/.test(e)
    )
    expect(mimeError, `expected MIME/module console error, got: ${errors.join(' | ')}`).toBe(true)
    detach()
  })
})

// ---------------------------------------------------------------------------
// Profile 2: service-worker controlled browser
// ---------------------------------------------------------------------------

test.describe('Finding G with SW control (real Pages)', () => {
  test('P2 SW-controlled: chunks served 200 + JS MIME; stale chunk gets a real 404', async ({ page }) => {
    test.setTimeout(300_000)

    await page.goto(`${ORIGIN}/login`)
    await page.waitForLoadState('load')
    await page.waitForTimeout(1500)

    await page.reload()
    await page.waitForLoadState('load')

    const controlled = await page.evaluate(async () => {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const reg = await navigator.serviceWorker?.getRegistration?.()
        if (reg && reg.active && navigator.serviceWorker.controller) return true
        await new Promise((r) => setTimeout(r, 300))
      }
      return false
    })
    expect(controlled, 'service worker did not take control of the page').toBe(true)

    await login(page)

    const allRoutes: Array<[string, string]> = [...PROTECTED_ROUTES, ...PARAM_ROUTES]
    for (const [route, stem] of allRoutes) {
      const errors: string[] = []
      const detach = collectConsoleErrors(page, errors)
      const watch = watchChunks(page, route)
      const chunkLoaded = waitForChunk(page, stem)
      await page.goto(`${ORIGIN}${route}`)
      await chunkLoaded
      await page.waitForTimeout(500)
      detach()
      watch.dispose()

      const rec = watch.out.find((c) => c.url.includes(stem))
      expect(rec, `chunk ${stem} not requested for ${route}`).toBeTruthy()
      expect([200, 304], `chunk ${stem} status on ${route}`).toContain(rec!.status)
      if (rec!.status === 200) {
        expect(rec!.contentType, `chunk ${stem} MIME on ${route}`).toBe('application/javascript')
      }
      expect(chunkImportError(errors), `chunk import failure on ${route}`).toBe(false)
    }

    // Stale (nonexistent) chunk through the SW network path must be a real 404,
    // never a 200 index.html SPA fallback. (Pages serves its own 404 page body
    // with text/html content-type, so the status is the contract.)
    const stale = await page.evaluate(async (u) => {
      const res = await fetch(u, { headers: { accept: '*/*' } })
      return { status: res.status, ct: res.headers.get('content-type') || '' }
    }, `${ORIGIN}/assets/stale-old-hash-404-test.js`)

    expect(stale.status).toBe(404)
    expect(stale.ct, 'the 404 page must not be the SPA index.html').not.toContain('index.html')
  })
})
