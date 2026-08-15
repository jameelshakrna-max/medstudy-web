import { test, expect, type Page, type Browser } from '@playwright/test'
import { buildStorageState, stubApi, expectNoHorizontalOverflow, SUPABASE_ORIGIN } from './validation-session'

// TrackingHub ("Progress") E2E — non-credential-gated.
//
// Auth is a synthetic Supabase session (see validation-session.ts); every
// Worker/PostgREST call is stubbed. No login(), no TEST_EMAIL/TEST_PASSWORD.
// The PostgREST stub returns [] for every table, so these pages show their
// EMPTY states; error-state tests override a specific table AFTER stubApi
// (Playwright matches routes in reverse registration order, so a later
// page.route wins) and unroute it to prove retry recovery.
//
// Covered here: hard-load defaults + URL contract (see src/lib/trackingTabs.js),
// unknown-tab fallback, tab click + query-param preservation, keyboard
// navigation on the shared Tabs primitive (arrows move focus only, Enter/Space
// activate), empty states, error states + retry, responsive overflow, and
// back/forward history across hard navigations. Real CRUD stays auth-gated in
// the existing suites — nothing here mutates data.

interface AppOpts {
  width: number
  height?: number
  theme?: 'dark' | 'light'
}

interface AppCtx {
  context: Awaited<ReturnType<typeof openApp>>['context']
  page: Page
  errors: string[]
}

async function openApp(browser: Browser, opts: AppOpts = {}): Promise<AppCtx> {
  const theme = opts.theme ?? 'dark'
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height ?? 800 },
    storageState: buildStorageState(theme),
    colorScheme: theme,
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = '.tsqd-parent-container { display: none !important; }'
    const inject = () => (document.head || document.documentElement).appendChild(style)
    if (document.head) inject()
    else document.addEventListener('DOMContentLoaded', inject)
  })
  await stubApi(page)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  return { context, page, errors }
}

async function expectNoPageErrors(ctx: AppCtx): Promise<void> {
  await ctx.page.waitForTimeout(300)
  expect(ctx.errors, `uncaught page errors: ${ctx.errors.join(' | ')}`).toEqual([])
}

const tablist = (page: Page) => page.locator('[data-testid="tracking-tablist"]')
const selectedTab = (page: Page) => page.locator('[data-testid="tracking-tablist"] [role="tab"][aria-selected="true"]')
const tab = (page: Page, label: string) => page.getByRole('tab', { name: label })

/** Hard-loads a path and waits for the app shell (main). */
async function open(path: string, page: Page): Promise<void> {
  await page.goto(path)
  await expect(page.locator('main')).toBeVisible({ timeout: 15_000 })
}

/** Hard-loads a TrackingHub path and waits for the rendered tablist. */
async function openTracking(path: string, page: Page): Promise<void> {
  await open(path, page)
  await expect(tablist(page)).toBeVisible()
}

