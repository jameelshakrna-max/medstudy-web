import { test, expect } from '@playwright/test'

const WIDTHS = [320, 360, 375, 390, 430]

for (const width of WIDTHS) {
  test(`landing has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const errors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(String(err)))
    const response = await page.goto('/', { waitUntil: 'networkidle' })
    expect(response?.status()).toBeLessThan(400)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow, `horizontal overflow of ${overflow}px at ${width}px`).toBeLessThanOrEqual(0)
    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([])
  })
}

test('public auth routes render without JS errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.goto('/signup', { waitUntil: 'networkidle' })
  expect(errors).toEqual([])
})
