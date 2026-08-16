// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { LayerProvider } from '../../context/LayerContext'
import CommunityDetail from '../CommunityDetail'

const h = vi.hoisted(() => {
  const mockUseQuery = vi.fn()
  const mockUseQueryClient = vi.fn()
  const invalidateQueries = vi.fn()
  const setQueryData = vi.fn()
  const queryResults = new Map()
  const mockRealtime = {
    messages: [],
    loading: false,
    connected: true,
    competitions: [],
    pins: [],
    announcements: [],
    hasMore: false,
    setActive: vi.fn(),
    sendMessage: vi.fn(),
    sendFlashcard: vi.fn(),
    deleteMessage: vi.fn(),
    fetchNewMessages: vi.fn(),
    loadMore: vi.fn(),
  }
  return {
    mockUseQuery,
    mockUseQueryClient,
    invalidateQueries,
    setQueryData,
    queryResults,
    mockRealtime,
    realtimeCalls: 0,
    voiceMounts: 0,
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: h.mockUseQuery,
  useQueryClient: h.mockUseQueryClient,
}))

h.mockUseQuery.mockImplementation((opts = {}) =>
  h.queryResults.get(JSON.stringify(opts.queryKey)) || {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }
)

h.mockUseQueryClient.mockReturnValue({
  invalidateQueries: h.invalidateQueries,
  setQueryData: h.setQueryData,
})

vi.mock('../../hooks/useCommunityRealtime', () => ({
  useCommunityRealtime: () => {
    h.realtimeCalls += 1
    return h.mockRealtime
  },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'me@test.com' } }),
}))

vi.mock('../../context/ProfilePanelContext', () => ({
  useProfilePanel: () => ({ openProfile: vi.fn() }),
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
  apiJson: vi.fn().mockResolvedValue({ success: true }),
  formatDate: () => 'Jan 1',
  imageUrl: (u) => u || null,
}))

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ itemContent, totalCount = 0, style }) => (
    <div data-testid="virtuoso" style={style}>
      {Array.from({ length: totalCount }).map((_, i) => (
        <div key={i}>{itemContent(i)}</div>
      ))}
    </div>
  ),
}))

vi.mock('@radix-ui/react-visually-hidden', () => {
  const VisuallyHidden = ({ children, ...rest }) => (
    <span style={{ position: 'absolute', clip: 'rect(0 0 0 0)' }} {...rest}>{children}</span>
  )
  return { default: VisuallyHidden, VisuallyHidden }
})

vi.mock('../../components/community/LeaderboardTab', () => ({ default: () => <div data-testid="tab-leaderboard">Leaderboard</div> }))
vi.mock('../../components/community/CompetitionsTab', () => ({ default: () => <div data-testid="tab-competitions">Competitions</div> }))
vi.mock('../../components/community/SettingsTab', () => ({ default: () => <div data-testid="tab-settings">Settings</div> }))
vi.mock('../../components/community/ModDashboardTab', () => ({ default: () => <div data-testid="tab-mod">Mod</div> }))
vi.mock('../../components/community/AnnouncementsTab', () => ({ default: () => <div data-testid="tab-announcements">Announcements</div> }))
vi.mock('../../components/community/HallOfFameTab', () => ({ default: () => <div data-testid="tab-hof">Hall</div> }))
vi.mock('../../components/community/CalendarHeatmap.jsx', () => ({ default: () => <div data-testid="tab-stats">Stats</div> }))
vi.mock('../../components/community/VoiceRooms', () => ({
  default: () => {
    h.voiceMounts += 1
    return <div data-testid="tab-voice">Voice</div>
  },
}))

