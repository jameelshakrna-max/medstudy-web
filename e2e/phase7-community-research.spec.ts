import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import {
  buildStorageState, stubApi, expectNoHorizontalOverflow,
  VALIDATION_USER, RESEARCH_POSTS, RESEARCH_BOOKMARKS,
  COMMUNITY_MINE, COMMUNITY_PUBLIC,
  type StubOptions,
} from './validation-session'

interface AppCtx {
  context: BrowserContext
  page: Page
  errors: string[]
}

async function openApp(
  browser: import('@playwright/test').Browser,
  opts: StubOptions & { viewport?: { width: number; height: number }; theme?: 'dark' | 'light' } = {},
): Promise<AppCtx> {
  const { viewport = { width: 1280, height: 800 }, theme = 'dark', ...stubOpts } = opts
  const context = await browser.newContext({
    storageState: buildStorageState(theme),
    viewport,
    colorScheme: theme,
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    try { document.querySelector('.tsqd-parent-container')?.remove() } catch {}
  })
  await stubApi(page, stubOpts)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return { context, page, errors }
}

async function expectNoPageErrors(ctx: AppCtx): Promise<void> {
  await ctx.page.waitForTimeout(250)
  expect(ctx.errors, `uncaught page errors: ${ctx.errors.join(' | ')}`).toEqual([])
}

// ─── Community Hub (§5) ───

