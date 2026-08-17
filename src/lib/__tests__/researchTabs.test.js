import { describe, it, expect } from 'vitest'
import { RESEARCH_TAB_VALUES, RESEARCH_DEFAULT_TAB, getResearchTab, setResearchTab, RESEARCH_TABS } from '../researchTabs'

describe('researchTabs', () => {
  it('exports exactly 3 tab values', () => { expect(RESEARCH_TAB_VALUES).toHaveLength(3) })
  it('default tab is discover', () => { expect(RESEARCH_DEFAULT_TAB).toBe('discover') })
  it('RESEARCH_TABS has matching ids', () => { expect(RESEARCH_TABS.map(t => t.id)).toEqual(RESEARCH_TAB_VALUES) })
  
  describe('getResearchTab', () => {
    it('returns discover for empty params', () => {
      expect(getResearchTab(new URLSearchParams(''))).toBe('discover')
    })
    it('returns mine for ?tab=mine', () => {
      expect(getResearchTab(new URLSearchParams('tab=mine'))).toBe('mine')
    })
    it('returns saved for ?tab=saved', () => {
      expect(getResearchTab(new URLSearchParams('tab=saved'))).toBe('saved')
    })
    it('returns discover for invalid tab', () => {
      expect(getResearchTab(new URLSearchParams('tab=bogus'))).toBe('discover')
    })
    it('is case-sensitive', () => {
      expect(getResearchTab(new URLSearchParams('tab=MINE'))).toBe('discover')
    })
    it('preserves other params', () => {
      const sp = new URLSearchParams('invite=K&tab=saved')
      expect(getResearchTab(sp)).toBe('saved')
    })
  })

  describe('setResearchTab', () => {
    it('deletes tab when setting to discover', () => {
      const sp = new URLSearchParams('tab=mine&q=hi')
      const next = setResearchTab(sp, 'discover')
      expect(next.toString()).toBe('q=hi')
    })
    it('sets tab param for non-default tabs', () => {
      const next = setResearchTab(new URLSearchParams(''), 'saved')
      expect(next.get('tab')).toBe('saved')
    })
    it('preserves unrelated params', () => {
      const sp = new URLSearchParams('invite=K&q=hello')
      const next = setResearchTab(sp, 'mine')
      expect(next.get('invite')).toBe('K')
      expect(next.get('q')).toBe('hello')
      expect(next.get('tab')).toBe('mine')
    })
    it('does not mutate input', () => {
      const sp = new URLSearchParams('tab=saved')
      setResearchTab(sp, 'discover')
      expect(sp.get('tab')).toBe('saved')
    })
    it('discover on clean URL stays clean', () => {
      const next = setResearchTab(new URLSearchParams(''), 'discover')
      expect(next.has('tab')).toBe(false)
    })
  })
})
