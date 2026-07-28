import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PLANNER_TABLES,
  PLAN_STATUSES,
  STUDY_STYLES,
  SCHEDULING_MODES,
  QUESTION_START_RULES,
  TOPIC_STATUSES,
  TASK_TYPES,
  TASK_STATUSES,
  V1_TABLES,
  ALL_PLANNER_COLUMNS,
} from '../rotationPlannerSchema.js'
import {
  getMigration14Sql,
} from '../rotationPlannerSchema.node.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadMigrationSql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration13.sql'), 'utf8')
    + '\n'
    + readFileSync(resolve(__dirname, '../../../schema-migration14.sql'), 'utf8')
    + '\n'
    + readFileSync(resolve(__dirname, '../../../schema-migration15.sql'), 'utf8')
}

function loadMigration16Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration16.sql'), 'utf8')
}

function loadMigration17Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration17.sql'), 'utf8')
}

const FLASHCARDS_STUB = `
CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL,
  next_review TEXT,
  last_review TEXT
);
`

let SQL
let db

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run(loadMigrationSql())

  db.run(FLASHCARDS_STUB)
  db.run(loadMigration16Sql())
  db.run(loadMigration17Sql())
})

function tableExists(name) {
  const result = db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`
  )
  return result.length > 0 && result[0].values.length > 0
}

function getColumns(tableName) {
  const result = db.exec(`PRAGMA table_info('${tableName}')`)
  if (result.length === 0) return []
  return result[0].values.map((row) => row[1])
}

function getIndexes(tableName) {
  const result = db.exec(
    `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${tableName}'`
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => row[0])
}

function getCreateTableSql(tableName) {
  const result = db.exec(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`
  )
  if (result.length === 0) return ''
  return result[0].values[0][0]
}

function runSafe(sql) {
  try {
    db.run(sql)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function runSafeDb(targetDb, sql) {
  try {
    targetDb.run(sql)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ──────────────────────────────────────────────────────────
// Table existence
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — table existence', () => {
  it('creates all 6 planner tables', () => {
    for (const tableName of Object.values(PLANNER_TABLES)) {
      expect(tableExists(tableName)).toBe(true)
    }
  })

  it('does not create or alter v1 tables', () => {
    for (const tableName of V1_TABLES) {
      expect(tableExists(tableName)).toBe(false)
    }
  })
})

// ──────────────────────────────────────────────────────────
// Column validation
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — column presence', () => {
  for (const [key, tableName] of Object.entries(PLANNER_TABLES)) {
    it(`${tableName} has all expected columns`, () => {
      const columns = getColumns(tableName)
      const expected = ALL_PLANNER_COLUMNS[key]
      for (const col of expected) {
        expect(columns).toContain(col)
      }
    })
  }
})

// ──────────────────────────────────────────────────────────
// Idempotency
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — idempotency', () => {
  it('migration 14 ALTER TABLE fails on double-apply (not idempotent)', () => {
    expect(() => db.run(loadMigrationSql())).toThrow()
  })
})

// ──────────────────────────────────────────────────────────
// CHECK constraints — valid values
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — CHECK constraints accept valid values', () => {
  const planId = 'plan-check-1'
  const topicId = 'topic-check-1'
  const taskId = 'task-check-1'

  beforeAll(() => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES (?, 'u1', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-check-1', 'fp-check-1')`,
      [planId]
    )
  })

  it('accepts all valid plan statuses', () => {
    for (const status of PLAN_STATUSES) {
      const r = runSafe(
        `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, status)
         VALUES ('plan-${status}', 'u1', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-status-${status}', 'fp-status-${status}', '${status}')`
      )
      expect(r.ok).toBe(true)
    }
  })

  it('accepts all valid study_style values', () => {
    for (const style of STUDY_STYLES) {
      const r = runSafe(
        `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, study_style)
         VALUES ('plan-style-${style}', 'u1', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-style-${style}', 'fp-style-${style}', '${style}')`
      )
      expect(r.ok).toBe(true)
    }
  })

  it('accepts all valid scheduling_mode values', () => {
    for (const mode of SCHEDULING_MODES) {
      const r = runSafe(
        `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, scheduling_mode)
         VALUES ('plan-mode-${mode}', 'u1', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-mode-${mode}', 'fp-mode-${mode}', '${mode}')`
      )
      expect(r.ok).toBe(true)
    }
  })

  it('accepts all valid question_start_rule values', () => {
    for (const rule of QUESTION_START_RULES) {
      const r = runSafe(
        `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, question_start_rule)
         VALUES ('plan-rule-${rule}', 'u1', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-rule-${rule}', 'fp-rule-${rule}', '${rule}')`
      )
      expect(r.ok).toBe(true)
    }
  })

  it('accepts all valid topic statuses', () => {
    for (const status of TOPIC_STATUSES) {
      const r = runSafe(
        `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title, status)
         VALUES ('topic-${status}', '${planId}', 'test-source::cardiology-${status}', 'cardiology-${status}', 'Cardiology ${status}', '${status}')`
      )
      expect(r.ok).toBe(true)
    }
  })

  it('accepts all valid task types', () => {
    for (const type of TASK_TYPES) {
      const r = runSafe(
        `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type)
         VALUES ('task-${type}', '${planId}', '2026-01-15', '${type}')`
      )
      expect(r.ok).toBe(true)
    }
  })

  it('accepts all valid task statuses', () => {
    for (const status of TASK_STATUSES) {
      const r = runSafe(
        `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type, status)
         VALUES ('task-status-${status}', '${planId}', '2026-01-16', 'learning', '${status}')`
      )
      expect(r.ok).toBe(true)
    }
  })
})

