import { createHmac } from 'node:crypto'
import { type Page, expect } from '@playwright/test'

// Synthetic-session harness for Phase 1 shell validation.
//
// Real local credentials (TEST_EMAIL/TEST_PASSWORD) are not available, so we
// seed localStorage with a far-future Supabase session. supabase-js 2.108
// overrides the auth-js default storage key with
// `sb-<project-ref>-auth-token` (computed in supabase-js from the URL), so the
// session must live under that key (see `SESSION_STORAGE_KEY`); the legacy
// `supabase.auth.token` key is never read by the current client. The auth-js
// client performs NO network call for an unexpired session
// (`_recoverAndRefresh` only refreshes when within EXPIRY_MARGIN_MS), so this
// is a stable authenticated shell without touching the Supabase backend.
// All Worker-API traffic is stubbed at the network layer with neutral shapes.

export const API_ORIGIN = 'https://medstudy-api.medstudy.workers.dev'
export const SUPABASE_ORIGIN = 'https://undakhccjrbcpzryfmot.supabase.co'
export const APP_ORIGIN = 'http://localhost:3000'

// Key supabase-js computes: `sb-${hostname.split('.')[0]}-auth-token`.
export const SESSION_STORAGE_KEY = 'sb-undakhccjrbcpzryfmot-auth-token'

export const VALIDATION_USER = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  email: 'validation@medstudy.local',
  username: 'validationuser',
  displayName: 'Validation User',
  plan: 'core',
}

const JWT_SECRET = 'medstudy-validation-seed'

function b64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function signJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

export interface StorageState {
  cookies: never[]
  origins: Array<{
    origin: string
    localStorage: Array<{ name: string; value: string }>
  }>
}

export function buildStorageState(theme: 'dark' | 'light' = 'dark'): StorageState {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 60 * 60 * 24 * 365
  const accessToken = signJwt({ sub: VALIDATION_USER.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt })
  const refreshToken = signJwt({ sub: VALIDATION_USER.id, exp: expiresAt })
  const user = {
    id: VALIDATION_USER.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: VALIDATION_USER.email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: new Date(now * 1000).toISOString(),
  }
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: refreshToken,
    user,
  }
  return {
    cookies: [],
    origins: [
      {
        origin: APP_ORIGIN,
        localStorage: [
          { name: SESSION_STORAGE_KEY, value: JSON.stringify(session) },
          { name: `${SESSION_STORAGE_KEY}-user`, value: JSON.stringify({ user }) },
          { name: 'medstudy-theme', value: theme },
        ],
      },
    ],
  }
}

const USER_PROFILE = {
  id: VALIDATION_USER.id,
  username: VALIDATION_USER.username,
  display_name: VALIDATION_USER.displayName,
  avatar_url: null,
  full_name: VALIDATION_USER.displayName,
  email: VALIDATION_USER.email,
  plan: VALIDATION_USER.plan,
}

export const PROFILE_ROW = {
  id: VALIDATION_USER.id,
  plan: VALIDATION_USER.plan,
  full_name: VALIDATION_USER.displayName,
  email: VALIDATION_USER.email,
}

