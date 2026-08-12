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

function getJson(db, path) {
  return worker.fetch(makeRequest(path), makeEnv(db), {}).then(async (res) => {
    expect(res.status).toBe(200)
    return res.json()
  })
}

const SEEDS = [
  {
    id: 'r-01',
    title: 'Zebra Anatomy',
    category: 'Internal Medicine',
    description: 'Deep dive into zebra cases',
    tags: '["anatomy", "rare"]',
    type: 'notes',
    file_name: 'zebra.pdf',
    file_key: 'k/zebra.pdf',
    file_size: 5000,
    user_id: 'user-a',
    user_name: 'Alice',
    created_at: '2024-01-01 10:00:00',
  },
  {
    id: 'r-02',
    title: 'apple flashcards',
    category: 'Pharmacology',
    description: 'Drug cards for finals',
    tags: '["drugs"]',
    type: 'deck',
    file_name: 'apple.apkg',
    file_key: 'k/apple.apkg',
    file_size: 200,
    user_id: 'user-a',
    user_name: 'Alice',
    created_at: '2024-01-02 10:00:00',
  },
  {
    id: 'r-03',
    title: 'Banana techniques',
    category: 'Surgery',
    description: 'Operative approaches',
    tags: '["technique"]',
    type: 'video',
    file_name: 'banana.mp4',
    file_key: 'k/banana.mp4',
    file_size: 100,
    user_id: 'user-a',
    user_name: 'Alice',
    created_at: '2024-01-03 10:00:00',
  },
  {
    id: 'r-04',
    title: 'cherry dosing',
    category: 'Pharmacology',
    description: 'Dose tables for the ward',
    tags: '["drugs", "dose"]',
    type: 'sheet',
    file_name: 'cherry.xlsx',
    file_key: 'k/cherry.xlsx',
    file_size: 3000,
    user_id: 'user-a',
    user_name: 'Alice',
    created_at: '2024-01-03 10:00:00',
  },
]

describe('GET /api/resources list contract (real DB)', () => {
  let db

  beforeAll(async () => {
    db = await createTestDb()
    const cols =
      '(id, title, category, description, tags, type, file_name, file_key, file_size, user_id, user_name, created_at)'
    for (const row of SEEDS) {
      db.run(
        `INSERT INTO resources ${cols} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.category,
          row.description,
          row.tags,
          row.type,
          row.file_name,
          row.file_key,
          row.file_size,
          row.user_id,
          row.user_name,
          row.created_at,
        ]
      )
    }
  })

  it('parameterless returns all rows newest-first with id ASC tie-break', async () => {
    const rows = await getJson(db, '/api/resources')
    expect(rows.map((r) => r.id)).toEqual(['r-03', 'r-04', 'r-02', 'r-01'])
    expect(rows[0]).toMatchObject({ id: 'r-03', tags: ['technique'], file_size: 100 })
  })

  it('legacy q filters on title and description', async () => {
    const rows = await getJson(db, '/api/resources?q=ward')
    expect(rows.map((r) => r.id)).toEqual(['r-04'])
  })

  it('search alias filters identically', async () => {
    const rows = await getJson(db, '/api/resources?search=techniques')
    expect(rows.map((r) => r.id)).toEqual(['r-03'])
  })

  it('search wins over legacy q when both are provided', async () => {
    const rows = await getJson(db, '/api/resources?search=zebra&q=apple')
    expect(rows.map((r) => r.id)).toEqual(['r-01'])
  })

  it('whitespace-only search falls back to legacy q', async () => {
    const rows = await getJson(db, '/api/resources?search=%20%20&q=apple')
    expect(rows.map((r) => r.id)).toEqual(['r-02'])
  })

  it('tag matches legacy JSON LIKE', async () => {
    const rows = await getJson(db, '/api/resources?tag=drugs')
    expect(rows.map((r) => r.id).sort()).toEqual(['r-02', 'r-04'])
  })

  it('type matches exactly', async () => {
    const rows = await getJson(db, '/api/resources?type=video')
    expect(rows.map((r) => r.id)).toEqual(['r-03'])
  })

  it('category matches exactly and combines with filters', async () => {
    const rows = await getJson(db, '/api/resources?category=Pharmacology&search=dosing')
    expect(rows.map((r) => r.id)).toEqual(['r-04'])
  })

  it('tie on created_at is broken deterministically by id asc', async () => {
    const rows = await getJson(db, '/api/resources?sort=created_at')
    const slice = rows.filter((r) => r.created_at === '2024-01-03 10:00:00')
    expect(slice.map((r) => r.id)).toEqual(['r-03', 'r-04'])
  })

  it('name sort is case-insensitive with id tie-break', async () => {
    const rows = await getJson(db, '/api/resources?sort=name')
    expect(rows.map((r) => r.id)).toEqual(['r-02', 'r-03', 'r-04', 'r-01'])
  })

  it('largest/smallest sort by file_size with id tie-break', async () => {
    const largest = await getJson(db, '/api/resources?sort=largest')
    expect(largest.map((r) => r.id)).toEqual(['r-01', 'r-04', 'r-02', 'r-03'])
    const smallest = await getJson(db, '/api/resources?sort=smallest')
    expect(smallest.map((r) => r.id)).toEqual(['r-03', 'r-02', 'r-04', 'r-01'])
  })

  it('newest/oldest map to the created_at clause', async () => {
    const newest = await getJson(db, '/api/resources?sort=newest')
    expect(newest.map((r) => r.id)).toEqual(['r-03', 'r-04', 'r-02', 'r-01'])
    const oldest = await getJson(db, '/api/resources?sort=oldest')
    expect(oldest.map((r) => r.id)).toEqual(['r-01', 'r-02', 'r-03', 'r-04'])
  })

  it('unknown or injected sort values fall back to created_at DESC', async () => {
    const fallback = await getJson(db, '/api/resources?sort=DROP%20TABLE%20resources')
    expect(fallback.map((r) => r.id)).toEqual(['r-03', 'r-04', 'r-02', 'r-01'])
    const upper = await getJson(db, '/api/resources?sort=%20%20NAME%20%20')
    expect(upper.map((r) => r.id)).toEqual(['r-02', 'r-03', 'r-04', 'r-01'])
  })

  it('limit is honored and offset pages without overlap', async () => {
    const page1 = await getJson(db, '/api/resources?limit=2&offset=0')
    expect(page1.map((r) => r.id)).toEqual(['r-03', 'r-04'])
    const page2 = await getJson(db, '/api/resources?limit=2&offset=2')
    expect(page2.map((r) => r.id)).toEqual(['r-02', 'r-01'])
  })

  it('default limit is 50 and beyond-range offset is empty', async () => {
    const rows = await getJson(db, '/api/resources')
    expect(rows.length).toBe(4)
    const empty = await getJson(db, '/api/resources?offset=100')
    expect(empty).toEqual([])
  })

  it('injection-like search input is bound, not interpreted', async () => {
    const rows = await getJson(db, "/api/resources?search=%27%20OR%201%3D1--")
    expect(rows).toEqual([])
  })

  it('injection-like tag input is bound, not interpreted', async () => {
    const rows = await getJson(db, "/api/resources?tag=%22%20OR%201%3D1--")
    expect(rows).toEqual([])
  })
})