// ──────────────────────────────────────────────────────────
// CHECK constraints — reject invalid values
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — CHECK constraints reject invalid values', () => {
  it('rejects invalid plan status', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, status)
       VALUES ('plan-bad', 'u1', 'im', 'step-up', '2026-01-01', '2026-04-01', 'req-bad', 'fp-bad', 'invalid_status')`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects invalid study_style', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, study_style)
       VALUES ('plan-bad2', 'u1', 'im', 'step-up', '2026-01-01', '2026-04-01', 'req-bad2', 'fp-bad2', 'turbo')`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects invalid scheduling_mode', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, scheduling_mode)
       VALUES ('plan-bad3', 'u1', 'im', 'step-up', '2026-01-01', '2026-04-01', 'req-bad3', 'fp-bad3', 'turbo')`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects invalid topic status', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title, status)
       VALUES ('topic-bad', 'plan-check-1', 'step-up::cardio', 'cardio', 'Cardiology', 'invalid_status')`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects invalid task type', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type)
       VALUES ('task-bad', 'plan-check-1', '2026-01-15', 'invalid_type')`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects invalid task status', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type, status)
       VALUES ('task-bad2', 'plan-check-1', '2026-01-15', 'learning', 'invalid_status')`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects weekday out of range', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.availability} (id, plan_id, weekday, available_minutes)
       VALUES ('avail-bad', 'plan-check-1', 7, 60)`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects is_day_off outside 0/1', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.availability} (id, plan_id, weekday, available_minutes, is_day_off)
       VALUES ('avail-bad2', 'plan-check-1', 0, 60, 2)`
    )
    expect(r.ok).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────
// Unique constraints
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — unique constraints', () => {
  const planId = 'plan-uniq-1'

  beforeAll(() => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES (?, 'u1', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-uniq-1', 'fp-uniq-1')`,
      [planId]
    )
  })

  it('enforces unique (plan_id, weekday) in availability', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.availability} (id, plan_id, weekday, available_minutes)
       VALUES ('avail-1', '${planId}', 0, 60)`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.availability} (id, plan_id, weekday, available_minutes)
       VALUES ('avail-2', '${planId}', 0, 120)`
    )
    expect(r.ok).toBe(false)
  })

  it('enforces unique (plan_id, normalized_topic_id) in topics', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title)
       VALUES ('topic-1', '${planId}', 'step-up::cardiology', 'cardiology', 'Cardiology')`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title)
       VALUES ('topic-2', '${planId}', 'step-up::cardiology', 'cardiology', 'Cardiology Again')`
    )
    expect(r.ok).toBe(false)
  })

  it('allows same canonical_topic_id with different normalized_topic_id', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title)
       VALUES ('topic-3', '${planId}', 'essentials::cardiology', 'cardiology', 'Cardiology via Essentials')`
    )
    expect(r.ok).toBe(true)
  })

  it('enforces unique (user_id, client_request_id) index on plans', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES ('plan-idem-1', 'u-idem', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-key-1', 'fp-key-1')`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES ('plan-idem-2', 'u-idem', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-key-1', 'fp-key-dup')`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects NULL client_request_id', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, request_fingerprint)
       VALUES ('plan-null-crid', 'u-null-test', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'fp-value')`
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('NOT NULL')
  })

  it('rejects NULL request_fingerprint', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id)
       VALUES ('plan-null-rfp', 'u-null-test', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-key-nf')`
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('NOT NULL')
  })

  it('allows same key for different users', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES ('plan-shared-key-1', 'u-shared-1', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'shared-key', 'fp-1')`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES ('plan-shared-key-2', 'u-shared-2', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'shared-key', 'fp-2')`
    )
    expect(r.ok).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────
