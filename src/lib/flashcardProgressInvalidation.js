import { queryKeys } from './queryKeys'

export function invalidateFlashcardProgressQueries(queryClient) {
  if (!queryClient) return
  queryClient.invalidateQueries({ queryKey: queryKeys.flashcards.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.rotations.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.tracking.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all })
}
