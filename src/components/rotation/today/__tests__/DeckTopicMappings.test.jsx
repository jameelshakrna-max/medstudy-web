// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DeckTopicMappings from '../DeckTopicMappings'

const { mockInvalidateQueries } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
}))

vi.mock('../../../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('../../../../lib/queryKeys', () => ({
  queryKeys: {
    deckMappings: {
      all: ['deckMappings'],
      list: () => ['deckMappings', 'list'],
    },
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: vi.fn(),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: mockInvalidateQueries,
    })),
  }
})

vi.mock('../DeckTopicMappings.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

import { useQuery } from '@tanstack/react-query'
import { apiPost, apiDelete } from '../../../../lib/api'

function renderWithClient(ui) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('DeckTopicMappings', () => {
  const defaultProps = {
    planId: 'plan-1',
    topics: [
      { id: 'topic-1', topicTitle: 'Cardiology', canonicalTopicId: 'canon-1' },
      { id: 'topic-2', topicTitle: 'Neurology', canonicalTopicId: 'canon-2' },
    ],
    usesFlashcardCapacity: 1,
    onRecalculationRequired: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [{ deckName: 'Anatomy', cardCount: 100 }] }, isLoading: false, refetch: vi.fn() }
      }
      if (queryKey[0] === 'deckMappings') {
        return { data: { mappings: [] }, isLoading: false, refetch: vi.fn() }
      }
      return { data: null, isLoading: false }
    })
  })

  it('shows non-owner message when usesFlashcardCapacity is not 1', () => {
    renderWithClient(<DeckTopicMappings {...defaultProps} usesFlashcardCapacity={0} />)
    expect(screen.getByText(/Another rotation currently uses flashcard capacity/i)).toBeInTheDocument()
  })

  it('shows create-plan message when no planId', () => {
    renderWithClient(<DeckTopicMappings {...defaultProps} planId={null} />)
    expect(screen.getByText(/Create the plan first/i)).toBeInTheDocument()
  })

  it('shows loading state', () => {
    useQuery.mockImplementation(() => ({ data: null, isLoading: true }))
    renderWithClient(<DeckTopicMappings {...defaultProps} />)
    expect(screen.getByText(/Loading decks/i)).toBeInTheDocument()
  })

  it('shows empty state when no decks', () => {
    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [] }, isLoading: false }
      }
      return { data: { mappings: [] }, isLoading: false }
    })
    renderWithClient(<DeckTopicMappings {...defaultProps} />)
    expect(screen.getByText(/Link an Anki deck to this rotation/i)).toBeInTheDocument()
  })

  it('renders deck list with unmapped decks', () => {
    renderWithClient(<DeckTopicMappings {...defaultProps} />)
    expect(screen.getByText('Anatomy')).toBeInTheDocument()
    expect(screen.getByText('100 cards')).toBeInTheDocument()
  })

  it('shows linked-unmapped empty state with Map topics action when decks are linked but unmapped', () => {
    renderWithClient(<DeckTopicMappings {...defaultProps} hasLinkedDecks />)
    expect(screen.getByText(/aren't mapped to planner topics yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Map topics' })).toBeInTheDocument()
  })

  it('shows no-linked-decks empty state without a Map topics action', () => {
    renderWithClient(<DeckTopicMappings {...defaultProps} hasLinkedDecks={false} />)
    expect(screen.getByText(/Link an Anki deck to this rotation/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Map topics' })).not.toBeInTheDocument()
  })

  it('shows linked-unmapped empty state when the deck list is empty', () => {
    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [] }, isLoading: false }
      }
      return { data: { mappings: [] }, isLoading: false }
    })
    renderWithClient(<DeckTopicMappings {...defaultProps} hasLinkedDecks />)
    expect(screen.getByText(/aren't mapped to planner topics yet/i)).toBeInTheDocument()
    expect(screen.queryByText('No flashcard decks found.')).not.toBeInTheDocument()
  })

  it('Map topics button scrolls the deck list into view', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderWithClient(<DeckTopicMappings {...defaultProps} hasLinkedDecks />)
    fireEvent.click(screen.getByRole('button', { name: 'Map topics' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('does not show an empty state when decks are linked and mapped', () => {
    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [{ deckName: 'Anatomy', cardCount: 100 }] }, isLoading: false }
      }
      if (queryKey[0] === 'deckMappings') {
        return { data: { mappings: [{ id: 'm1', deckName: 'Anatomy', planTopicId: 'topic-1', canonicalTopicId: 'canon-1' }] }, isLoading: false }
      }
      return { data: null, isLoading: false }
    })
    renderWithClient(<DeckTopicMappings {...defaultProps} hasLinkedDecks />)
    expect(screen.queryByText(/mapped to planner topics/i)).not.toBeInTheDocument()
    expect(screen.getByText('Cardiology')).toBeInTheDocument()
  })

  it('shows mapped deck with topic badge', () => {
    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [{ deckName: 'Anatomy', cardCount: 100 }] }, isLoading: false }
      }
      if (queryKey[0] === 'deckMappings') {
        return { data: { mappings: [{ id: 'm1', deckName: 'Anatomy', planTopicId: 'topic-1', canonicalTopicId: 'canon-1' }] }, isLoading: false }
      }
      return { data: null, isLoading: false }
    })
    renderWithClient(<DeckTopicMappings {...defaultProps} />)
    expect(screen.getByText('Cardiology')).toBeInTheDocument()
  })

  it('renders heading', () => {
    renderWithClient(<DeckTopicMappings {...defaultProps} />)
    expect(screen.getByText('Deck-Topic Mappings')).toBeInTheDocument()
  })

  it('sends correct POST body when adding a mapping', async () => {
    renderWithClient(<DeckTopicMappings {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('Select topic for Anatomy'), { target: { value: 'topic-1' } })

    expect(apiPost).toHaveBeenCalledWith('/api/deck-mappings', {
      planId: 'plan-1',
      deckName: 'Anatomy',
      planTopicId: 'topic-1',
      clientRequestId: expect.any(String),
    })
  })

  it('sends correct DELETE body when removing a mapping', async () => {
    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [{ deckName: 'Anatomy', cardCount: 100 }] }, isLoading: false, refetch: vi.fn() }
      }
      if (queryKey[0] === 'deckMappings') {
        return { data: { mappings: [{ id: 'm1', deckName: 'Anatomy', planTopicId: 'topic-1', canonicalTopicId: 'canon-1' }] }, isLoading: false, refetch: vi.fn() }
      }
      return { data: null, isLoading: false }
    })

    renderWithClient(<DeckTopicMappings {...defaultProps} />)

    fireEvent.click(screen.getByLabelText('Remove mapping for Anatomy'))

    expect(apiDelete).toHaveBeenCalledWith('/api/deck-mappings/m1', {
      clientRequestId: expect.any(String),
    })
  })

  it('generates unique clientRequestId for consecutive add calls', async () => {
    const uuidSpy = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('uuid-001')
      .mockReturnValueOnce('uuid-002')

    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [{ deckName: 'Anatomy', cardCount: 100 }] }, isLoading: false, refetch: vi.fn() }
      }
      if (queryKey[0] === 'deckMappings') {
        return { data: { mappings: [] }, isLoading: false, refetch: vi.fn() }
      }
      return { data: null, isLoading: false }
    })

    renderWithClient(<DeckTopicMappings {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('Select topic for Anatomy'), { target: { value: 'topic-1' } })
    expect(apiPost).toHaveBeenNthCalledWith(1, '/api/deck-mappings', expect.objectContaining({
      clientRequestId: 'uuid-001',
    }))

    await waitFor(() => {
      expect(screen.getByLabelText('Select topic for Anatomy')).not.toBeDisabled()
    })

    fireEvent.change(screen.getByLabelText('Select topic for Anatomy'), { target: { value: 'topic-2' } })
    expect(apiPost).toHaveBeenNthCalledWith(2, '/api/deck-mappings', expect.objectContaining({
      clientRequestId: 'uuid-002',
    }))

    uuidSpy.mockRestore()
  })

  it('invalidates queries after successful POST', async () => {
    renderWithClient(<DeckTopicMappings {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('Select topic for Anatomy'), { target: { value: 'topic-1' } })

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['flashcards', 'planner-decks'] })
    })
  })

  it('invalidates queries after successful DELETE', async () => {
    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [{ deckName: 'Anatomy', cardCount: 100 }] }, isLoading: false, refetch: vi.fn() }
      }
      if (queryKey[0] === 'deckMappings') {
        return { data: { mappings: [{ id: 'm1', deckName: 'Anatomy', planTopicId: 'topic-1', canonicalTopicId: 'canon-1' }] }, isLoading: false, refetch: vi.fn() }
      }
      return { data: null, isLoading: false }
    })

    renderWithClient(<DeckTopicMappings {...defaultProps} />)

    fireEvent.click(screen.getByLabelText('Remove mapping for Anatomy'))

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['flashcards', 'planner-decks'] })
    })
  })

  it('shows error message when POST fails', async () => {
    apiPost.mockRejectedValueOnce(new Error('Server error'))

    renderWithClient(<DeckTopicMappings {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('Select topic for Anatomy'), { target: { value: 'topic-1' } })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })
  })

  it('shows error message when DELETE fails', async () => {
    apiDelete.mockRejectedValueOnce(new Error('Network error'))

    useQuery.mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'flashcards' && queryKey[1] === 'planner-decks') {
        return { data: { decks: [{ deckName: 'Anatomy', cardCount: 100 }] }, isLoading: false, refetch: vi.fn() }
      }
      if (queryKey[0] === 'deckMappings') {
        return { data: { mappings: [{ id: 'm1', deckName: 'Anatomy', planTopicId: 'topic-1', canonicalTopicId: 'canon-1' }] }, isLoading: false, refetch: vi.fn() }
      }
      return { data: null, isLoading: false }
    })

    renderWithClient(<DeckTopicMappings {...defaultProps} />)

    fireEvent.click(screen.getByLabelText('Remove mapping for Anatomy'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error')
    })
  })

  it('disables add controls while a mapping is pending to prevent duplicate clicks', async () => {
    let resolvePost
    apiPost.mockImplementationOnce(() => new Promise(resolve => { resolvePost = resolve }))

    renderWithClient(<DeckTopicMappings {...defaultProps} />)

    const select = screen.getByLabelText('Select topic for Anatomy')
    fireEvent.change(select, { target: { value: 'topic-1' } })

    expect(select).toBeDisabled()
    expect(apiPost).toHaveBeenCalledTimes(1)

    resolvePost({})

    await waitFor(() => {
      expect(select).not.toBeDisabled()
    })
  })
})