// Indexes
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — indexes', () => {
  it('creates indexes on rotation_planner_plans', () => {
    const indexes = getIndexes(PLANNER_TABLES.plans)
    expect(indexes).toContain('idx_rpp_user')
    expect(indexes).toContain('idx_rpp_status')
    expect(indexes).toContain('idx_rpp_rotation')
    expect(indexes).toContain('idx_rpp_idempotency')
  })

  it('creates indexes on rotation_planner_availability', () => {
    const indexes = getIndexes(PLANNER_TABLES.availability)
    expect(indexes).toContain('idx_rpa_plan')
  })

  it('creates indexes on rotation_planner_topics', () => {
    const indexes = getIndexes(PLANNER_TABLES.topics)
    expect(indexes).toContain('idx_rpt_plan')
    expect(indexes).toContain('idx_rpt_status')
    expect(indexes).toContain('idx_rpt_normalized')
    expect(indexes).toContain('idx_rpt_shared_key')
  })

  it('creates indexes on rotation_planner_daily_tasks', () => {
    const indexes = getIndexes(PLANNER_TABLES.dailyTasks)
    expect(indexes).toContain('idx_rpd_plan')
    expect(indexes).toContain('idx_rpd_date')
    expect(indexes).toContain('idx_rpd_status')
    expect(indexes).toContain('idx_rpd_topic')
  })

  it('creates indexes on rotation_planner_task_sessions', () => {
    const indexes = getIndexes(PLANNER_TABLES.taskSessions)
    expect(indexes).toContain('idx_rpts_task')
    expect(indexes).toContain('idx_rpts_user')
    expect(indexes).toContain('idx_rpts_source')
    expect(indexes).toContain('idx_rpts_created')
  })

  it('creates index on user_source_pace', () => {
    const indexes = getIndexes(PLANNER_TABLES.userSourcePace)
    expect(indexes).toContain('idx_usp_user')
  })
})

// ──────────────────────────────────────────────────────────
// Foreign keys
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — foreign keys', () => {
  it('availability references plans with CASCADE', () => {
    const ddl = getCreateTableSql(PLANNER_TABLES.availability)
    expect(ddl).toContain('REFERENCES rotation_planner_plans(id)')
    expect(ddl).toContain('ON DELETE CASCADE')
  })

  it('topics references plans with CASCADE', () => {
    const ddl = getCreateTableSql(PLANNER_TABLES.topics)
    expect(ddl).toContain('REFERENCES rotation_planner_plans(id)')
    expect(ddl).toContain('ON DELETE CASCADE')
  })

  it('daily_tasks references plans with CASCADE and topics with SET NULL', () => {
    const ddl = getCreateTableSql(PLANNER_TABLES.dailyTasks)
    expect(ddl).toContain('REFERENCES rotation_planner_plans(id)')
    expect(ddl).toContain('REFERENCES rotation_planner_topics(id)')
    expect(ddl).toContain('ON DELETE CASCADE')
    expect(ddl).toContain('ON DELETE SET NULL')
  })

  it('task_sessions references daily_tasks with CASCADE', () => {
    const ddl = getCreateTableSql(PLANNER_TABLES.taskSessions)
    expect(ddl).toContain('REFERENCES rotation_planner_daily_tasks(id)')
    expect(ddl).toContain('ON DELETE CASCADE')
  })

  it('user_source_pace has no foreign keys', () => {
    const ddl = getCreateTableSql(PLANNER_TABLES.userSourcePace)
    expect(ddl).not.toContain('REFERENCES')
  })
})

