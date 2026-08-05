// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AnkiStatus from '../AnkiStatus'

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useQuery: mockUseQuery }
})

const TODAY = '2026-08-05'

const ownerPlan = { id: 'p1', usesFlashcardCapacity: 1 }
const nonOwnerPlan = { id: 'p1', usesFlashcardCapacity: 0 }

const topics = [
  { id: 't1', canonicalTopicId: 'ct-1' },
  { id: 't2', canonicalTopicId: 'ct-2' },
]

const matchingMappings = {
  mappings: [
    { deckName: 'Anatomy', canonicalTopicId: 'ct-1' },
    { deckName: 'Physiology', canonicalTopicId: 'ct-2' },
    { deckName: 'Pathology', canonicalTopicId: 'unrelated' },
  ],
}

function renderAnkiStatus(plan = ownerPlan, tasks = [], mappings = matchingMappings) {
  mockUseQuery.mockReturnValue({ data: mappings, isLoading: false, isError: false })
  return render(<AnkiStatus plan={plan} topics={topics} tasks={tasks} todayKey={TODAY} />)
}

describe('AnkiStatus', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  it('shows the non-owner message when the plan does not own flashcard capacity', () => {
    renderAnkiStatus(nonOwnerPlan)
    expect(screen.getByText('Another rotation plan currently owns your Anki review workload.')).toBeInTheDocument()
  })

  it('shows no mapped decks message with Map Decks button for an owner without mappings', () => {
    renderAnkiStatus(ownerPlan, [], { mappings: [{ deckName: 'Pathology', canonicalTopicId: 'unrelated' }] })
    expect(screen.getByText('No Anki decks are mapped to this rotation.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Map Decks' })).toBeInTheDocument()
  })

  it('shows the no due message when owner has mapped decks but zero due today', () => {
    const tasks = [{ id: 'fc-1', taskType: 'flashcard_review', taskDate: TODAY, dueCardCount: 0, deckNames: ['Anatomy'] }]
    renderAnkiStatus(ownerPlan, tasks)
    expect(screen.getByText('No flashcards are due for this rotation today.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Map Decks' })).not.toBeInTheDocument()
  })

  it('shows the due count, deck names, and Open Flashcards link when cards are due', () => {
    const tasks = [{ id: 'fc-1', taskType: 'flashcard_review', taskDate: TODAY, dueCardCount: 10, deckNames: ['Anatomy'] }]
    renderAnkiStatus(ownerPlan, tasks)
    expect(screen.getByText('10 flashcards due')).toBeInTheDocument()
    expect(screen.getByText('Anatomy')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Open Flashcards/i })
    expect(link).toHaveAttribute('href', '/anki?deck=Anatomy')
  })

  it('builds the Open Flashcards href from all unique today deck names', () => {
    const tasks = [
      { id: 'fc-1', taskType: 'flashcard_review', taskDate: TODAY, dueCardCount: 4, deckNames: ['Anatomy', 'Physiology'] },
      { id: 'fc-2', taskType: 'flashcard_review', taskDate: TODAY, dueCardCount: 3, deckNames: ['Anatomy'] },
    ]
    renderAnkiStatus(ownerPlan, tasks)
    const link = screen.getByRole('link', { name: /Open Flashcards/i })
    expect(link).toHaveAttribute('href', '/anki?deck=Anatomy&deck=Physiology')
  })

  it('sums due counts across today flashcard tasks including metadataJson', () => {
    const tasks = [
      { id: 'fc-1', taskType: 'flashcard_review', taskDate: TODAY, dueCardCount: 10, deckNames: ['Anatomy'] },
      { id: 'fc-2', taskType: 'flashcard_review', taskDate: TODAY, metadataJson: { dueCardCount: 5 }, deckNames: ['Physiology'] },
      { id: 'fc-3', taskType: 'flashcard_review', taskDate: '2026-08-06', dueCardCount: 99, deckNames: ['Skipped'] },
    ]
    renderAnkiStatus(ownerPlan, tasks)
    expect(screen.getByText('15 flashcards due')).toBeInTheDocument()
    expect(screen.queryByText('Skipped')).not.toBeInTheDocument()
  })

  it('renders nothing for an owner while deck mappings are loading', () => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: true, isError: false })
    const { container } = render(<AnkiStatus plan={ownerPlan} topics={topics} tasks={[]} todayKey={TODAY} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('No Anki decks are mapped to this rotation.')).not.toBeInTheDocument()
  })

  it('renders nothing for an owner when the deck mappings query errors', () => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, isError: true })
    const { container } = render(<AnkiStatus plan={ownerPlan} topics={topics} tasks={[]} todayKey={TODAY} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('No Anki decks are mapped to this rotation.')).not.toBeInTheDocument()
  })

  it('Map Decks button scrolls the deck-topic-mappings section into view', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const target = document.createElement('div')
    target.id = 'deck-topic-mappings'
    document.body.appendChild(target)
    const user = userEvent.setup()
    renderAnkiStatus(ownerPlan, [], { mappings: [{ deckName: 'Pathology', canonicalTopicId: 'unrelated' }] })
    await user.click(screen.getByRole('button', { name: 'Map Decks' }))
    expect(scrollIntoView).toHaveBeenCalled()
  })
})
