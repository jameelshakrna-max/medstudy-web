-- ════════════════════════════════════════════════════════════
-- Migration 23
-- Rotation Planner v2.2 — grouped UWorld scheduling.
-- Adds the question-group table, an explicit uworld_scheduling_mode
-- on plans, and a nullable plan_question_group_id on daily tasks.
-- Requires Migration 22 to be applied first.
-- This file is NOT idempotent — ALTER TABLE ADD COLUMN will
-- fail if run twice.
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. rotation_planner_question_groups
-- Immutable snapshot of a curated or fallback question group.
-- Progress fields (completed/incorrect/status) are NOT persisted;
-- they are derived from task history at read time.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_planner_question_groups (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL
    REFERENCES rotation_planner_plans(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  title TEXT NOT NULL,
  system TEXT,
  target_questions INTEGER NOT NULL
    CHECK (target_questions > 0),
  member_topic_ids_json TEXT NOT NULL,
  required_topic_ids_json TEXT NOT NULL,
  excluded INTEGER DEFAULT 0
    CHECK (excluded IN (0, 1)),
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(plan_id, group_key)
);
CREATE INDEX IF NOT EXISTS idx_rpqg_plan ON rotation_planner_question_groups(plan_id);

-- ────────────────────────────────────────────────────────────
-- 2. rotation_planner_plans.uworld_scheduling_mode
-- 'per_topic' preserves all legacy behavior. 'grouped' enables
-- UWorld question-group scheduling. Missing values default to
-- 'per_topic' so existing plans and old clients are unchanged.
-- ────────────────────────────────────────────────────────────
ALTER TABLE rotation_planner_plans
  ADD COLUMN uworld_scheduling_mode TEXT NOT NULL DEFAULT 'per_topic'
    CHECK (uworld_scheduling_mode IN ('per_topic', 'grouped'));

-- ────────────────────────────────────────────────────────────
-- 3. rotation_planner_daily_tasks.plan_question_group_id
-- Grouped UWorld and grouped incorrect-review tasks carry this
-- column instead of plan_topic_id. ON DELETE CASCADE removes
-- grouped tasks when their group (or plan) is deleted.
-- ────────────────────────────────────────────────────────────
ALTER TABLE rotation_planner_daily_tasks
  ADD COLUMN plan_question_group_id TEXT DEFAULT NULL
    REFERENCES rotation_planner_question_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_rpdt_question_group
  ON rotation_planner_daily_tasks(plan_question_group_id);
