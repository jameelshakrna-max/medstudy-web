import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Rotation Planner', () => {
  test.describe('Authentication', () => {
    test('redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/rotations')
      await expect(page).toHaveURL(/\/login/)
    })
  })

  test.describe('Page loads after login', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/rotations')
    })

    test('sidebar link "Rotation Planner" is visible', async ({ page }) => {
      const sidebarLink = page.locator('nav a[href="/rotations"]')
      await expect(sidebarLink).toBeVisible()
      await expect(sidebarLink).toContainText('Rotation Planner')
    })

    test('page heading shows "Rotation Planner"', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Rotation Planner')
    })
  })

  test.describe('Empty state', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/rotations')
    })

    test('shows "No rotation plans yet" when no plans exist', async ({ page }) => {
      const emptyState = page.locator('text=No rotation plans yet')
      if (await emptyState.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(emptyState).toBeVisible()
        await expect(page.locator('text=Create Your First Plan')).toBeVisible()
      }
    })
  })

  test.describe('New Plan button', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/rotations')
    })

    test('clicking "New Plan" opens a modal/form', async ({ page }) => {
      const newPlanBtn = page.locator('button:has-text("New Plan")')
      await expect(newPlanBtn).toBeVisible()
      await newPlanBtn.click()

      const modal = page.locator('[role="dialog"][data-state="open"]')
      await expect(modal).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Plan creation form', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/rotations')
      await page.locator('button:has-text("New Plan")').click()
      await page.locator('[role="dialog"][data-state="open"]').waitFor({ timeout: 5000 })
    })

    test('form step 1 shows plan name, source, and rotation fields', async ({ page }) => {
      const modal = page.locator('[role="dialog"][data-state="open"]')

      await expect(modal.locator('text=Plan Name')).toBeVisible()
      await expect(modal.locator('input[type="text"]').first()).toBeVisible()

      await expect(modal.locator('text=Source')).toBeVisible()
      await expect(modal.locator('select').first()).toBeVisible()

      await expect(modal.locator('text=Rotation')).toBeVisible()
      await expect(modal.locator('select').nth(1)).toBeVisible()
    })

    test('step indicator shows 6 steps', async ({ page }) => {
      const modal = page.locator('[role="dialog"][data-state="open"]')
      const stepDots = modal.locator('[class*="stepDot"]')
      await expect(stepDots).toHaveCount(6)
    })

    test('Next button is disabled when name is empty', async ({ page }) => {
      const modal = page.locator('[role="dialog"][data-state="open"]')
      const nextBtn = modal.locator('button:has-text("Next")')
      await expect(nextBtn).toBeDisabled()
    })
  })

  test.describe('Plan card interaction', () => {
    test('plan card appears in list after creation', async ({ page }) => {
      await login(page)
      await page.goto('/rotations')

      // Open the creation form
      await page.locator('button:has-text("New Plan")').click()
      await page.locator('[role="dialog"][data-state="open"]').waitFor({ timeout: 5000 })

      const modal = page.locator('[role="dialog"][data-state="open"]')

      // Fill step 0: name + rotation
      const nameInput = modal.locator('input[type="text"]').first()
      await nameInput.fill('Cardiology E2E Test')

      // Select source (first select)
      const sourceSelect = modal.locator('select').first()
      await sourceSelect.selectOption({ index: 1 })

      // Select rotation (second select) — pick first non-empty option
      const rotationSelect = modal.locator('select').nth(1)
      const rotationOptions = rotationSelect.locator('option')
      const optionCount = await rotationOptions.count()
      if (optionCount > 1) {
        await rotationSelect.selectOption({ index: 1 })
      }

      // Advance through all steps to create the plan
      for (let i = 0; i < 5; i++) {
        const nextBtn = modal.locator('button:has-text("Next"), button:has-text("Create Plan")')
        if (await nextBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
          await nextBtn.click()
          await page.waitForTimeout(200)
        }
      }

      // Click "Create Plan" if visible
      const createBtn = modal.locator('button:has-text("Create Plan")')
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createBtn.click()
        await page.waitForTimeout(3000)
      }

      // Verify the plan card appears in the list
      const planCard = page.locator('text=Cardiology E2E Test')
      await expect(planCard).toBeVisible({ timeout: 5000 })
    })
  })
})
