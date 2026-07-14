import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('shows settings page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h1, h2')).toBeVisible()
  })

  test('can navigate to own profile', async ({ page }) => {
    await page.goto('/dashboard')
    await page.click('[class*="avatar"], [class*="Avatar"], a[href*="/profile"]')
    await expect(page).toHaveURL(/\/profile\//)
  })
})
