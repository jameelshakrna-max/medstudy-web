-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER — plan configuration
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rotation_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rotation TEXT NOT NULL,
  source_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  exam_date TEXT,
  study_style TEXT DEFAULT 'active',
  uworld_mode TEXT DEFAULT 'timed',
  planning_buffer_minutes INTEGER DEFAULT 30,
  uworld_total_questions INTEGER DEFAULT 0,
  preferred_questions_per_day INTEGER DEFAULT 30,
  questions_per_day_min INTEGER DEFAULT 20,
  questions_per_day_max INTEGER DEFAULT 40,
  avg_minutes_per_question REAL DEFAULT 1.5,
  scheduling_style TEXT DEFAULT 'efficient',
  flashcard_review_enabled INTEGER DEFAULT 1,
  flashcard_max_minutes INTEGER DEFAULT 30,
  personal_pace_multiplier REAL DEFAULT 1.0,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rotation_plans_user ON rotation_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_rotation_plans_status ON rotation_plans(user_id, status);

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER — per-day availability
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rotation_availability (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES rotation_plans(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  available_minutes INTEGER NOT NULL DEFAULT 0,
  is_hospital_day INTEGER DEFAULT 0,
  is_day_off INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rotation_availability_plan ON rotation_availability(plan_id);

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER — schedule entries
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rotation_schedule (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES rotation_plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  topic_id TEXT,
  activity_type TEXT NOT NULL,
  description TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  uworld_questions INTEGER DEFAULT 0,
  uworld_mode TEXT,
  status TEXT DEFAULT 'pending',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rotation_schedule_plan ON rotation_schedule(plan_id);
CREATE INDEX IF NOT EXISTS idx_rotation_schedule_user ON rotation_schedule(user_id);
CREATE INDEX IF NOT EXISTS idx_rotation_schedule_date ON rotation_schedule(plan_id, date);

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER — topic progress
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rotation_topic_progress (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES rotation_plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  study_status TEXT DEFAULT 'not_started',
  study_completed_at TEXT,
  uworld_status TEXT DEFAULT 'not_started',
  uworld_questions_done INTEGER DEFAULT 0,
  uworld_questions_total INTEGER DEFAULT 0,
  uworld_completed_at TEXT,
  confidence INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rotation_progress_plan ON rotation_topic_progress(plan_id);
CREATE INDEX IF NOT EXISTS idx_rotation_progress_user ON rotation_topic_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_rotation_progress_topic ON rotation_topic_progress(plan_id, topic_id);
