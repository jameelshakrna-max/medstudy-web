import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaSource = readFileSync(
  resolve(__dirname, '../rotationPlannerSchema.js'),
  'utf8'
)

describe('rotationPlannerSchema.js is Worker-safe', () => {
  it('does not import node:fs', () => {
    expect(schemaSource).not.toMatch(/from\s+['"]node:fs['"]/)
  })

  it('does not import node:path', () => {
    expect(schemaSource).not.toMatch(/from\s+['"]node:path['"]/)
  })

  it('does not import node:url', () => {
    expect(schemaSource).not.toMatch(/from\s+['"]node:url['"]/)
  })

  it('does not reference fileURLToPath', () => {
    expect(schemaSource).not.toMatch(/fileURLToPath/)
  })

  it('does not reference readFileSync', () => {
    expect(schemaSource).not.toMatch(/readFileSync/)
  })

  it('exports PLANNER_TABLES', async () => {
    const mod = await import('../rotationPlannerSchema.js')
    expect(mod.PLANNER_TABLES).toBeDefined()
    expect(mod.PLANNER_TABLES.plans).toBe('rotation_planner_plans')
  })

  it('exports all required constants', async () => {
    const mod = await import('../rotationPlannerSchema.js')
    expect(mod.PLAN_STATUSES).toBeDefined()
    expect(mod.STUDY_STYLES).toBeDefined()
    expect(mod.TASK_TYPES).toBeDefined()
    expect(mod.TASK_STATUSES).toBeDefined()
    expect(mod.ALL_PLANNER_COLUMNS).toBeDefined()
  })
})
