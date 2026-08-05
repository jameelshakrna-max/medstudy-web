// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import worker from '../worker.js'
import { createTestDb } from './helpers/d1TestHarness.js'

function makeEnv(db) {
  return {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    ENVIRONMENT: 'test',
    DB: db,
    IMAGES: { get: async () => null },
  }
}

function makeRequest(path, { method = 'GET', body } = {}) {
  return new Request(`https://medstudy.app${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'user-a' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function countRows(db, table) {
  const rows = db.exec(`SELECT COUNT(*) FROM ${table}`)
  return rows[0]?.values[0][0] ?? 0
}

describe('Anki deck create → list lifecycle (real DB)', () => {
  let db

  beforeAll(async () => {
    db = await createTestDb()
  })

  it('POST /api/decks returns success and persists exactly one deck row', async () => {
    const post = await worker.fetch(
      makeRequest('/api/decks', { method: 'POST', body: { deck_name: 'Release Test Deck' } }),
      makeEnv(db),
      {}
    )
    expect(post.status).toBe(200)
    const postBody = await post.json()
    expect(postBody.success).toBe(true)
    expect(postBody.deck_name).toBe('Release Test Deck')

    expect(countRows(db, 'deck_settings')).toBe(1)
  })

  it('duplicate POSTs are idempotent — still exactly one row', async () => {
    await worker.fetch(
      makeRequest('/api/decks', { method: 'POST', body: { deck_name: 'Release Test Deck' } }),
      makeEnv(db),
      {}
    )
    await worker.fetch(
      makeRequest('/api/decks', { method: 'POST', body: { deck_name: 'Release Test Deck' } }),
      makeEnv(db),
      {}
    )
    expect(countRows(db, 'deck_settings')).toBe(1)
  })

  it('GET /api/decks includes the freshly created empty deck', async () => {
    await worker.fetch(
      makeRequest('/api/decks', { method: 'POST', body: { deck_name: 'Release Test Deck' } }),
      makeEnv(db),
      {}
    )

    const get = await worker.fetch(makeRequest('/api/decks'), makeEnv(db), {})
    expect(get.status).toBe(200)
    const decks = await get.json()
    expect(Array.isArray(decks)).toBe(true)
    expect(decks).toContainEqual({ id: 'Release Test Deck', name: 'Release Test Deck', card_count: 0 })
  })

  it('GET /api/decks still lists decks that exist only via flashcards', async () => {
    db.run(
      'INSERT INTO flashcards (id, user_id, deck_name, state) VALUES (?, ?, ?, ?)',
      ['c1', 'user-a', 'Imported Deck', 0]
    )

    const get = await worker.fetch(makeRequest('/api/decks'), makeEnv(db), {})
    expect(get.status).toBe(200)
    const decks = await get.json()
    expect(decks).toContainEqual({ id: 'Imported Deck', name: 'Imported Deck', card_count: 1 })
  })
})
