import { describe, it, expect } from 'vitest'
import {
  TRACKING_TABS,
  TRACKING_TAB_VALUES,
  TRACKING_DEFAULT_TAB,
  resolveTrackingTab,
} from '../trackingTabs.js'

function p(query) {
  return new URLSearchParams(query)
}

describe('TRACKING_TABS constants', () => {
  it('has exactly the expected ids in order', () => {
    expect(TRACKING_TABS.map(t => t.id)).toEqual([
      'overview',
      'uworld',
      'mrcp',
      'board',
      'sessions',
      'rotation',
      'goals',
    ])
  })

  it('has the exact labels', () => {
    expect(TRACKING_TABS.map(t => t.label)).toEqual([
      'Overview',
      'UWorld Tracker',
      'MRCP Progress',
      'Local Board Tracker',
      'Sessions',
      'Rotation',
      'Goals',
    ])
  })

  it('TRACKING_TAB_VALUES equals the ids in the same order', () => {
    expect(TRACKING_TAB_VALUES).toEqual(TRACKING_TABS.map(t => t.id))
  })

  it('TRACKING_DEFAULT_TAB maps /progress and /uworld', () => {
    expect(TRACKING_DEFAULT_TAB).toEqual({ '/progress': 'overview', '/uworld': 'uworld' })
  })
})

describe('resolveTrackingTab', () => {
  it('/progress with no tab resolves to overview', () => {
    expect(resolveTrackingTab('/progress', p(''))).toBe('overview')
  })

  it('/progress with empty tab resolves to overview', () => {
    expect(resolveTrackingTab('/progress', p('tab='))).toBe('overview')
  })

  it.each(TRACKING_TAB_VALUES)('/progress?tab=%s resolves to itself', tab => {
    expect(resolveTrackingTab('/progress', p(`tab=${tab}`))).toBe(tab)
  })

  it('/progress?tab=overview resolves to overview', () => {
    expect(resolveTrackingTab('/progress', p('tab=overview'))).toBe('overview')
  })

  it('/uworld with no tab resolves to uworld (pathname default)', () => {
    expect(resolveTrackingTab('/uworld', p(''))).toBe('uworld')
    expect(resolveTrackingTab('/uworld', p('tab='))).toBe('uworld')
  })

  it('/uworld with an explicit valid tab wins over the pathname default', () => {
    expect(resolveTrackingTab('/uworld', p('tab=mrcp'))).toBe('mrcp')
    expect(resolveTrackingTab('/uworld', p('tab=overview'))).toBe('overview')
    expect(resolveTrackingTab('/uworld', p('tab=goals'))).toBe('goals')
    expect(resolveTrackingTab('/uworld', p('tab=uworld'))).toBe('uworld')
  })

  it('invalid tab on /progress falls back to the pathname default', () => {
    expect(resolveTrackingTab('/progress', p('tab=bogus'))).toBe('overview')
    expect(resolveTrackingTab('/progress', p('tab=123'))).toBe('overview')
  })

  it('invalid tab on /uworld falls back to uworld', () => {
    expect(resolveTrackingTab('/uworld', p('tab=bogus'))).toBe('uworld')
  })

  it('tab matching is case-sensitive', () => {
    expect(resolveTrackingTab('/progress', p('tab=OVERVIEW'))).toBe('overview')
    expect(resolveTrackingTab('/progress', p('tab=UWorld'))).toBe('overview')
    expect(resolveTrackingTab('/progress', p('tab=Goals'))).toBe('overview')
  })

  it('unknown pathname with no tab resolves to overview', () => {
    expect(resolveTrackingTab('/somewhere', p(''))).toBe('overview')
  })

  it('unknown pathname with a valid tab value returns the tab (valid param wins)', () => {
    expect(resolveTrackingTab('/somewhere', p('tab=goals'))).toBe('goals')
  })

  it('unknown pathname with an invalid tab resolves to overview', () => {
    expect(resolveTrackingTab('/somewhere', p('tab=bogus'))).toBe('overview')
    expect(resolveTrackingTab('/somewhere', p('tab=123'))).toBe('overview')
  })
})
