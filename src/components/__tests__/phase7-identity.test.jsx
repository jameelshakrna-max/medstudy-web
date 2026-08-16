// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import ProfilePanel from '../ProfilePanel'
import UserCard from '../UserCard'

const h = vi.hoisted(() => {
  const mockUseQuery = vi.fn()
  const mockUseMutation = vi.fn()
  const mockUseQueryClient = vi.fn()
  const mockMutate = vi.fn()
  const mockNavigate = vi.fn()
  const mockApiGet = vi.fn()
  const mockApiPost = vi.fn()
  const mockApiDelete = vi.fn()
  const mockOpenProfile = vi.fn()
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
    mockNavigate,
    mockApiGet,
    mockApiPost,
    mockApiDelete,
    mockOpenProfile,
    queryResults,
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.mockUseQuery,
  useMutation: h.mockUseMutation,
  useQueryClient: h.mockUseQueryClient,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => h.mockNavigate,
}))

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

vi.mock('react-swipeable', () => ({
  useSwipeable: () => ({}),
}))

vi.mock('lucide-react', () => {
  const NullIcon = () => null
  const icons = [
    'UserPlus', 'UserMinus', 'MessageCircle', 'Link', 'ArrowRight', 'Crown', 'Shield', 'AlertCircle',
  ]
  return Object.fromEntries(icons.map((name) => [name, NullIcon]))
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}))

vi.mock('../../context/ProfilePanelContext', () => ({
  useProfilePanel: () => ({
    panelState: { open: true, userId: 'u1' },
    closeProfile: vi.fn(),
    openProfile: h.mockOpenProfile,
    preloadProfile: vi.fn(),
    cancelPreload: vi.fn(),
  }),
}))

vi.mock('../../lib/api', () => ({
  apiGet: h.mockApiGet,
  apiPost: h.mockApiPost,
  apiDelete: h.mockApiDelete,
  apiPut: vi.fn(),
  imageUrl: (u) => u || null,
  joinApiPath: (b, p) => p,
}))

vi.mock('../../lib/queryKeys', () => ({
  queryKeys: {
    profile: {
      detail: (id) => ['profile', 'detail', id],
      achievements: (id) => ['profile', 'achievements', id],
    },
    follow: {
      status: (id) => ['follow', 'status', id],
    },
  },
}))

vi.mock('../../lib/socialInvalidation', () => ({
  invalidateUserRelationshipQueries: vi.fn(),
}))

vi.mock('../ui/Drawer/Drawer', () => ({
  default: ({ open, children }) => (open ? <div data-testid="drawer">{children}</div> : null),
}))

vi.mock('../ui/Dropdown/Dropdown', () => {
  const Trigger = ({ children }) => <>{children}</>
  const Content = ({ children }) => <div data-testid="dropdown-content">{children}</div>
  const Item = ({ children, onSelect }) => (
    <button onClick={() => onSelect?.()}>{children}</button>
  )
  const Label = ({ children }) => <div>{children}</div>
  const Dropdown = ({ children }) => <>{children}</>
  Dropdown.Trigger = Trigger
  Dropdown.Content = Content
  Dropdown.Item = Item
  Dropdown.Label = Label
  return { default: Dropdown }
})

vi.mock('../profile/Skeleton', () => ({
  default: () => null,
  ProfilePanelSkeleton: () => <div data-testid="profile-panel-skeleton" />,
}))

vi.mock('../ui/Popover/Popover', () => {
  const Anchor = ({ asChild, children }) => (asChild ? <>{children}</> : <span>{children}</span>)
  const Content = ({ children }) => <div data-testid="popover-content">{children}</div>
  const Popover = ({ open, children }) => {
    const nodes = Array.isArray(children) ? children : [children]
    return open ? nodes : nodes.filter((child) => child?.type !== Content)
  }
  Popover.Anchor = Anchor
  Popover.Content = Content
  return { default: Popover }
})

