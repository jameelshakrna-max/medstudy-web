import { test, expect, type Page, type Browser } from '@playwright/test'
import {
  buildStorageState,
  stubApi,
  seedPomodoroState,
  expectNoHorizontalOverflow,
  mobileNavGeometry,
  APP_ORIGIN,
} from './validation-session'

// Phase 2 Dashboard "Today" validation in a real authenticated browser.
// All identities/sessions are synthetic (see validation-session.ts). Fixtures
// are page-scoped (fresh BrowserContext per test), so cardsDue / pomodoro
// state can never leak between tests or parallel workers.

interface AppOpts {
  width: number
  height?: number
  theme?: 'dark' | 'light'
  cardsDue?: number
  failCardsDue?: boolean
  pomodoroState?: Record<string, unknown> | null
}

interface AppCtx {
  context: Awaited<ReturnType<typeof openApp>>['context']
  page: Page
  errors: string[]
}

async function openApp(browser: Browser, opts: AppOpts): Promise<AppCtx> {
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
  await stubApi(page, { cardsDue: opts.cardsDue ?? 0, failCardsDue: opts.failCardsDue ?? false })
  await seedPomodoroState(page, opts.pomodoroState ?? null)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  return { context, page, errors }
}

async function gotoDashboard(page: Page): Promise<void> {
  await page.goto(APP_ORIGIN + '/dashboard')
  await expect(page.locator('main')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)
}

async function expectNoPageErrors(ctx: AppCtx): Promise<void> {
  await ctx.page.waitForTimeout(250)
  expect(ctx.errors, `uncaught page errors: ${ctx.errors.join(' | ')}`).toEqual([])
}

const quickActions = (page: Page) => page.locator('[aria-label="Quick actions"]')
const bottomNav = (page: Page) => page.locator('nav[aria-label="Bottom navigation"]')
const primaryNav = (page: Page) => page.locator('nav[aria-label="Primary"]')
const ankiStatCard = (page: Page) => page.getByText('Anki Cards Due', { exact: true }).locator('..')

/** A valid paused session the PomodoroContext will hydrate (fresh savedAt). */
function pausedPomodoroState(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'study',
    running: false,
    seconds: 1200,
    totalSec: 1500,
    focusMins: 25,
    shortMins: 5,
    longMins: 15,
    savedAt: Date.now(),
    ...overrides,
  }
}

