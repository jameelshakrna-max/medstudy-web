import { test, expect, type Page, type Browser } from '@playwright/test'
import {
  buildStorageState,
  stubApi,
  seedPomodoroState,
  expectNoHorizontalOverflow,
} from './validation-session'

// Focus experience E2E — non-credential-gated.
//
// Auth is a synthetic Supabase session (see validation-session.ts); every
// Worker/PostgREST call is stubbed. No login(), no TEST_EMAIL/TEST_PASSWORD.
// Fixtures are page-scoped (fresh BrowserContext per test) so seeded pomodoro
// state can never leak between tests or parallel workers.
//
// Note on "seeded running" sessions: PomodoroContext hydrates a `running:true`
// payload as an ACTIVE-but-paused session (the app deliberately does not
// auto-resume — "let user decide"). Tests that need the timer genuinely
// running therefore click the Resume control first, then assert Pause is
// available. This is a faithful test of real behavior.

interface AppOpts {
  width: number
  height?: number
  theme?: 'dark' | 'light'
  fullscreen?: 'resolving' | 'rejecting' | null
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
  if (opts.fullscreen) await installFullscreenMock(page, opts.fullscreen)
  await stubApi(page)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  return { context, page, errors }
}

async function installFullscreenMock(page: Page, mode: 'resolving' | 'rejecting'): Promise<void> {
  await page.addInitScript((reject) => {
    // Install on prototypes: addInitScript runs before the HTML element is
    // parsed (document.documentElement is null), so a direct assignment on the
    // element instance would throw and leave only the fullscreenElement getter
    // in place — which shadows the real API, makes the app's own
    // fullscreenchange handler see !fullscreenElement, and flips focusMode off.
    const state = { fs: false }
    const install = () => {
      try {
        Object.defineProperty(Document.prototype, 'fullscreenElement', {
          configurable: true,
          get: () => (state.fs ? document.documentElement : null),
        })
        ;(HTMLElement.prototype as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = async () => {
          if (reject) throw new Error('fullscreen rejected by mock')
          state.fs = true
        }
        ;(Document.prototype as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = async () => {
          state.fs = false
        }
      } catch (e) {
        ;(window as any).__fullscreenMockError = String(e)
      }
    }
    install()
    if (!document.documentElement) {
      const retry = () => { install(); document.removeEventListener('DOMContentLoaded', retry) }
      document.addEventListener('DOMContentLoaded', retry)
    }
  }, mode === 'rejecting')
}

/** Seeds pomodoro state (init script, before app load) then navigates. */
async function seed(page: Page, state: Record<string, unknown> | null, path = '/focus'): Promise<void> {
  await seedPomodoroState(page, state)
  await page.goto(path)
  await expect(page.locator('main')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)
}

async function expectNoPageErrors(ctx: AppCtx): Promise<void> {
  await ctx.page.waitForTimeout(250)
  expect(ctx.errors, `uncaught page errors: ${ctx.errors.join(' | ')}`).toEqual([])
}

/** A valid paused session the PomodoroContext will hydrate (fresh savedAt). */
function pausedPomodoroState(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'study',
    running: false,
    seconds: 720,
    totalSec: 1500,
    focusMins: 25,
    shortMins: 5,
    longMins: 15,
    savedAt: Date.now(),
    ...overrides,
  }
}

/** Like pausedPomodoroState but flagged running; hydrates as an active (paused-until-resumed) session. */
function runningState(overrides: Record<string, unknown> = {}) {
  return pausedPomodoroState({ running: true, seconds: 840, ...overrides })
}

const primaryNav = (page: Page) => page.locator('nav[aria-label="Primary"]')
const bottomNav = (page: Page) => page.locator('nav[aria-label="Bottom navigation"]')
const pauseBtn = (page: Page) => page.locator('[aria-label="Pause timer"]')
const resumeBtn = (page: Page) => page.locator('[aria-label="Resume timer"]')

/** The countdown shown by an active session (~14:00 for the running seed; wide enough to tolerate 1-2s of hydration elapsed). */
const runningCountdown = /^1[34]:\d{2}$/

/** Starts the recovered-paused timer by clicking the visible Resume control (forest strip / desktop in-page). */
async function resume(page: Page): Promise<void> {
  await resumeBtn(page).filter({ visible: true }).click()
}

/**
 * Starts a hydrated-paused timer on the active Timer pane. On mobile the only
 * visible Resume lives in the FocusControlBar, which is portaled to
 * document.body so it paints above BottomNav and is genuinely clickable.
 */
async function startTimer(page: Page): Promise<void> {
  await resumeBtn(page).filter({ visible: true }).click()
}

async function readStoredRunning(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('pomodoro_state')
    if (!raw) return null
    return JSON.parse(raw).running ?? null
  })
}

