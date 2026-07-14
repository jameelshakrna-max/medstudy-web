import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Communities', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('shows communities page', async ({ page }) => {
    await page.goto('/communities')
    await expect(page.locator('h1')).toContainText(/communit/i)
  })

  test('can navigate to a community', async ({ page }) => {
    await page.goto('/communities')
    const card = page.locator('[class*="card"], [class*="Card"]').first()
    if (await card.isVisible()) {
      await card.click()
      await expect(page).toHaveURL(/\/communities\//)
    }
  })
})
