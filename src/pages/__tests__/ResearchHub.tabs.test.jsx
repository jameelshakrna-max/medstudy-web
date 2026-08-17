// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { LayerProvider } from '../../context/LayerContext'
import ResearchHub from '../ResearchHub'

const h = vi.hoisted(() => {
  const mockUseQuery = vi.fn()
  const mockUseMutation = vi.fn()
  const mockUseQueryClient = vi.fn()
  const invalidateQueries = vi.fn()
  const cancelQueries = vi.fn().mockResolvedValue(undefined)
  const setQueryData = vi.fn()
  const getQueryData = vi.fn()
  const queryResults = new Map()
  const mutations = []
  const apiGetSpy = vi.fn()
  const apiPostSpy = vi.fn()
  const apiDeleteSpy = vi.fn()
  return {
    mockUseQuery,
    mockUseMutation,
    mockUseQueryClient,
    invalidateQueries,
    cancelQueries,
    setQueryData,
    getQueryData,
    queryResults,
    mutations,
    apiGetSpy,
    apiPostSpy,
    apiDeleteSpy,
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.mockUseQuery,
  useMutation: h.mockUseMutation,
  useQueryClient: h.mockUseQueryClient,
}))

h.mockUseQuery.mockImplementation((opts = {}) => {
  const key = JSON.stringify(opts.queryKey)
  if (h.queryResults.has(key)) return h.queryResults.get(key)
  return { data: undefined, isLoading: false, error: null, refetch: vi.fn() }
})

h.mockUseQueryClient.mockReturnValue({
  invalidateQueries: h.invalidateQueries,
  cancelQueries: h.cancelQueries,
  setQueryData: h.setQueryData,
  getQueryData: h.getQueryData,
})

h.mockUseMutation.mockImplementation((opts = {}) => {
  const mutation = {
    mutate: vi.fn((vars) => {
      if (opts.mutationFn) {
        Promise.resolve()
          .then(() => opts.onMutate?.(vars))
          .then(() => opts.mutationFn(vars))
          .then((data) => opts.onSuccess?.(data, vars, undefined))
          .catch((err) => opts.onError?.(err, vars, undefined))
          .finally(() => opts.onSettled?.(undefined, undefined, vars))
      }
    }),
    isPending: false,
  }
  h.mutations.push(mutation)
  return mutation
})

vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v) => v,
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'me@test.com' }, profile: { username: 'meuser', avatar_url: null } }),
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
  apiGet: (...args) => h.apiGetSpy(...args),
  apiPost: (...args) => h.apiPostSpy(...args),
  apiDelete: (...args) => h.apiDeleteSpy(...args),
  formatDate: () => 'Jan 1',
  imageUrl: (u) => u || null,
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

vi.mock('@radix-ui/react-visually-hidden', () => {
  const VisuallyHidden = ({ children, ...rest }) => (
    <span style={{ position: 'absolute', clip: 'rect(0 0 0 0)' }} {...rest}>{children}</span>
  )
  return { default: VisuallyHidden, VisuallyHidden }
})

vi.mock('../../components/ui/UserLink/UserLink', () => ({
  default: ({ username }) => <span data-testid="user-link">{username}</span>,
  UserLink: ({ username }) => <span data-testid="user-link">{username}</span>,
}))

vi.mock('../../components/ui/Modal/Modal', () => {
  const Modal = ({ open, children }) => open ? <div data-testid="modal">{children}</div> : null
  Modal.Title = ({ children }) => <div>{children}</div>
  return { default: Modal }
})

vi.mock('../../components/QueryState', () => ({
  QueryErrorState: ({ message }) => <div data-testid="query-error-state">{message}</div>,
  RefetchWarning: () => <div data-testid="refetch-warning" />,
}))

vi.mock('../../components/research/ResearchPostCard', () => {
  const CATEGORY_COLORS = { questionnaire: '#3b82f6', collaboration: '#8b5cf6' }
  function timeAgo(dateStr) { return dateStr ? '1h ago' : '' }
  function ResearchPostCard({ post }) {
    return (
      <article data-testid="research-post-card" data-post-id={post.id}>
        <span>{post.title}</span>
      </article>
    )
  }
  return { __esModule: true, default: ResearchPostCard, CATEGORY_COLORS, timeAgo }
})

const DISCOVER_KEY = ['research', 'discover', 'all', '', 'newest']
const MINE_KEY = ['research', 'mine', 'me', 'all', '', 'newest']
const SAVED_KEY = ['research', 'saved']

const POST = { id: 'p1', title: 'Cardio Study', user_id: 'other', upvotes_count: 5, comments_count: 2, helped_count: 0, user_vote: 0, is_bookmarked: false, created_at: '2025-01-01' }
const MINE_POST = { ...POST, id: 'm1', title: 'My Paper', user_id: 'me' }

function seedDiscover(overrides = {}) {
  h.queryResults.set(JSON.stringify(DISCOVER_KEY), {
    data: { posts: [POST], hasMore: false },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  })
  h.apiGetSpy.mockImplementation((url) => {
    if (url.startsWith('/research?')) return Promise.resolve({ posts: [POST], hasMore: false })
    if (url.startsWith('/research/')) return Promise.resolve({ ...POST, comments: [], tags: [] })
    return Promise.resolve({})
  })
}