vi.mock('../../components/FlashcardShareModal', () => ({ default: () => null }))
vi.mock('../../components/MentionText', () => ({ default: ({ text }) => <span>{text}</span> }))
vi.mock('../../components/MentionInput', () => ({
  default: (props) => (
    <input
      aria-label="Message input"
      placeholder={props.placeholder}
      onChange={(e) => props.onChange?.(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') props.onSubmit?.() }}
    />
  ),
}))
vi.mock('../../components/UserCard', () => ({ default: ({ children }) => <span>{children}</span> }))
vi.mock('../../components/ui/UserLink/UserLink', () => ({ default: () => null }))

const DETAIL_KEY = ['communities', 'detail', 'c1']

const TAB_LABELS = {
  chat: 'Chat',
  leaderboard: 'Leaderboard',
  competitions: 'Competitions',
  voice: 'Voice',
  stats: 'Stats',
  'hall-of-fame': 'Hall of Fame',
  settings: 'Settings',
  mod: 'Mod Dashboard',
}

const TAB_TEST_IDS = {
  leaderboard: 'tab-leaderboard',
  competitions: 'tab-competitions',
  voice: 'tab-voice',
  stats: 'tab-stats',
  'hall-of-fame': 'tab-hof',
  settings: 'tab-settings',
}

function seedDetail({ role = null, overrides = {} } = {}) {
  const members = role ? [{ user_id: 'me', role }] : []
  h.queryResults.set(JSON.stringify(DETAIL_KEY), {
    data: {
      community: { id: 'c1', name: 'Cardio Club', description: 'Cardiology study group', visibility: 'public', join_type: 'open', member_count: 5, invite_code: 'ABC' },
      members,
      rules: [],
      settings: {},
      bans: [],
      joinRequests: [],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  })
}

function DetailRoutes() {
  return (
    <Routes>
      <Route path="/communities" element={<div data-testid="hub-stub">Hub</div>} />
      <Route path="/communities/:id" element={<CommunityDetail />} />
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

function renderDetail(initialPath, { initialEntries, initialIndex } = {}) {
  const controls = { navigate: null, location: null }
  const utils = render(
    <LayerProvider>
      <MemoryRouter initialEntries={initialEntries || [initialPath]} initialIndex={initialIndex}>
        <DetailRoutes />
        <Controls onReady={c => { controls.navigate = c.navigate; controls.location = c.location }} />
      </MemoryRouter>
    </LayerProvider>
  )
  return { controls, unmount: utils.unmount }
}

beforeEach(() => {
  h.queryResults.clear()
  h.mockUseQuery.mockClear()
  h.mockRealtime.setActive.mockClear()
  h.invalidateQueries.mockClear()
  h.realtimeCalls = 0
  h.voiceMounts = 0
})

describe('CommunityDetail URL tab contract (phase 7d)', () => {
  it('defaults to the Chat tab on a clean URL', () => {
    seedDetail()
    renderDetail('/communities/c1')
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: 'Search messages' })).toBeInTheDocument()
  })

  it('derives the active tab synchronously from the URL on first render (no flash)', () => {
    seedDetail()
    renderDetail('/communities/c1?tab=leaderboard')
    expect(screen.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('textbox', { name: 'Search messages' })).not.toBeInTheDocument()
  })

  it.each(Object.entries(TAB_TEST_IDS))('deep links /communities/:id?tab=%s to its panel', (tab, testid) => {
    seedDetail()
    renderDetail(`/communities/c1?tab=${tab}`)
    expect(screen.getByRole('tab', { name: TAB_LABELS[tab] })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId(testid)).toBeInTheDocument()
  })

  it('canonicalizes an invalid tab to a clean URL using replace (no back pollution)', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1?tab=bogus', {
      initialEntries: ['/communities', '/communities/c1?tab=bogus'],
      initialIndex: 1,
    })
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(controls.location.search).toBe(''))
    act(() => { controls.navigate(-1) })
    await waitFor(() => expect(controls.location.pathname).toBe('/communities'))
    expect(screen.getByTestId('hub-stub')).toBeInTheDocument()
  })

  it('canonicalizes an explicit ?tab=chat to a clean URL', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1?tab=chat')
    await waitFor(() => expect(controls.location.search).toBe(''))
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
  })

  it('preserves unrelated query params while canonicalizing an invalid tab', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1?invite=K&tab=bogus')
    await waitFor(() => expect(controls.location.search).toBe('?invite=K'))
  })

  it('preserves unrelated query params when switching tabs', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1?invite=K&tab=voice')
    fireEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }))
    await waitFor(() => expect(controls.location.search).toBe('?invite=K&tab=leaderboard'))
  })

  it('removes ?tab when clicking the default Chat tab', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1?invite=K&tab=voice')
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    await waitFor(() => expect(controls.location.search).toBe('?invite=K'))
  })
})