/** PomodoroContext saves to localStorage on a ~1s debounce; poll until it flushes. */
async function assertStoredRunning(page: Page, expected: boolean, message?: string): Promise<void> {
  await expect.poll(() => readStoredRunning(page), {
    timeout: 6000,
    message: message ?? `expected pomodoro_state.running to become ${expected}`,
  }).toBe(expected)
}

async function blurActive(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement
    if (el instanceof HTMLElement) el.blur()
  })
}

test.describe('Focus', () => {
  test('deep links: /focus defaults to Timer, ?view=forest shows My Forest, ?view=bogus falls back to Timer', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440 })
    const { page } = ctx
    await seed(page, null, '/focus')

    await expect(page.getByRole('tablist', { name: 'Focus views' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Plant' })).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()

    const forest = await openApp(browser, { width: 1440 })
    await seed(forest.page, null, '/focus?view=forest')
    await expect(forest.page.getByRole('tab', { name: 'Forest' })).toHaveAttribute('aria-selected', 'true')
    await expect(forest.page.getByRole('heading', { name: 'My Forest' })).toBeVisible()
    await expectNoPageErrors(forest)
    await forest.context.close()

    const bogus = await openApp(browser, { width: 1440 })
    await seed(bogus.page, null, '/focus?view=bogus')
    await expect(bogus.page.getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true')
    await expect(bogus.page.getByRole('button', { name: 'Plant' })).toBeVisible()
    await expectNoPageErrors(bogus)
    await bogus.context.close()
  })

  test('query-param preservation: switching view keeps unrelated params', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440 })
    const { page } = ctx
    await seed(page, null, '/focus?view=timer&plan=abc')

    await page.getByRole('tab', { name: 'Forest' }).click()
    await expect(page).toHaveURL(/view=forest/)
    await expect(page).toHaveURL(/plan=abc/)
    await expect(page.getByRole('tab', { name: 'Forest' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('seeded paused session survives tab switching with identical countdown', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440 })
    const { page } = ctx
    const paused = pausedPomodoroState()
    await seed(page, paused, '/focus')

    await expect(page.getByText('12:00', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Forest' }).click()
    await expect(page).toHaveURL(/view=forest/)
    const forestPanel = page.getByRole('tabpanel')
    await expect(forestPanel.getByText('12:00', { exact: true })).toBeVisible()
    await expect(forestPanel.getByRole('button', { name: 'Resume timer' })).toBeVisible()

    await forestPanel.getByRole('button', { name: 'Return to Timer' }).click()
    await expect(page).toHaveURL(/\/focus\?view=timer$/)
    await expect(page.getByText('12:00', { exact: true })).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('seeded running session: resumed session offers Pause and the forest strip mirrors it (no FloatingTimer on /focus)', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await seed(page, runningState(), '/focus')

    await expect(page.getByText(runningCountdown)).toBeVisible()
    await expect(resumeBtn(page).filter({ visible: true })).toBeVisible()
    await startTimer(page)
    await expect(pauseBtn(page).filter({ visible: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Forest' }).click()
    await expect(page).toHaveURL(/view=forest/)
    const forestPanel = page.getByRole('tabpanel')
    await expect(forestPanel.getByRole('button', { name: 'Pause timer' })).toBeVisible()
    await expect(forestPanel.getByText(runningCountdown)).toBeVisible()

    await expect(page.locator('[class*="floating"]').filter({ visible: true })).toHaveCount(0)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('hidden timer shortcuts do not fire on the Forest pane; Space works only on the active Timer pane', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440 })
    const { page } = ctx
    await seed(page, runningState(), '/focus?view=forest')

    const forestPanel = page.getByRole('tabpanel')
    await expect(forestPanel.getByRole('button', { name: 'Resume timer' })).toBeVisible()
    await resume(page)
    await assertStoredRunning(page, true)

    await blurActive(page)
    await page.keyboard.press(' ')
    await page.keyboard.press('f')
    await page.waitForTimeout(1600)
    await assertStoredRunning(page, true, 'hidden pane shortcuts must not pause the timer')

    await page.getByRole('tab', { name: 'Timer' }).click()
    await expect(page.getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText(runningCountdown)).toBeVisible()
    await page.waitForTimeout(50)

    await blurActive(page)
    await page.keyboard.press(' ')
    await page.waitForTimeout(1600)
    await assertStoredRunning(page, false, 'Space on the active Timer pane must pause the timer')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('focus mode hides the shell with fullscreen success and restores on exit', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440, fullscreen: 'resolving' })
    const { page } = ctx
    await seed(page, pausedPomodoroState(), '/focus')

    await expect(primaryNav(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide sidebar' })).toBeVisible()
    await expect(bottomNav(page)).toHaveCount(1)

    await page.getByRole('button', { name: 'Focus', exact: true }).click()
    await expect(primaryNav(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Hide sidebar' })).toHaveCount(0)
    await expect(bottomNav(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Exit focus mode' })).toBeVisible()

    await page.getByRole('button', { name: 'Exit focus mode' }).click()
    await expect(primaryNav(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide sidebar' })).toBeVisible()
    await expect(bottomNav(page)).toHaveCount(1)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('fullscreen rejection fallback keeps focus mode active with a truthful note', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440, fullscreen: 'rejecting' })
    const { page } = ctx
    await seed(page, pausedPomodoroState(), '/focus')

    await page.getByRole('button', { name: 'Focus', exact: true }).click()
    await expect(primaryNav(page)).toHaveCount(0)
    await expect(page.getByRole('status')).toBeVisible()
    await expect(page.getByRole('status')).toContainText(/still active/i)
    await expect(page.getByRole('button', { name: 'Exit focus mode' })).toBeVisible()

    await page.getByRole('button', { name: 'Exit focus mode' }).click()
    await expect(primaryNav(page)).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('no duplicated Pause controls: one visible control per viewport', async ({ browser }) => {
    const mobile = await openApp(browser, { width: 390, height: 844 })
    await seed(mobile.page, runningState(), '/focus')
    await startTimer(mobile.page)
    await expect(pauseBtn(mobile.page).filter({ visible: true })).toHaveCount(1)
    await expect(pauseBtn(mobile.page)).toHaveCount(2)
    await expect(mobile.page.getByRole('button', { name: 'Enter focus mode' })).toBeVisible()
    await expectNoPageErrors(mobile)
    await mobile.context.close()

    const desktop = await openApp(browser, { width: 1440, height: 900 })
    await seed(desktop.page, runningState(), '/focus')
    await resume(desktop.page)
    await expect(pauseBtn(desktop.page).filter({ visible: true })).toHaveCount(1)
    await expect(pauseBtn(desktop.page)).toHaveCount(1)
    await expect(desktop.page.getByRole('button', { name: 'Enter focus mode' })).toHaveCount(0)
    await expectNoPageErrors(desktop)
    await desktop.context.close()
  })

  test('compatibility routes: /pomodoro standalone and /forest with session strip', async ({ browser }) => {
    const pomo = await openApp(browser, { width: 1440 })
    await seed(pomo.page, null, '/pomodoro')
    await expect(pomo.page.getByRole('tablist')).toHaveCount(0)
    await expect(pomo.page.getByRole('button', { name: 'Plant' })).toBeVisible()
    await expectNoPageErrors(pomo)
    await pomo.context.close()

    const forest = await openApp(browser, { width: 1440 })
    await seed(forest.page, runningState(), '/forest')
    await expect(forest.page.getByRole('heading', { name: 'My Forest' })).toBeVisible()
    await expect(forest.page.getByRole('button', { name: 'Resume timer' })).toBeVisible()
    await resume(forest.page)
    await expect(forest.page.getByRole('button', { name: 'Pause timer' })).toBeVisible()
    await forest.page.getByRole('button', { name: 'Return to Timer' }).click()
    await expect(forest.page).toHaveURL(/\/focus\?view=timer$/)
    await expect(forest.page.getByText(runningCountdown)).toBeVisible()
    await expectNoPageErrors(forest)
    await forest.context.close()
  })

  for (const { width, height, theme } of [
    { width: 320, height: 568, theme: 'dark' as const },
    { width: 320, height: 568, theme: 'light' as const },
    { width: 1440, height: 900, theme: 'dark' as const },
    { width: 1440, height: 900, theme: 'light' as const },
  ]) {
    test(`${width}x${height} / ${theme}: focus routes have no horizontal overflow${width <= 390 ? ' and FocusControlBar is visible on 320px' : ''}`, async ({ browser }) => {
      const ctx = await openApp(browser, { width, height, theme })
      const { page } = ctx
      await seed(page, runningState(), '/focus')
      await expect(page.getByText(runningCountdown)).toBeVisible()
      await startTimer(page)
      if (width <= 390) {
        await expect(page.getByRole('button', { name: 'Enter focus mode' })).toBeVisible()
        await expect(pauseBtn(page).filter({ visible: true })).toBeVisible()
      }
      await expectNoHorizontalOverflow(page)

      await page.goto('/focus?view=forest')
      await expect(page.getByRole('heading', { name: 'My Forest' })).toBeVisible()
      await expectNoHorizontalOverflow(page)

      await page.goto('/pomodoro')
      await expect(page.locator('main')).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await expectNoPageErrors(ctx)
      await ctx.context.close()
    })
  }
})