function apiStub(path: string, method: string): { status: number; body: unknown } {
  const p = path.replace(/^\/api/, '') || '/'

  if (method === 'GET') {
    if (/^\/users\/username\/[^/]+/.test(p)) return { status: 200, body: { user_id: VALIDATION_USER.id } }
    if (/^\/users\/[^/]+\/follow-status/.test(p)) return { status: 200, body: { following: false, followers_count: 0, following_count: 0 } }
    if (/^\/users\/[^/]+\/achievements/.test(p)) return { status: 200, body: [] }
    if (/^\/users\/[^/]+\/badges/.test(p)) return { status: 200, body: [] }
    if (/^\/users\/[^/]+\/research-profile/.test(p)) return { status: 200, body: {} }
    if (/^\/users\/[^/]+\/research-skills/.test(p)) return { status: 200, body: { skills: [] } }
    if (/^\/users\/[^/]+\/research-portfolio/.test(p)) return { status: 200, body: { entries: [] } }
    if (/^\/users\/[^/]+\/research-stats/.test(p)) return { status: 200, body: { stats: {} } }
    if (/^\/users\/[^/]+\/portfolio/.test(p)) return { status: 200, body: { portfolio: [] } }
    if (/^\/users\/[^/]+\/heatmap/.test(p)) return { status: 200, body: { stats: { totalHours: 0, activeDays: 0 }, data: [] } }
    if (/^\/users\/[^/]+\/pins/.test(p)) return { status: 200, body: [] }
    if (/^\/users\/[^/]+\/card/.test(p)) return { status: 200, body: { is_following: false } }
    if (/^\/users\/[^/]+\/profile/.test(p)) return { status: 200, body: USER_PROFILE }
    if (/^\/users\/(suggested|search)/.test(p)) return { status: 200, body: { users: [] } }
    if (/^\/users\/mention\/search/.test(p)) return { status: 200, body: [] }
    if (/^\/notifications\/unread-counts/.test(p)) return { status: 200, body: { all: 0 } }
    if (/^\/notifications\/preferences/.test(p)) return { status: 200, body: {} }
    if (/^\/notifications/.test(p)) return { status: 200, body: { notifications: [] } }
    if (/^\/dm\/conversations/.test(p)) return { status: 200, body: [] }
    if (/^\/dm\//.test(p)) return { status: 200, body: [] }
    if (/^\/flashcards\/due-count/.test(p)) return { status: 200, body: { dueCount: 0 } }
    if (/^\/flashcards/.test(p)) return { status: 200, body: [] }
    if (/^\/decks/.test(p)) return { status: 200, body: [] }
    if (/^\/deck-mappings/.test(p)) return { status: 200, body: [] }
    if (/^\/rotation-planner\/tracking\/schedule/.test(p)) return { status: 200, body: { schedule: [], incorrectReview: [], linkedDecks: [] } }
    if (/^\/rotation-planner\/sources/.test(p)) return { status: 200, body: [] }
    if (/^\/rotation-planner\/plans/.test(p)) return { status: 200, body: [] }
    if (/^\/rotation-planner/.test(p)) return { status: 200, body: [] }
    if (/^\/rotations\//.test(p)) return { status: 200, body: [] }
    if (/^\/heatmap/.test(p)) return { status: 200, body: { contributions: [] } }
    if (/^\/resources\/pins/.test(p)) return { status: 200, body: { pins: [] } }
    if (/^\/resources/.test(p)) return { status: 200, body: { resources: [] } }
    if (/^\/categories/.test(p)) return { status: 200, body: [] }
    if (/^\/communities/.test(p)) return { status: 200, body: { mine: [], communities: [], categories: [] } }
    if (/^\/community\/suggested-rules/.test(p)) return { status: 200, body: [] }
    if (/^\/research\/skills\/predefined/.test(p)) return { status: 200, body: [] }
    if (/^\/research\/bookmarks/.test(p)) return { status: 200, body: [] }
    if (/^\/research/.test(p)) return { status: 200, body: { posts: [] } }
    if (/^\/forest\/inventory/.test(p)) return { status: 200, body: { inventory: [], selectedTree: 'oak', coins: 0 } }
    if (/^\/leaderboard/.test(p)) return { status: 200, body: [] }
    return { status: 200, body: [] }
  }

  if (method === 'POST') {
    if (/^\/presence\/bulk/.test(p)) return { status: 200, body: { users: {} } }
    if (/^\/users\/[^/]+\/dm/.test(p)) return { status: 200, body: { conversation_id: 'conv-validation' } }
    if (/^\/communities$/.test(p)) return { status: 200, body: { id: 'community-created' } }
    return { status: 200, body: {} }
  }

  // PUT / PATCH / DELETE
  return { status: 200, body: {} }
}

/** Intercepts Worker-API, dev-proxy /api, PostgREST, and GoTrue traffic. */
export async function stubApi(page: Page): Promise<void> {
  await page.route(`${API_ORIGIN}/api/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    const { status, body } = apiStub(pathname, route.request().method())
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.route(`${APP_ORIGIN}/api/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    const { status, body } = apiStub(pathname, route.request().method())
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname.endsWith('/profiles')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PROFILE_ROW]) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
  })

  await page.route(`${SUPABASE_ORIGIN}/auth/v1/**`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'synthetic session: network auth disabled' }),
    })
  })
}

export interface ShellGeo {
  navHeight: number
  contentPadBottom: number
}

export async function mobileNavGeometry(page: Page): Promise<ShellGeo> {
  return page.evaluate(() => {
    const nav = document.querySelector('[aria-label="Bottom navigation"]')
    const main = document.querySelector('main')
    const navHeight = nav ? nav.getBoundingClientRect().height : 0
    let contentPadBottom = 0
    for (const el of Array.from(main?.children ?? [])) {
      const pad = parseFloat(getComputedStyle(el).paddingBottom)
      if (pad > 40) {
        contentPadBottom = pad
        break
      }
    }
    return { navHeight, contentPadBottom }
  })
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const geo = await page.evaluate(() => {
    const doc = document.documentElement
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, innerWidth: window.innerWidth }
  })
  expect(geo.scrollWidth, `horizontal overflow detected (scrollWidth=${geo.scrollWidth})`).toBeLessThanOrEqual(geo.innerWidth + 1)
  expect(geo.clientWidth, `document wider than viewport (clientWidth=${geo.clientWidth})`).toBeLessThanOrEqual(geo.innerWidth + 1)
}
