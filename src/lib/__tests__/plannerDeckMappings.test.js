import { describe, it, expect } from 'vitest'
import { getMappingEmptyState, MAPPING_EMPTY_STATE } from '../plannerDeckMappings'

describe('getMappingEmptyState', () => {
  it('returns the linked-unmapped copy with a Map topics action when linked decks exist but none are mapped', () => {
    expect(getMappingEmptyState({ hasLinkedDecks: true, hasMappings: false })).toEqual({
      copy: MAPPING_EMPTY_STATE.linkedUnmapped,
      action: MAPPING_EMPTY_STATE.mapTopicsAction,
    })
  })

  it('returns the link-first copy with no action when there are no linked decks', () => {
    expect(getMappingEmptyState({ hasLinkedDecks: false, hasMappings: false })).toEqual({
      copy: MAPPING_EMPTY_STATE.noLinkedDecks,
      action: null,
    })
  })

  it('returns no empty state when linked decks are mapped', () => {
    expect(getMappingEmptyState({ hasLinkedDecks: true, hasMappings: true })).toBeNull()
  })

  it('returns the link-first copy even when mappings exist but no linked decks', () => {
    expect(getMappingEmptyState({ hasLinkedDecks: false, hasMappings: true })).toEqual({
      copy: MAPPING_EMPTY_STATE.noLinkedDecks,
      action: null,
    })
  })
})
