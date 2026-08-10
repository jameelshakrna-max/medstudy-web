// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'
import worker from '../worker.js'
import { D1Database } from './helpers/d1TestHarness.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(resolve(__dirname, '../../schema.sql'), 'utf8')
const MIGRATION2_SQL = readFileSync(resolve(__dirname, '../../schema-migration2.sql'), 'utf8')

function makeEnv(db) {
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

function profileRequest(viewerId, targetUserId) {
  return new Request(`https://medstudy.app/api/users/${targetUserId}/profile`, {
    method: 'GET',
    headers: { 'x-test-user-id': viewerId },
  })
}

async function buildDb({ applyMigration2 }) {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run(SCHEMA_SQL)
  if (applyMigration2) db.run(MIGRATION2_SQL)

  db.run(
    "INSERT INTO user_profiles (user_id, user_name, display_name, username) VALUES ('user-a', 'usera', 'User A', 'usera')"
  )
  db.run("INSERT INTO user_stats (user_id, study_hours, questions_answered) VALUES ('user-a', 12, 300)")
  db.run(
    "INSERT INTO user_profiles (user_id, user_name, display_name, username) VALUES ('user-b', 'userb', 'User B', 'userb')"
  )
  db.run("INSERT INTO user_stats (user_id) VALUES ('user-b')")
  db.run("INSERT INTO communities (id, name, created_by) VALUES ('comm-1', 'Cardiology Club', 'user-a')")
  if (applyMigration2) {
    db.run(
      "INSERT INTO community_members (id, community_id, user_id, role, title, total_study_hours) VALUES ('cm-1', 'comm-1', 'user-a', 'member', 'Cardiology', 42.5)"
    )
  } else {
    db.run(
      "INSERT INTO community_members (id, community_id, user_id, role, total_study_hours) VALUES ('cm-1', 'comm-1', 'user-a', 'member', 42.5)"
    )
  }
  db.run(
    "INSERT INTO community_monthly_badges (id, community_id, user_id, year, month, rank, title) VALUES ('b-1', 'comm-1', 'user-a', 2026, 7, 1, 'Top Performer')"
  )
  return new D1Database(db)
}

describe('GET /api/users/:id/profile — schema-migration2 regression', () => {
  it('reproduces the bug: missing migration2 (no cm.title) returns 500', async () => {
    const db = await buildDb({ applyMigration2: false })

    const res = await worker.fetch(
      profileRequest('user-a', 'user-a'),
      makeEnv(db),
      makeCtx()
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal Server Error')
  })

  it('applying migration2 fixes the endpoint and cm.title flows through', async () => {
    const SQL = await initSqlJs()
    const sqlJsDb = new SQL.Database()
    sqlJsDb.run('PRAGMA foreign_keys = ON')
    sqlJsDb.run(SCHEMA_SQL)
    sqlJsDb.run(
      "INSERT INTO user_profiles (user_id, user_name, display_name, username) VALUES ('user-a', 'usera', 'User A', 'usera')"
    )
    sqlJsDb.run("INSERT INTO user_stats (user_id, study_hours, questions_answered) VALUES ('user-a', 12, 300)")
    sqlJsDb.run("INSERT INTO communities (id, name, created_by) VALUES ('comm-1', 'Cardiology Club', 'user-a')")
    sqlJsDb.run(
      "INSERT INTO community_members (id, community_id, user_id, role, total_study_hours) VALUES ('cm-1', 'comm-1', 'user-a', 'member', 42.5)"
    )
    sqlJsDb.run(
      "INSERT INTO community_monthly_badges (id, community_id, user_id, year, month, rank, title) VALUES ('b-1', 'comm-1', 'user-a', 2026, 7, 1, 'Top Performer')"
    )

    sqlJsDb.run(MIGRATION2_SQL)
    sqlJsDb.run("UPDATE community_members SET title = 'Cardiology' WHERE id = 'cm-1'")
    const db = new D1Database(sqlJsDb)

    const res = await worker.fetch(
      profileRequest('user-a', 'user-a'),
      makeEnv(db),
      makeCtx()
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.username).toBe('usera')
    expect(body.stats.study_hours).toBe(12)
    expect(body.communities).toHaveLength(1)
    expect(body.communities[0]).toMatchObject({
      name: 'Cardiology Club',
      title: 'Cardiology',
      total_study_hours: 42.5,
    })
    expect(body.badges).toHaveLength(1)
    expect(body.badges[0].title).toBe('Top Performer')
  })

  it('applying migration2 fixes the endpoint for other-user reads too', async () => {
    const SQL = await initSqlJs()
    const sqlJsDb = new SQL.Database()
    sqlJsDb.run('PRAGMA foreign_keys = ON')
    sqlJsDb.run(SCHEMA_SQL)
    sqlJsDb.run(
      "INSERT INTO user_profiles (user_id, user_name, display_name, username) VALUES ('user-b', 'userb', 'User B', 'userb')"
    )
    sqlJsDb.run("INSERT INTO user_stats (user_id) VALUES ('user-b')")
    sqlJsDb.run(
      "INSERT INTO user_profiles (user_id, user_name, display_name, username) VALUES ('user-a', 'usera', 'User A', 'usera')"
    )
    sqlJsDb.run("INSERT INTO communities (id, name, created_by) VALUES ('comm-1', 'Cardiology Club', 'user-a')")
    sqlJsDb.run(
      "INSERT INTO community_members (id, community_id, user_id, role, total_study_hours) VALUES ('cm-1', 'comm-1', 'user-a', 'member', 42.5)"
    )
    sqlJsDb.run(
      "INSERT INTO community_members (id, community_id, user_id, role, total_study_hours) VALUES ('cm-2', 'comm-1', 'user-b', 'member', 5)"
    )

    sqlJsDb.run(MIGRATION2_SQL)
    const db = new D1Database(sqlJsDb)

    const res = await worker.fetch(
      profileRequest('user-a', 'user-b'),
      makeEnv(db),
      makeCtx()
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.username).toBe('userb')
    expect(body.communities).toHaveLength(1)
    expect(body.communities[0].name).toBe('Cardiology Club')
    expect(body.shared_communities).toHaveLength(1)
    expect(body.shared_communities[0].id).toBe('comm-1')
  })
})