const PROFILE_KEY = ['profile', 'detail', 'u1']
const FOLLOW_KEY = ['follow', 'status', 'u1']
const ACHIEVEMENTS_KEY = ['profile', 'achievements', 'u1']

function seed(key, result) {
  h.queryResults.set(JSON.stringify(key), result)
}

function renderProfile() {
  return render(<ProfilePanel />)
}

describe('ProfilePanel (phase 7)', () => {
  beforeEach(() => {
    h.queryResults.clear()
    h.mockMutate.mockClear()
    h.mockApiGet.mockReset()
    h.mockApiPost.mockReset()
    h.mockApiDelete.mockReset()
    h.mockApiGet.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const profile = {
    id: 'u1',
    display_name: 'Ann',
    user_name: 'ann',
    username: 'ann',
    bio: 'hi',
    stats: { study_hours: 10, current_streak: 2, followers_count: 5, following_count: 3, communities_count: 1 },
  }

  it('shows the loading skeleton while the profile query has no data yet', () => {
    renderProfile()
    expect(screen.getByTestId('profile-panel-skeleton')).toBeInTheDocument()
  })

  it('renders QueryErrorState when the profile fails to load', () => {
    const mockRefetch = vi.fn()
    seed(PROFILE_KEY, { data: undefined, isLoading: false, error: new Error('boom'), refetch: mockRefetch })
    renderProfile()

    expect(screen.getByTestId('query-error-state')).toBeInTheDocument()
    expect(screen.getByText('This profile could not be loaded.')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('query-error-retry'))
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('unfollows via DELETE when already following', () => {
    seed(PROFILE_KEY, { data: profile, isLoading: false, error: null, refetch: vi.fn() })
    seed(FOLLOW_KEY, { data: { following: true }, isLoading: false, error: null, refetch: vi.fn() })
    seed(ACHIEVEMENTS_KEY, { data: [], isLoading: false, error: null, refetch: vi.fn() })
    renderProfile()

    const followBtn = screen.getByRole('button', { name: /following/i })
    expect(followBtn).toBeInTheDocument()

    fireEvent.click(followBtn)

    expect(h.mockMutate).toHaveBeenCalled()
    expect(h.mockApiDelete).toHaveBeenCalledWith('/users/u1/follow')
    expect(h.mockApiPost).not.toHaveBeenCalledWith('/users/u1/follow')
  })
})

describe('UserCard (phase 7)', () => {
  beforeEach(() => {
    h.mockMutate.mockClear()
    h.mockApiGet.mockReset()
    h.mockApiPost.mockReset()
    h.mockApiDelete.mockReset()
    h.mockOpenProfile.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const cardData = {
    username: 'ann',
    display_name: 'Ann',
    status: 'online',
    is_following: false,
    bio: 'Med student',
    study_hours: 4,
    followers_count: 10,
    communities_count: 2,
    reputation: 99,
  }

  it('opens the profile when the anchor is activated with Enter', () => {
    h.mockApiGet.mockResolvedValue(cardData)
    render(<UserCard userId="u1"><span>ann</span></UserCard>)

    const anchor = screen.getByRole('button', { name: 'View user profile' })
    fireEvent.keyDown(anchor, { key: 'Enter' })
    expect(h.mockOpenProfile).toHaveBeenCalledWith('u1')
  })

  it('fetches the card on hover and posts a follow from the Follow action', async () => {
    vi.useFakeTimers()
    h.mockApiGet.mockResolvedValue(cardData)
    render(<UserCard userId="u1"><span>ann</span></UserCard>)

    const anchor = screen.getByRole('button', { name: 'View user profile' })
    fireEvent.mouseEnter(anchor)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    await act(async () => {})

    expect(h.mockApiGet).toHaveBeenCalledWith('/users/u1/card')

    const followBtn = screen.getByRole('button', { name: 'Follow' })
    fireEvent.click(followBtn)
    await act(async () => {})

    expect(h.mockApiPost).toHaveBeenCalledWith('/users/u1/follow')
    expect(screen.getByRole('button', { name: 'Unfollow' })).toBeInTheDocument()
  })
})
