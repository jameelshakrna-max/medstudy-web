export const REVIEW_MINUTES_PER_CARD = 1.5

export function isReviewDueCard(card) {
  if (!card.last_review) return false
  const state = Number(card.state) || 0
  if (state === 0) return false
  if (!card.next_review) return false
  return true
}

export function isReviewDueCardWithCutoff(card, cutoffIso) {
  if (!isReviewDueCard(card)) return false
  return card.next_review <= cutoffIso
}

export function isNewCard(card) {
  return !card.last_review || (Number(card.state) || 0) === 0
}
