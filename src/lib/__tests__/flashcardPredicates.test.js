import { describe, it, expect } from 'vitest'
import {
  REVIEW_MINUTES_PER_CARD,
  isReviewDueCard,
  isReviewDueCardWithCutoff,
  isNewCard,
} from '../flashcardPredicates.js'

describe('REVIEW_MINUTES_PER_CARD', () => {
  it('is 1.5', () => {
    expect(REVIEW_MINUTES_PER_CARD).toBe(1.5)
  })
})

describe('isReviewDueCard', () => {
  it('state 0 is not review-due', () => {
    expect(isReviewDueCard({ state: 0, last_review: '2026-01-01', next_review: '2026-07-01' })).toBe(false)
  })

  it('Learning (state 1) with past next_review is review-due', () => {
    expect(isReviewDueCard({ state: 1, last_review: '2026-01-01', next_review: '2026-06-01' })).toBe(true)
  })

  it('Learning (state 1) with future next_review is review-due (without cutoff check)', () => {
    expect(isReviewDueCard({ state: 1, last_review: '2026-01-01', next_review: '2026-12-31' })).toBe(true)
  })

  it('Review (state 2) with past next_review is review-due', () => {
    expect(isReviewDueCard({ state: 2, last_review: '2026-01-01', next_review: '2026-06-01' })).toBe(true)
  })

  it('Relearning (state 3) with past next_review is review-due', () => {
    expect(isReviewDueCard({ state: 3, last_review: '2026-01-01', next_review: '2026-06-01' })).toBe(true)
  })

  it('null last_review is not review-due (treated as new)', () => {
    expect(isReviewDueCard({ state: 1, last_review: null, next_review: '2026-06-01' })).toBe(false)
    expect(isReviewDueCard({ state: 2, last_review: null, next_review: '2026-06-01' })).toBe(false)
    expect(isReviewDueCard({ state: 3, last_review: null, next_review: '2026-06-01' })).toBe(false)
  })

  it('null next_review is not review-due', () => {
    expect(isReviewDueCard({ state: 1, last_review: '2026-01-01', next_review: null })).toBe(false)
    expect(isReviewDueCard({ state: 2, last_review: '2026-01-01', next_review: null })).toBe(false)
  })

  it('undefined fields fail safely', () => {
    expect(isReviewDueCard({})).toBe(false)
    expect(isReviewDueCard({ state: 2 })).toBe(false)
  })
})

describe('isReviewDueCardWithCutoff', () => {
  it('Learning with next_review before cutoff is review-due', () => {
    expect(isReviewDueCardWithCutoff(
      { state: 1, last_review: '2026-01-01', next_review: '2026-07-01' },
      '2026-07-15T00:00:00.000Z',
    )).toBe(true)
  })

  it('Learning with next_review after cutoff is not review-due', () => {
    expect(isReviewDueCardWithCutoff(
      { state: 1, last_review: '2026-01-01', next_review: '2026-08-01' },
      '2026-07-15T00:00:00.000Z',
    )).toBe(false)
  })

  it('Review with next_review equal to cutoff is review-due', () => {
    expect(isReviewDueCardWithCutoff(
      { state: 2, last_review: '2026-01-01', next_review: '2026-07-15T00:00:00.000Z' },
      '2026-07-15T00:00:00.000Z',
    )).toBe(true)
  })

  it('New card is not review-due regardless of cutoff', () => {
    expect(isReviewDueCardWithCutoff(
      { state: 0, last_review: null, next_review: '2026-06-01' },
      '2026-07-15T00:00:00.000Z',
    )).toBe(false)
  })
})

describe('isNewCard', () => {
  it('state 0 is new', () => {
    expect(isNewCard({ state: 0, last_review: null })).toBe(true)
  })

  it('state 1 with null last_review is new (legacy)', () => {
    expect(isNewCard({ state: 1, last_review: null })).toBe(true)
  })

  it('state 2 with null last_review is new (legacy)', () => {
    expect(isNewCard({ state: 2, last_review: null })).toBe(true)
  })

  it('state 3 with null last_review is new (legacy)', () => {
    expect(isNewCard({ state: 3, last_review: null })).toBe(true)
  })

  it('state 1 with last_review is not new', () => {
    expect(isNewCard({ state: 1, last_review: '2026-01-01' })).toBe(false)
  })

  it('state 2 with last_review is not new', () => {
    expect(isNewCard({ state: 2, last_review: '2026-01-01' })).toBe(false)
  })

  it('state 3 with last_review is not new', () => {
    expect(isNewCard({ state: 3, last_review: '2026-01-01' })).toBe(false)
  })

  it('state 0 with last_review is still new (state takes precedence)', () => {
    expect(isNewCard({ state: 0, last_review: '2026-01-01' })).toBe(true)
  })

  it('undefined state with null last_review is new', () => {
    expect(isNewCard({ last_review: null })).toBe(true)
  })
})