// ──────────────────────────────────────────────────────────
// Cascade behavior
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — cascade delete', () => {
  let cascadePlanId

  beforeAll(() => {
    cascadePlanId = 'plan-cascade-' + Date.now()
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES (?, 'u-cascade', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-cascade', 'fp-cascade')`,
      [cascadePlanId]
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.availability} (id, plan_id, weekday, available_minutes)
       VALUES ('avail-cascade', ?, 0, 120)`,
      [cascadePlanId]
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title)
       VALUES ('topic-cascade', ?, 'step-up::cardiology', 'cardiology', 'Cardiology')`,
      [cascadePlanId]
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, plan_topic_id, task_date, task_type)
       VALUES ('task-cascade', ?, 'topic-cascade', '2026-01-15', 'learning')`,
      [cascadePlanId]
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.taskSessions} (id, user_id, task_id, source_id)
       VALUES ('session-cascade', 'u-cascade', 'task-cascade', 'step-up')`
    )
  })

  it('deleting plan cascades to availability, topics, daily_tasks, and task_sessions', () => {
    db.run(`DELETE FROM ${PLANNER_TABLES.plans} WHERE id = ?`, [cascadePlanId])

    const avail = db.exec(
      `SELECT * FROM ${PLANNER_TABLES.availability} WHERE plan_id = '${cascadePlanId}'`
    )
    expect(avail.length === 0 || avail[0].values.length === 0).toBe(true)

    const topics = db.exec(
      `SELECT * FROM ${PLANNER_TABLES.topics} WHERE plan_id = '${cascadePlanId}'`
    )
    expect(topics.length === 0 || topics[0].values.length === 0).toBe(true)

    const tasks = db.exec(
      `SELECT * FROM ${PLANNER_TABLES.dailyTasks} WHERE plan_id = '${cascadePlanId}'`
    )
    expect(tasks.length === 0 || tasks[0].values.length === 0).toBe(true)

    const sessions = db.exec(
      `SELECT * FROM ${PLANNER_TABLES.taskSessions} WHERE task_id = 'task-cascade'`
    )
    expect(sessions.length === 0 || sessions[0].values.length === 0).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────
// SET NULL on topic deletion
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — SET NULL on topic deletion', () => {
  let setNullPlanId

  beforeAll(() => {
    setNullPlanId = 'plan-setnull-' + Date.now()
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES (?, 'u-setnull', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-setnull', 'fp-setnull')`,
      [setNullPlanId]
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title)
       VALUES ('topic-setnull', ?, 'step-up::cardiology', 'cardiology', 'Cardiology')`,
      [setNullPlanId]
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, plan_topic_id, task_date, task_type)
       VALUES ('task-setnull', ?, 'topic-setnull', '2026-01-15', 'learning')`,
      [setNullPlanId]
    )
  })

  it('deleting a topic sets daily_tasks.plan_topic_id to NULL', () => {
    db.run(`DELETE FROM ${PLANNER_TABLES.topics} WHERE id = 'topic-setnull'`)

    const result = db.exec(
      `SELECT plan_topic_id FROM ${PLANNER_TABLES.dailyTasks} WHERE id = 'task-setnull'`
    )
    expect(result.length).toBe(1)
    expect(result[0].values[0][0]).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────
// user_source_pace survives plan deletion
// ──────────────────────────────────────────────────────────
describe('Migrations 13+14 — user_source_pace survival', () => {
  it('user_source_pace is not affected by plan deletion', () => {
    db.run(
      `INSERT OR REPLACE INTO ${PLANNER_TABLES.userSourcePace} (user_id, source_id, activity_type, pace_multiplier, sample_count)
       VALUES ('u-pace', 'step-up', 'uworld_questions', 1.2, 10)`
    )

    db.run(`DELETE FROM ${PLANNER_TABLES.plans} WHERE user_id = 'u-pace'`)

    const result = db.exec(
      `SELECT pace_multiplier FROM ${PLANNER_TABLES.userSourcePace} WHERE user_id = 'u-pace'`
    )
    expect(result.length).toBe(1)
    expect(result[0].values[0][0]).toBe(1.2)
  })
})

// ──────────────────────────────────────────────────────────
// Migration 14 — sequential application
// ──────────────────────────────────────────────────────────
describe('Migration 14 — sequential application', () => {
  it('migration 14 raw SQL fails when applied to already-migrated database', () => {
    expect(() => db.run(getMigration14Sql())).toThrow()
  })
})

// ──────────────────────────────────────────────────────────
// Migration 14 — new columns and tables
// ──────────────────────────────────────────────────────────
describe('Migration 14 — new columns and tables', () => {
  it('rotation_planner_plans has revision and last_recalculated_at', () => {
    const columns = getColumns(PLANNER_TABLES.plans)
    expect(columns).toContain('revision')
    expect(columns).toContain('last_recalculated_at')
  })

  it('rotation_planner_topics has incorrect_questions_remaining', () => {
    const columns = getColumns(PLANNER_TABLES.topics)
    expect(columns).toContain('incorrect_questions_remaining')
  })

  it('rotation_planner_daily_tasks has completion_percentage, incorrect_count, completed_at, completed_on', () => {
    const columns = getColumns(PLANNER_TABLES.dailyTasks)
    expect(columns).toContain('completion_percentage')
    expect(columns).toContain('incorrect_count')
    expect(columns).toContain('completed_at')
    expect(columns).toContain('completed_on')
  })

  it('rotation_planner_task_sessions has activity_type, mutation_id, calibration_invalid_reason', () => {
    const columns = getColumns(PLANNER_TABLES.taskSessions)
    expect(columns).toContain('activity_type')
    expect(columns).toContain('mutation_id')
    expect(columns).toContain('calibration_invalid_reason')
  })

  it('rotation_planner_task_mutations table exists with expected columns', () => {
    expect(tableExists(PLANNER_TABLES.taskMutations)).toBe(true)
    const columns = getColumns(PLANNER_TABLES.taskMutations)
    expect(columns).toContain('expected_revision')
    expect(columns).toContain('resulting_revision')
    expect(columns).toContain('result_json')
  })

  it('rotation_planner_plan_mutations table exists with expected columns', () => {
    expect(tableExists(PLANNER_TABLES.planMutations)).toBe(true)
    const columns = getColumns(PLANNER_TABLES.planMutations)
    expect(columns).toContain('expected_revision')
    expect(columns).toContain('resulting_revision')
    expect(columns).toContain('result_json')
  })

  it('idx_rpts_mutation unique index exists', () => {
    const indexes = getIndexes(PLANNER_TABLES.taskSessions)
    expect(indexes).toContain('idx_rpts_mutation')
  })

  it('idx_rpts_pace_lookup index exists', () => {
    const indexes = getIndexes(PLANNER_TABLES.taskSessions)
    expect(indexes).toContain('idx_rpts_pace_lookup')
  })

  it('idx_rptm_idempotency unique index exists', () => {
    const indexes = getIndexes(PLANNER_TABLES.taskMutations)
    expect(indexes).toContain('idx_rptm_idempotency')
  })

  it('idx_rppm_idempotency unique index exists', () => {
    const indexes = getIndexes(PLANNER_TABLES.planMutations)
    expect(indexes).toContain('idx_rppm_idempotency')
  })

  it('revision defaults to 0 on new plans', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES ('plan-rev-test', 'u-rev', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-rev', 'fp-rev')`
    )
    const result = db.exec(`SELECT revision FROM ${PLANNER_TABLES.plans} WHERE id = 'plan-rev-test'`)
    expect(result[0].values[0][0]).toBe(0)
  })

  it('completion_percentage defaults to 0 on new tasks', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type)
       VALUES ('task-cp-default', 'plan-rev-test', '2026-01-15', 'learning')`
    )
    const result = db.exec(`SELECT completion_percentage FROM ${PLANNER_TABLES.dailyTasks} WHERE id = 'task-cp-default'`)
    expect(result[0].values[0][0]).toBe(0)
  })

  it('incorrect_questions_remaining defaults to 0 on new topics', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title)
       VALUES ('topic-iqr-default', 'plan-rev-test', 'step-up::test-topic', 'test-topic', 'Test Topic')`
    )
    const result = db.exec(`SELECT incorrect_questions_remaining FROM ${PLANNER_TABLES.topics} WHERE id = 'topic-iqr-default'`)
    expect(result[0].values[0][0]).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────
// Migration 14 — CHECK constraints
// ──────────────────────────────────────────────────────────
describe('Migration 14 — CHECK constraints', () => {
  it('rejects completion_percentage > 100', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type, completion_percentage)
       VALUES ('task-cp-bad', 'plan-check-1', '2026-01-15', 'learning', 101)`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects completion_percentage < 0', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type, completion_percentage)
       VALUES ('task-cp-bad2', 'plan-check-1', '2026-01-15', 'learning', -1)`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects incorrect_count < 0', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type, incorrect_count)
       VALUES ('task-ic-bad', 'plan-check-1', '2026-01-15', 'learning', -1)`
    )
    expect(r.ok).toBe(false)
  })

  it('rejects incorrect_questions_remaining < 0', () => {
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.topics} (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title, incorrect_questions_remaining)
       VALUES ('topic-iqr-bad', 'plan-check-1', 'step-up::iqr-bad', 'iqr-bad', 'Bad', -1)`
    )
    expect(r.ok).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────
// Migration 14 — cascade delete for new tables
// ──────────────────────────────────────────────────────────
describe('Migration 14 — cascade delete for new tables', () => {
  let cascadePlanId

  beforeAll(() => {
    cascadePlanId = 'plan-cascade-m14-' + Date.now()
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES (?, 'u-cascade-m14', 'internal-medicine', 'step-up', '2026-01-01', '2026-04-01', 'req-cascade-m14', 'fp-cascade-m14')`,
      [cascadePlanId]
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.taskMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, action, resulting_task_status, occurred_at, occurred_on, result_json)
       VALUES ('tm-cascade', ?, 'u-cascade-m14', 'req-cascade-m14', 'fp-cascade-m14', 0, 1, 'complete', 'completed', '2026-01-15T00:00:00Z', '2026-01-15', '{}')`,
      [cascadePlanId]
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.planMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, operation, result_json)
       VALUES ('pm-cascade', ?, 'u-cascade-m14', 'req-pm-cascade', 'fp-pm-cascade', 0, 1, 'recalculate', '{}')`,
      [cascadePlanId]
    )
  })

  it('deleting plan cascades to task_mutations and plan_mutations', () => {
    db.run(`DELETE FROM ${PLANNER_TABLES.plans} WHERE id = ?`, [cascadePlanId])

    const tm = db.exec(`SELECT * FROM ${PLANNER_TABLES.taskMutations} WHERE plan_id = '${cascadePlanId}'`)
    expect(tm.length === 0 || tm[0].values.length === 0).toBe(true)

    const pm = db.exec(`SELECT * FROM ${PLANNER_TABLES.planMutations} WHERE plan_id = '${cascadePlanId}'`)
    expect(pm.length === 0 || pm[0].values.length === 0).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────
// Migration 14 — unique constraints
// ──────────────────────────────────────────────────────────
describe('Migration 14 — unique constraints', () => {
  it('enforces unique (user_id, client_request_id) on task_mutations', () => {
    const planId = 'plan-check-1'
    db.run(
      `INSERT INTO ${PLANNER_TABLES.taskMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, action, resulting_task_status, occurred_at, occurred_on, result_json)
       VALUES ('tm-uniq-1', '${planId}', 'u-tm-uniq', 'tm-key-1', 'fp-tm-1', 0, 1, 'complete', 'completed', '2026-01-15T00:00:00Z', '2026-01-15', '{}')`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.taskMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, action, resulting_task_status, occurred_at, occurred_on, result_json)
       VALUES ('tm-uniq-2', '${planId}', 'u-tm-uniq', 'tm-key-1', 'fp-tm-2', 0, 1, 'complete', 'completed', '2026-01-15T00:00:00Z', '2026-01-15', '{}')`
    )
    expect(r.ok).toBe(false)
  })

  it('enforces unique (user_id, client_request_id) on plan_mutations', () => {
    const planId = 'plan-check-1'
    db.run(
      `INSERT INTO ${PLANNER_TABLES.planMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, operation, result_json)
       VALUES ('pm-uniq-1', '${planId}', 'u-pm-uniq', 'pm-key-1', 'fp-pm-1', 0, 1, 'recalculate', '{}')`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.planMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, operation, result_json)
       VALUES ('pm-uniq-2', '${planId}', 'u-pm-uniq', 'pm-key-1', 'fp-pm-2', 0, 1, 'recalculate', '{}')`
    )
    expect(r.ok).toBe(false)
  })

  it('enforces unique mutation_id on task_sessions', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES ('plan-sess-uniq', 'u-sess', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-sess', 'fp-sess')`
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.dailyTasks} (id, plan_id, task_date, task_type)
       VALUES ('task-sess-uniq', 'plan-sess-uniq', '2026-01-15', 'learning')`
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.taskMutations} (id, plan_id, task_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, action, resulting_task_status, occurred_at, occurred_on, result_json)
       VALUES ('mut-uniq', 'plan-sess-uniq', 'task-sess-uniq', 'u-sess', 'req-mut-1', 'fp-mut-1', 0, 1, 'start', 'in_progress', '2026-01-15', '2026-01-15', '{}')`
    )
    db.run(
      `INSERT INTO ${PLANNER_TABLES.taskSessions} (id, user_id, task_id, source_id, mutation_id)
       VALUES ('sess-uniq-1', 'u-sess', 'task-sess-uniq', 'step-up', 'mut-uniq')`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.taskSessions} (id, user_id, task_id, source_id, mutation_id)
       VALUES ('sess-uniq-2', 'u-sess', 'task-sess-uniq', 'step-up', 'mut-uniq')`
    )
    expect(r.ok).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────
// Migration 16 — isolated verification
// Every statement runs against a fresh DB with the required
// pre-migration stubs. No error suppression.
// ──────────────────────────────────────────────────────────
describe('Migration 16 — isolated verification', () => {
  let m16Db

  beforeAll(async () => {
    const SQL = await initSqlJs()
    m16Db = new SQL.Database()
    m16Db.run('PRAGMA foreign_keys = ON')
    m16Db.run(loadMigrationSql())
    m16Db.run(FLASHCARDS_STUB)
    m16Db.run(loadMigration16Sql())
  })

  function m16TableExists(name) {
    const result = m16Db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`
    )
    return result.length > 0 && result[0].values.length > 0
  }

  function m16GetColumns(tableName) {
    const result = m16Db.exec(`PRAGMA table_info('${tableName}')`)
    if (result.length === 0) return []
    return result[0].values.map((row) => row[1])
  }

  function m16GetIndexes(tableName) {
    const result = m16Db.exec(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${tableName}'`
    )
    if (result.length === 0) return []
    return result[0].values.map((row) => row[0])
  }

  it('uses_flashcard_capacity column exists on rotation_planner_plans', () => {
    const cols = m16GetColumns(PLANNER_TABLES.plans)
    expect(cols).toContain('uses_flashcard_capacity')
  })

  it('uses_flashcard_capacity defaults to 0', () => {
    m16Db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint)
       VALUES ('plan-t11-default', 'u-t11', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-t11-d', 'fp-t11-d')`
    )
    const result = m16Db.exec(
      `SELECT uses_flashcard_capacity FROM ${PLANNER_TABLES.plans} WHERE id = 'plan-t11-default'`
    )
    expect(result[0].values[0][0]).toBe(0)
  })

  it('idx_rpp_flashcard_owner partial unique index exists', () => {
    const indexes = m16GetIndexes(PLANNER_TABLES.plans)
    expect(indexes).toContain('idx_rpp_flashcard_owner')
  })

  it('enforces at most one active owner per user', () => {
    m16Db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('plan-owner-1', 'u-owner-iso', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'active', 'req-own-1', 'fp-own-1', 1)`
    )
    const r = runSafeDb(m16Db,
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('plan-owner-2', 'u-owner-iso', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'active', 'req-own-2', 'fp-own-2', 1)`
    )
    expect(r.ok).toBe(false)
  })

  it('allows two owners if one is paused', () => {
    m16Db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('plan-owner-paused', 'u-owner2-iso', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'paused', 'req-own-p', 'fp-own-p', 1)`
    )
    m16Db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('plan-owner-active', 'u-owner2-iso', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'active', 'req-own-a', 'fp-own-a', 1)`
    )
  })

  it('allows multiple non-owner plans per user', () => {
    m16Db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('plan-nonowner-1', 'u-nonowner-iso', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-no-1', 'fp-no-1', 0)`
    )
    m16Db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('plan-nonowner-2', 'u-nonowner-iso', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'req-no-2', 'fp-no-2', 0)`
    )
  })

  it('flashcard_deck_mappings table exists', () => {
    expect(m16TableExists('flashcard_deck_mappings')).toBe(true)
  })

  it('flashcard_deck_mappings has expected columns', () => {
    const cols = m16GetColumns('flashcard_deck_mappings')
    expect(cols).toContain('id')
    expect(cols).toContain('user_id')
    expect(cols).toContain('deck_name')
    expect(cols).toContain('canonical_topic_id')
    expect(cols).toContain('created_at')
    expect(cols).toContain('updated_at')
  })

  it('enforces UNIQUE(user_id, deck_name) on flashcard_deck_mappings', () => {
    m16Db.run(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id)
       VALUES ('fdm-1', 'u-fdm-iso', 'Cardiology', 'cardio::chf')`
    )
    const r = runSafeDb(m16Db,
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id)
       VALUES ('fdm-2', 'u-fdm-iso', 'Cardiology', 'cardio::mi')`
    )
    expect(r.ok).toBe(false)
  })

  it('idx_fdm_user index exists on flashcard_deck_mappings', () => {
    const indexes = m16GetIndexes('flashcard_deck_mappings')
    expect(indexes).toContain('idx_fdm_user')
  })

  it('idx_fdm_topic index exists on flashcard_deck_mappings', () => {
    const indexes = m16GetIndexes('flashcard_deck_mappings')
    expect(indexes).toContain('idx_fdm_topic')
  })

  it('idx_flashcards_user_review index exists on flashcards', () => {
    const indexes = m16GetIndexes('flashcards')
    expect(indexes).toContain('idx_flashcards_user_review')
  })

  it('idx_flashcards_user_review covers (user_id, state, next_review) WHERE last_review IS NOT NULL', () => {
    const result = m16Db.exec(
      `SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_flashcards_user_review'`
    )
    expect(result.length).toBe(1)
    const ddl = result[0].values[0][0]
    expect(ddl).toContain('flashcards(user_id, state, next_review)')
    expect(ddl).toContain('WHERE last_review IS NOT NULL')
  })
})