function seedMine(overrides = {}) {
  h.queryResults.set(JSON.stringify(MINE_KEY), {
    data: { posts: [MINE_POST], hasMore: false },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  })
  h.apiGetSpy.mockImplementation((url) => {
    if (url.includes('user_id=')) return Promise.resolve({ posts: [MINE_POST], hasMore: false })
    if (url.startsWith('/research/')) return Promise.resolve({ ...MINE_POST, comments: [], tags: [] })
    return Promise.resolve({})
  })
}

function seedSaved(overrides = {}) {
  h.queryResults.set(JSON.stringify(SAVED_KEY), {
    data: { bookmarks: [{ ...POST, id: 's1', title: 'Saved Post' }] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  })
  h.apiGetSpy.mockImplementation((url) => {
    if (url === '/research/bookmarks') return Promise.resolve({ bookmarks: [{ ...POST, id: 's1', title: 'Saved Post' }] })
    return Promise.resolve({})
  })
}

function Controls({ onReady }) {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => { onReady({ navigate, location }) }, [navigate, location, onReady])
  return null
}

function renderHub(initialPath, { initialEntries, initialIndex } = {}) {
  const controls = { navigate: null, location: null }
  const utils = render(
    <LayerProvider>
      <MemoryRouter initialEntries={initialEntries || [initialPath]} initialIndex={initialIndex}>
        <Routes>
          <Route path="/research" element={<ResearchHub />} />
          <Route path="*" element={<ResearchHub />} />
        </Routes>
        <Controls onReady={c => { controls.navigate = c.navigate; controls.location = c.location }} />
      </MemoryRouter>
    </LayerProvider>
  )
  return { controls, unmount: utils.unmount }
}

beforeEach(() => {
  h.queryResults.clear()
  h.mockUseQuery.mockClear()
  h.mockUseMutation.mockClear()
  h.invalidateQueries.mockClear()
  h.cancelQueries.mockClear()
  h.setQueryData.mockClear()
  h.getQueryData.mockClear()
  h.mutations.length = 0
  h.apiGetSpy.mockReset()
  h.apiPostSpy.mockReset()
  h.apiDeleteSpy.mockReset()
  seedDiscover()
})

describe('ResearchHub URL tab contract (phase 7e)', () => {
  it('defaults to Discover on a clean URL', () => {
    renderHub('/research')
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'My Posts' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Saved' })).toHaveAttribute('aria-selected', 'false')
  })

  it('derives the active tab synchronously from the URL on first render', () => {
    renderHub('/research?tab=mine')
    expect(screen.getByRole('tab', { name: 'My Posts' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'false')
  })

  it('deep-links ?tab=saved to the Saved tab', () => {
    seedSaved()
    renderHub('/research?tab=saved')
    expect(screen.getByRole('tab', { name: 'Saved' })).toHaveAttribute('aria-selected', 'true')
  })

  it('canonicalizes an invalid tab to a clean URL using replace', async () => {
    seedDiscover()
    const { controls } = renderHub('/research?tab=bogus', {
      initialEntries: ['/', '/research?tab=bogus'],
      initialIndex: 1,
    })
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(controls.location.search).toBe(''))
  })

  it('canonicalizes an explicit ?tab=discover to a clean URL', async () => {
    seedDiscover()
    const { controls } = renderHub('/research?tab=discover')
    await waitFor(() => expect(controls.location.search).toBe(''))
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
  })

  it('preserves unrelated query params while canonicalizing an invalid tab', async () => {
    seedDiscover()
    const { controls } = renderHub('/research?sort=top&tab=bogus')
    await waitFor(() => expect(controls.location.search).toBe('?sort=top'))
  })

  it('removes ?tab when clicking the default Discover tab', async () => {
    seedDiscover()
    const { controls } = renderHub('/research?tab=saved')
    seedSaved()
    fireEvent.click(screen.getByRole('tab', { name: 'Discover' }))
    await waitFor(() => expect(controls.location.search).toBe(''))
  })
})

describe('ResearchHub history and back/forward (phase 7e)', () => {
  it('pushes ?tab on user clicks so back walks through the tabs', async () => {
    seedDiscover()
    seedSaved()
    const { controls } = renderHub('/research')
    fireEvent.click(screen.getByRole('tab', { name: 'Saved' }))
    await waitFor(() => expect(controls.location.search).toBe('?tab=saved'))
    act(() => { controls.navigate(-1) })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true'))
    expect(controls.location.search).toBe('')
  })

  it('restores a tab when going forward', async () => {
    seedDiscover()
    seedMine()
    const { controls } = renderHub('/research')
    fireEvent.click(screen.getByRole('tab', { name: 'My Posts' }))
    await waitFor(() => expect(controls.location.search).toBe('?tab=mine'))
    act(() => { controls.navigate(-1) })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true'))
    act(() => { controls.navigate(1) })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'My Posts' })).toHaveAttribute('aria-selected', 'true'))
    expect(controls.location.search).toBe('?tab=mine')
  })
})

