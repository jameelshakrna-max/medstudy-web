import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { buildStorageState, stubApi } from './validation-session'

interface AppCtx {
  context: BrowserContext
  page: Page
  errors: string[]
}

async function openApp(browser: import('@playwright/test').Browser): Promise<AppCtx> {
  const context = await browser.newContext({
    storageState: buildStorageState('dark'),
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    try { document.querySelector('.tsqd-parent-container')?.remove() } catch {}
  })
  await stubApi(page)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return { context, page, errors }
}

const SPA_ROUTES = [
  '/',
  '/dashboard',
  '/communities',
  '/communities/mine',
  '/communities/discover',
  '/communities/people',
  '/communities/leaderboard',
  '/people',
  '/leaderboard',
  '/research',
  '/rotations',
  '/focus',
  '/progress',
  '/uworld',
  '/sessions',
  '/goals',
]

for (const route of SPA_ROUTES) {
  test.describe(`Route: ${route}`, () => {
    test('SPA shell loads', async ({ browser }) => {
      const ctx = await openApp(browser)
      await ctx.page.goto(route, { waitUntil: 'domcontentloaded' })
      const shell = ctx.page.locator('#root')
      await expect(shell).toBeAttached()
      expect(ctx.errors, `page errors on ${route}: ${ctx.errors.join(' | ')}`).toEqual([])
      await ctx.context.close()
    })
  })
}