test.describe('Community Hub tabs (§5)', () => {
  test.afterEach(async ({ page }) => { await page.context().close() })

  test('Overview tab active on /communities', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities')
    await expect(ctx.page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    await expect(ctx.page.locator('h1')).toContainText(/communit/i)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('My Communities tab active on /communities/mine', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/mine')
    await expect(ctx.page.getByRole('tab', { name: 'My Communities' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Discover tab active on /communities/discover', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/discover')
    await expect(ctx.page.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('People tab active on /communities/people', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/people')
    await expect(ctx.page.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Leaderboard tab active on /communities/leaderboard', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/leaderboard')
    await expect(ctx.page.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('standalone /people renders', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/people')
    await expect(ctx.page.locator('h1')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('standalone /leaderboard renders', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/leaderboard')
    await expect(ctx.page.locator('h1')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Back/Forward between Community tabs', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities')
    await ctx.page.getByRole('tab', { name: 'My Communities' }).click()
    await expect(ctx.page).toHaveURL(/\/communities\/mine/)
    await ctx.page.getByRole('tab', { name: 'Discover' }).click()
    await expect(ctx.page).toHaveURL(/\/communities\/discover/)
    await ctx.page.goBack()
    await expect(ctx.page.getByRole('tab', { name: 'My Communities' })).toHaveAttribute('aria-selected', 'true')
    await ctx.page.goForward()
    await expect(ctx.page.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('deep-link refresh retains selected section', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/people')
    await expect(ctx.page.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true')
    await ctx.page.reload()
    await expect(ctx.page.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('320px: CommunityHub no page-level overflow', async ({ browser }) => {
    const ctx = await openApp(browser, { viewport: { width: 320, height: 568 } })
    await ctx.page.goto('/communities')
    await ctx.page.waitForTimeout(500)
    await expectNoHorizontalOverflow(ctx.page)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('390px: CommunityHub no page-level overflow', async ({ browser }) => {
    const ctx = await openApp(browser, { viewport: { width: 390, height: 844 } })
    await ctx.page.goto('/communities')
    await ctx.page.waitForTimeout(500)
    await expectNoHorizontalOverflow(ctx.page)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

// ─── CommunityDetail Deep-Link (§6) ───

test.describe('CommunityDetail deep-link (§6)', () => {
  test.afterEach(async ({ page }) => { await page.context().close() })

  test('valid tab deep-link renders selected tab', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/c-test-1?tab=leaderboard')
    await expect(ctx.page.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('invalid tab canonicalizes to default', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/c-test-1?tab=bogus')
    await expect(ctx.page.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    await expect(ctx.page).toHaveURL(/\/communities\/c-test-1$/)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('default tab clean URL', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/c-test-1')
    await expect(ctx.page.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Back/Forward between detail tabs', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/c-test-1')
    await ctx.page.getByRole('tab', { name: 'Voice' }).click()
    await expect(ctx.page).toHaveURL(/tab=voice/)
    await ctx.page.goBack()
    await expect(ctx.page.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    await ctx.page.goForward()
    await expect(ctx.page.getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('unrelated query param preserved', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/c-test-1?invite=K&tab=voice')
    await expect(ctx.page.getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'true')
    await expect(ctx.page.url()).toContain('invite=K')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('tablist has accessible label', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/c-test-1')
    await expect(ctx.page.getByRole('tablist', { name: 'Community sections' })).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('keyboard Arrow navigation between tabs', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities/c-test-1')
    const chatTab = ctx.page.getByRole('tab', { name: 'Chat' })
    await chatTab.focus()
    await chatTab.press('ArrowRight')
    await expect(ctx.page.getByRole('tab', { name: 'Leaderboard' })).toBeFocused()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

// ─── Invite Flow (§7) ───

test.describe('Invite flow (§7)', () => {
  test.afterEach(async ({ page }) => { await page.context().close() })

  test('invite URL parses without crash', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities?invite=TESTCODE')
    await ctx.page.waitForTimeout(500)
    await expect(ctx.errors).toEqual([])
    await expect(ctx.page.locator('h1')).toBeVisible()
    await ctx.context.close()
  })

  test('invite removes query param after handling', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities?invite=TESTCODE')
    await ctx.page.waitForTimeout(1000)
    expect(ctx.page.url()).not.toContain('invite=')
    await ctx.context.close()
  })

  test('join-by-code POST is issued', async ({ browser }) => {
    const ctx = await openApp(browser)
    const requests: string[] = []
    ctx.page.on('request', (req) => {
      if (req.url().includes('/communities/join-by-code')) requests.push(req.url())
    })
    await ctx.page.goto('/communities?invite=TESTCODE')
    await ctx.page.waitForTimeout(1500)
    expect(requests.length).toBeGreaterThanOrEqual(1)
    await ctx.context.close()
  })
})

// ─── Research Tabs (§8) ───

test.describe('Research tabs (§8)', () => {
  test.afterEach(async ({ page }) => { await page.context().close() })

  test('Discover tab active on /research', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/research')
    await expect(ctx.page.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    await expect(ctx.page.locator('h1')).toContainText(/research/i)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('My Posts tab active on /research?tab=mine', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/research?tab=mine')
    await expect(ctx.page.getByRole('tab', { name: 'My Posts' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Saved tab active on /research?tab=saved', async ({ browser }) => {
    const ctx = await openApp(browser, { researchBookmarks: RESEARCH_BOOKMARKS })
    await ctx.page.goto('/research?tab=saved')
    await expect(ctx.page.getByRole('tab', { name: 'Saved' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('invalid tab canonicalizes to Discover', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/research?tab=bogus')
    await expect(ctx.page.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    await expect(ctx.page).toHaveURL(/\/research$/)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Back/Forward between research tabs', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/research')
    await ctx.page.getByRole('tab', { name: 'My Posts' }).click()
    await expect(ctx.page).toHaveURL(/tab=mine/)
    await ctx.page.getByRole('tab', { name: 'Saved' }).click()
    await expect(ctx.page).toHaveURL(/tab=saved/)
    await ctx.page.goBack()
    await expect(ctx.page.getByRole('tab', { name: 'My Posts' })).toHaveAttribute('aria-selected', 'true')
    await ctx.page.goForward()
    await expect(ctx.page.getByRole('tab', { name: 'Saved' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('deep-link refresh retains tab', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/research?tab=saved')
    await expect(ctx.page.getByRole('tab', { name: 'Saved' })).toHaveAttribute('aria-selected', 'true')
    await ctx.page.reload()
    await expect(ctx.page.getByRole('tab', { name: 'Saved' })).toHaveAttribute('aria-selected', 'true')
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('tablist has accessible label', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/research')
    await expect(ctx.page.getByRole('tablist', { name: 'Research sections' })).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('search input has accessible name', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/research')
    await expect(ctx.page.getByRole('textbox', { name: 'Search research posts' })).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

// ─── Research Behavior (§9) ───

test.describe('Research behavior (§9)', () => {
  test.afterEach(async ({ page }) => { await page.context().close() })

  test('Discover: posts render from stub', async ({ browser }) => {
    const ctx = await openApp(browser, { researchPosts: RESEARCH_POSTS })
    await ctx.page.goto('/research')
    await expect(ctx.page.getByText('Cardiology Study')).toBeVisible()
    await expect(ctx.page.getByText('Neurology Research')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Discover: search filters posts', async ({ browser }) => {
    const ctx = await openApp(browser, { researchPosts: RESEARCH_POSTS })
    await ctx.page.goto('/research')
    const search = ctx.page.getByRole('textbox', { name: 'Search research posts' })
    await search.fill('Cardiology')
    await ctx.page.waitForTimeout(500)
    await expect(ctx.page.getByText('Cardiology Study')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('My Posts: user_id sent server-side', async ({ browser }) => {
    const ctx = await openApp(browser, { researchPosts: RESEARCH_POSTS })
    await ctx.page.goto('/research?tab=mine')
    const response = await ctx.page.waitForResponse((r) => r.url().includes('/api/research') && r.url().includes('user_id='))
    expect(response.url()).toContain(`user_id=${VALIDATION_USER.id}`)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('My Posts: empty state shows Share Research CTA', async ({ browser }) => {
    const ctx = await openApp(browser, { researchPosts: [] })
    await ctx.page.goto('/research?tab=mine')
    await expect(ctx.page.getByText(/haven't shared any research yet/i)).toBeVisible()
    await expect(ctx.page.getByRole('button', { name: /share research/i }).first()).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Saved: bookmarks endpoint called', async ({ browser }) => {
    const ctx = await openApp(browser, { researchBookmarks: RESEARCH_BOOKMARKS })
    const requests: string[] = []
    ctx.page.on('request', (req) => {
      if (req.url().includes('/research/bookmarks')) requests.push(req.url())
    })
    await ctx.page.goto('/research?tab=saved')
    await ctx.page.waitForTimeout(1000)
    expect(requests.length).toBeGreaterThanOrEqual(1)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Saved: saved post renders', async ({ browser }) => {
    const ctx = await openApp(browser, { researchBookmarks: RESEARCH_BOOKMARKS })
    await ctx.page.goto('/research?tab=saved')
    await expect(ctx.page.getByText('Saved Study')).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Saved: empty state distinct', async ({ browser }) => {
    const ctx = await openApp(browser, { researchBookmarks: [] })
    await ctx.page.goto('/research?tab=saved')
    await expect(ctx.page.getByText(/haven't saved any research posts yet/i)).toBeVisible()
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

// ─── Error/Retry (§11) ───

test.describe('Error and retry (§11)', () => {
  test.afterEach(async ({ page }) => { await page.context().close() })

  test('community 500 shows QueryErrorState', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.route('**/api/communities*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal Server Error' }) }))
    await ctx.page.goto('/communities')
    await expect(ctx.page.getByText(/could not load/i)).toBeVisible()
    await ctx.context.close()
  })

  test('research 500 shows QueryErrorState', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.route('**/api/research?*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal Server Error' }) }))
    await ctx.page.goto('/research')
    await expect(ctx.page.getByText(/could not load/i)).toBeVisible()
    await ctx.context.close()
  })
})

// ─── Accessibility (§12) ───

test.describe('Accessibility (§12)', () => {
  test.afterEach(async ({ page }) => { await page.context().close() })

  test('Community tablist accessible', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/communities')
    const tablist = ctx.page.getByRole('tablist', { name: 'Community sections' })
    await expect(tablist).toBeVisible()
    const tabs = tablist.getByRole('tab')
    const count = await tabs.count()
    expect(count).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < count; i++) {
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected')
    }
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Research tablist accessible', async ({ browser }) => {
    const ctx = await openApp(browser)
    await ctx.page.goto('/research')
    const tablist = ctx.page.getByRole('tablist', { name: 'Research sections' })
    await expect(tablist).toBeVisible()
    const tabs = tablist.getByRole('tab')
    const count = await tabs.count()
    expect(count).toBe(3)
    for (let i = 0; i < count; i++) {
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected')
    }
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})

// ─── Mobile / Overflow (§13) ───

test.describe('Mobile overflow (§13)', () => {
  test.afterEach(async ({ page }) => { await page.context().close() })

  for (const width of [320, 390, 768]) {
    test(`${width}px: CommunityHub no overflow`, async ({ browser }) => {
      const ctx = await openApp(browser, { viewport: { width, height: 800 } })
      await ctx.page.goto('/communities')
      await ctx.page.waitForTimeout(500)
      await expectNoHorizontalOverflow(ctx.page)
      await ctx.context.close()
    })

    test(`${width}px: ResearchHub no overflow`, async ({ browser }) => {
      const ctx = await openApp(browser, { viewport: { width, height: 800 } })
      await ctx.page.goto('/research')
      await ctx.page.waitForTimeout(500)
      await expectNoHorizontalOverflow(ctx.page)
      await ctx.context.close()
    })
  }
})
