import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

export function previewOrigin(): string {
  const url = (process.env.STAGING_PREVIEW_URL || '').replace(/\/+$/, '')
  if (!url) throw new Error('STAGING_PREVIEW_URL must be set to a medstudy-web.pages.dev preview URL')
  const host = new URL(url).hostname
  if (!host.endsWith('.medstudy-web.pages.dev')) {
    throw new Error(`Refusing to run against non-staging host: ${host}`)
  }
  return new URL(url).origin
}

export function loadStagingEnv(): void {
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

export const STAGING = (() => {
  loadStagingEnv()
  const email = process.env.STAGING_TEST_USER_A_EMAIL || process.env.TEST_EMAIL || ''
  const password = process.env.STAGING_TEST_USER_A_PASSWORD || process.env.TEST_PASSWORD || ''
  const userAId = process.env.STAGING_TEST_USER_A_ID || ''
  const userBId = process.env.STAGING_TEST_USER_B_ID || ''
  if (!/^.+@medstudy-staging\.test$/.test(email)) {
    throw new Error('STAGING_TEST_USER_A_EMAIL must be a @medstudy-staging.test account')
  }
  if (!password) throw new Error('STAGING_TEST_USER_A_PASSWORD is missing')
  return {
    ORIGIN: previewOrigin(),
    A_EMAIL: email,
    A_PASSWORD: password,
    A_ID: userAId,
    B_ID: userBId,
  }
})()

export async function login(page: Page): Promise<void> {
  await page.goto(`${STAGING.ORIGIN}/login`)
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]')
  await page.fill('input[type="email"], input[placeholder*="email" i]', STAGING.A_EMAIL)
  await page.fill('input[type="password"], input[placeholder*="password" i]', STAGING.A_PASSWORD)
  await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Sign in")')
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

export async function logout(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: 'Sign Out' })
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
  await page.waitForURL((u) => u.pathname === '/', { timeout: 15_000 })
}

export function collectConsoleErrors(page: Page, errors: string[]) {
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

export function moduleErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !/PAGEERROR/.test(e) &&
      /Failed to fetch dynamically imported module|Unexpected token|Failed to load module script|MIME type/i.test(e)
  )
}