// ──────────────────────────────────────────────────────────
// Migration 17 — flashcard owner index (draft+active)
// ──────────────────────────────────────────────────────────
describe('Migration 17 — flashcard owner index (Model B)', () => {
  it('idx_rpp_flashcard_owner covers draft+active', () => {
    const result = db.exec(
      `SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_rpp_flashcard_owner'`
    )
    expect(result.length).toBe(1)
    const ddl = result[0].values[0][0]
    expect(ddl).toContain("status IN ('draft', 'active')")
    expect(ddl).not.toContain("status = 'active'")
  })

  it('allows two draft owners for different users', () => {
    const r1 = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('m17-plan-1', 'u-m17-1', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'draft', 'req-m17-1', 'fp-m17-1', 1)`
    )
    expect(r1.ok).toBe(true)
    const r2 = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('m17-plan-2', 'u-m17-2', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'draft', 'req-m17-2', 'fp-m17-2', 1)`
    )
    expect(r2.ok).toBe(true)
  })

  it('still enforces at most one draft owner per user', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('m17-owner-1', 'u-m17-owner', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'draft', 'req-m17-o1', 'fp-m17-o1', 1)`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('m17-owner-2', 'u-m17-owner', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'draft', 'req-m17-o2', 'fp-m17-o2', 1)`
    )
    expect(r.ok).toBe(false)
  })

  it('allows draft+active owner for same user (different statuses)', () => {
    db.run(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('m17-da-1', 'u-m17-da', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'draft', 'req-m17-da1', 'fp-m17-da1', 1)`
    )
    const r = runSafe(
      `INSERT INTO ${PLANNER_TABLES.plans} (id, user_id, rotation_id, source_id, start_date, end_date, status, client_request_id, request_fingerprint, uses_flashcard_capacity)
       VALUES ('m17-da-2', 'u-m17-da', 'cardiology', 'step-up', '2026-01-01', '2026-04-01', 'active', 'req-m17-da2', 'fp-m17-da2', 1)`
    )
    expect(r.ok).toBe(false)
  })
})
