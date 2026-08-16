// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { LayerProvider } from '../../context/LayerContext'
import CommunityHub from '../CommunityHub'
import CommunityDetail from '../CommunityDetail'
import People from '../People'
import Leaderboard from '../Leaderboard'

const h = vi.hoisted(() => {
  const mockUseQuery = vi.fn()
  const mockUseMutation = vi.fn()
  const mockUseQueryClient = vi.fn()
  const mockMutate = vi.fn()
  const queryResults = new Map()

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
    queryResults,
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.mockUseQuery,
  useMutation: h.mockUseMutation,
  useQueryClient: h.mockUseQueryClient,
}))

vi.mock('../People', () => ({
  default: (props) => <div data-testid="people-screen">People embedded={String(Boolean(props.embedded))}</div>,
}))

vi.mock('../Leaderboard', () => ({
  default: (props) => <div data-testid="leaderboard-screen">Leaderboard embedded={String(Boolean(props.embedded))}</div>,
}))

vi.mock('../CommunityDetail', () => ({
  default: () => <div data-testid="community-detail">Community detail</div>,
}))

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  imageUrl: (u) => u || null,
  joinApiPath: (b, p) => p,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))

vi.mock('@radix-ui/react-visually-hidden', () => {
  const VisuallyHidden = ({ children, ...rest }) => (
    <span style={{ position: 'absolute', clip: 'rect(0 0 0 0)' }} {...rest}>{children}</span>
  )
  return { default: VisuallyHidden, VisuallyHidden }
})

const LIST_KEY = ['communities', 'list', 'members', '', 'all']

function seed(key, result) {
  h.queryResults.set(JSON.stringify(key), result)
}

function seedEmptyList() {
  seed(LIST_KEY, {
    data: { communities: [], mine: [], categories: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })
}

function HubRoutes() {
  return (
    <Routes>
      <Route path="/communities" element={<CommunityHub />} />
      <Route path="/communities/mine" element={<CommunityHub />} />
      <Route path="/communities/discover" element={<CommunityHub />} />
      <Route path="/communities/people" element={<CommunityHub />} />
      <Route path="/communities/leaderboard" element={<CommunityHub />} />
      <Route path="/communities/:id" element={<CommunityDetail />} />
      <Route path="/people" element={<People />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
    </Routes>
  )
}

function Controls({ onReady }) {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    onReady({ navigate, location })
  }, [navigate, location, onReady])
  return null
}

function renderHub(initialPath) {
  const controls = { navigate: null, location: null }
  const utils = render(
    <LayerProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <HubRoutes />
        <Controls onReady={c => {
          controls.navigate = c.navigate
          controls.location = c.location
        }} />
      </MemoryRouter>
    </LayerProvider>
  )
  return { controls, unmount: utils.unmount }
}

