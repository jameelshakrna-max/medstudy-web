import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { STAGING, login, collectConsoleErrors, moduleErrors } from './staging-helpers'

const { ORIGIN } = STAGING

// The repo ships no @types/node/tsconfig; this keeps the spec self-contained.
declare const process: { env: Record<string, string | undefined> }

test.describe.configure({ mode: 'serial' })

// Created by Test 1, consumed by Tests 2-4.
let planId: string | undefined

// The V2 planner API lives on the staging Cloudflare Worker. loadStagingEnv() (run
// during STAGING init above) populates process.env.STAGING_API_BASE_URL if present.
const API_BASE = (process.env.STAGING_API_BASE_URL || 'https://medstudy-api-staging.medstudy.workers.dev').replace(/\/+$/, '')

// In-page fetch helper — reads the Supabase session from localStorage (never logged).
async function api(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return page.evaluate(
    async ({ base, method, path, body }) => {
      const k = Object.keys(localStorage).find(
        (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
      )
      const session = k ? JSON.parse(localStorage.getItem(k) ?? 'null') : null
      if (!session?.access_token) throw new Error('no session')
      const res = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      return { status: res.status, body: json }
    },
    { base: API_BASE, method, path, body }
  )
}

// The page's Supabase session is written before the /dashboard route settles, but a
// tiny retry guards the first call after a fresh login.
async function apiWithRetry(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await api(page, method, path, body)
    } catch (err) {
      lastErr = err
      await page.waitForTimeout(750)
    }
  }
  throw lastErr
}

// Local-timezone date helpers (avoids the UTC shift of toISOString()).
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
}

// Click the wizard's footer "Next" and assert we land on the expected next step.
async function advance(page: Page, nextStepName: string): Promise<void> {
  await expect(page.getByText(/^Step \d+ of 12: [A-Z]/)).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText(new RegExp(`^Step \\d+ of 12: ${nextStepName}$`))).toBeVisible()
}

