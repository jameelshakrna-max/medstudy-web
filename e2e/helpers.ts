import { type Page, expect } from '@playwright/test'

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@medstudy.app'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword123'

export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto('/login')
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', email)
  await page.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', password)
  await page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")')
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
}

export async function createCommunity(page: Page, name: string) {
  await page.goto('/communities')
  await page.click('button:has-text("Create"), button:has-text("New Community")')
  await page.fill('input[placeholder*="name" i], input[name="name"]', name)
  await page.fill('textarea[placeholder*="description" i], textarea[name="description"]', 'Test community for E2E')
  await page.click('button[type="submit"], button:has-text("Create")')
  await page.waitForURL(/\/communities\//, { timeout: 10_000 })
}
