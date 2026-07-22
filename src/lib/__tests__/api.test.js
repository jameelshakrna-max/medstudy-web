import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'test-token' } },
})

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
    },
  },
}))

import { apiPost } from '../api'

describe('apiPost', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
  })

  it('sends custom headers including Idempotency-Key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"success":true}'),
    })

    await apiPost('/api/test', { foo: 'bar' }, {
      headers: { 'Idempotency-Key': 'test-key-123' },
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0]
    expect(init.headers).toMatchObject({
      'Idempotency-Key': 'test-key-123',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    })
  })

  it('works without the options argument', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"ok":true}'),
    })

    await apiPost('/api/test', { a: 1 })

    const [, init] = fetchSpy.mock.calls[0]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    })
    expect(init.headers['Idempotency-Key']).toBeUndefined()
  })
})
