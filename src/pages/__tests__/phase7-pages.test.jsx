// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import People from '../People'
import Leaderboard from '../Leaderboard'

const h = vi.hoisted(() => {
  const mockUseQuery = vi.fn()
  const mockUseMutation = vi.fn()
  const mockUseQueryClient = vi.fn()
  const mockMutate = vi.fn()
  const mockNavigate = vi.fn()
  const mockSetSearchParams = vi.fn()
  const queryResults = new Map()
  let mockUrlParams = new URLSearchParams('')

  mockUseQuery.mockImplementation((opts = {}) =>
    queryResults.get(JSON.stringify(opts.queryKey)) || {
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }
  )

  mockUseMutation.mockImplementation((config = {}) => ({
    mutate: (...args) => {
      mockMutate(...args)
      return config?.mutationFn?.(...args)
    },
    isPending: false,
    error: null,
    data: null,
  }))

  mockUseQueryClient.mockReturnValue({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    cancelQueries: vi.fn(),
  })

  return {
    mockUseQuery,
    mockUseMutation,
    mockUseQueryClient,
    mockMutate,
    mockNavigate,
    mockSetSearchParams,
    queryResults,
    getUrlParams: () => mockUrlParams,
    setUrlParams: (p) => { mockUrlParams = p },
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.mockUseQuery,
  useMutation: h.mockUseMutation,
  useQueryClient: h.mockUseQueryClient,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => h.mockNavigate,
  useSearchParams: () => [h.getUrlParams(), h.mockSetSearchParams],
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, profile: {} }),
}))

vi.mock('../../context/ProfilePanelContext', () => ({
  useProfilePanel: () => ({
    openProfile: vi.fn(),
    preloadProfile: vi.fn(),
    cancelPreload: vi.fn(),
    closeProfile: vi.fn(),
  }),
}))

vi.mock('../../context/CommunityPanelContext', () => ({
  useCommunityPanel: () => ({
    openCommunity: vi.fn(),
    preloadCommunity: vi.fn(),
    cancelPreload: vi.fn(),
  }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  imageUrl: (u) => u || null,
  joinApiPath: (b, p) => p,
}))

vi.mock('@radix-ui/react-visually-hidden', () => {
  const VisuallyHidden = ({ children, ...rest }) => (
    <span style={{ position: 'absolute', clip: 'rect(0 0 0 0)' }} {...rest}>{children}</span>
  )
  return { default: VisuallyHidden, VisuallyHidden }
})

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ totalCount = 0, itemContent, style }) => (
    <div style={style}>
      {Array.from({ length: totalCount }, (_, i) => itemContent(i))}
    </div>
  ),
}))

function seed(key, result) {
  h.queryResults.set(JSON.stringify(key), result)
}

describe('People page (phase 7)', () => {
  beforeEach(() => {
    h.queryResults.clear()
    h.mockMutate.mockClear()
    h.mockNavigate.mockClear()
    h.setUrlParams(new URLSearchParams(''))
  })

  it('renders heading and search input', () => {
    seed(['people', 'suggested', 10], { data: [], isLoading: false, error: null, refetch: vi.fn() })
    render(<People />)

    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /search users by username/i })).toBeInTheDocument()
  })

  it('announces search result counts in an aria-live region', () => {
    vi.useFakeTimers()
    try {
      seed(['people', 'suggested', 10], { data: [], isLoading: false, error: null, refetch: vi.fn() })
      seed(['people', 'search', 'ab'], {
        data: [{ user_id: 'u1', user_name: 'ann' }],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<People />)
      const input = screen.getByRole('textbox', { name: /search users by username/i })
      fireEvent.change(input, { target: { value: 'ab' } })
      act(() => {
        vi.advanceTimersByTime(300)
      })

      const live = document.querySelector('[aria-live="polite"]')
      expect(live).not.toBeNull()
      expect(live.textContent).toContain('1 users found for "ab"')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Leaderboard page (phase 7)', () => {
  beforeEach(() => {
    h.queryResults.clear()
    h.mockMutate.mockClear()
    h.mockNavigate.mockClear()
    h.setUrlParams(new URLSearchParams(''))
  })

  it('renders heading and search input, using shared RankChange for rows', () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    seed(['leaderboard', 'stats', year, month], {
      data: {},
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    seed(['leaderboard', 'usersMonthly', year, month, 100], {
      data: { entries: [{ user_id: 'u9', user_name: 'zed', rank: 1, rank_change: 0 }] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Leaderboard />)

    expect(screen.getByRole('heading', { name: 'Study Rankings' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /search users/i })).toBeInTheDocument()
  })
})

describe('People page embedded (phase 7)', () => {
  beforeEach(() => {
    h.queryResults.clear()
    h.mockMutate.mockClear()
    h.mockNavigate.mockClear()
    h.setUrlParams(new URLSearchParams(''))
  })

  it('renders an h2 (not h1) when embedded', () => {
    seed(['people', 'suggested', 10], { data: [], isLoading: false, error: null, refetch: vi.fn() })
    render(<People embedded />)

    expect(screen.getByRole('heading', { level: 2, name: 'People' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'People' })).not.toBeInTheDocument()
  })

  it('does not autofocus the search input when embedded', () => {
    seed(['people', 'suggested', 10], { data: [], isLoading: false, error: null, refetch: vi.fn() })
    render(<People embedded />)

    expect(screen.getByRole('textbox', { name: /search users by username/i })).not.toHaveFocus()
  })
})

describe('Leaderboard page embedded (phase 7)', () => {
  beforeEach(() => {
    h.queryResults.clear()
    h.mockMutate.mockClear()
    h.mockNavigate.mockClear()
    h.setUrlParams(new URLSearchParams(''))
  })

  it('renders an h2 (not h1) when embedded', () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    seed(['leaderboard', 'stats', year, month], {
      data: {},
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    seed(['leaderboard', 'usersMonthly', year, month, 100], {
      data: { entries: [{ user_id: 'u9', user_name: 'zed', rank: 1, rank_change: 0 }] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<Leaderboard embedded />)

    expect(screen.getByRole('heading', { level: 2, name: 'Study Rankings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Study Rankings' })).not.toBeInTheDocument()
  })
})
