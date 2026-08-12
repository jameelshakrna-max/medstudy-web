import { test, expect, type Page, type Browser } from '@playwright/test'
import {
  buildStorageState,
  stubApi,
  expectNoHorizontalOverflow,
  APP_ORIGIN,
  type AnkiSeed,
} from './validation-session'

// Phase 3 Anki "due-first" validation in a real authenticated browser.
// All identities/sessions are synthetic (see validation-session.ts). The API
// stub returns a fixed deck/card seed (new / learning / relearning / review +
// future), so header counts, Review Now, deck tiles and the New Deck modal can
// be asserted deterministically. Fixtures are page-scoped (fresh
// BrowserContext per test), so nothing leaks between tests or workers.

const PAST = '2020-01-01T00:00:00.000Z'
const FUTURE = '2030-01-01T00:00:00.000Z'

function card(id: string, deckId: string, state: number, lastReview: string | null, nextReview: string | null) {
  return {
    id,
    user_id: 'a1b2c3d4-0000-4000-8000-000000000001',
    deck_id: deckId,
    front: `<p>${id} Q</p>`,
    back: `<p>${id} A</p>`,
    image_url: null,
    high_yield: false,
    difficulty: 0,
    stability: 0,
    state,
    interval: 0,
    repetitions: 0,
    last_review: lastReview,
    next_review: nextReview,
    created_at: '2024-01-01T00:00:00.000Z',
  }
}

// Cardiology: c1 Learning due, c2 Relearning due, c3 New (unreviewed → due),
// c4 Review "Later" (future). Pathology: only a future Review card (never due).
function seed(noDue = false): AnkiSeed {
  const cardiologyCards = noDue
    ? [card('c4', 'cardio', 2, '2026-01-01T00:00:00.000Z', FUTURE)]
    : [
        card('c1', 'cardio', 1, PAST, PAST),
        card('c2', 'cardio', 3, PAST, PAST),
        card('c3', 'cardio', 0, null, null),
        card('c4', 'cardio', 2, '2026-01-01T00:00:00.000Z', FUTURE),
      ]
  return {
    decks: [
      { id: 'cardio', name: 'Cardiology', card_count: cardiologyCards.length },
      { id: 'path', name: 'Pathology', card_count: 1 },
    ],
    cards: [
      ...cardiologyCards,
      card('p1', 'path', 2, '2026-01-01T00:00:00.000Z', FUTURE),
    ],
  }
}

interface AppOpts {
  width: number
  height?: number
  theme?: 'dark' | 'light'
  noDue?: boolean
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
  await stubApi(page, { ankiSeed: seed(opts.noDue ?? false) })
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  return { context, page, errors }
}

async function gotoAnki(page: Page): Promise<void> {
  await page.goto(APP_ORIGIN + '/anki')
  await expect(page.getByRole('heading', { name: 'Anki' })).toBeVisible({ timeout: 15_000 })
}

async function expectNoPageErrors(ctx: AppCtx): Promise<void> {
  await ctx.page.waitForTimeout(250)
  expect(ctx.errors, `uncaught page errors: ${ctx.errors.join(' | ')}`).toEqual([])
}

test.describe('Anki Phase 3 due-first', () => {
  test('header shows truthful due/new/learning pills and a Review Now button with the due count', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    const { page } = ctx
    await gotoAnki(page)

    await expect(page.locator('[class*="pills"]').getByText('3 due')).toBeVisible()
    await expect(page.locator('[class*="pills"]').getByText('1 new')).toBeVisible()
    await expect(page.locator('[class*="pills"]').getByText('2 learning')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review Now (3)' })).toBeVisible()

    const cardio = page.locator('[class*="deckCard"]').filter({ hasText: 'Cardiology' })
    await expect(cardio.locator('[class*="deckCounts"]')).toContainText('3 due')
    await expect(cardio.locator('[class*="deckCounts"]')).toContainText('1 new')
    await expect(cardio.locator('[class*="deckCounts"]')).toContainText('2 learning')
    const path = page.locator('[class*="deckCard"]').filter({ hasText: 'Pathology' })
    await expect(path.locator('[class*="deckCounts"]')).toContainText('0 due')

    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('Review Now starts the inline FSRS session and persists a rating', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    const { page } = ctx
    await gotoAnki(page)

    await page.getByRole('button', { name: 'Review Now (3)' }).click()
    await expect(page.getByRole('button', { name: 'Show Answer', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Show Answer', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Good/ }).first()).toBeVisible()

    const persisted = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.startsWith('/api/flashcards/'),
      { timeout: 15_000 }
    )
    await page.getByRole('button', { name: /^Good/ }).first().click()
    const res = await persisted
    expect([200, 201], `review persist status ${res.status()}`).toContain(res.status())

    await expect(page.getByRole('button', { name: 'Show Answer', exact: true })).toBeVisible()
    await page.locator('button:has-text("x")').first().click()
    await expect(page.getByRole('heading', { name: 'Anki' })).toBeVisible()

    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('New Deck modal: create posts /api/decks, closes, and toasts success', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 1280 })
    const { page } = ctx
    await gotoAnki(page)

    await page.getByRole('button', { name: '+ Deck' }).click()
    const input = page.getByPlaceholder('New deck name...')
    await expect(input).toBeVisible()
    await input.fill('E2E Deck')

    const post = page.waitForRequest(
      (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/decks',
      { timeout: 15_000 }
    )
    await page.getByRole('button', { name: 'Create Deck', exact: true }).click()
    const req = await post
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ deck_name: 'E2E Deck' })

    await expect(page.getByPlaceholder('New deck name...')).toBeHidden()
    await expect(page.getByText('Deck created.', { exact: true })).toBeVisible()

    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('mobile: header actions hidden, shortcuts show Review Now + Create; Create opens the modal', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390 })
    const { page } = ctx
    await gotoAnki(page)

    await expect(page.getByRole('button', { name: 'Review Now (3)' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Deck' })).toHaveCount(0)

    const shortcuts = page.locator('[aria-label="Quick actions"]')
    await expect(shortcuts).toBeVisible()
    await expect(shortcuts.getByRole('button', { name: 'Review Now' })).toBeVisible()
    await expect(shortcuts.getByRole('button', { name: 'Create' })).toBeVisible()

    await shortcuts.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByPlaceholder('New deck name...')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder('New deck name...')).toBeHidden()

    await expectNoHorizontalOverflow(page)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('no reviewable cards: Review Now hidden on desktop and in mobile shortcuts', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 390, noDue: true })
    const { page } = ctx
    await gotoAnki(page)

    await expect(page.getByRole('button', { name: /Review Now/ })).toHaveCount(0)
    const shortcuts = page.locator('[aria-label="Quick actions"]')
    await expect(shortcuts.getByRole('button', { name: 'Create' })).toBeVisible()
    await expect(shortcuts.getByRole('button', { name: 'Review Now' })).toHaveCount(0)
    await expect(page.locator('[class*="pills"]').getByText('0 due')).toBeVisible()

    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })

  test('320px light theme: shortcuts fit and no horizontal overflow', async ({ browser }) => {
    const ctx = await openApp(browser, { width: 320, theme: 'light' })
    const { page } = ctx
    await gotoAnki(page)

    const shortcuts = page.locator('[aria-label="Quick actions"]')
    await expect(shortcuts.getByRole('button', { name: 'Review Now' })).toBeVisible()
    await expect(shortcuts.getByRole('button', { name: 'Create' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectNoPageErrors(ctx)
    await ctx.context.close()
  })
})
