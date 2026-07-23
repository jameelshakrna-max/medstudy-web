import { describe, it, expect } from 'vitest'

function buildPlanEntries(v1Plans, v2Plans) {
  return [
    ...v1Plans.map(p => ({ key: `v1:${p.id}`, version: 'v1', plan: p })),
    ...v2Plans.map(p => ({ key: `v2:${p.id}`, version: 'v2', plan: p })),
  ]
}

describe('RotationPlanner plan entries', () => {
  it('tags v1 plans with version v1', () => {
    const entries = buildPlanEntries([{ id: 'p1', name: 'Plan 1' }], [])
    expect(entries).toEqual([
      { key: 'v1:p1', version: 'v1', plan: { id: 'p1', name: 'Plan 1' } },
    ])
  })

  it('tags v2 plans with version v2', () => {
    const entries = buildPlanEntries([], [{ id: 'p2', sourceTitle: 'Plan 2' }])
    expect(entries).toEqual([
      { key: 'v2:p2', version: 'v2', plan: { id: 'p2', sourceTitle: 'Plan 2' } },
    ])
  })

  it('V1 plan with revision-like field still remains v1', () => {
    const v1Plan = { id: 'p3', name: 'Legacy Plan', revision: 7 }
    const entries = buildPlanEntries([v1Plan], [])
    expect(entries[0].version).toBe('v1')
    expect(entries[0].key).toBe('v1:p3')
    expect(entries[0].plan.revision).toBe(7)
  })

  it('mixes v1 and v2 plans correctly', () => {
    const entries = buildPlanEntries(
      [{ id: 'p1' }],
      [{ id: 'p2' }, { id: 'p3' }]
    )
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.version)).toEqual(['v1', 'v2', 'v2'])
  })

  it('uses composite key to avoid id collisions', () => {
    const entries = buildPlanEntries(
      [{ id: 'shared-id' }],
      [{ id: 'shared-id' }]
    )
    expect(entries[0].key).toBe('v1:shared-id')
    expect(entries[1].key).toBe('v2:shared-id')
    expect(entries[0].key).not.toBe(entries[1].key)
  })
})
