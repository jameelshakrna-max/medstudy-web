// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import worker from '../worker.js'
import { createTestDb } from './helpers/d1TestHarness.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function makeEnv(db) {
  return {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    ENVIRONMENT: 'test',
    DB: db,
    IMAGES: { get: async () => null },
  }
}

function makeRequest(path, { method = 'GET', userId = 'user-a' } = {}) {
  return new Request(`https://medstudy.app${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': userId },
  })
}

async function getJson(db, path, { userId } = {}) {
  const res = await worker.fetch(makeRequest(path, { userId }), makeEnv(db), {})
  return { status: res.status, body: await res.json() }
}

const POSTS = [
  {
    id: 'rp-01',
    user_id: 'user-a',
    title: 'Keyword study on cardiology',
    description: 'Deep keyword analysis',
    url: 'https://example.com/1',
    category: 'Cardiology',
    status: 'open',
    expires_at: '2099-01-01 00:00:00',
    created_at: '2024-01-01 10:00:00',
    tags: ['keyword'],
  },
  {
    id: 'rp-02',
    user_id: 'user-a',
    title: 'Anatomy review',
    description: 'Review of anatomy basics',
    url: 'https://example.com/2',
    category: 'Anatomy',
    status: 'open',
    expires_at: '2099-01-01 00:00:00',
    created_at: '2024-01-02 10:00:00',
    tags: [],
  },
  {
    id: 'rp-03',
    user_id: 'user-b',
    title: 'Pharmacology keyword notes',
    description: 'Notes on pharma',
    url: 'https://example.com/3',
    category: 'Pharmacology',
    status: 'open',
    expires_at: '2099-01-01 00:00:00',
    created_at: '2024-01-03 10:00:00',
    tags: ['pharma'],
  },
  {
    id: 'rp-04',
    user_id: 'user-b',
    title: 'Surgery techniques',
    description: 'Surgical keyword approaches',
    url: 'https://example.com/4',
    category: 'Surgery',
    status: 'open',
    expires_at: '2099-01-01 00:00:00',
    created_at: '2024-01-04 10:00:00',
    tags: [],
  },
]

const USER_PROFILES = [
  { user_id: 'user-a', user_name: 'Alice', username: 'alice' },
  { user_id: 'user-b', user_name: 'Bob', username: 'bob' },
]

describe('GET /api/research user_id filter', () => {
  let db

  beforeAll(async () => {
    db = await createTestDb()
    const schemaSql = readFileSync(resolve(__dirname, '../../schema-research.sql'), 'utf8')
    db.exec(schemaSql)
    db.exec(`CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT DEFAULT '',
      username TEXT,
      reputation INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )`)

    for (const p of POSTS) {
      db.run(
        `INSERT INTO research_posts (id, user_id, title, description, url, category, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.user_id, p.title, p.description, p.url, p.category, p.status, p.expires_at, p.created_at]
      )
      for (const tag of p.tags) {
        db.run(
          `INSERT INTO research_post_tags (id, post_id, tag) VALUES (?, ?, ?)`,
          [`${p.id}-tag-${tag}`, p.id, tag]
        )
      }
    }
    for (const u of USER_PROFILES) {
      db.run(
        `INSERT INTO user_profiles (user_id, user_name, username) VALUES (?, ?, ?)`,
        [u.user_id, u.user_name, u.username]
      )
    }
  })

  it('returns all posts newest-first without user_id', async () => {
    const { status, body } = await getJson(db, '/api/research')
    expect(status).toBe(200)
    expect(body).toHaveProperty('posts')
    expect(body).toHaveProperty('page', 1)
    expect(body).toHaveProperty('hasMore', false)
    expect(body.posts.map(p => p.id)).toEqual(['rp-04', 'rp-03', 'rp-02', 'rp-01'])
  })

  it('filters by user_id=user-a', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-a')
    expect(body.posts.map(p => p.id)).toEqual(['rp-02', 'rp-01'])
    expect(body.posts.every(p => p.user_id === 'user-a')).toBe(true)
  })

  it('filters by user_id=user-b', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-b')
    expect(body.posts.map(p => p.id)).toEqual(['rp-04', 'rp-03'])
    expect(body.posts.every(p => p.user_id === 'user-b')).toBe(true)
  })

  it('combines user_id with search filter', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-a&search=keyword')
    expect(body.posts.map(p => p.id)).toEqual(['rp-01'])
  })

  it('combines user_id with category filter', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-a&category=Anatomy')
    expect(body.posts.map(p => p.id)).toEqual(['rp-02'])
  })

  it('SQL injection via user_id returns empty', async () => {
    const { body } = await getJson(db, "/api/research?user_id=%27%20OR%201%3D1--")
    expect(body.posts).toEqual([])
    expect(body.hasMore).toBe(false)
  })

  it('unknown user_id returns empty', async () => {
    const { body } = await getJson(db, '/api/research?user_id=unknown-uuid')
    expect(body).toEqual({ posts: [], page: 1, hasMore: false })
  })

  it('DTO shape is correct', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-a')
    const post = body.posts[0]
    expect(post).toHaveProperty('id')
    expect(post).toHaveProperty('user_id')
    expect(post).toHaveProperty('title')
    expect(post).toHaveProperty('category')
    expect(post).toHaveProperty('tags')
    expect(Array.isArray(post.tags)).toBe(true)
    expect(post).toHaveProperty('user_vote')
    expect(post).toHaveProperty('is_bookmarked')
    expect(post).toHaveProperty('user_name')
    expect(post).toHaveProperty('avatar_url')
    expect(post).toHaveProperty('username')
  })

  it('public-read: different user can filter by any author', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-b', { userId: 'user-a' })
    expect(body.posts.map(p => p.id)).toEqual(['rp-04', 'rp-03'])
    expect(body.posts.every(p => p.user_id === 'user-b')).toBe(true)
  })

  it('combines user_id with status filter', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-a&status=open')
    expect(body.posts.map(p => p.id)).toEqual(['rp-02', 'rp-01'])
  })

  it('pagination works with user_id filter', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-a&page=1&limit=1')
    expect(body.posts).toHaveLength(1)
    expect(body.posts[0].id).toBe('rp-02')
    expect(body.page).toBe(1)
    expect(body.hasMore).toBe(true)
  })

  it('hasMore is false when all author posts fit on one page', async () => {
    const { body } = await getJson(db, '/api/research?user_id=user-a&limit=10')
    expect(body.posts).toHaveLength(2)
    expect(body.hasMore).toBe(false)
  })
})
