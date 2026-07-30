// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FlashcardForecastRecommendations from '../FlashcardForecastRecommendations'

vi.mock('../FlashcardForecastRecommendations.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

describe('FlashcardForecastRecommendations', () => {
  const defaultProps = {
    forecast: null,
    usesFlashcardCapacity: 0,
    topicsById: new Map(),
    topics: [],
  }

  it('shows non-owner message when usesFlashcardCapacity is not 1', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} />)
    expect(screen.getByText(/does not currently own flashcard capacity/i)).toBeInTheDocument()
  })

  it('shows enable-forecast message when forecast is empty and owner', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={null} />)
    expect(screen.getByText(/Enable safe-new-card forecasting/i)).toBeInTheDocument()
  })

  it('shows enable-forecast message when safeNewCardsByDate is empty and no accepted cards', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{ safeNewCardsByDate: {}, acceptedCardCount: 0, rejectedCardCount: 0 }} />)
    expect(screen.getByText(/Enable safe-new-card forecasting/i)).toBeInTheDocument()
  })

  it('shows no-eligible message when accepted and rejected are both 0 but safeNewCardsByDate has entries', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [] },
      acceptedCardCount: 0,
      rejectedCardCount: 0,
      rejectionCounts: {},
      truncated: false,
    }} />)
    expect(screen.getByText(/No mapped and unlocked new cards/i)).toBeInTheDocument()
  })

  it('shows all-rejected message when accepted is 0 and rejected > 0', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [] },
      acceptedCardCount: 0,
      rejectedCardCount: 5,
      rejectionCounts: { projectedLoadExceeded: 5 },
      truncated: false,
    }} />)
    expect(screen.getByText(/All eligible cards exceed the projected review limit/i)).toBeInTheDocument()
  })

  it('shows data-limits truncation warning when candidateLimitReached is true', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [] },
      acceptedCardCount: 0,
      rejectedCardCount: 5,
      rejectionCounts: { projectedLoadExceeded: 5 },
      truncated: true,
      candidateLimitReached: true,
    }} />)
    expect(screen.getByText(/Forecast was truncated due to data limits/i)).toBeInTheDocument()
  })

  it('shows capacity-limits truncation warning when truncated is true but candidateLimitReached is false', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [] },
      acceptedCardCount: 0,
      rejectedCardCount: 5,
      rejectionCounts: { projectedLoadExceeded: 5 },
      truncated: true,
      candidateLimitReached: false,
    }} />)
    expect(screen.getByText(/Forecast was truncated due to capacity limits/i)).toBeInTheDocument()
  })

  it('shows truncation warning in accepted view when candidateLimitReached is true', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [{ planTopicId: 'topic-1', deckName: 'Anatomy', projectedReviewDates: ['2025-08-03'] }] },
      acceptedCardCount: 1,
      rejectedCardCount: 0,
      rejectionCounts: {},
      truncated: false,
      candidateLimitReached: true,
    }} topicsById={new Map([['topic-1', { topicTitle: 'Cardiology' }]])} />)
    expect(screen.getByText(/Forecast was truncated due to data limits/i)).toBeInTheDocument()
  })

  it('renders accepted card count when acceptedCardCount > 0', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [{ planTopicId: 'topic-1', deckName: 'Anatomy', projectedReviewDates: ['2025-08-03'] }] },
      acceptedCardCount: 1,
      rejectedCardCount: 0,
      rejectionCounts: {},
      truncated: false,
    }} topicsById={new Map([['topic-1', { topicTitle: 'Cardiology' }]])} />)
    expect(screen.getByText('1 card')).toBeInTheDocument()
  })

  it('renders date groups and expand/collapse works', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [{ planTopicId: 'topic-1', deckName: 'Anatomy', projectedReviewDates: ['2025-08-03'] }] },
      acceptedCardCount: 1,
      rejectedCardCount: 0,
      rejectionCounts: {},
      truncated: false,
    }} topicsById={new Map([['topic-1', { topicTitle: 'Cardiology' }]])} />)
    expect(screen.getByText('2025-08-01')).toBeInTheDocument()
    fireEvent.click(screen.getByText('2025-08-01'))
    expect(screen.getByText('Cardiology')).toBeInTheDocument()
  })

  it('renders rejection breakdown when both accepted and rejected > 0', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [{ planTopicId: 'topic-1', deckName: 'Anatomy', projectedReviewDates: [] }] },
      acceptedCardCount: 3,
      rejectedCardCount: 2,
      rejectionCounts: { projectedLoadExceeded: 1, unmappedDeck: 1 },
      truncated: false,
    }} topicsById={new Map([['topic-1', { topicTitle: 'Cardiology' }]])} />)
    expect(screen.getByText(/Unmapped decks/i)).toBeInTheDocument()
    expect(screen.getByText(/Exceeded projected load/i)).toBeInTheDocument()
  })

  it('renders heading', () => {
    render(<FlashcardForecastRecommendations {...defaultProps} usesFlashcardCapacity={1} forecast={{
      safeNewCardsByDate: { '2025-08-01': [] },
      acceptedCardCount: 0,
      rejectedCardCount: 0,
      rejectionCounts: {},
      truncated: false,
    }} />)
    expect(screen.getByText('Safe-New-Card Recommendations')).toBeInTheDocument()
  })
})
