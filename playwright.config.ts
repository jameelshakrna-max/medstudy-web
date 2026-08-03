import { defineConfig, devices } from '@playwright/test'

// Default: deterministic local suite only. The opt-in staging-integration project is
// defined only when RUN_STAGING_E2E=1 and requires STAGING_PREVIEW_URL to be a
// medstudy-web.pages.dev preview URL (never production).
const runStaging = process.env.RUN_STAGING_E2E === '1'

const projects = [
  {
    name: 'chromium',
    testMatch: /^(?!.*-staging\.spec\.ts$).*\.spec\.ts$/,
    use: { ...devices['Desktop Chrome'] },
  },
]

if (runStaging) {
  const url = (process.env.STAGING_PREVIEW_URL || '').replace(/\/+$/, '')
  if (!url) {
    throw new Error('RUN_STAGING_E2E=1 requires STAGING_PREVIEW_URL (a medstudy-web.pages.dev preview URL)')
  }
  const host = new URL(url).hostname
  if (!host.endsWith('.medstudy-web.pages.dev')) {
    throw new Error(`Refusing to run staging-integration against non-staging host: ${host}`)
  }
  projects.push({
    name: 'staging-integration',
    testMatch: /-staging\.spec\.ts$/,
    use: {
      ...devices['Desktop Chrome'],
      baseURL: url,
      screenshot: 'only-on-failure',
      trace: 'on-first-retry',
    },
  })
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: runStaging ? 0 : 1,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects,
  webServer: runStaging
    ? undefined
    : {
        command: 'npm run dev',
        port: 3000,
        reuseExistingServer: true,
        timeout: 30_000,
      },
})
