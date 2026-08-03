import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The cumulative fresh-bootstrap schema. Applied verbatim — never pre-edited by the test.
function loadSchemaSql() {
  return readFileSync(resolve(__dirname, '../../../schema.sql'), 'utf8')
}

let SQL

beforeAll(async () => {
  SQL = await initSqlJs()
})

// Disposable in-memory database, fresh per test.
function freshDb() {
  return new SQL.Database()
}

function applySchema(db) {
  db.run('PRAGMA foreign_keys = ON')
  db.run(loadSchemaSql())
}

describe('fresh schema.sql bootstrap', () => {
  it('applies schema.sql end-to-end on an empty database', () => {
    const db = freshDb()
    applySchema(db)

    const result = db.exec(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name IN ('notifications', 'flashcards', 'rotation_planner_plans')`
    )
    expect(result.length).toBe(1)
    expect(result[0].values.length).toBe(3)
  })

  it('creates idx_notifications_user_read on the notifications table', () => {
    const db = freshDb()
    applySchema(db)

    const result = db.exec(
      `SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_notifications_user_read'`
    )
    expect(result.length).toBe(1)
    expect(result[0].values[0][0]).toContain('notifications(user_id, read)')
  })

  it('reports zero rows from PRAGMA foreign_key_check', () => {
    const db = freshDb()
    applySchema(db)

    const violations = db.exec('PRAGMA foreign_key_check')
    expect(violations.length === 0 || violations[0].values.length === 0).toBe(true)
  })
})
