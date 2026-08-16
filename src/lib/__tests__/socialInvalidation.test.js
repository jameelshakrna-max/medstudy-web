import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  invalidateCommunityListQueries,
  invalidateCommunityDetailQueries,
  invalidateCommunityQueries,
  invalidateUserRelationshipQueries,
  invalidateDmQueries,
  refreshDmInboxCache,
  invalidateInvitationQueries,
} from '../socialInvalidation'

const { mockInvalidateQueries } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
}))

vi.mock('../queryKeys', () => ({
  queryKeys: {
    communities: {
      all: ['communities'],
      detail: (id) => ['communities', 'detail', id],
      members: (id) => ['communities', 'members', id],
      joinRequests: (id) => ['communities', 'joinRequests', id],
      settings: (id) => ['communities', 'settings', id],
      bans: (id) => ['communities', 'bans', id],
      mutes: (id) => ['communities', 'mutes', id],
    },
    follow: {
      all: ['follow'],
      status: (id) => ['follow', 'status', id],
    },
    profile: {
      all: ['profile'],
      detail: (id) => ['profile', 'detail', id],
    },
    dm: {
      all: ['dm'],
      conversations: () => ['dm', 'conversations'],
      unread: () => ['dm', 'unread'],
    },
    invitations: {
      all: ['invitations'],
      list: () => ['invitations', 'list'],
    },
  },
}))

function qc() {
  return { invalidateQueries: mockInvalidateQueries }
}

describe('social invalidation helpers', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear()
  })

  it('invalidateCommunityQueries invalidates the list and full detail set for a community', () => {
    invalidateCommunityQueries(qc(), 'c1')
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'detail', 'c1'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'members', 'c1'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'joinRequests', 'c1'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'settings', 'c1'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'bans', 'c1'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'mutes', 'c1'] })
  })

  it('invalidateCommunityListQueries invalidates only the list prefix', () => {
    invalidateCommunityListQueries(qc())
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1)
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities'] })
  })

  it('invalidateCommunityDetailQueries invalidates the detail set without the list prefix', () => {
    invalidateCommunityDetailQueries(qc(), 'c2')
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'detail', 'c2'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'members', 'c2'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'joinRequests', 'c2'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'settings', 'c2'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'bans', 'c2'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['communities', 'mutes', 'c2'] })
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['communities'] })
  })

  it('invalidateUserRelationshipQueries invalidates follow status and profile detail', () => {
    invalidateUserRelationshipQueries(qc(), 'u1')
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['follow', 'status', 'u1'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['profile', 'detail', 'u1'] })
  })

  it('refreshDmInboxCache invalidates conversations and unread keys', () => {
    refreshDmInboxCache(qc())
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['dm', 'conversations'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['dm', 'unread'] })
  })

  it('invalidateDmQueries invalidates the dm prefix', () => {
    invalidateDmQueries(qc())
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['dm'] })
  })

  it('invalidateInvitationQueries invalidates the invitations prefix', () => {
    invalidateInvitationQueries(qc())
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['invitations'] })
  })

  it('no-ops without crashing when the query client is null', () => {
    expect(() => invalidateCommunityListQueries(null)).not.toThrow()
    expect(() => invalidateCommunityDetailQueries(null, 'c1')).not.toThrow()
    expect(() => invalidateCommunityQueries(null, 'c1')).not.toThrow()
    expect(() => invalidateUserRelationshipQueries(null, 'u1')).not.toThrow()
    expect(() => invalidateDmQueries(null)).not.toThrow()
    expect(() => refreshDmInboxCache(null)).not.toThrow()
    expect(() => invalidateInvitationQueries(null)).not.toThrow()
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })
})