describe('CommunityDetail history and back/forward (phase 7d)', () => {
  it('pushes ?tab on user clicks so back walks through the tabs', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1')
    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    await waitFor(() => expect(controls.location.search).toBe('?tab=voice'))
    act(() => { controls.navigate(-1) })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true'))
    expect(controls.location.search).toBe('')
  })

  it('restores a tab when going forward', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1')
    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    await waitFor(() => expect(controls.location.search).toBe('?tab=voice'))
    act(() => { controls.navigate(-1) })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true'))
    act(() => { controls.navigate(1) })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'true'))
    expect(controls.location.search).toBe('?tab=voice')
  })

  it('does not pollute back history with canonicalized invalid tabs', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1?tab=zzz', {
      initialEntries: ['/communities', '/communities/c1?tab=zzz'],
      initialIndex: 1,
    })
    await waitFor(() => expect(controls.location.search).toBe(''))
    act(() => { controls.navigate(-1) })
    await waitFor(() => expect(controls.location.pathname).toBe('/communities'))
  })

  it('preserves the deep-linked tab across a fresh mount (refresh)', () => {
    seedDetail()
    renderDetail('/communities/c1?tab=settings')
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('CommunityDetail chat setActive contract (phase 7d)', () => {
  it('activates chat by default on a clean URL', () => {
    seedDetail()
    renderDetail('/communities/c1')
    expect(h.mockRealtime.setActive).toHaveBeenCalledWith(true)
  })

  it('deactivates chat when a non-chat tab is opened via deep link', () => {
    seedDetail()
    renderDetail('/communities/c1?tab=voice')
    expect(h.mockRealtime.setActive).toHaveBeenCalledWith(false)
  })

  it('tracks activation across tab switches without duplicate transitions', () => {
    seedDetail()
    renderDetail('/communities/c1')
    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }))
    expect(h.mockRealtime.setActive.mock.calls).toEqual([[true], [false], [true], [false]])
  })

  it('does not re-call setActive when the active tab is clicked again', () => {
    seedDetail()
    renderDetail('/communities/c1')
    expect(h.mockRealtime.setActive).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    expect(h.mockRealtime.setActive).toHaveBeenCalledTimes(1)
  })

  it('activates chat exactly once for an invalid deep link', () => {
    seedDetail()
    renderDetail('/communities/c1?tab=bogus')
    expect(h.mockRealtime.setActive).toHaveBeenCalledTimes(1)
    expect(h.mockRealtime.setActive).toHaveBeenCalledWith(true)
  })

  it('restores chat activation when navigating back to the chat tab', () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1')
    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    expect(h.mockRealtime.setActive).toHaveBeenLastCalledWith(false)
    act(() => { controls.navigate(-1) })
    expect(h.mockRealtime.setActive).toHaveBeenLastCalledWith(true)
  })
})

