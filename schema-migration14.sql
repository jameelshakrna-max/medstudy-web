-- ════════════════════════════════════════════════════════════
-- TASK 7 — Migration 14
-- Task updates, recalculation, pace calibration
-- Requires Migration 13 to be applied first.
-- This file is NOT idempotent — ALTER TABLE ADD COLUMN will
-- fail if run twice.
-- ════════════════════════════════════════════════════════════

-- Plans: revision tracking
ALTER TABLE rotation_planner_plans
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rotation_planner_plans
  ADD COLUMN last_recalculated_at TEXT;

-- Topics: cached incorrect-review aggregate
ALTER TABLE rotation_planner_topics
  ADD COLUMN incorrect_questions_remaining INTEGER NOT NULL DEFAULT 0
  CHECK (incorrect_questions_remaining >= 0);

-- Tasks: durable progress fields
ALTER TABLE rotation_planner_daily_tasks
  ADD COLUMN completion_percentage REAL NOT NULL DEFAULT 0
  CHECK (completion_percentage >= 0 AND completion_percentage <= 100);
ALTER TABLE rotation_planner_daily_tasks
  ADD COLUMN incorrect_count INTEGER NOT NULL DEFAULT 0
  CHECK (incorrect_count >= 0);
ALTER TABLE rotation_planner_daily_tasks
  ADD COLUMN completed_at TEXT;
ALTER TABLE rotation_planner_daily_tasks
  ADD COLUMN completed_on TEXT;

-- Task mutations: idempotency + replay + revision audit
CREATE TABLE IF NOT EXISTS rotation_planner_task_mutations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL
    REFERENCES rotation_planner_plans(id) ON DELETE CASCADE,
  task_id TEXT
    REFERENCES rotation_planner_daily_tasks(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  resulting_revision INTEGER NOT NULL,
  action TEXT NOT NULL,
  resulting_task_status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rptm_idempotency
  ON rotation_planner_task_mutations(user_id, client_request_id);
CREATE INDEX IF NOT EXISTS idx_rptm_task ON rotation_planner_task_mutations(task_id);
CREATE INDEX IF NOT EXISTS idx_rptm_plan ON rotation_planner_task_mutations(plan_id);

-- Plan mutations: recalculation idempotency + revision guard
CREATE TABLE IF NOT EXISTS rotation_planner_plan_mutations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL
    REFERENCES rotation_planner_plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  resulting_revision INTEGER NOT NULL,
  operation TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rppm_idempotency
  ON rotation_planner_plan_mutations(user_id, client_request_id);
CREATE INDEX IF NOT EXISTS idx_rppm_plan ON rotation_planner_plan_mutations(plan_id);

-- Task sessions: pace calibration fields
ALTER TABLE rotation_planner_task_sessions
  ADD COLUMN activity_type TEXT;
ALTER TABLE rotation_planner_task_sessions
  ADD COLUMN mutation_id TEXT
    REFERENCES rotation_planner_task_mutations(id) ON DELETE SET NULL;
ALTER TABLE rotation_planner_task_sessions
  ADD COLUMN calibration_invalid_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpts_mutation
  ON rotation_planner_task_sessions(mutation_id);
CREATE INDEX IF NOT EXISTS idx_rpts_pace_lookup
  ON rotation_planner_task_sessions(
    user_id, source_id, activity_type, created_at
  );