test.describe('Progress tracking hub', () => {
  test('hard load /progress: Overview selected, empty dashboard, no errors, no overflow', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    await openTracking('/progress', ctx.page)
    await expect(selectedTab(ctx.page)).toHaveText('Overview')
    await expect(ctx.page.getByText('No tracking data yet')).toBeVisible()
    await expectNoHorizontalOverflow(ctx.page)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  for (const { path, label, empty, heading } of [
    { path: '/progress?tab=uworld', label: 'UWorld Tracker', empty: 'No blocks logged yet. Log your first UWorld block!' },
    { path: '/progress?tab=mrcp', label: 'MRCP Progress', empty: 'No MRCP systems yet. Add your first system and topic above.' },
    { path: '/progress?tab=board', label: 'Local Board Tracker', empty: 'No clinical cases logged yet. Start tracking your Local Board cases!' },
    { path: '/progress?tab=sessions', label: 'Sessions', empty: 'No sessions found for this period.', heading: 'Study Sessions' },
    { path: '/progress?tab=goals', label: 'Goals', empty: 'No study goals yet', heading: 'Study Goals' },
  ]) {
    test(`hard load ${path}: selects "${label}" and shows its empty state`, async ({ browser }) => {
      const ctx = await openApp(browser, { width: 1280 })
      await openTracking(path, ctx.page)
      await expect(selectedTab(ctx.page)).toHaveText(label)
      if (label === 'Sessions') await expect(ctx.page.getByTestId('sessions-view')).toBeVisible()
      if (heading) await expect(ctx.page.getByRole('heading', { name: heading })).toBeVisible()
      await expect(ctx.page.getByText(empty)).toBeVisible()
      await expectNoPageErrors(ctx)
      await ctx.context.close()
    })
  }

  test('/uworld defaults to UWorld Tracker; valid ?tab= wins over the pathname default', async ({ browser }) => {
    const a = await openApp(browser, { width: 1280 })
    await openTracking('/uworld', a.page)
    await expect(selectedTab(a.page)).toHaveText('UWorld Tracker')
    await expect(a.page.getByText('No blocks logged yet. Log your first UWorld block!')).toBeVisible()
    await expectNoPageErrors(a)
    await a.context.close()

    const b = await openApp(browser, { width: 1280 })
    await openTracking('/uworld?tab=mrcp', b.page)
    await expect(selectedTab(b.page)).toHaveText('MRCP Progress')
    await expectNoPageErrors(b)
    await b.context.close()
  })

  test('unknown ?tab= falls back to the pathname default', async ({ browser }) => {
    const a = await openApp(browser, { width: 1280 })
    await openTracking('/progress?tab=bogus', a.page)
    await expect(selectedTab(a.page)).toHaveText('Overview')
    await expect(a.page.getByText('No tracking data yet')).toBeVisible()
    await expectNoPageErrors(a)
    await a.context.close()

    const b = await openApp(browser, { width: 1280 })
    await openTracking('/uworld?tab=unknown', b.page)
    await expect(selectedTab(b.page)).toHaveText('UWorld Tracker')
    await expectNoPageErrors(b)
    await b.context.close()
  })

  test('tab click navigation preserves unrelated query params', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    await openTracking('/progress?tab=overview&source=card', ctx.page)
    await expect(selectedTab(ctx.page)).toHaveText('Overview')

    await tab(ctx.page, 'MRCP Progress').click()
    await expect(ctx.page).toHaveURL(/[?&]tab=mrcp/)
    await expect(ctx.page).toHaveURL(/[?&]source=card/)
    await expect(selectedTab(ctx.page)).toHaveText('MRCP Progress')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('keyboard: arrows move focus only, Enter/Space activate and sync the URL', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    await openTracking('/progress', ctx.page)
    await expect(selectedTab(ctx.page)).toHaveText('Overview')

    await tab(ctx.page, 'Overview').focus()
    await expect(tab(ctx.page, 'Overview')).toBeFocused()

    // Arrow keys move focus only — selection stays put.
    await ctx.page.keyboard.press('ArrowRight')
    await expect(tab(ctx.page, 'UWorld Tracker')).toBeFocused()
    await expect(selectedTab(ctx.page)).toHaveText('Overview')

    await ctx.page.keyboard.press('ArrowRight')
    await expect(tab(ctx.page, 'MRCP Progress')).toBeFocused()

    // Enter activates the focused tab (manual activation contract).
    await ctx.page.keyboard.press('Enter')
    await expect(selectedTab(ctx.page)).toHaveText('MRCP Progress')
    await expect(ctx.page).toHaveURL(/tab=mrcp/)

    // Home/End jump focus to the first/last tab without activating.
    await ctx.page.keyboard.press('Home')
    await expect(tab(ctx.page, 'Overview')).toBeFocused()
    await expect(selectedTab(ctx.page)).toHaveText('MRCP Progress')

    await ctx.page.keyboard.press('End')
    await expect(tab(ctx.page, 'Goals')).toBeFocused()

    // Space activates like Enter.
    await ctx.page.keyboard.press(' ')
    await expect(selectedTab(ctx.page)).toHaveText('Goals')
    await expect(ctx.page).toHaveURL(/tab=goals/)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('empty states across routes: sessions zeros, goals copy, dashboard empty', async ({ browser }) => {
    const sessions = await openApp(browser, { width: 1280 })
    await open('/sessions', sessions.page)
    await expect(sessions.page.getByTestId('sessions-view')).toBeVisible()
    await expect(sessions.page.getByRole('heading', { name: 'Study Sessions' })).toBeVisible()
    await expect(sessions.page.getByText('No sessions found for this period.')).toBeVisible()
    const values = sessions.page.locator('[data-testid="session-stats"] [class*="statValue"]')
    await expect(values).toHaveCount(4)
    await expect(values.nth(0)).toHaveText('0.0')
    await expect(values.nth(1)).toHaveText('0')
    await expect(values.nth(2)).toHaveText('0')
    await expect(values.nth(3)).toHaveText('0')
    await expectNoPageErrors(sessions)
    await sessions.context.close()

    const goals = await openApp(browser, { width: 1280 })
    await open('/goals', goals.page)
    await expect(goals.page.getByRole('heading', { name: 'Study Goals' })).toBeVisible()
    await expect(goals.page.getByText('No study goals yet')).toBeVisible()
    await expectNoPageErrors(goals)
    await goals.context.close()

    const progress = await openApp(browser, { width: 1280 })
    await openTracking('/progress', progress.page)
    await expect(progress.page.getByText('No tracking data yet')).toBeVisible()
    await expectNoPageErrors(progress)
    await progress.context.close()
  })

  test('error state: failing uworld_blocks breaks the report with a Retry button', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    await ctx.page.route(`${SUPABASE_ORIGIN}/rest/v1/uworld_blocks**`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'stubbed failure' }) }))
    await open('/progress?tab=uworld', ctx.page)
    await expect(ctx.page.getByTestId('query-error-state')).toBeVisible()
    await expect(ctx.page.getByTestId('query-error-retry')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('error + retry: Overview report recovers after the failing table is un-stubbed', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    await ctx.page.route(`${SUPABASE_ORIGIN}/rest/v1/uworld_blocks**`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'stubbed failure' }) }))
    await open('/progress', ctx.page)
    await expect(ctx.page.getByTestId('query-error-state')).toBeVisible()

    await ctx.page.unroute(`${SUPABASE_ORIGIN}/rest/v1/uworld_blocks**`)
    await ctx.page.getByTestId('query-error-retry').click()
    await expect(ctx.page.getByText('No tracking data yet')).toBeVisible()
    await expect(tablist(ctx.page)).toBeVisible()
    await expect(selectedTab(ctx.page)).toHaveText('Overview')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('rotation tab renders its stubbed empty state', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    await openTracking('/progress?tab=rotation', ctx.page)
    await expect(selectedTab(ctx.page)).toHaveText('Rotation')
    await expect(ctx.page.getByText('No rotation plan yet')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('responsive 320: /progress has no overflow and the tablist scrolls horizontally', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 320, height: 568 })
    await openTracking('/progress', ctx.page)
    await expectNoHorizontalOverflow(ctx.page)

    const tablistEl = ctx.page.locator('[data-testid="tracking-tablist"]')
    const dims = await tablistEl.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(dims.scrollWidth).toBeGreaterThan(dims.clientWidth)
    const scrolled = await tablistEl.evaluate((el) => { el.scrollLeft = el.scrollWidth; return el.scrollLeft })
    expect(scrolled).toBeGreaterThan(0)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('responsive: /sessions at 320 and /progress at 768/1280 have no horizontal overflow', async ({ browser }) => {
    const sessions = await openApp(browser, { width: 320, height: 568 })
    await open('/sessions', sessions.page)
    await expect(sessions.page.getByRole('heading', { name: 'Study Sessions' })).toBeVisible()
    await expectNoHorizontalOverflow(sessions.page)
    await expectNoPageErrors(sessions)
    await sessions.context.close()

    const tablet = await openApp(browser, { width: 768 })
    await openTracking('/progress', tablet.page)
    await expectNoHorizontalOverflow(tablet.page)
    await expectNoPageErrors(tablet)
    await tablet.context.close()

    const desktop = await openApp(browser, { width: 1280 })
    await openTracking('/progress', desktop.page)
    await expectNoHorizontalOverflow(desktop.page)
    await expectNoPageErrors(desktop)
    await desktop.context.close()
  })

  test('back/forward across tab switches restores the prior hard-load URL and the tab state', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    // Two hard loads build real history entries; tab clicks use replace
    // navigation (handleTabChange passes { replace: true }), so they don't
    // append entries — goBack lands on the prior hard-load URL.
    await openTracking('/progress', ctx.page)
    await expect(selectedTab(ctx.page)).toHaveText('Overview')
    await openTracking('/uworld', ctx.page)
    await expect(selectedTab(ctx.page)).toHaveText('UWorld Tracker')

    await tab(ctx.page, 'Sessions').click()
    await expect(ctx.page).toHaveURL(/tab=sessions/)
    await expect(selectedTab(ctx.page)).toHaveText('Sessions')

    await ctx.page.goBack()
    await expect(ctx.page).toHaveURL(/\/progress$/)
    await expect(tablist(ctx.page)).toBeVisible()
    await expect(selectedTab(ctx.page)).toHaveText('Overview')

    await ctx.page.goForward()
    await expect(ctx.page).toHaveURL(/tab=sessions/)
    await expect(tablist(ctx.page)).toBeVisible()
    await expect(selectedTab(ctx.page)).toHaveText('Sessions')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})