describe('ResearchHub tab content (phase 7e)', () => {
  it('Discover tab shows post cards when data is loaded', () => {
    seedDiscover()
    renderHub('/research')
    expect(screen.getAllByTestId('research-post-card')).toHaveLength(1)
  })

  it('Discover tab shows empty state when no posts', () => {
    seedDiscover({ data: { posts: [], hasMore: false } })
    renderHub('/research')
    expect(screen.getByText(/No research posts yet/)).toBeInTheDocument()
  })

  it('My Posts tab shows sign-in prompt for logged-in users with empty state', () => {
    seedDiscover()
    seedMine({ data: { posts: [], hasMore: false } })
    renderHub('/research?tab=mine')
    expect(screen.getByText(/haven't shared any research yet/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /share research/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('Saved tab shows sign-in prompt for logged-in users with empty state', () => {
    seedDiscover()
    seedSaved({ data: { bookmarks: [] } })
    renderHub('/research?tab=saved')
    expect(screen.getByText(/haven't saved any research posts yet/i)).toBeInTheDocument()
  })

  it('Saved adapter passes through authoritative reputation and user_vote from API', () => {
    const savedWithVote = {
      id: 's-voted',
      title: 'Saved with Vote',
      user_id: 'other',
      reputation: 42,
      user_vote: 1,
      upvotes_count: 5,
      comments_count: 2,
      helped_count: 0,
      is_bookmarked: false,
      created_at: '2025-01-01',
    }
    seedDiscover()
    seedSaved({ data: { bookmarks: [savedWithVote] } })
    renderHub('/research?tab=saved')
    const card = screen.getByTestId('research-post-card')
    expect(card).toHaveAttribute('data-post-id', 's-voted')
  })

  it('Saved adapter does not overwrite reputation or user_vote when absent', () => {
    const savedNoFields = {
      id: 's-raw',
      title: 'Raw Saved',
      user_id: 'other',
      upvotes_count: 3,
      comments_count: 1,
      helped_count: 0,
      created_at: '2025-01-02',
      // reputation and user_vote intentionally absent
    }
    seedDiscover()
    seedSaved({ data: { bookmarks: [savedNoFields] } })
    renderHub('/research?tab=saved')
    const card = screen.getByTestId('research-post-card')
    expect(card).toHaveAttribute('data-post-id', 's-raw')
  })
})

describe('ResearchHub query key separation (phase 7e)', () => {
  it('uses different query keys for Discover vs My Posts', () => {
    seedDiscover()
    seedMine()
    renderHub('/research')
    const keys = h.mockUseQuery.mock.calls.map((c) => c[0].queryKey)
    const hasDiscover = keys.some((k) => k[1] === 'discover')
    const hasMine = keys.some((k) => k[1] === 'mine')
    expect(hasDiscover).toBe(true)
    expect(hasMine).toBe(true)
  })

  it('My Posts query is disabled when tab is not mine', () => {
    seedDiscover()
    renderHub('/research')
    const mineCall = h.mockUseQuery.mock.calls.find((c) => c[0].queryKey?.[1] === 'mine')
    expect(mineCall).toBeDefined()
    expect(mineCall[0].enabled).toBe(false)
  })
})

describe('ResearchHub accessibility (phase 7e)', () => {
  it('exposes a labelled tablist with tabs', () => {
    seedDiscover()
    renderHub('/research')
    expect(screen.getByRole('tablist', { name: 'Research sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'My Posts' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Saved' })).toHaveAttribute('aria-selected', 'false')
  })

  it('search input has an accessible label', () => {
    seedDiscover()
    renderHub('/research')
    expect(screen.getByRole('textbox', { name: 'Search research posts' })).toBeInTheDocument()
  })
})

describe('ResearchHub regression (phase 7e)', () => {
  it('CTA button says "Share Research" not "New Project"', () => {
    seedDiscover()
    renderHub('/research')
    expect(screen.getByRole('button', { name: /share research/i })).toBeInTheDocument()
    expect(screen.queryByText(/new project/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/create project/i)).not.toBeInTheDocument()
  })

  it('has no hardcoded z-index in ResearchHub.module.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/pages/ResearchHub.module.css'), 'utf8')
    const matches = css.match(/z-index\s*:\s*(?!var\()[0-9]+/g)
    expect(matches).toBeNull()
  })

  it('has no hardcoded z-index in ResearchPostCard.module.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/research/ResearchPostCard.module.css'), 'utf8')
    const matches = css.match(/z-index\s*:\s*(?!var\()[0-9]+/g)
    expect(matches).toBeNull()
  })

  it('ResearchHub JSX source contains no "Project" or "Opportunity" labels', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/ResearchHub.jsx'), 'utf8')
    expect(source).not.toMatch(/['"](New |Create )?(Project|Opportunity)['"]?/i)
  })

  it('has no card layout styles in ResearchHub.module.css (cards are shared component)', () => {
    const css = readFileSync(join(process.cwd(), 'src/pages/ResearchHub.module.css'), 'utf8')
    expect(css).not.toMatch(/\.postCard\b/)
  })
})