describe('CommunityDetail permission-gated tabs (phase 7d)', () => {
  it('hides the Mod Dashboard tab for non-moderators', () => {
    seedDetail()
    renderDetail('/communities/c1')
    expect(screen.queryByRole('tab', { name: 'Mod Dashboard' })).not.toBeInTheDocument()
  })

  it('shows the Mod Dashboard tab for moderators', () => {
    seedDetail({ role: 'moderator' })
    renderDetail('/communities/c1')
    expect(screen.getByRole('tab', { name: 'Mod Dashboard' })).toBeInTheDocument()
  })

  it('opens the Mod Dashboard for a moderator via ?tab=mod', () => {
    seedDetail({ role: 'moderator' })
    const { controls } = renderDetail('/communities/c1?tab=mod')
    expect(screen.getByRole('tab', { name: 'Mod Dashboard' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tab-mod')).toBeInTheDocument()
    expect(controls.location.search).toBe('?tab=mod')
  })

  it('canonicalizes ?tab=mod away for non-moderators', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1?tab=mod')
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(controls.location.search).toBe(''))
    expect(screen.queryByTestId('tab-mod')).not.toBeInTheDocument()
  })

  it('does not refresh the detail query when switching to Mod Dashboard', () => {
    seedDetail({ role: 'moderator' })
    renderDetail('/communities/c1')
    fireEvent.click(screen.getByRole('tab', { name: 'Mod Dashboard' }))
    expect(h.invalidateQueries).not.toHaveBeenCalled()
  })

  it('refreshes the detail query when switching to a regular tab', () => {
    seedDetail()
    renderDetail('/communities/c1')
    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    expect(h.invalidateQueries).toHaveBeenCalled()
  })
})

describe('CommunityDetail accessibility (phase 7d)', () => {
  it('exposes a labelled tablist with tabs and roving tabindex', () => {
    seedDetail()
    renderDetail('/communities/c1')
    expect(screen.getByRole('tablist', { name: 'Community sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('tabindex', '-1')
  })

  it('supports arrow-key roving focus and space activation', async () => {
    seedDetail()
    const { controls } = renderDetail('/communities/c1')
    const chat = screen.getByRole('tab', { name: 'Chat' })
    chat.focus()
    fireEvent.keyDown(chat, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Leaderboard' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Leaderboard' }), { key: ' ' })
    await waitFor(() => expect(controls.location.search).toBe('?tab=leaderboard'))
    expect(screen.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('aria-selected', 'true')
  })

  it('hides inactive panels from the document and keeps a single h1', () => {
    seedDetail()
    renderDetail('/communities/c1?tab=voice')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('textbox', { name: 'Search messages' })).not.toBeInTheDocument()
  })
})

describe('CommunityDetail regression (phase 7d)', () => {
  it('renders the loading state without tabs while the query is pending', () => {
    seedDetail({ overrides: { isLoading: true } })
    renderDetail('/communities/c1')
    expect(screen.getByText('Loading community...')).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Community sections' })).not.toBeInTheDocument()
  })

  it('renders QueryErrorState without tabs on fetch failure', () => {
    seedDetail({ overrides: { error: new Error('boom') } })
    renderDetail('/communities/c1')
    expect(screen.getByTestId('query-error-state')).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Community sections' })).not.toBeInTheDocument()
  })

  it('keeps stale detail content visible across tab switches', () => {
    seedDetail()
    renderDetail('/communities/c1')
    expect(screen.getByText('Cardio Club')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    expect(screen.getByText('Cardio Club')).toBeInTheDocument()
    expect(h.invalidateQueries).toHaveBeenCalled()
  })

  it('mounts VoiceRooms only while the voice tab is active (mount/unmount contract)', async () => {
    seedDetail()
    renderDetail('/communities/c1')
    expect(screen.queryByTestId('tab-voice')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    expect(screen.getByTestId('tab-voice')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    await waitFor(() => expect(screen.queryByTestId('tab-voice')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }))
    expect(screen.getByTestId('tab-voice')).toBeInTheDocument()
    expect(h.voiceMounts).toBe(2)
  })

  it('keeps the realtime hook mounted regardless of the active tab', () => {
    seedDetail()
    renderDetail('/communities/c1?tab=settings')
    expect(h.realtimeCalls).toBeGreaterThanOrEqual(1)
  })

  it('has no hardcoded inline z-index in CommunityDetail', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/CommunityDetail.jsx'), 'utf8')
    expect(source).not.toMatch(/zIndex\s*:/)
  })

  it('has no hardcoded z-index values in CommunityDetail styles', () => {
    const css = readFileSync(join(process.cwd(), 'src/pages/CommunityDetail.module.css'), 'utf8')
    expect(css).not.toMatch(/z-index\s*:/)
  })

  it('keeps the tab row horizontally scrollable instead of overflowing the page', () => {
    const css = readFileSync(join(process.cwd(), 'src/pages/CommunityDetail.module.css'), 'utf8')
    expect(css).toMatch(/\.tabs\s*\{[^}]*overflow-x:\s*auto/)
  })

  it('hides tab labels on mobile to keep the tab row compact', () => {
    const css = readFileSync(join(process.cwd(), 'src/pages/CommunityDetail.module.css'), 'utf8')
    expect(css).toMatch(/@media[\s\S]*?\.tab\s*span\s*\{\s*display:\s*none;\s*\}/)
  })
})
