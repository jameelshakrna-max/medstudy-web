import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '../api'

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

import { apiPost, apiPatch } from '../api'

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError({ code: 'TEST', message: 'fail' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
  })

  it('sets code, message, details, status, payload', () => {
    const err = new ApiError({
      code: 'PLAN_REVISION_CONFLICT',
      message: 'Plan was modified',
      details: { planId: 'p1' },
      status: 409,
      payload: { error: { code: 'PLAN_REVISION_CONFLICT' } },
    })
    expect(err.code).toBe('PLAN_REVISION_CONFLICT')
    expect(err.message).toBe('Plan was modified')
    expect(err.details).toEqual({ planId: 'p1' })
    expect(err.status).toBe(409)
    expect(err.name).toBe('ApiError')
  })

  it('uses defaults when no args', () => {
    const err = new ApiError()
    expect(err.code).toBe('API_ERROR')
    expect(err.message).toBe('Request failed')
    expect(err.details).toBeNull()
    expect(err.status).toBeNull()
    expect(err.payload).toBeNull()
  })
})

describe('apiJson error parsing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
  })

  it('parses nested { error: { code, message, details } }', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      text: () => Promise.resolve(JSON.stringify({
        error: {
          code: 'TASK_IN_PROGRESS',
          message: 'Finish the active task before recalculating.',
          details: { inProgressTaskId: 'task-abc' },
        },
      })),
    })

    await expect(apiPost('/api/test', {})).rejects.toMatchObject({
      code: 'TASK_IN_PROGRESS',
      message: 'Finish the active task before recalculating.',
      details: { inProgressTaskId: 'task-abc' },
      status: 409,
    })
  })

  it('parses flat string error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      text: () => Promise.resolve('{"error":"PLAN_REVISION_CONFLICT"}'),
    })

    await expect(apiPatch('/api/test', {})).rejects.toMatchObject({
      code: 'API_ERROR',
      message: 'PLAN_REVISION_CONFLICT',
      status: 409,
    })
  })

  it('handles malformed non-JSON response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('x'.repeat(600)),
    })

    await expect(apiPatch('/api/test', {})).rejects.toMatchObject({
      message: 'x'.repeat(500),
      status: 500,
    })
  })

  it('preserves HTTP status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('{"error":{"code":"PLAN_NOT_FOUND","message":"Not found"}}'),
    })

    await expect(apiPost('/api/test', {})).rejects.toMatchObject({
      code: 'PLAN_NOT_FOUND',
      status: 404,
    })
  })

  it('preserves details from nested error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'expectedRevision is required',
          details: { field: 'expectedRevision' },
        },
      })),
    })

    await expect(apiPatch('/api/test', {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { field: 'expectedRevision' },
      status: 400,
    })
  })

  it('returns parsed JSON on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"planId":"p1","revision":1}'),
    })

    const result = await apiPost('/api/test', {})
    expect(result).toEqual({ planId: 'p1', revision: 1 })
  })
})

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

describe('apiPatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
  })

  it('sends PATCH method with JSON body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"ok":true}'),
    })

    await apiPatch('/api/test', { action: 'start' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/api/test')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"action":"start"}')
  })

  it('includes Authorization header from session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"ok":true}'),
    })

    await apiPatch('/api/test', {})

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    })
  })

  it('forwards custom headers including Idempotency-Key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"ok":true}'),
    })

    await apiPatch('/api/test', { x: 1 }, {
      headers: { 'Idempotency-Key': 'idem-999' },
    })

    const [, init] = fetchSpy.mock.calls[0]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
      'Idempotency-Key': 'idem-999',
    })
  })

  it('works without the options argument', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"ok":true}'),
    })

    await apiPatch('/api/test', { a: 1 })

    const [, init] = fetchSpy.mock.calls[0]
    expect(init.headers['Idempotency-Key']).toBeUndefined()
  })

  it('throws ApiError with code from nested error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      text: () => Promise.resolve(JSON.stringify({
        error: { code: 'PLAN_REVISION_CONFLICT', message: 'Plan was modified' },
      })),
    })

    await expect(apiPatch('/api/test', {})).rejects.toMatchObject({
      code: 'PLAN_REVISION_CONFLICT',
      status: 409,
    })
  })

  it('truncates unparseable error text to 500 chars', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('x'.repeat(600)),
    })

    await expect(apiPatch('/api/test', {})).rejects.toMatchObject({
      message: 'x'.repeat(500),
    })
  })
})
