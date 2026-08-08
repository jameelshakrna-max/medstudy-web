import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { API_ORIGINS, WORKER_TOKEN, resolveApiOrigin, renderWorkerSource } from '../../config/api-origins.mjs'

const TEMPLATE = readFileSync(resolve(process.cwd(), 'config/_worker.template.js'), 'utf8')
const PROD = 'medstudy-api.medstudy.workers.dev'
const STAGING = 'medstudy-api-staging.medstudy.workers.dev'

describe('Pages proxy API-origin isolation', () => {
  it('the proxy template carries no hard-coded API origin — only the build token', () => {
    expect(TEMPLATE).toContain(WORKER_TOKEN)
    expect(TEMPLATE).not.toMatch(/medstudy-api\.medstudy\.workers\.dev/)
    expect(TEMPLATE).not.toMatch(/medstudy-api-staging\.medstudy\.workers\.dev/)
  })

  it('the origin map contains exactly the two allowed environments', () => {
    expect(Object.values(API_ORIGINS).sort()).toEqual([`https://${PROD}`, `https://${STAGING}`].sort())
  })

  it('a staging proxy contains the staging origin and NOT the production origin', () => {
    const src = renderWorkerSource(resolveApiOrigin('staging'))
    expect(src).toContain(`https://${STAGING}`)
    expect(src).not.toContain(PROD)
    expect(src).not.toContain(WORKER_TOKEN)
  })

  it('a production proxy contains the production origin and NOT the staging origin', () => {
    const src = renderWorkerSource(resolveApiOrigin('production'))
    expect(src).toContain(`https://${PROD}`)
    expect(src).not.toContain(STAGING)
    expect(src).not.toContain(WORKER_TOKEN)
  })

  it('resolveApiOrigin is deterministic and never mixes environments', () => {
    expect(resolveApiOrigin('staging')).toBe(`https://${STAGING}`)
    expect(resolveApiOrigin('production')).toBe(`https://${PROD}`)
    expect(resolveApiOrigin('production')).not.toContain('staging')
    expect(resolveApiOrigin('staging')).not.toBe(resolveApiOrigin('production'))
  })

  it('an unreplaced token fails closed at runtime (503 guard present)', () => {
    const src = renderWorkerSource('__MEDSTUDY_API_ORIGIN__')
    expect(src).toContain('API origin not configured')
    expect(src).toContain('503')
  })
})
