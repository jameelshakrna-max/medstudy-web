import { describe, it, expect } from 'vitest'
import { buildCommunityInviteUrl, readInviteCode } from '../communityInvite'

describe('buildCommunityInviteUrl', () => {
  it('builds a communities invite URL from an origin and code', () => {
    expect(buildCommunityInviteUrl('ABC123', 'https://x.pages.dev')).toBe(
      'https://x.pages.dev/communities?invite=ABC123'
    )
  })

  it('strips trailing slashes from the origin', () => {
    expect(buildCommunityInviteUrl('ABC123', 'https://x.pages.dev///')).toBe(
      'https://x.pages.dev/communities?invite=ABC123'
    )
    expect(buildCommunityInviteUrl('ABC123', 'https://x.pages.dev/')).toBe(
      'https://x.pages.dev/communities?invite=ABC123'
    )
  })

  it('encodes the code into the query string', () => {
    expect(buildCommunityInviteUrl('a b&c', 'https://x.pages.dev')).toBe(
      'https://x.pages.dev/communities?invite=a%20b%26c'
    )
  })
})

describe('readInviteCode', () => {
  it('reads a valid invite code', () => {
    expect(readInviteCode(new URLSearchParams('?invite=CODE'))).toBe('CODE')
  })

  it('returns null when the invite param is missing', () => {
    expect(readInviteCode(new URLSearchParams())).toBeNull()
    expect(readInviteCode(new URLSearchParams('?other=1'))).toBeNull()
  })

  it('returns null (without crashing) when passed null', () => {
    expect(readInviteCode(null)).toBeNull()
  })

  it('returns null for whitespace-only codes', () => {
    expect(readInviteCode(new URLSearchParams('?invite=%20%20'))).toBeNull()
    expect(readInviteCode(new URLSearchParams('?invite=%09'))).toBeNull()
  })
})
