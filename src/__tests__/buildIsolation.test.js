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

  it.runIf(hasDist)('Supabase URL is resolved as a concrete string (not undefined)', () => {
    for (const file of collectJsAssets()) {
      const src = readFileSync(file, 'utf8')
      if (src.includes('createClient')) {
        expect(src).not.toMatch(/createClient\s*\(\s*undefined/)
        expect(src).not.toMatch(/createClient\s*\(\s*"undefined"/)
      }
    }
  })

  it.runIf(hasDist)('Supabase anon key is resolved as a concrete string (not undefined)', () => {
    for (const file of collectJsAssets()) {
      const src = readFileSync(file, 'utf8')
      if (src.includes('createClient')) {
        const match = src.match(/createClient\s*\(\s*"[^"]*"\s*,\s*("[^"]*"|undefined)/)
        if (match) {
          expect(match[1]).not.toBe('undefined')
          expect(match[1]).not.toBe('""')
        }
      }
    }
  })

  it.runIf(hasDist)('staging artifact has staging Supabase URL in JS bundles', () => {
    const jsFiles = collectJsAssets()
    const hasStaging = jsFiles.some((f) => readFileSync(f, 'utf8').includes(STAGING_SUPABASE))
    expect(hasStaging, 'staging Supabase URL missing from JS bundles').toBe(true)
  })

  it.runIf(hasDist)('staging artifact has staging API origin in _worker.js', () => {
    const src = readFileSync(join(DIST, '_worker.js'), 'utf8')
    expect(src).toContain(STAGING_API)
    expect(src).not.toContain(PROD_API)
  })

  it.runIf(hasDist)('staging artifact has no production Supabase URL in JS bundles', () => {
    for (const file of collectJsAssets()) {
      const src = readFileSync(file, 'utf8')
      expect(src).not.toContain(PROD_SUPABASE)
    }
  })

  it.runIf(hasDist)('index.html has no hardcoded production Supabase preconnect', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8')
    expect(html).not.toContain(PROD_SUPABASE)
  })

  it.runIf(hasDist)('index.html has no undefined configuration values', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8')
    expect(html).not.toContain('undefined')
  })
})
