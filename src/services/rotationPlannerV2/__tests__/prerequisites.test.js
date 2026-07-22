import { describe, it, expect } from 'vitest'
import { applyPrerequisites } from '../prerequisites.js'

function makeTopic(id, prerequisiteTopicIds = []) {
  return {
    canonicalTopicId: id,
    sourceTopicId: id,
    title: id,
    prerequisiteTopicIds,
  }
}

describe('applyPrerequisites — no prerequisites', () => {
  it('preserves order for topics with no dependencies', () => {
    const topics = [makeTopic('a'), makeTopic('b'), makeTopic('c')]
    const { sorted, errors } = applyPrerequisites(topics)
    const ids = sorted.map((t) => t.canonicalTopicId)
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(errors).toHaveLength(0)
  })
})

describe('applyPrerequisites — simple chain', () => {
  it('A→B→C resolves to C after B after A', () => {
    const topics = [
      makeTopic('c', ['b']),
      makeTopic('a'),
      makeTopic('b', ['a']),
    ]
    const { sorted, errors } = applyPrerequisites(topics)
    const ids = sorted.map((t) => t.canonicalTopicId)
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'))
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'))
    expect(errors).toHaveLength(0)
  })
})

describe('applyPrerequisites — missing prerequisite', () => {
  it('returns error containing "Missing prerequisite"', () => {
    const topics = [makeTopic('a', ['nonexistent'])]
    const { sorted, errors } = applyPrerequisites(topics)
    expect(errors.some((e) => e.includes('Missing prerequisite'))).toBe(true)
    expect(sorted).toHaveLength(1)
  })
})

describe('applyPrerequisites — cycle detection', () => {
  it('returns error containing "Cycle"', () => {
    const topics = [makeTopic('a', ['b']), makeTopic('b', ['a'])]
    const { sorted, errors } = applyPrerequisites(topics)
    expect(errors.some((e) => e.includes('Cycle'))).toBe(true)
    expect(sorted.length).toBeGreaterThanOrEqual(2)
  })
})

describe('applyPrerequisites — independent topics', () => {
  it('preserves source order for unrelated topics', () => {
    const topics = [makeTopic('x'), makeTopic('y'), makeTopic('z')]
    const { sorted } = applyPrerequisites(topics)
    const ids = sorted.map((t) => t.canonicalTopicId)
    expect(ids).toEqual(['x', 'y', 'z'])
  })
})

describe('applyPrerequisites — completed prerequisite ordering', () => {
  it('completed prerequisite still appears before dependent (ordering is structural)', () => {
    const topics = [
      makeTopic('b', ['a']),
      makeTopic('a'),
    ]
    const { sorted, errors } = applyPrerequisites(topics)
    const ids = sorted.map((t) => t.canonicalTopicId)
    expect(ids).toEqual(['a', 'b'])
    expect(errors).toHaveLength(0)
  })
})
