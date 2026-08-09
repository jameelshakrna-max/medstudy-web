import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function normalizePlannerDecks(response) {
  const list = Array.isArray(response)
    ? response
    : Array.isArray(response?.decks)
      ? response.decks
      : []
  return list.map((deck) => ({
    deckName: deck.deckName ?? deck.deck_name ?? deck.name ?? '',
    cardCount: Number(deck.cardCount ?? deck.card_count ?? 0) || 0,
  }))
}

export function usePlannerDecks(options) {
  const { data, ...rest } = useQuery({
    queryKey: queryKeys.flashcards.decks(),
    queryFn: () => apiGet('/decks'),
    ...options,
  })
  return { ...rest, data: normalizePlannerDecks(data) }
}
