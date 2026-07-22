-- ════════════════════════════════════════════════════════════
-- MIGRATION 13: Rotation Planner v2 schema
-- Creates 6 new tables under the rotation_planner_* prefix.
-- Does NOT alter, rename, or delete any existing v1 tables.
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. rotation_planner_plans
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_planner_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rotation_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  exam_date TEXT,
  study_style TEXT DEFAULT 'active'
    CHECK (study_style IN ('focused', 'active', 'detailed_notes')),
  scheduling_mode TEXT DEFAULT 'efficient'
    CHECK (scheduling_mode IN ('focused', 'efficient')),
  question_start_rule TEXT DEFAULT 'next_available_day'
    CHECK (question_start_rule IN ('next_available_day', 'same_day_if_capacity')),
  preferred_questions_per_day INTEGER DEFAULT 30,
  minimum_questions_per_session INTEGER DEFAULT 10,
  maximum_questions_per_day INTEGER DEFAULT 50,
  average_minutes_per_question REAL DEFAULT 1.5,
  buffer_percentage INTEGER DEFAULT 20,
  maximum_active_topics INTEGER DEFAULT 5,
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  client_request_id TEXT,
  request_fingerprint TEXT,
  settings_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpp_idempotency
  ON rotation_planner_plans(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rpp_user ON rotation_planner_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_rpp_status ON rotation_planner_plans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rpp_rotation ON rotation_planner_plans(user_id, rotation_id);

-- ────────────────────────────────────────────────────────────
-- 2. rotation_planner_availability
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_planner_availability (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL
    REFERENCES rotation_planner_plans(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL
    CHECK (weekday BETWEEN 0 AND 6),
  available_minutes INTEGER NOT NULL DEFAULT 0,
  is_day_off INTEGER DEFAULT 0
    CHECK (is_day_off IN (0, 1)),
  UNIQUE(plan_id, weekday)
);
CREATE INDEX IF NOT EXISTS idx_rpa_plan ON rotation_planner_availability(plan_id);

-- ────────────────────────────────────────────────────────────
-- 3. rotation_planner_topics
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_planner_topics (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL
    REFERENCES rotation_planner_plans(id) ON DELETE CASCADE,
  normalized_topic_id TEXT NOT NULL,
  canonical_topic_id TEXT NOT NULL,
  source_topic_id TEXT,
  shared_topic_key TEXT,
  topic_title TEXT NOT NULL,
  group_id TEXT,
  base_learning_minutes INTEGER DEFAULT 0,
  personalized_learning_minutes INTEGER DEFAULT 0,
  total_uworld_questions INTEGER DEFAULT 0,
  completed_uworld_questions INTEGER DEFAULT 0,
  learning_completed_at TEXT,
  questions_unlocked_at TEXT,
  status TEXT DEFAULT 'not_started'
    CHECK (status IN (
      'not_started',
      'learning',
      'questions_locked',
      'uworld_in_progress',
      'incorrect_review',
      'maintenance',
      'completed'
    )),
  mastery_score REAL,
  display_order INTEGER DEFAULT 0,
  UNIQUE(plan_id, normalized_topic_id)
);
CREATE INDEX IF NOT EXISTS idx_rpt_plan ON rotation_planner_topics(plan_id);
CREATE INDEX IF NOT EXISTS idx_rpt_status ON rotation_planner_topics(plan_id, status);
CREATE INDEX IF NOT EXISTS idx_rpt_normalized ON rotation_planner_topics(plan_id, normalized_topic_id);
CREATE INDEX IF NOT EXISTS idx_rpt_shared_key ON rotation_planner_topics(plan_id, shared_topic_key);

-- ────────────────────────────────────────────────────────────
-- 4. rotation_planner_daily_tasks
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_planner_daily_tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL
    REFERENCES rotation_planner_plans(id) ON DELETE CASCADE,
  plan_topic_id TEXT
    REFERENCES rotation_planner_topics(id) ON DELETE SET NULL,
  task_date TEXT NOT NULL,
  task_type TEXT NOT NULL
    CHECK (task_type IN (
      'learning',
      'consolidation',
      'flashcard_review',
      'uworld_questions',
      'incorrect_review',
      'mixed_review',
      'optional_book_questions'
    )),
  provider TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  target_count INTEGER,
  completed_count INTEGER DEFAULT 0,
  mode TEXT,
  question_pool TEXT,
  status TEXT DEFAULT 'locked'
    CHECK (status IN (
      'locked',
      'pending',
      'in_progress',
      'partial',
      'completed',
      'skipped'
    )),
  unlock_condition TEXT,
  display_order INTEGER DEFAULT 0,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rpd_plan ON rotation_planner_daily_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_rpd_date ON rotation_planner_daily_tasks(plan_id, task_date);
CREATE INDEX IF NOT EXISTS idx_rpd_status ON rotation_planner_daily_tasks(plan_id, status);
CREATE INDEX IF NOT EXISTS idx_rpd_topic ON rotation_planner_daily_tasks(plan_topic_id);

-- ────────────────────────────────────────────────────────────
-- 5. rotation_planner_task_sessions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_planner_task_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL
    REFERENCES rotation_planner_daily_tasks(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  planned_minutes INTEGER,
  active_minutes INTEGER,
  completion_percentage REAL DEFAULT 0,
  interrupted INTEGER DEFAULT 0
    CHECK (interrupted IN (0, 1)),
  valid_for_calibration INTEGER DEFAULT 1
    CHECK (valid_for_calibration IN (0, 1)),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rpts_task ON rotation_planner_task_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_rpts_user ON rotation_planner_task_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_rpts_source ON rotation_planner_task_sessions(source_id);
CREATE INDEX IF NOT EXISTS idx_rpts_created ON rotation_planner_task_sessions(created_at);

-- ────────────────────────────────────────────────────────────
-- 6. user_source_pace
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_source_pace (
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  pace_multiplier REAL DEFAULT 1.0,
  sample_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, source_id, activity_type)
);
CREATE INDEX IF NOT EXISTS idx_usp_user ON user_source_pace(user_id);
