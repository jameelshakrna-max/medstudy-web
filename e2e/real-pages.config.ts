import { defineConfig, devices } from '@playwright/test'

const url = (process.env.STAGING_PREVIEW_URL || '').replace(/\/+$/, '')

if (!url) {
  throw new Error('STAGING_PREVIEW_URL must be set to a medstudy-web.pages.dev preview URL')
}
const host = new URL(url).hostname
if (!host.endsWith('.medstudy-web.pages.dev')) {
  throw new Error(`Refusing to run against non-staging host: ${host}`)
}

export default defineConfig({
  testDir: '.',
  testMatch: /(finding-g-real-pages|workflow-staging)\.spec\.ts$/,
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: url,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
