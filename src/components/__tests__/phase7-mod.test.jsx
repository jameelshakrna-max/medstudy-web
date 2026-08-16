// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import ModDashboardTab from '../community/ModDashboardTab'

const h = vi.hoisted(() => {
  const mockApiGet = vi.fn()
  const mockApiPut = vi.fn()
  const mockApiPost = vi.fn()
  const mockApiDelete = vi.fn()
  return { mockApiGet, mockApiPut, mockApiPost, mockApiDelete }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    cancelQueries: vi.fn(),
  }),
}))

vi.mock('../../context/ProfilePanelContext', () => ({
  useProfilePanel: () => ({
    openProfile: vi.fn(),
    preloadProfile: vi.fn(),
    cancelPreload: vi.fn(),
  }),
}))

vi.mock('../../lib/api', () => ({
  apiGet: h.mockApiGet,
  apiPut: h.mockApiPut,
  apiPost: h.mockApiPost,
  apiDelete: h.mockApiDelete,
}))

vi.mock('../../lib/socialInvalidation', () => ({
  invalidateCommunityDetailQueries: vi.fn(),
}))

vi.mock('lucide-react', () => {
  const NullIcon = () => null
  const icons = [
    'Users', 'UserPlus', 'Ban', 'MessageSquare', 'Activity', 'Search', 'UserCog', 'UserMinus',
    'VolumeX', 'Volume2', 'ExternalLink', 'Check', 'X', 'Loader2',
  ]
  return Object.fromEntries(icons.map((name) => [name, NullIcon]))
})

vi.mock('../community/AnnouncementsTab', () => ({
  default: () => null,
}))

vi.mock('../RoleBadge', () => ({
  default: () => null,
}))

vi.mock('../ui', () => ({
  UserLink: ({ username }) => <span data-testid="userlink">{username}</span>,
}))

const baseProps = {
  communityId: 'c1',
  announcements: [],
  setAnnouncements: vi.fn(),
  myId: 'me',
  isMod: true,
  isAdmin: true,
  onRefresh: vi.fn(),
}

function renderMod(props = {}) {
  return render(<ModDashboardTab {...baseProps} {...props} />)
}

describe('ModDashboardTab (phase 7)', () => {
  beforeEach(() => {
    h.mockApiGet.mockReset()
    h.mockApiPut.mockReset()
    h.mockApiPost.mockReset()
    h.mockApiDelete.mockReset()

    h.mockApiGet.mockImplementation((url) => {
      if (url.includes('join-requests')) {
        return Promise.resolve([{ id: 1, user_id: 'u9', username: 'x', status: 'pending' }])
      }
      if (url.includes('mutes')) {
        return Promise.resolve([])
      }
      if (url.includes('mod-dashboard')) {
        return Promise.resolve({
          totalMembers: 2,
          activeMembers: 1,
          recentMessages: 3,
          joinRequests: 1,
          recentBans: 0,
        })
      }
      return Promise.resolve({})
    })
  })

  it('renders the heading and member search input', async () => {
    renderMod()

    expect(screen.getByRole('heading', { name: 'Moderator Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search members' })).toBeInTheDocument()
    expect(await screen.findByText('Total Members')).toBeInTheDocument()
  })

  it('renders Approve/Reject join-request actions with accessible names', async () => {
    renderMod()

    const approve = await screen.findByRole('button', { name: 'Approve join request' })
    const reject = screen.getByRole('button', { name: 'Reject join request' })
    expect(approve).toBeInTheDocument()
    expect(reject).toBeInTheDocument()

    fireEvent.click(approve)
    await act(async () => {})
    expect(h.mockApiPut).toHaveBeenCalledWith('/communities/c1/join-requests/1', { status: 'approved' })
  })

  it('filters members by the search input', async () => {
    renderMod({
      members: [
        { user_id: 'u1', user_name: 'alice', role: 'member' },
        { user_id: 'u2', user_name: 'bob', role: 'member' },
      ],
    })

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search members' }), {
      target: { value: 'alice' },
    })

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByText('bob')).not.toBeInTheDocument()
  })
})
