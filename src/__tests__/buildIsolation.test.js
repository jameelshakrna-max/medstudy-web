import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

// Asserts that the REAL built artifacts (dist/) never mix environments:
// staging proxies/bundles must not reference the production API/Supabase and
// vice versa. Runs only when a build has been produced (npm run build).
const DIST = resolve(process.cwd(), 'dist')
const PROD_API = 'https://medstudy-api.medstudy.workers.dev'
const STAGING_API = 'https://medstudy-api-staging.medstudy.workers.dev'
const PROD_SUPABASE = 'undakhccjrbcpzryfmot.supabase.co'
const STAGING_SUPABASE = 'bzppijzqqfclwtvmiqzb.supabase.co'

function collectJsAssets() {
  const assetsDir = join(DIST, 'assets')
  if (!existsSync(assetsDir)) return []
  return readdirSync(assetsDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(assetsDir, f))
}

describe('build environment isolation (dist artifacts)', () => {
  const hasDist = existsSync(join(DIST, '_worker.js'))
  beforeAll(() => {
    if (!hasDist) return
  })

  it.runIf(hasDist)('dist/_worker.js has a concrete origin injected and no unreplaced token', () => {
    const src = readFileSync(join(DIST, '_worker.js'), 'utf8')
    expect(src).not.toContain('__MEDSTUDY_API_ORIGIN__')
    expect(src).toMatch(/https:\/\/medstudy-api(?:-staging)?\.medstudy\.workers\.dev/)
  })

  it.runIf(hasDist)('dist/_worker.js references exactly one environment — never both', () => {
    const src = readFileSync(join(DIST, '_worker.js'), 'utf8')
    const hasProd = src.includes(PROD_API)
    const hasStaging = src.includes(STAGING_API)
    expect(hasProd).not.toBe(hasStaging)
  })

  it.runIf(hasDist)('no JS asset mixes production and staging Supabase/API references', () => {
    for (const file of collectJsAssets()) {
      const src = readFileSync(file, 'utf8')
      const prodRef = src.includes(PROD_SUPABASE) || src.includes(PROD_API)
      const stagingRef = src.includes(STAGING_SUPABASE) || src.includes(STAGING_API)
      expect(prodRef && stagingRef, `env mixing in ${file}`).toBe(false)
    }
  })
})
