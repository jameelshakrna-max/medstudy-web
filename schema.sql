CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  image_url TEXT,
  tags TEXT,
  difficulty REAL DEFAULT 0,
  stability REAL DEFAULT 0,
  state INTEGER DEFAULT 0,
  interval REAL DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  last_review TEXT,
  next_review TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fsrs_parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  params TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deck_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  settings TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_name);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_deck ON flashcards(user_id, deck_name);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO categories (id, name) VALUES
  ('internal_medicine', 'Internal Medicine'),
  ('surgery', 'Surgery'),
  ('pharmacology', 'Pharmacology'),
  ('other', 'Other');

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  type TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT DEFAULT '',
  image_key TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resource_comments (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  parent_id TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  removed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comment_votes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  vote INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_user ON resources(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_resource ON resource_comments(resource_id);
CREATE INDEX IF NOT EXISTS idx_votes_comment ON comment_votes(comment_id);

-- ════════════════════════════════════════════════════════════
-- STUDY SUBJECTS (lookup table, no colors — colors are frontend)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS study_subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'other',
  display_order INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO study_subjects (id, name, category, display_order) VALUES
  ('cardiology',        'Cardiology',              'medical',    1),
  ('respiratory',       'Respiratory',             'medical',    2),
  ('gastroenterology',  'Gastroenterology',        'medical',    3),
  ('nephrology',        'Nephrology',              'medical',    4),
  ('neurology',         'Neurology',               'medical',    5),
  ('endocrinology',     'Endocrinology',           'medical',    6),
  ('infectious',        'Infectious Disease',      'medical',    7),
  ('hematology',        'Hematology',              'medical',    8),
  ('oncology',          'Oncology',                'medical',    9),
  ('rheumatology',      'Rheumatology',            'medical',   10),
  ('dermatology',       'Dermatology',             'medical',   11),
  ('psychiatry',        'Psychiatry',              'medical',   12),
  ('obgyn',             'Obstetrics & Gynecology', 'medical',   13),
  ('pediatrics',        'Pediatrics',              'medical',   14),
  ('emergency',         'Emergency Medicine',      'medical',   15),
  ('mixed',             'Mixed',                   'mixed',     16),
  ('self_assessment',   'Self Assessment',         'mixed',     17),
  ('other',             'Other',                   'other',     18);

-- ════════════════════════════════════════════════════════════
-- UWORLD BLOCKS — full table definition with new subject_id/time
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS uworld_blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  block_name TEXT NOT NULL,
  total_questions INTEGER DEFAULT 40,
  correct INTEGER DEFAULT 0,
  percent_correct INTEGER DEFAULT 0,
  grade TEXT DEFAULT '',
  mode TEXT DEFAULT 'Tutor',
  subject_id TEXT,
  time_minutes INTEGER DEFAULT 0,
  notes TEXT,
  date_completed TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ════════════════════════════════════════════════════════════
-- MRCP SYLLABUS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mrcp_syllabus (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Not Started',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mrcp_syllabus_user ON mrcp_syllabus(user_id);

CREATE TABLE IF NOT EXISTS mrcp_topics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  syllabus_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Not Started',
  confidence INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  notes TEXT,
  last_reviewed TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mrcp_topics_user ON mrcp_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_mrcp_topics_syllabus ON mrcp_topics(syllabus_id);

-- ════════════════════════════════════════════════════════════
-- LOCAL BOARD CASES
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS local_board_cases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  case_name TEXT NOT NULL,
  subject_id TEXT REFERENCES study_subjects(id),
  past_paper_year TEXT,
  repetition_count INTEGER DEFAULT 0,
  mastery_level TEXT DEFAULT 'Started',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_board_cases_user ON local_board_cases(user_id);

-- ════════════════════════════════════════════════════════════
-- STUDY ACTIVITY (unified event log)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS study_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON study_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_created ON study_activity(user_id, created_at);
