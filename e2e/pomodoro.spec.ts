import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Pomodoro', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('shows pomodoro page', async ({ page }) => {
    await page.goto('/pomodoro')
    await expect(page.locator('h1, h2')).toBeVisible()
  })
})
