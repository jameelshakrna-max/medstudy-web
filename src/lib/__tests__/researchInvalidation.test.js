import { describe, it, expect } from 'vitest'
import { getResearchInvalidation, RESEARCH_DISCOVER_PREFIX, RESEARCH_MINE_PREFIX, RESEARCH_SAVED_PREFIX } from '../researchInvalidation'

describe('getResearchInvalidation', () => {
  it('create invalidates discover + mine', () => {
    const keys = getResearchInvalidation('create')
    expect(keys).toContainEqual(RESEARCH_DISCOVER_PREFIX)
    expect(keys).toContainEqual(RESEARCH_MINE_PREFIX)
    expect(keys).not.toContainEqual(RESEARCH_SAVED_PREFIX)
  })

  it('delete invalidates discover + mine + saved', () => {
    const keys = getResearchInvalidation('delete')
    expect(keys).toContainEqual(RESEARCH_DISCOVER_PREFIX)
    expect(keys).toContainEqual(RESEARCH_MINE_PREFIX)
    expect(keys).toContainEqual(RESEARCH_SAVED_PREFIX)
  })

  it('vote invalidates list + detail when postId provided', () => {
    const keys = getResearchInvalidation('vote', { postId: 'p1' })
    expect(keys).toContainEqual(['research', 'detail', 'p1'])
    expect(keys).toContainEqual(RESEARCH_DISCOVER_PREFIX)
    expect(keys).toContainEqual(RESEARCH_MINE_PREFIX)
  })

  it('vote invalidates only list when postId missing', () => {
    const keys = getResearchInvalidation('vote')
    expect(keys).toContainEqual(RESEARCH_DISCOVER_PREFIX)
    expect(keys).toContainEqual(RESEARCH_MINE_PREFIX)
    expect(keys.every(k => k[0] !== 'detail')).toBe(true)
  })

  it('bookmark invalidates saved + list', () => {
    const keys = getResearchInvalidation('bookmark')
    expect(keys).toContainEqual(RESEARCH_SAVED_PREFIX)
    expect(keys).toContainEqual(RESEARCH_DISCOVER_PREFIX)
  })

  it('unbookmark invalidates saved + list', () => {
    const keys = getResearchInvalidation('unbookmark')
    expect(keys).toContainEqual(RESEARCH_SAVED_PREFIX)
    expect(keys).toContainEqual(RESEARCH_DISCOVER_PREFIX)
  })

  it('comment invalidates detail + list', () => {
    const keys = getResearchInvalidation('comment', { postId: 'p2' })
    expect(keys).toContainEqual(['research', 'detail', 'p2'])
    expect(keys).toContainEqual(RESEARCH_DISCOVER_PREFIX)
  })

  it('help invalidates detail + list', () => {
    const keys = getResearchInvalidation('help', { postId: 'p3' })
    expect(keys).toContainEqual(['research', 'detail', 'p3'])
    expect(keys).toContainEqual(RESEARCH_DISCOVER_PREFIX)
  })

  it('returns empty array for unknown type', () => {
    expect(getResearchInvalidation('unknown')).toEqual([])
  })

  it('delete without postId still returns list + saved', () => {
    const keys = getResearchInvalidation('delete')
    expect(keys).toContainEqual(RESEARCH_SAVED_PREFIX)
  })

  it('no type returns empty array', () => {
    expect(getResearchInvalidation()).toEqual([])
  })

  it('all returned keys are arrays (not functions)', () => {
    for (const type of ['create', 'delete', 'vote', 'bookmark', 'unbookmark', 'comment', 'help']) {
      const keys = getResearchInvalidation(type, { postId: 'x' })
      for (const k of keys) {
        expect(Array.isArray(k)).toBe(true)
      }
    }
  })
})
