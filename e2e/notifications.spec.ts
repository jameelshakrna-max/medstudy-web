import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('notification bell is visible', async ({ page }) => {
    await page.goto('/dashboard')
    const bell = page.locator('[class*="notification"], [class*="Notification"], button[aria-label*="notification" i]')
    await expect(bell.first()).toBeVisible({ timeout: 10_000 })
  })
})
