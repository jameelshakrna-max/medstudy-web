import { describe, it, expect } from 'vitest'
import {
  COMMUNITY_DETAIL_TAB_VALUES,
  COMMUNITY_DETAIL_MOD_TAB,
  COMMUNITY_DETAIL_DEFAULT_TAB,
  getCommunityDetailTab,
  setCommunityDetailTab,
} from '../communityDetailTabs.js'

function p(query) {
  return new URLSearchParams(query)
}

describe('COMMUNITY_DETAIL_TAB_VALUES constants', () => {
  it('has exactly the expected tab ids in order', () => {
    expect(COMMUNITY_DETAIL_TAB_VALUES).toEqual([
      'chat',
      'leaderboard',
      'competitions',
      'voice',
      'stats',
      'hall-of-fame',
      'settings',
    ])
  })

  it('defines chat as the default tab', () => {
    expect(COMMUNITY_DETAIL_DEFAULT_TAB).toBe('chat')
  })

  it('defines the mod dashboard tab', () => {
    expect(COMMUNITY_DETAIL_MOD_TAB).toEqual({ id: 'mod', label: 'Mod Dashboard' })
  })

  it('mod is not part of the base tab values (role-gated)', () => {
    expect(COMMUNITY_DETAIL_TAB_VALUES).not.toContain('mod')
  })
})

describe('getCommunityDetailTab', () => {
  it('resolves to the default when no tab is requested', () => {
    expect(getCommunityDetailTab({ requestedTab: null, allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
  })

  it('resolves to the default when the tab param is empty', () => {
    expect(getCommunityDetailTab({ requestedTab: '', allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
  })

  it('resolves to the default when requestedTab is undefined', () => {
    expect(getCommunityDetailTab({ allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
  })

  it.each(COMMUNITY_DETAIL_TAB_VALUES)('resolves a requested valid tab %s to itself', tab => {
    expect(getCommunityDetailTab({ requestedTab: tab, allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe(tab)
  })

  it('resolves an explicit chat request to chat', () => {
    expect(getCommunityDetailTab({ requestedTab: 'chat', allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
  })

  it('falls back to the default for an invalid tab', () => {
    expect(getCommunityDetailTab({ requestedTab: 'bogus', allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
    expect(getCommunityDetailTab({ requestedTab: '123', allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
  })

  it('tab matching is case-sensitive', () => {
    expect(getCommunityDetailTab({ requestedTab: 'VOICE', allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
    expect(getCommunityDetailTab({ requestedTab: 'Settings', allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
  })

  it('resolves a gated tab only when it is allowed', () => {
    const allowedWithMod = [...COMMUNITY_DETAIL_TAB_VALUES, 'mod']
    expect(getCommunityDetailTab({ requestedTab: 'mod', allowedTabs: allowedWithMod })).toBe('mod')
    expect(getCommunityDetailTab({ requestedTab: 'mod', allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).toBe('chat')
  })

  it('falls back for an unauthorized/unknown tab instead of rendering it', () => {
    expect(getCommunityDetailTab({ requestedTab: 'mod', allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })).not.toBe('mod')
  })

  it('uses a custom defaultTab when provided', () => {
    expect(getCommunityDetailTab({ requestedTab: 'bogus', allowedTabs: ['settings'], defaultTab: 'settings' })).toBe('settings')
  })

  it('defends against a missing allowedTabs list', () => {
    expect(getCommunityDetailTab({ requestedTab: 'voice' })).toBe('chat')
  })
})

describe('setCommunityDetailTab', () => {
  it('removes the tab param when switching to the default tab (clean URL)', () => {
    expect(setCommunityDetailTab(p('tab=voice'), 'chat').toString()).toBe('')
  })

  it('sets the tab param for a non-default tab', () => {
    expect(setCommunityDetailTab(p(''), 'voice').toString()).toBe('tab=voice')
  })

  it('replaces an existing tab param for a non-default tab', () => {
    expect(setCommunityDetailTab(p('tab=chat'), 'voice').toString()).toBe('tab=voice')
  })

  it('preserves unrelated query params', () => {
    expect(setCommunityDetailTab(p('invite=CODE&tab=voice'), 'leaderboard').toString()).toBe('invite=CODE&tab=leaderboard')
  })

  it('preserves unrelated query params when cleaning the default tab', () => {
    expect(setCommunityDetailTab(p('invite=CODE&tab=voice'), 'chat').toString()).toBe('invite=CODE')
  })

  it('does not mutate the input search params', () => {
    const input = p('tab=voice')
    const out = setCommunityDetailTab(input, 'chat')
    expect(input.toString()).toBe('tab=voice')
    expect(out).not.toBe(input)
  })

  it('round-trips: applying the resolved tab yields the canonical URL', () => {
    const requested = p('tab=bogus&invite=K')
    const resolved = getCommunityDetailTab({ requestedTab: requested.get('tab'), allowedTabs: COMMUNITY_DETAIL_TAB_VALUES })
    expect(setCommunityDetailTab(requested, resolved).toString()).toBe('invite=K')
  })
})