test('Rotation planner: wizard preview→create returns previewToken + feasible (Defect 1 regression) and enters UWorld 20', async ({ page }) => {
  const errors: string[] = []
  const detach = collectConsoleErrors(page, errors)

  await login(page)

  // Intercept the preview POST before triggering it (step 9 → 10).
  const previewRespP = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/api/rotation-planner/plans/preview'),
    { timeout: 30_000 }
  )

  await page.goto(`${ORIGIN}/rotations`)
  await expect(page.getByRole('heading', { name: 'Rotation Planner' })).toBeVisible()
  await page.getByRole('button', { name: 'New Plan' }).click()
  await expect(page.getByText('Create Rotation Plan', { exact: true })).toBeVisible()

  // Step 0 — Rotation (Radix selects: trigger role=combobox, options in a portal).
  await expect(page.getByRole('combobox').nth(0)).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('combobox').nth(0).click()
  await page.getByRole('option', { name: /Step-Up to Medicine/ }).click()
  // The rotation select stays disabled until the source query resolves.
  await expect(page.getByRole('combobox').nth(1)).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: /Cardiology/ }).click()
  await advance(page, 'Dates')

  // Step 1 — Dates: start tomorrow, end 16 days later (local timezone).
  const today = new Date()
  const startDate = localDateKey(addDays(today, 1))
  const endDate = localDateKey(addDays(today, 17))
  await page.locator('input[type="date"]').nth(0).fill(startDate)
  await page.locator('input[type="date"]').nth(1).fill(endDate)
  await advance(page, 'Availability')

  // Steps 2-5 — defaults are valid; just advance.
  await advance(page, 'Source')
  await advance(page, 'Study Style')
  await advance(page, 'Topics')
  await advance(page, 'UWorld')

  // Step 6 — UWorld: set exactly the stable-angina topic to 20 Q (do NOT use batch
  // Apply). CSS-module class names are hashed in the production build, so we anchor
  // on the deterministic subtitle text (normalizedTopicId) and walk up to the row.
  const uworldSubtitle = page.getByText('step-up-medicine-6e-2024::cardiology.stable-angina-pectoris', { exact: true })
  await expect(uworldSubtitle).toBeVisible({ timeout: 30_000 })
  const uworldRow = uworldSubtitle.locator('..').locator('..')
  await uworldRow.locator('input[type="number"]').fill('20')
  await expect(uworldRow).toContainText('20 Q')

  // Steps 7-9 — defaults valid.
  await advance(page, 'Questions')
  await advance(page, 'Scheduling')
  await advance(page, 'Flashcards')

  // Step 9 → Next triggers the preview POST and lands on step 10 (Preview).
  await page.getByRole('button', { name: 'Next' }).click()
  const previewRes = await previewRespP
  expect([200, 201], `preview status ${previewRes.status()}`).toContain(previewRes.status())
  const preview = await previewRes.json()
  // Defect 1: preview must return top-level previewToken/feasibility/unscheduledWork.
  expect(typeof preview.previewToken).toBe('string')
  expect(preview.previewToken.length).toBeGreaterThan(0)
  expect(preview.feasibility).toBeTruthy()
  expect(typeof preview.feasibility.feasible).toBe('boolean')
  expect(preview.plan.scheduleFingerprint).toBe(preview.previewToken)
  expect(Array.isArray(preview.tasks)).toBe(true)

  await expect(page.getByText(/^Step \d+ of 12: Preview$/)).toBeVisible()
  await expect(page.getByText('Plan is feasible', { exact: true })).toBeVisible()

  // Intercept create (step 11) before clicking through.
  const createRespP = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/api/rotation-planner/plans') && !r.url().includes('/preview'),
    { timeout: 30_000 }
  )

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText(/^Step \d+ of 12: Confirm$/)).toBeVisible()

  // THE Defect 1 regression: Create was permanently disabled before the backend fix.
  const createBtn = page.getByRole('button', { name: 'Create Plan' })
  await expect(createBtn).toBeEnabled()
  await createBtn.click()

  const createRes = await createRespP
  expect([200, 201], `create status ${createRes.status()}`).toContain(createRes.status())
  const createBody = await createRes.json()
  expect(createBody.plan?.id).toBeTruthy()
  planId = createBody.plan.id

  const createReqBody = createRes.request().postDataJSON() ?? {}
  expect(createReqBody.previewToken).toBe(preview.previewToken)
  expect(createReqBody.acceptOverload).toBe(false)

  // Planner list refetches after create: the new v2 card (sourceTitle = the source
  // slug, e.g. "step-up-medicine-6e-2024") is visible.
  const card = page.getByLabel(/^step-up-medicine-6e-2024 plan, /).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.locator('span', { hasText: /^v2$/ })).toBeVisible()

  detach()
  expect(moduleErrors(errors), `module errors: ${errors.join(' | ')}`).toEqual([])
})

test('Rotation planner: persisted plan partitions UWorld 20 (Defect 2 propagation)', async ({ page }) => {
  test.skip(!planId, 'no plan was created by the wizard test')

  const errors: string[] = []
  const detach = collectConsoleErrors(page, errors)

  await login(page)

  const detail = await apiWithRetry(page, 'GET', `/api/rotation-planner/plans/${planId}`)
  expect(detail.status).toBe(200)
  const body = detail.body

  const topic = body.topics.find((t: any) => String(t.normalizedTopicId).endsWith('cardiology.stable-angina-pectoris'))
  expect(topic).toBeTruthy()
  expect(topic.totalUworldQuestions).toBe(20)

  // Defect 2 propagation is already visible at creation: the uworld task EXISTS with
  // the exact 20 entered (partitioned), but is LOCKED behind the learning task until
  // learning completes and the plan is recalculated.
  const topicTasks = body.tasks.filter((t: any) => t.planTopicId === topic.id)
  expect(topicTasks.filter((t: any) => t.taskType === 'learning')).toHaveLength(1)
  const uworld = topicTasks.filter((t: any) => t.taskType === 'uworld_questions')
  expect(uworld).toHaveLength(1)
  expect(uworld[0].targetCount).toBe(20)
  expect(uworld[0].unlockCondition).toMatch(/^learning_completed:/)
  expect(uworld[0].unlockCondition).toContain('cardiology.stable-angina-pectoris')

  detach()
  expect(moduleErrors(errors), `module errors: ${errors.join(' | ')}`).toEqual([])
})