test.describe('Dashboard contextual shortcuts', () => {
  test('Start Focus always available; Continue Study and Review Anki hidden when nothing is eligible', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoDashboard(page)

    await expect(quickActions(page)).toBeVisible()
    await expect(quickActions(page).getByRole('link', { name: 'Start Focus' })).toBeVisible()
    await expect(quickActions(page).getByRole('link', { name: 'Start Focus' })).toHaveAttribute('href', '/focus')
    await expect(quickActions(page).getByRole('link', { name: 'Continue Study' })).toHaveCount(0)
    await expect(quickActions(page).getByRole('link', { name: 'Review Anki' })).toHaveCount(0)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Continue Study appears for a paused resumable session', async ({ browser }) => {
    const ctx = await openApp(browser, {
      width: 390,
      cardsDue: 0,
      pomodoroState: pausedPomodoroState(),
    })
    const { page } = ctx
    await gotoDashboard(page)

    const cont = quickActions(page).getByRole('link', { name: 'Continue Study' })
    await expect(cont).toBeVisible()
    await expect(cont).toHaveAttribute('href', '/focus')
    await expect(quickActions(page).getByRole('link', { name: 'Review Anki' })).toHaveCount(0)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  for (const [label, state] of [
    ['expired', pausedPomodoroState({ savedAt: Date.now() - 3 * 60 * 60 * 1000 })],
    ['completed', pausedPomodoroState({ completed: true })],
    ['failed', pausedPomodoroState({ failed: true })],
  ] as const) {
    test(`Continue Study hidden for ${label} stored state`, async ({ browser }) => {
      const ctx = await openApp(browser, { width: 390, pomodoroState: state })
      const { page } = ctx
      await gotoDashboard(page)

      await expect(quickActions(page)).toBeVisible()
      await expect(quickActions(page).getByRole('link', { name: 'Continue Study' })).toHaveCount(0)
      await expect(quickActions(page).getByRole('link', { name: 'Start Focus' })).toBeVisible()
      await expectNoPageErrors(ctx)
      await ctx.context.close()
    })
  }

  test('Review Anki appears only when cards are actually due', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390, cardsDue: 5 })
    const { page } = ctx
    await gotoDashboard(page)

    const review = quickActions(page).getByRole('link', { name: 'Review Anki' })
    await expect(review).toBeVisible()
    await expect(review).toHaveAttribute('href', '/anki')
    await expect(ankiStatCard(page)).toContainText('5')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('due-count request failure hides Review Anki and shows an unavailable dash (never a fabricated 0)', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390, failCardsDue: true })
    const { page } = ctx
    await gotoDashboard(page)

    await expect(quickActions(page).getByRole('link', { name: 'Review Anki' })).toHaveCount(0)
    await expect(ankiStatCard(page)).toContainText('–')
    await expect(ankiStatCard(page)).not.toContainText('0')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('successful zero response shows 0 and no Review Anki', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390, cardsDue: 0 })
    const { page } = ctx
    await gotoDashboard(page)

    await expect(quickActions(page).getByRole('link', { name: 'Review Anki' })).toHaveCount(0)
    await expect(ankiStatCard(page)).toContainText('0')
    await expect(ankiStatCard(page)).not.toContainText('–')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('320px light theme: all three shortcuts, no overflow, bottom-nav clearance preserved', async ({ browser }) => {
    const ctx = await openApp(browser, {
      width: 320,
      theme: 'light',
      cardsDue: 3,
      pomodoroState: pausedPomodoroState(),
    })
    const { page } = ctx
    await gotoDashboard(page)

    await expect(quickActions(page).getByRole('link', { name: 'Start Focus' })).toBeVisible()
    await expect(quickActions(page).getByRole('link', { name: 'Continue Study' })).toBeVisible()
    await expect(quickActions(page).getByRole('link', { name: 'Review Anki' })).toBeVisible()

    const geo = await mobileNavGeometry(page)
    expect(geo.navHeight).toBeGreaterThan(0)
    expect(geo.contentPadBottom, 'bottom nav must never cover dashboard content').toBeGreaterThanOrEqual(geo.navHeight)
    await expectNoHorizontalOverflow(page)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('shortcuts are outside the persistent BottomNav; its tabs are unchanged', async ({ browser }) => {
    const ctx = await openApp(browser, {
      width: 390,
      cardsDue: 3,
      pomodoroState: pausedPomodoroState(),
    })
    const { page } = ctx
    await gotoDashboard(page)

    await expect(quickActions(page)).toBeVisible()
    for (const name of ['Start Focus', 'Continue Study', 'Review Anki']) {
      await expect(bottomNav(page).getByRole('link', { name })).toHaveCount(0)
    }
    await expect(bottomNav(page).getByRole('link', { name: 'Home' })).toBeVisible()
    await expect(bottomNav(page).getByRole('link', { name: 'Plan' })).toBeVisible()
    await expect(bottomNav(page).getByRole('link', { name: 'Focus' })).toBeVisible()
    await expect(bottomNav(page).locator('button[aria-label="More menu"]')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('desktop 1440: shortcuts hidden with sidebar expanded and collapsed', async ({ browser }) => {
    const ctx = await openApp(browser, {
      width: 1440,
      cardsDue: 3,
      pomodoroState: pausedPomodoroState(),
    })
    const { page } = ctx
    await gotoDashboard(page)

    await expect(quickActions(page)).toBeHidden()
    await expect(primaryNav(page)).toBeVisible()
    const expanded = await page.locator('aside').first().boundingBox()
    expect(expanded?.width ?? 0).toBeGreaterThan(100)

    await page.getByRole('button', { name: 'Hide sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible()
    await expect
      .poll(async () => (await page.locator('aside').first().boundingBox())?.width ?? 0)
      .toBeLessThanOrEqual(80)
    await expect(quickActions(page)).toBeHidden()
    await expectNoHorizontalOverflow(page)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('keyboard: shortcuts are focusable with a visible ring and activate with Enter', async ({ browser }) => {
    const ctx = await openApp(browser, {
      width: 390,
      cardsDue: 5,
      pomodoroState: pausedPomodoroState(),
    })
    const { page } = ctx
    await gotoDashboard(page)

    const startFocus = quickActions(page).getByRole('link', { name: 'Start Focus' })
    await startFocus.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    const ring = await startFocus.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { style: cs.outlineStyle, width: cs.outlineWidth }
    })
    expect(ring.style, 'focused shortcut must have a visible focus ring').not.toBe('none')

    await startFocus.press('Enter')
    await expect(page).toHaveURL(/\/focus$/)

    await page.goto(APP_ORIGIN + '/dashboard')
    await expect(page.locator('main')).toBeVisible()
    const reviewAnki = quickActions(page).getByRole('link', { name: 'Review Anki' })
    await expect(reviewAnki).toBeVisible()
    await reviewAnki.press('Enter')
    await expect(page).toHaveURL(/\/anki$/)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})