describe('CommunityHub routing (phase 7c)', () => {
  beforeEach(() => {
    h.queryResults.clear()
    h.mockMutate.mockClear()
    h.mockUseQuery.mockClear()
  })

  it('renders a single Community hub with one h1 and all five tabs, Overview selected by default', () => {
    seedEmptyList()
    renderHub('/communities')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Community' })).toBeInTheDocument()

    const tablist = screen.getByRole('tablist', { name: 'Community sections' })
    expect(tablist).toBeInTheDocument()

    for (const name of ['Overview', 'My Communities', 'Discover', 'People', 'Leaderboard']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'My Communities' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Explore' })).toBeInTheDocument()
  })

  it('selects the My Communities tab on /communities/mine', () => {
    seedEmptyList()
    renderHub('/communities/mine')

    expect(screen.getByRole('tab', { name: 'My Communities' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText("You haven't joined any communities yet")).toBeInTheDocument()
    expect(screen.queryByTestId('community-detail')).not.toBeInTheDocument()
  })

  it('selects the Discover tab on /communities/discover', () => {
    seedEmptyList()
    renderHub('/communities/discover')

    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: /search public communities/i })).toBeInTheDocument()
    expect(screen.queryByTestId('community-detail')).not.toBeInTheDocument()
  })

  it('selects the People tab on /communities/people and embeds the shared People screen', async () => {
    seedEmptyList()
    renderHub('/communities/people')

    expect(screen.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true')
    const screenEl = await screen.findByTestId('people-screen')
    expect(screenEl.textContent).toBe('People embedded=true')
    expect(screen.queryByTestId('community-detail')).not.toBeInTheDocument()
  })

  it('selects the Leaderboard tab on /communities/leaderboard and embeds the shared Leaderboard screen', async () => {
    seedEmptyList()
    renderHub('/communities/leaderboard')

    expect(screen.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('aria-selected', 'true')
    const screenEl = await screen.findByTestId('leaderboard-screen')
    expect(screenEl.textContent).toBe('Leaderboard embedded=true')
    expect(screen.queryByTestId('community-detail')).not.toBeInTheDocument()
  })

  it('never treats the static subroutes as community ids', async () => {
    for (const path of ['/communities/mine', '/communities/discover', '/communities/people', '/communities/leaderboard']) {
      const { unmount } = renderHub(path)
      expect(screen.queryByTestId('community-detail')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('still routes /communities/<uuid> to CommunityDetail', async () => {
    seedEmptyList()
    const uuid = '123e4567-e89b-12d3-a456-426614174000'
    renderHub(`/communities/${uuid}`)

    await screen.findByTestId('community-detail')
    expect(screen.queryByRole('tablist', { name: 'Community sections' })).not.toBeInTheDocument()
  })

  it('keeps /people and /leaderboard standalone (not embedded)', async () => {
    seedEmptyList()
    renderHub('/people')
    const peopleEl = await screen.findByTestId('people-screen')
    expect(peopleEl.textContent).toBe('People embedded=false')
  })

  it('keeps /leaderboard standalone (not embedded)', async () => {
    seedEmptyList()
    renderHub('/leaderboard')
    const lbEl = await screen.findByTestId('leaderboard-screen')
    expect(lbEl.textContent).toBe('Leaderboard embedded=false')
  })

  it('navigates to the matching static route when a tab is clicked and updates selection', async () => {
    seedEmptyList()
    const { controls } = renderHub('/communities')

    fireEvent.click(screen.getByRole('tab', { name: 'Discover' }))
    await waitFor(() => expect(controls.location.pathname).toBe('/communities/discover'))
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'My Communities' }))
    await waitFor(() => expect(controls.location.pathname).toBe('/communities/mine'))
    expect(screen.getByRole('tab', { name: 'My Communities' })).toHaveAttribute('aria-selected', 'true')
  })

  it('derives the active tab from the pathname so back/forward restore works', async () => {
    seedEmptyList()
    const { controls } = renderHub('/communities/mine')

    expect(screen.getByRole('tab', { name: 'My Communities' })).toHaveAttribute('aria-selected', 'true')

    act(() => { controls.navigate('/communities/leaderboard') })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('aria-selected', 'true'))

    act(() => { controls.navigate(-1) })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'My Communities' })).toHaveAttribute('aria-selected', 'true'))
  })

  it('shows an honest summary and shortcuts on Overview with no fabricated statistics', () => {
    seed(LIST_KEY, {
      data: {
        communities: [],
        mine: [
          { id: 'c1', name: 'Cardio Club', description: 'Cardiology study group', visibility: 'public', member_count: 12, category: 'clinical' },
          { id: 'c2', name: 'Neuro Group', description: 'Neuro study group', visibility: 'private', member_count: 8, category: 'anatomy' },
        ],
        categories: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    renderHub('/communities')

    expect(screen.getByText('You belong to 2 communities.')).toBeInTheDocument()
    expect(screen.getByText('Cardio Club')).toBeInTheDocument()
    expect(screen.getByText('Neuro Group')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /Discover/ })).toHaveAttribute('href', '/communities/discover')
    expect(screen.getByRole('link', { name: /People/ })).toHaveAttribute('href', '/communities/people')
    expect(screen.getByRole('link', { name: /Leaderboard/ })).toHaveAttribute('href', '/communities/leaderboard')
  })

  it('shows an Overview empty state with a Discover action when the user has no communities', async () => {
    seedEmptyList()
    const { controls } = renderHub('/communities')

    expect(screen.getByText("You haven't joined any communities yet.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Discover communities' }))
    await waitFor(() => expect(controls.location.pathname).toBe('/communities/discover'))
  })

  it('lists the user communities on the My Communities tab and opens the detail', async () => {
    seed(LIST_KEY, {
      data: {
        communities: [],
        mine: [{ id: 'c1', name: 'Cardio Club', description: 'Cardiology study group', visibility: 'public', member_count: 12 }],
        categories: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const { controls } = renderHub('/communities/mine')

    expect(screen.getByRole('heading', { name: 'Your Communities' })).toBeInTheDocument()
    expect(screen.getByText('Cardio Club')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /Cardio Club/ }))
    await waitFor(() => expect(controls.location.pathname).toBe('/communities/c1'))
    await screen.findByTestId('community-detail')
  })

  it('offers an empty state with a Discover action on the My Communities tab', async () => {
    seedEmptyList()
    const { controls } = renderHub('/communities/mine')

    fireEvent.click(screen.getByRole('button', { name: /Discover communities/ }))
    await waitFor(() => expect(controls.location.pathname).toBe('/communities/discover'))
  })

  it('preserves the Discover search and filter state through the shared query key', () => {
    seedEmptyList()
    renderHub('/communities/discover')

    expect(screen.getByRole('heading', { name: 'Discover Communities' })).toBeInTheDocument()
    const search = screen.getByRole('textbox', { name: /search public communities/i })
    fireEvent.change(search, { target: { value: 'cardio' } })

    const calls = h.mockUseQuery.mock.calls
    expect(calls.some(([opts]) => JSON.stringify(opts.queryKey) === JSON.stringify(['communities', 'list', 'members', 'cardio', 'all']))).toBe(true)
  })

  it('shows the Discover empty state and opens the create modal', () => {
    seedEmptyList()
    renderHub('/communities/discover')

    expect(screen.getByText('No communities found')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create the first community' }))
    expect(screen.getByRole('heading', { name: 'Create Community' })).toBeInTheDocument()
  })

  it('consumes ?invite=CODE on /communities and clears the param', async () => {
    seedEmptyList()
    const { controls } = renderHub('/communities?invite=CODE')

    expect(h.mockMutate).toHaveBeenCalledWith('CODE')
    expect(screen.getByRole('textbox', { name: /enter invite code/i })).toHaveValue('CODE')
    await waitFor(() => {
      expect(new URLSearchParams(controls.location.search).has('invite')).toBe(false)
    })
  })

  it('renders QueryErrorState on list failure and retries', () => {
    const mockRefetch = vi.fn()
    seed(LIST_KEY, {
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
      refetch: mockRefetch,
    })
    renderHub('/communities')

    expect(screen.getByTestId('query-error-state')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('query-error-retry'))
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('renders RefetchWarning while keeping stale list content', () => {
    seed(LIST_KEY, {
      data: { communities: [], mine: [{ id: 'c1', name: 'Cardio Club', description: 'Cardiology', visibility: 'public', member_count: 12 }], categories: [] },
      isLoading: false,
      error: new Error('stale'),
      refetch: vi.fn(),
    })
    renderHub('/communities')

    expect(screen.getByTestId('refetch-warning')).toBeInTheDocument()
    expect(screen.getByText('Cardio Club')).toBeInTheDocument()
  })

  it('shows the loading state while the list query is pending', () => {
    seed(LIST_KEY, {
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })
    renderHub('/communities')

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('exposes a labelled tablist, roving tabindex, and a single h1', () => {
    seedEmptyList()
    renderHub('/communities')

    expect(screen.getByRole('tablist', { name: 'Community sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'My Communities' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('supports arrow-key navigation and activation through the shared Tabs', async () => {
    seedEmptyList()
    const { controls } = renderHub('/communities')

    const overview = screen.getByRole('tab', { name: 'Overview' })
    overview.focus()
    fireEvent.keyDown(overview, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'My Communities' })).toHaveFocus()

    const mine = screen.getByRole('tab', { name: 'My Communities' })
    fireEvent.keyDown(mine, { key: ' ' })
    await waitFor(() => expect(controls.location.pathname).toBe('/communities/mine'))
  })
})

describe('CommunityHub responsive CSS (phase 7c)', () => {
  it('keeps the tab row horizontally scrollable instead of overflowing the page', () => {
    const css = readFileSync(join(process.cwd(), 'src/pages/CommunityHub.module.css'), 'utf8')
    expect(css).toMatch(/\.tabList\s*\{[^}]*overflow-x:\s*auto/)
    expect(css).toMatch(/\.tab\s*\{[^}]*flex:\s*0\s*0\s*auto/)
  })

  it('wraps cards and collapses the grid on small screens without page-level overflow', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/community/communityPanels.module.css'), 'utf8')
    expect(css).toMatch(/\.grid\s*\{[^}]*repeat\(auto-fill,\s*minmax\(260px,\s*1fr\)/)
    expect(css).toMatch(/@media[\s\S]*?\.grid\s*\{\s*grid-template-columns:\s*1fr;\s*\}/)
  })
})

describe('Community deep-link routing (phase 7d)', () => {
  it('keeps /communities/<uuid>?tab=voice on the CommunityDetail screen', async () => {
    seedEmptyList()
    renderHub('/communities/9a7c44e5-8f3b-4f1a-9b3c-2e8d1a5f6c2d?tab=voice')
    expect(await screen.findByTestId('community-detail')).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Community sections' })).not.toBeInTheDocument()
  })

  it('keeps /communities/mine?tab=leaderboard on the Community hub', () => {
    seedEmptyList()
    renderHub('/communities/mine?tab=leaderboard')
    expect(screen.queryByTestId('community-detail')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'My Communities' })).toHaveAttribute('aria-selected', 'true')
  })
})
