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

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadMigrationSql() {
  return readFileSync(
    resolve(__dirname, '../../../schema-migration13.sql'),
    'utf8'
  )
}

let SQL
let db

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run(loadMigrationSql())
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

// ──────────────────────────────────────────────────────────
// Table existence
// ──────────────────────────────────────────────────────────
describe('Migration 13 — table existence', () => {
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
describe('Migration 13 — column presence', () => {
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
describe('Migration 13 — idempotency', () => {
  it('can run the migration a second time without errors', () => {
    expect(() => db.run(loadMigrationSql())).not.toThrow()
  })
})

// ──────────────────────────────────────────────────────────
// CHECK constraints — valid values
// ──────────────────────────────────────────────────────────
describe('Migration 13 — CHECK constraints accept valid values', () => {
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
describe('Migration 13 — CHECK constraints reject invalid values', () => {
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
describe('Migration 13 — unique constraints', () => {
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
describe('Migration 13 — indexes', () => {
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
describe('Migration 13 — foreign keys', () => {
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
describe('Migration 13 — cascade delete', () => {
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
describe('Migration 13 — SET NULL on topic deletion', () => {
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
describe('Migration 13 — user_source_pace survival', () => {
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
