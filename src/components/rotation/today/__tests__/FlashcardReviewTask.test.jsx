// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FlashcardReviewTask, { buildAnkiUrl } from '../FlashcardReviewTask'

vi.mock('../FlashcardReviewTask.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

describe('buildAnkiUrl', () => {
  it('returns /anki for empty deckNames', () => {
    expect(buildAnkiUrl([])).toBe('/anki')
  })

  it('returns /anki for null/undefined', () => {
    expect(buildAnkiUrl(null)).toBe('/anki')
    expect(buildAnkiUrl(undefined)).toBe('/anki')
  })

  it('returns /anki?deck=name for 1 deck', () => {
    expect(buildAnkiUrl(['Anatomy'])).toBe('/anki?deck=Anatomy')
  })

  it('returns combined params for 2-5 decks', () => {
    const url = buildAnkiUrl(['Anatomy', 'Physiology'])
    expect(url).toContain('deck=Anatomy')
    expect(url).toContain('deck=Physiology')
  })

  it('returns /anki for more than 5 decks', () => {
    const decks = ['A','B','C','D','E','F']
    expect(buildAnkiUrl(decks)).toBe('/anki')
  })

  it('deduplicates deck names', () => {
    const url = buildAnkiUrl(['Anatomy', 'Anatomy', 'Physiology'])
    expect(url.match(/deck=Anatomy/g)).toHaveLength(1)
    expect(url).toContain('deck=Physiology')
  })
})

describe('FlashcardReviewTask', () => {
  const baseTask = {
    id: 'task-1',
    taskType: 'flashcard_review',
    deckNames: ['Anatomy'],
    dueCardCount: 10,
    scheduledMinutes: 30,
    unmetReviewMinutes: 0,
  }
  const topicsById = new Map([
    ['topic-1', { topicTitle: 'Cardiology' }],
  ])

  it('renders topic name from topicsById', () => {
    render(<FlashcardReviewTask task={baseTask} planTopicId="topic-1" topicsById={topicsById} />)
    expect(screen.getByText('Cardiology')).toBeInTheDocument()
  })

  it('renders general reviews for unknown planTopicId', () => {
    render(<FlashcardReviewTask task={baseTask} planTopicId={null} topicsById={topicsById} />)
    expect(screen.getByText('General Reviews')).toBeInTheDocument()
  })

  it('renders due card count', () => {
    render(<FlashcardReviewTask task={baseTask} planTopicId="topic-1" topicsById={topicsById} />)
    expect(screen.getByText('10 cards due')).toBeInTheDocument()
  })

  it('renders scheduled minutes', () => {
    render(<FlashcardReviewTask task={baseTask} planTopicId="topic-1" topicsById={topicsById} />)
    expect(screen.getByText('30 min scheduled')).toBeInTheDocument()
  })

  it('renders unmet review minutes when > 0', () => {
    const task = { ...baseTask, unmetReviewMinutes: 15 }
    render(<FlashcardReviewTask task={task} planTopicId="topic-1" topicsById={topicsById} />)
    expect(screen.getByText('15 min over capacity')).toBeInTheDocument()
  })

  it('renders deck badges', () => {
    render(<FlashcardReviewTask task={baseTask} planTopicId="topic-1" topicsById={topicsById} />)
    expect(screen.getByText('Anatomy')).toBeInTheDocument()
  })

  it('renders type label', () => {
    render(<FlashcardReviewTask task={baseTask} planTopicId="topic-1" topicsById={topicsById} />)
    expect(screen.getByText('Flashcard Review')).toBeInTheDocument()
  })

  it('renders Open Flashcards link', () => {
    render(<FlashcardReviewTask task={baseTask} planTopicId="topic-1" topicsById={topicsById} />)
    expect(screen.getByText('Open Flashcards')).toBeInTheDocument()
  })

  it('clicking Open Flashcards navigates to Anki and does not trigger any API call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not be called'))

    render(<FlashcardReviewTask task={baseTask} planTopicId="topic-1" topicsById={topicsById} />)

    const link = screen.getByRole('link', { name: /Open Flashcards/ })
    expect(link).toHaveAttribute('href', '/anki?deck=Anatomy')

    fireEvent.click(link)

    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })

  it('clicking Open Flashcards on general review navigates to /anki and does not trigger any API call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not be called'))

    const generalTask = { ...baseTask, deckNames: [] }
    render(<FlashcardReviewTask task={generalTask} planTopicId={null} topicsById={topicsById} />)

    const link = screen.getByRole('link', { name: /Open Flashcards/ })
    expect(link).toHaveAttribute('href', '/anki')

    fireEvent.click(link)

    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })
})
