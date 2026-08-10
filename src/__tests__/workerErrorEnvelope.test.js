// @vitest-environment node
// Regression test for the app-wide error-envelope defect:
// `return handleX(...)` inside try/catch does NOT catch an asynchronously
// rejected handler promise. The fix is `return await handleX(...)`.
//
// This test FAILS if a dispatcher uses `return handleUpdatePresence(...)`
// and PASSES with `return await handleUpdatePresence(...)`.
import { describe, it, expect, vi } from 'vitest'
import initSqlJs from 'sql.js'
import worker from '../worker.js'
import { D1Database } from './helpers/d1TestHarness.js'

vi.mock('../handlers/presence.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    handleUpdatePresence: async () => {
      throw new Error('SENTINEL_BOOM_LEAK_CHECK')
    },
  }
})

const SENTINEL = 'SENTINEL_BOOM_LEAK_CHECK'

async function makeEnv() {
  const SQL = await initSqlJs()
  const db = new D1Database(new SQL.Database())
  return {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    ENVIRONMENT: 'test',
    DB: db,
    IMAGES: { get: async () => null },
  }
}

function makeCtx() {
  return { waitUntil: () => {} }
}

describe('generic error envelope — async handler rejection', () => {
  it('resolves to a safe JSON 500 envelope instead of leaking the exception', async () => {
    const env = await makeEnv()

    const res = await worker.fetch(
      new Request('https://medstudy.app/api/presence/status', {
        method: 'POST',
        headers: { 'x-test-user-id': 'user-a' },
      }),
      env,
      makeCtx()
    )

    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toContain('application/json')

    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['error', 'requestId'])
    expect(body.error).toBe('Internal Server Error')
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(SENTINEL)
    expect(serialized).not.toContain('at handleUpdatePresence')
    expect(serialized).not.toContain('Error:')
    expect(serialized).not.toContain('stack')
  })
})
