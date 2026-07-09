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

-- ── Goals ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal_type TEXT NOT NULL,
  target_value REAL NOT NULL,
  subject_id TEXT,
  module TEXT,
  category TEXT DEFAULT 'long_term',
  deadline TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

-- ════════════════════════════════════════════════════════════
-- COMMUNITIES
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  avatar_url TEXT,
  banner_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  join_type TEXT NOT NULL DEFAULT 'anyone',
  invite_code TEXT UNIQUE,
  member_count INTEGER DEFAULT 0,
  total_study_hours REAL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_members (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  level_id TEXT,
  total_study_hours REAL DEFAULT 0,
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cm_user ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cm_community ON community_members(community_id);

CREATE TABLE IF NOT EXISTS community_bans (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  banned_by TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cb_community ON community_bans(community_id);

CREATE TABLE IF NOT EXISTS member_levels (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  level_name TEXT NOT NULL,
  level_number INTEGER NOT NULL,
  min_hours REAL DEFAULT 0,
  can_invite INTEGER DEFAULT 0,
  can_create_competition INTEGER DEFAULT 0,
  can_pin_messages INTEGER DEFAULT 0,
  can_upload_files INTEGER DEFAULT 1,
  can_remove_members INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, level_number)
);

CREATE TABLE IF NOT EXISTS community_settings (
  community_id TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  allow_file_uploads INTEGER DEFAULT 1,
  allow_flashcards INTEGER DEFAULT 1,
  allow_competitions INTEGER DEFAULT 1,
  allow_member_invites INTEGER DEFAULT 1,
  allow_announcements INTEGER DEFAULT 1,
  max_file_size_mb INTEGER DEFAULT 50,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_rules (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_join_requests (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cjr_community ON community_join_requests(community_id);

-- ═══════════════════════════════════════════
-- CHAT
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS community_messages (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  file_key TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  is_edited INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_community_created ON community_messages(community_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_community_id ON community_messages(community_id, id);

CREATE TABLE IF NOT EXISTS community_message_flashcards (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  image_url TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON community_message_reactions(message_id);

CREATE TABLE IF NOT EXISTS community_pins (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  pinned_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_announcements (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_member_state (
  member_id TEXT PRIMARY KEY REFERENCES community_members(id) ON DELETE CASCADE,
  last_read_message_id TEXT,
  last_seen_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════
-- COMPETITIONS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL,
  is_admin_created INTEGER DEFAULT 1,
  approved INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  rejection_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_comp_community ON competitions(community_id);

CREATE TABLE IF NOT EXISTS competition_participants (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  total_hours REAL DEFAULT 0,
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(competition_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cp_competition ON competition_participants(competition_id);

-- ═══════════════════════════════════════════
-- ROLE CHANGE AUDIT LOG
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS role_audit_log (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL,
  changed_by_user_id TEXT NOT NULL,
  old_role TEXT,
  new_role TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ral_community ON role_audit_log(community_id);
CREATE INDEX IF NOT EXISTS idx_ral_target ON role_audit_log(target_user_id);

-- ═══════════════════════════════════════════
-- FUTURE: Voice/Video rooms (schema only)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS community_rooms (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT DEFAULT 'livekit',
  status TEXT DEFAULT 'inactive',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);

-- ════════════════════════════════════════════════════════════
-- SUPABASE / POSTGRESQL SECTION
-- Run these statements in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ════════════════════════════════════════════════════════════

-- CREATE SEQUENCE IF NOT EXISTS public.global_id_seq START 1;

CREATE TABLE IF NOT EXISTS public.study_subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'other',
  display_order INTEGER DEFAULT 0
);

INSERT INTO public.study_subjects (id, name, category, display_order) VALUES
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
  ('other',             'Other',                   'other',     18)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.uworld_blocks (
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
  date_completed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uworld_blocks_user ON public.uworld_blocks(user_id);

CREATE TABLE IF NOT EXISTS public.mrcp_syllabus (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Not Started',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mrcp_syllabus_user ON public.mrcp_syllabus(user_id);

CREATE TABLE IF NOT EXISTS public.mrcp_topics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  syllabus_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Not Started',
  confidence INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  notes TEXT,
  last_reviewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mrcp_topics_user ON public.mrcp_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_mrcp_topics_syllabus ON public.mrcp_topics(syllabus_id);

CREATE TABLE IF NOT EXISTS public.local_board_cases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  case_name TEXT NOT NULL,
  subject_id TEXT,
  past_paper_year TEXT,
  repetition_count INTEGER DEFAULT 0,
  mastery_level TEXT DEFAULT 'Started',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_cases_user ON public.local_board_cases(user_id);

CREATE TABLE IF NOT EXISTS public.study_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON public.study_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_created ON public.study_activity(user_id, created_at);

-- ── Goals ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal_type TEXT NOT NULL,
  target_value REAL NOT NULL,
  subject_id TEXT,
  module TEXT,
  category TEXT DEFAULT 'long_term',
  deadline TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_user_isolation ON public.goals
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

-- After running the above, run this to refresh PostgREST schema cache:
-- NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
