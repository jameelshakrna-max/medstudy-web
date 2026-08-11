import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test'
import {
  buildStorageState,
  stubApi,
  VALIDATION_USER,
  expectNoHorizontalOverflow,
  mobileNavGeometry,
} from './validation-session'

// Phase 1 shell validation in a real authenticated browser.
//
// Auth is a synthetic Supabase session (see validation-session.ts) — no real
// credentials, no network calls against the Supabase backend. All Worker-API
// traffic is stubbed with neutral shapes.

const MOBILE_WIDTHS = [320, 360, 375, 390, 430, 768]
const DESKTOP_WIDTHS = [1024, 1440, 1920]
const THEMES = ['dark', 'light'] as const

const FOCUS_ROUTES = ['/focus', '/pomodoro', '/forest']
const PROGRESS_ROUTES = ['/progress', '/uworld', '/sessions']

interface AppCtx {
  context: BrowserContext
  page: Page
  errors: string[]
}

async function openApp(
  browser: Browser,
  opts: { width: number; height?: number; theme?: 'dark' | 'light' },
): Promise<AppCtx> {
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

async function gotoShell(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await expect(page.locator('main')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)
}

async function expectNoPageErrors(ctx: AppCtx): Promise<void> {
  await ctx.page.waitForTimeout(250)
  expect(ctx.errors, `uncaught page errors: ${ctx.errors.join(' | ')}`).toEqual([])
}

const primaryNav = (page: Page) => page.locator('nav[aria-label="Primary"]')
const bottomNav = (page: Page) => page.locator('nav[aria-label="Bottom navigation"]')
const sidebar = (page: Page) => page.locator('aside').first()

async function sidebarIsOffCanvas(page: Page): Promise<boolean> {
  const box = await sidebar(page).boundingBox()
  return box !== null && box.x + box.width <= 1
}

async function moreButtonActive(page: Page): Promise<boolean> {
  return bottomNav(page)
    .locator('button[aria-label="More menu"]')
    .evaluate((el) => Array.from(el.classList).some((c) => c.includes('active')))
}

test.describe('Phase 1 shell — desktop matrix', () => {
  for (const width of DESKTOP_WIDTHS) {
    for (const theme of THEMES) {
      test(`${width}px / ${theme} — sidebar shell, no horizontal overflow`, async ({ browser }) => {
        const ctx = await openApp(browser, { width, theme })
        const { page } = ctx
        await gotoShell(page, '/dashboard')

        await expect(primaryNav(page)).toBeVisible()
        await expect(primaryNav(page).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
        await expect(bottomNav(page)).toBeHidden()
        await expectNoHorizontalOverflow(page)
        await expectNoPageErrors(ctx)

        await ctx.context.close()
      })
    }
  }
})

test.describe('Phase 1 shell — mobile matrix', () => {
  for (const width of MOBILE_WIDTHS) {
    for (const theme of THEMES) {
      test(`${width}px / ${theme} — bottom nav shell, no horizontal overflow, drawer removed`, async ({ browser }) => {
        const ctx = await openApp(browser, { width, theme })
        const { page } = ctx
        await gotoShell(page, '/dashboard')

        await expect(bottomNav(page)).toBeVisible()
        await expect(bottomNav(page).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
        await expect(page.locator('button[aria-label="Toggle navigation menu"]')).toHaveCount(0)
        expect(await sidebarIsOffCanvas(page)).toBe(true)

        const geo = await mobileNavGeometry(page)
        expect(geo.navHeight).toBeGreaterThan(0)
        expect(geo.contentPadBottom, 'bottom nav must never cover page content').toBeGreaterThanOrEqual(geo.navHeight)

        await expectNoHorizontalOverflow(page)
        await expectNoPageErrors(ctx)

        await ctx.context.close()
      })
    }
  }
})

test.describe('Mobile global navigation', () => {
  test('compact nav is exactly Home | Plan | Focus | More with the sidebar drawer disabled', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    const nav = bottomNav(page)
    const tabs = nav.locator('a, button')
    await expect(tabs).toHaveCount(4)
    for (const label of ['Home', 'Plan', 'Focus', 'More']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible()
    }

    await expect(page.locator('button[aria-label="Toggle navigation menu"]')).toHaveCount(0)
    expect(await sidebarIsOffCanvas(page)).toBe(true)
    await expectNoHorizontalOverflow(page)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

test.describe('Active nav state — six routes', () => {
  for (const route of FOCUS_ROUTES) {
    test(`desktop: ${route} activates the Focus item`, async ({ browser }) => {
      const ctx = await openApp(browser, { width: 1440 })
      const { page } = ctx
      await gotoShell(page, route)

      await expect(primaryNav(page).getByRole('link', { name: 'Focus' })).toHaveAttribute('aria-current', 'page')
      await expect(primaryNav(page).locator('a[aria-current="page"]')).toHaveCount(1)
      await expectNoPageErrors(ctx)
      await ctx.context.close()
    })
  }

  for (const route of PROGRESS_ROUTES) {
    test(`desktop: ${route} activates the Progress item`, async ({ browser }) => {
      const ctx = await openApp(browser, { width: 1440 })
      const { page } = ctx
      await gotoShell(page, route)

      await expect(primaryNav(page).getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
      await expect(primaryNav(page).locator('a[aria-current="page"]')).toHaveCount(1)
      await expectNoPageErrors(ctx)
      await ctx.context.close()
    })
  }

  for (const route of FOCUS_ROUTES) {
    test(`mobile: ${route} activates the Focus tab, not More`, async ({ browser }) => {
      const ctx = await openApp(browser, { width: 390 })
      const { page } = ctx
      await gotoShell(page, route)

      await expect(bottomNav(page).getByRole('link', { name: 'Focus' })).toHaveAttribute('aria-current', 'page')
      expect(await moreButtonActive(page)).toBe(false)
      await expectNoPageErrors(ctx)
      await ctx.context.close()
    })
  }

  for (const route of PROGRESS_ROUTES) {
    test(`mobile: ${route} activates the More tab, not Focus`, async ({ browser }) => {
      const ctx = await openApp(browser, { width: 390 })
      const { page } = ctx
      await gotoShell(page, route)

      await expect(bottomNav(page).getByRole('link', { name: 'Focus' })).not.toHaveAttribute('aria-current', 'page')
      expect(await moreButtonActive(page)).toBe(true)
      await expectNoPageErrors(ctx)
      await ctx.context.close()
    })
  }
})

test.describe('Floating timer guard', () => {
  test('no floating timer element while the full timer page is displayed', async ({ browser }) => {
    for (const path of ['/focus', '/dashboard']) {
      const ctx = await openApp(browser, { width: 390 })
      const { page } = ctx
      await gotoShell(page, path)
      await expect(page.locator('[class*="floating"]').filter({ visible: true })).toHaveCount(0)
      await expectNoPageErrors(ctx)
      await ctx.context.close()
    }
  })
})

test.describe('Mobile More sheet behaviors', () => {
  test('opens with all destinations and profile entry', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    await page.locator('button[aria-label="More menu"]').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByText('More')).toBeVisible()
    for (const label of ['Curriculum', 'Anki', 'Resources', 'Progress', 'Goals', 'Community', 'Research', 'Settings']) {
      await expect(dialog.getByRole('link', { name: label })).toBeVisible()
    }
    await expect(dialog.getByText(VALIDATION_USER.username)).toBeVisible()
    await expect(dialog.getByText('Sign Out')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('scroll is locked while open and restored after close', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    await page.locator('button[aria-label="More menu"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('visible close button closes the sheet', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    await page.locator('button[aria-label="More menu"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close menu' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Escape closes and restores focus to the More button', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    const more = page.locator('button[aria-label="More menu"]')
    await more.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(more).toBeFocused()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('outside click closes the sheet', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    await page.locator('button[aria-label="More menu"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.mouse.click(10, 10)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('navigating from a destination closes the sheet; Escape then nav tab navigates', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    await page.locator('button[aria-label="More menu"]').click()
    await page.getByRole('dialog').getByRole('link', { name: 'Progress' }).click()
    await expect(page).toHaveURL(/\/progress$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.locator('button[aria-label="More menu"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await bottomNav(page).getByRole('link', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

test.describe('Create Community Modal regression (shared Modal / BaseDialog)', () => {
  test('opens, locks scroll, traps focus, closes via Escape / close button / outside click', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440 })
    const { page } = ctx
    await gotoShell(page, '/communities')

    const trigger = page.locator('button:has-text("Create")').first()
    await expect(trigger).toBeVisible()
    await trigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('heading', { name: 'Create Community' })).toBeVisible()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    const inDialog = await dialog.evaluate((el) => el.contains(document.activeElement))
    expect(inDialog, 'initial focus must be inside the dialog').toBe(true)
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
    const stillInDialog = await dialog.evaluate((el) => el.contains(document.activeElement))
    expect(stillInDialog, 'focus must stay trapped inside the dialog').toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')

    await trigger.click()
    await expect(dialog).toBeVisible()
    await dialog.locator('[class*="modalClose"]').click()
    await expect(dialog).toHaveCount(0)

    await trigger.click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(20, 20)
    await expect(dialog).toHaveCount(0)

    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

test.describe('Profile destination resolution', () => {
  test('desktop sidebar profile item navigates to /u/:username', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    await page.getByRole('complementary').getByRole('button', { name: new RegExp(VALIDATION_USER.displayName) }).click()
    await expect(page).toHaveURL(new RegExp(`/u/${VALIDATION_USER.username}$`))
    await expect(page.getByText(VALIDATION_USER.username)).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('mobile More sheet profile entry navigates to /u/:username', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    await page.locator('button[aria-label="More menu"]').click()
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(VALIDATION_USER.displayName) }).click()
    await expect(page).toHaveURL(new RegExp(`/u/${VALIDATION_USER.username}$`))
    await expect(page.getByText(VALIDATION_USER.username)).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

test.describe('Overlay invariants', () => {
  test('all z-index values use design tokens (no hardcoded values above 1)', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    const hardcoded = await page.evaluate(() => {
      const found: string[] = []
      for (const sheet of Array.from(document.styleSheets)) {
        const owner = sheet.ownerNode as HTMLElement | null
        const viteId = owner?.getAttribute?.('data-vite-dev-id') || ''
        // Scan only the app's own compiled CSS (src/**.module.css). Vendor
        // stylesheets (Radix, TanStack devtools' goober/Tally widget, etc.)
        // legitimately use their own z-index values.
        if (!/\/src\//.test(viteId.replace(/\\/g, '/'))) continue
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            const text = rule.cssText || ''
            const matches = text.match(/z-index\s*:\s*(\d+)/g) || []
            for (const m of matches) {
              const num = parseInt(m.match(/\d+/)?.[0] || '0', 10)
              if (num > 1) found.push(m)
            }
          }
        } catch {
          // cross-origin stylesheets are skipped
        }
      }
      return found
    })
    expect(hardcoded).toEqual([])
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('layer tokens are defined and ordered', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1440 })
    const { page } = ctx
    await gotoShell(page, '/dashboard')

    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement)
      const get = (n: string) => parseInt(s.getPropertyValue(n).trim(), 10)
      return {
        sticky: get('--z-sticky'),
        header: get('--z-header'),
        dropdown: get('--z-dropdown'),
        modal: get('--z-modal'),
        toast: get('--z-toast'),
        loading: get('--z-loading'),
      }
    })
    expect(tokens.sticky).toBeLessThan(tokens.header)
    expect(tokens.header).toBeLessThan(tokens.dropdown)
    expect(tokens.dropdown).toBeLessThan(tokens.modal)
    expect(tokens.modal).toBeLessThan(tokens.toast)
    expect(tokens.toast).toBeLessThan(tokens.loading)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})