test('Rotation planner: complete learning → recalculate → UWorld unlock (Defect 2 recalc)', async ({ page }) => {
  test.skip(!planId, 'no plan was created by the wizard test')

  const errors: string[] = []
  const detach = collectConsoleErrors(page, errors)

  await login(page)

  const before = await apiWithRetry(page, 'GET', `/api/rotation-planner/plans/${planId}`)
  expect(before.status).toBe(200)
  const topic = before.body.topics.find((t: any) => String(t.normalizedTopicId).endsWith('cardiology.stable-angina-pectoris'))
  expect(topic).toBeTruthy()
  const learningTask = before.body.tasks.find((t: any) => t.planTopicId === topic.id && t.taskType === 'learning')
  expect(learningTask).toBeTruthy()
  expect(typeof before.body.plan.revision).toBe('number')

  // SPA-shaped task PATCH (see usePlannerTaskMutations.js): action + payload + expectedRevision.
  const patchRes = await apiWithRetry(page, 'PATCH', `/api/rotation-planner/plans/${planId}/tasks/${learningTask.id}`, {
    action: 'complete',
    payload: { actualMinutes: 30 },
    expectedRevision: before.body.plan.revision,
    clientRequestId: `e2e-complete-${Date.now()}`,
    timezone: 'UTC',
  })
  expect([200, 201], `patch status ${patchRes.status}`).toContain(patchRes.status)
  expect(patchRes.body.recalculationRequired).toBe(true)

  const recalcRes = await apiWithRetry(page, 'POST', `/api/rotation-planner/plans/${planId}/recalculate`, {
    recalculationDate: before.body.plan.startDate,
    expectedRevision: patchRes.body.revision,
    clientRequestId: `e2e-recalc-${Date.now()}`,
  })
  expect([200, 201], `recalc status ${recalcRes.status}`).toContain(recalcRes.status)

  // Recalc result exposes the derived topic state: learning now marked complete for
  // the stable-angina topic (planned timestamps are pre-filled at creation, so this
  // confirms the recalc recomputed the state from the actual completed learning task).
  const recalcState = recalcRes.body.topicStates?.find((s: any) => String(s.id).endsWith('cardiology.stable-angina-pectoris'))
  expect(recalcState).toBeTruthy()
  expect(recalcState.learningComplete).toBe(true)

  const after = await apiWithRetry(page, 'GET', `/api/rotation-planner/plans/${planId}`)
  expect(after.status).toBe(200)
  const topicAfter = after.body.topics.find((t: any) => String(t.normalizedTopicId).endsWith('cardiology.stable-angina-pectoris'))
  expect(topicAfter).toBeTruthy()
  // The regenerated schedule still partitions the exact 20 entered (Defect 2 survival
  // through the learning→recalc unlock cycle).

  const uworldTasks = after.body.tasks.filter((t: any) => t.planTopicId === topicAfter.id && t.taskType === 'uworld_questions')
  expect(uworldTasks.length).toBeGreaterThan(0)
  const targetTotal = uworldTasks.reduce((sum: number, t: any) => sum + (t.targetCount || 0), 0)
  expect(targetTotal).toBe(20)
  for (const t of uworldTasks) {
    expect(t.targetCount).toBeGreaterThan(0)
  }

  detach()
  expect(moduleErrors(errors), `module errors: ${errors.join(' | ')}`).toEqual([])
})

test('Rotation planner: cleanup deletes the created plan', async ({ page }) => {
  test.skip(!planId, 'no plan was created by the wizard test')

  const errors: string[] = []
  const detach = collectConsoleErrors(page, errors)

  await login(page)

  const del = await apiWithRetry(page, 'DELETE', `/api/rotation-planner/plans/${planId}`)
  expect([200, 201], `delete status ${del.status}`).toContain(del.status)

  const list = await apiWithRetry(page, 'GET', '/api/rotation-planner/plans')
  expect(list.status).toBe(200)
  expect(Array.isArray(list.body)).toBe(true)
  expect(list.body.some((p: any) => p.id === planId)).toBe(false)

  // UI smoke check: the planner page still renders after cleanup. The plan card is
  // labelled by source title (not id) and other same-source plans may exist on the
  // shared staging account, so we do NOT assert a card-count here.
  await page.goto(`${ORIGIN}/rotations`)
  await expect(page.getByRole('heading', { name: 'Rotation Planner' })).toBeVisible()

  detach()
  expect(moduleErrors(errors), `module errors: ${errors.join(' | ')}`).toEqual([])
})
