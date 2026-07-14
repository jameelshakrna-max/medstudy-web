import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1, h2')).toBeVisible()
  })
})
