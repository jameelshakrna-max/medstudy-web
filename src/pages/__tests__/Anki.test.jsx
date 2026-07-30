// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockQueryData, mockUrlParams } = vi.hoisted(() => {
  const urlParams = new URLSearchParams()
  return {
    mockQueryData: { decks: [], cards: [] },
    mockUrlParams: urlParams,
  }
})

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockUrlParams, vi.fn()],
}))

vi.mock('../Anki.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../../components/LoadingScreen', () => ({
  default: () => null,
}))

vi.mock('../../components/ui/Toast/Toast', () => {
  const Toast = () => null
  Toast.Provider = ({ children }) => <>{children}</>
  Toast.Viewport = () => null
  return { default: Toast }
})

vi.mock('lucide-react', () => ({
  Maximize2: () => null,
  Minimize2: () => null,
}))

vi.mock('fsrs.js', () => ({
  FSRS: vi.fn().mockImplementation(() => ({
    repeat: () => ({
      [0]: { card: { difficulty: 0, stability: 0, state: 0, due: new Date(), getTime: () => Date.now() } },
      [1]: { card: { difficulty: 0, stability: 0, state: 0, due: new Date(), getTime: () => Date.now() } },
      [2]: { card: { difficulty: 0, stability: 0, state: 0, due: new Date(), getTime: () => Date.now() } },
      [3]: { card: { difficulty: 0, stability: 0, state: 0, due: new Date(), getTime: () => Date.now() } },
    }),
  })),
  Card: vi.fn(),
  State: { New: 0, Learning: 1, Review: 2, Relearning: 3 },
  Rating: { Again: 0, Hard: 1, Good: 2, Easy: 3 },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((opts) => {
    const key = JSON.stringify(opts.queryKey)
    if (key.includes('decks')) {
      return { data: mockQueryData.decks, isLoading: false, error: null, isError: false }
    }
    if (key.includes('list')) {
      return { data: mockQueryData.cards, isLoading: false, error: null, isError: false }
    }
    return { data: [], isLoading: false, error: null, isError: false }
  }),
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: vi.fn() }),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) } },
}))

vi.mock('../../lib/queryKeys', () => ({
  queryKeys: {
    flashcards: {
      all: ['flashcards'],
      list: () => ['flashcards', 'list'],
      decks: () => ['flashcards', 'decks'],
      forDeck: (id) => ['flashcards', 'forDeck', id],
      dueCount: () => ['flashcards', 'dueCount'],
    },
  },
}))

import Anki from '../Anki'

describe('Anki URL-based filtering', () => {
  beforeEach(() => {
    mockQueryData.decks = []
    mockQueryData.cards = []
    for (const key of [...mockUrlParams.keys()]) {
      mockUrlParams.delete(key)
    }
  })

  it('shows all items when no deck URL params are provided', async () => {
    mockQueryData.decks = [
      { id: '1', name: 'Cardio' },
      { id: '2', name: 'Renal' },
    ]

    render(<Anki />)

    await waitFor(() => {
      expect(screen.getByText('Cardio')).toBeInTheDocument()
      expect(screen.getByText('Renal')).toBeInTheDocument()
    })
  })

  it('reads multiple deck values from URL via getAll("deck")', async () => {
    mockQueryData.decks = [
      { id: '1', name: 'cardio' },
      { id: '2', name: 'renal' },
    ]
    mockUrlParams.set('deck', 'xyz')
    mockUrlParams.append('deck', 'cardio')
    mockUrlParams.append('deck', 'renal')

    render(<Anki />)

    await waitFor(() => {
      expect(screen.getByText('cardio')).toBeInTheDocument()
    })
  })

  it('handles URL deck names with special characters', async () => {
    mockQueryData.decks = [
      { id: '1', name: 'UWorld (Step 1)' },
    ]
    mockUrlParams.set('deck', 'UWorld (Step 1)')

    render(<Anki />)

    await waitFor(() => {
      expect(screen.getByText('UWorld (Step 1)')).toBeInTheDocument()
    })
  })

  it('uses OR logic when matching deck names against URL params', async () => {
    mockQueryData.decks = [
      { id: '1', name: 'neurology' },
      { id: '2', name: 'renal' },
    ]
    mockUrlParams.set('deck', 'cardio')
    mockUrlParams.append('deck', 'renal')

    render(<Anki />)

    await waitFor(() => {
      expect(screen.getByText('renal')).toBeInTheDocument()
    })
  })
})
