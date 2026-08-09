// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/api', () => ({
  apiGet: vi.fn(),
}))

import { normalizePlannerDecks } from '../usePlannerDecks'

describe('normalizePlannerDecks', () => {
  it('maps an array of { id, name, card_count } decks', () => {
    const result = normalizePlannerDecks([
      { id: 'd1', name: 'Cardio Deck', card_count: 120 },
      { id: 'd2', name: 'Pharm Deck', card_count: 0 },
    ])
    expect(result).toEqual([
      { deckName: 'Cardio Deck', cardCount: 120 },
      { deckName: 'Pharm Deck', cardCount: 0 },
    ])
  })

  it('handles the legacy object { decks: [...] } shape', () => {
    const result = normalizePlannerDecks({
      decks: [
        { id: 'd1', name: 'Cardio Deck', card_count: 120 },
        { id: 'd2', name: 'Pharm Deck', card_count: 0 },
      ],
    })
    expect(result).toEqual([
      { deckName: 'Cardio Deck', cardCount: 120 },
      { deckName: 'Pharm Deck', cardCount: 0 },
    ])
  })

  it('passes through already-normalized { deckName, cardCount } decks', () => {
    const result = normalizePlannerDecks({
      decks: [{ deckName: 'A', cardCount: 5 }],
    })
    expect(result).toEqual([{ deckName: 'A', cardCount: 5 }])
  })

  it('returns [] for null, undefined, {}, and []', () => {
    expect(normalizePlannerDecks(null)).toEqual([])
    expect(normalizePlannerDecks(undefined)).toEqual([])
    expect(normalizePlannerDecks({})).toEqual([])
    expect(normalizePlannerDecks([])).toEqual([])
  })

  it('preserves exact deck names with internal spaces', () => {
    const result = normalizePlannerDecks([{ id: 'd1', name: 'Cardiology Step 2', card_count: 10 }])
    expect(result).toEqual([{ deckName: 'Cardiology Step 2', cardCount: 10 }])
  })
})
