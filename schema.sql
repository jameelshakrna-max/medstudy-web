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
  category TEXT DEFAULT 'general',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Shared Pomodoro timer per voice room
CREATE TABLE IF NOT EXISTS community_room_timers (
  room_id TEXT PRIMARY KEY REFERENCES community_rooms(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'stopped',              -- stopped | running | paused
  mode TEXT DEFAULT 'focus',                  -- focus | short_break | long_break
  focus_duration INTEGER DEFAULT 1500,
  short_break_duration INTEGER DEFAULT 300,
  long_break_duration INTEGER DEFAULT 900,
  long_break_every INTEGER DEFAULT 4,
  round_number INTEGER DEFAULT 0,
  started_at TEXT,
  total_paused_seconds INTEGER DEFAULT 0,
  last_pause_started_at TEXT,
  controlled_by TEXT,                          -- user_id who started
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Per-participant study time within a room
CREATE TABLE IF NOT EXISTS community_room_timer_participants (
  room_id TEXT NOT NULL REFERENCES community_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  study_seconds INTEGER DEFAULT 0,
  joined_at TEXT,
  left_at TEXT,
  last_seen_at TEXT,
  focus_status TEXT DEFAULT 'focusing',
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_participants_room_left ON community_room_timer_participants(room_id, left_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
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
  priority TEXT DEFAULT 'info',
  category TEXT DEFAULT 'system',
  action_url TEXT,
  action_label TEXT,
  group_key TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_category ON notifications(user_id, category, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_priority ON notifications(user_id, priority, read);
CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(user_id, group_key);

-- ═══════════════════════════════════════════
-- STUDY HOURS & LEADERBOARD
-- ═══════════════════════════════════════════

-- Granular per-session log (enables daily/weekly/monthly queries)
CREATE TABLE IF NOT EXISTS study_sessions_log (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  minutes REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ssl_community_user ON study_sessions_log(community_id, user_id, created_at);

-- Monthly aggregated study hours per member
CREATE TABLE IF NOT EXISTS community_monthly_hours (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  total_hours REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, user_id, year, month)
);

-- Monthly badge winners (gold/silver/copper)
CREATE TABLE IF NOT EXISTS community_monthly_badges (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  rank INTEGER NOT NULL, -- 1=gold, 2=silver, 3=copper
  title TEXT DEFAULT '',
  awarded_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, year, month, rank)
);

-- Daily leaderboard snapshots for position-change analytics
CREATE TABLE IF NOT EXISTS community_leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  ranking TEXT NOT NULL, -- JSON array: [{"user_id":"...","rank":1,"hours":12.5},...]
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, snapshot_date)
);

-- Global (cross-community) daily leaderboard snapshots
CREATE TABLE IF NOT EXISTS global_leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL UNIQUE,
  ranking TEXT NOT NULL, -- JSON array: [{"user_id":"...","rank":1,"hours":12.5},...]
  created_at TEXT DEFAULT (datetime('now'))
);

-- Community invitations (invite user by ID)
CREATE TABLE IF NOT EXISTS community_invitations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, accepted, declined
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, invitee_id)
);

-- ════════════════════════════════════════════════════════════
-- USER PROFILES (Phase 1: Social Profile System)
-- ════════════════════════════════════════════════════════════

-- user_profiles is created in schema-migration3.sql, expanded in schema-migration6.sql
-- For fresh installs, the full table is:

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  username TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  website TEXT DEFAULT '',
  location TEXT DEFAULT '',
  banner_url TEXT DEFAULT '',
  active_title TEXT DEFAULT '',
  pinned_badges TEXT DEFAULT '[]',
  profile_visibility TEXT DEFAULT 'public',
  activity_visibility TEXT DEFAULT 'everyone',
  reputation INTEGER DEFAULT 0,
  university TEXT DEFAULT '',
  graduation_year INTEGER,
  specialty TEXT DEFAULT '',
  languages TEXT DEFAULT '[]',
  favorite_subjects TEXT DEFAULT '[]',
  joined_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id TEXT PRIMARY KEY,
  study_hours REAL DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  cards_reviewed INTEGER DEFAULT 0,
  pomodoros_completed INTEGER DEFAULT 0,
  competitions_joined INTEGER DEFAULT 0,
  communities_count INTEGER DEFAULT 0,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  entity_id TEXT,
  entity_type TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_followers (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_followers_following ON user_followers(following_id);

-- ════════════════════════════════════════════════════════════
-- DIRECT MESSAGING (Migration 7)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  last_read_at TEXT DEFAULT (datetime('now')),
  muted INTEGER DEFAULT 0,
  UNIQUE(conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_conv ON conversation_members(conversation_id);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  file_key TEXT,
  file_name TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dm_conv ON direct_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_user ON direct_messages(user_id, created_at);

-- ════════════════════════════════════════════════════════════
-- USER PRESENCE (Migration 7)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_presence (
  user_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'offline',
  status_text TEXT DEFAULT '',
  last_active_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_presence_status ON user_presence(status);

-- ════════════════════════════════════════════════════════════
-- USER MENTIONS (Migration 7)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_mentions (
  id TEXT PRIMARY KEY,
  source_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mentions_target ON user_mentions(target_user_id, read);
CREATE INDEX IF NOT EXISTS idx_mentions_source ON user_mentions(source_user_id, created_at);

-- ════════════════════════════════════════════════════════════
-- PINNED RESOURCES (Migration 7)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_pinned_resources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT DEFAULT '',
  resource_meta TEXT DEFAULT '{}',
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_user ON user_pinned_resources(user_id);

-- ════════════════════════════════════════════════════════════
-- RESEARCH HUB
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS research_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  community_id TEXT DEFAULT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT DEFAULT 'open',
  upvotes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  helped_count INTEGER DEFAULT 0,
  bookmarks_count INTEGER DEFAULT 0,
  expires_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_posts_user ON research_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_research_posts_category ON research_posts(category);
CREATE INDEX IF NOT EXISTS idx_research_posts_community ON research_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_research_posts_created ON research_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_research_posts_status ON research_posts(status);

CREATE TABLE IF NOT EXISTS research_post_tags (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE(post_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_research_tags_post ON research_post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_research_tags_tag ON research_post_tags(tag);

CREATE TABLE IF NOT EXISTS research_votes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  vote INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_research_votes_post ON research_votes(post_id);

CREATE TABLE IF NOT EXISTS research_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_comments_post ON research_comments(post_id);

CREATE TABLE IF NOT EXISTS research_helped_marks (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  helper_id TEXT NOT NULL,
  marked_by TEXT NOT NULL,
  help_type TEXT NOT NULL DEFAULT 'helped',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, helper_id, help_type)
);
CREATE INDEX IF NOT EXISTS idx_research_helped_post ON research_helped_marks(post_id);
CREATE INDEX IF NOT EXISTS idx_research_helped_helper ON research_helped_marks(helper_id);

CREATE TABLE IF NOT EXISTS user_research_profile (
  user_id TEXT PRIMARY KEY,
  bio TEXT DEFAULT '',
  institution TEXT DEFAULT '',
  department TEXT DEFAULT '',
  research_interests TEXT DEFAULT '',
  orcid TEXT DEFAULT '',
  google_scholar TEXT DEFAULT '',
  researchgate TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  visibility TEXT DEFAULT 'public',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_research_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  proficiency TEXT DEFAULT 'intermediate',
  is_custom INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, skill)
);
CREATE INDEX IF NOT EXISTS idx_research_skills_user ON user_research_skills(user_id);

CREATE TABLE IF NOT EXISTS user_research_stats (
  user_id TEXT PRIMARY KEY,
  score INTEGER DEFAULT 0,
  level TEXT DEFAULT 'Beginner',
  posts_created INTEGER DEFAULT 0,
  posts_closed INTEGER DEFAULT 0,
  comments_created INTEGER DEFAULT 0,
  comments_helpful INTEGER DEFAULT 0,
  upvotes_received INTEGER DEFAULT 0,
  upvotes_given INTEGER DEFAULT 0,
  surveys_completed INTEGER DEFAULT 0,
  collaborations_joined INTEGER DEFAULT 0,
  papers_shared INTEGER DEFAULT 0,
  projects_created INTEGER DEFAULT 0,
  followers_from_research INTEGER DEFAULT 0,
  last_activity TEXT DEFAULT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_reputation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  action TEXT NOT NULL,
  reference_id TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rep_events_user ON research_reputation_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS research_bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_research_bookmarks_user ON research_bookmarks(user_id);

CREATE TABLE IF NOT EXISTS research_portfolio (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  research_type TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'other',
  status TEXT DEFAULT 'ongoing',
  specialty TEXT DEFAULT '',
  journal TEXT DEFAULT '',
  publication_date TEXT DEFAULT '',
  doi TEXT DEFAULT '',
  pmid TEXT DEFAULT '',
  github_url TEXT DEFAULT '',
  pdf_url TEXT DEFAULT '',
  authors TEXT DEFAULT '',
  abstract TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_portfolio_user ON research_portfolio(user_id);

CREATE TABLE IF NOT EXISTS research_reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_reports_post ON research_reports(post_id);

-- ════════════════════════════════════════════════════════════
-- FOREST TIMER — Tree inventory & selected tree
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_forest_inventory (
  user_id TEXT NOT NULL,
  tree_id TEXT NOT NULL,
  purchased_at TEXT DEFAULT (datetime('now')),
  purchase_type TEXT DEFAULT 'free',
  PRIMARY KEY (user_id, tree_id)
);

CREATE TABLE IF NOT EXISTS user_forest_settings (
  user_id TEXT PRIMARY KEY,
  selected_tree TEXT NOT NULL DEFAULT 'oak',
  coins INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ════════════════════════════════════════════════════════════
-- FOREST ECONOMY — Coin transactions & focus time tracking
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS forest_coin_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  entity_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fct_user ON forest_coin_transactions(user_id, created_at);

ALTER TABLE user_forest_settings ADD COLUMN total_focus_minutes INTEGER DEFAULT 0;

-- ════════════════════════════════════════════════════════════
-- PUSH NOTIFICATIONS — Browser push subscriptions & scheduled delivery queue
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS scheduled_pushes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  data TEXT,
  scheduled_at INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sched_push_due ON scheduled_pushes(scheduled_at, attempts);

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

CREATE TABLE IF NOT EXISTS rotation_availability (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES rotation_plans(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  available_minutes INTEGER NOT NULL DEFAULT 0,
  is_hospital_day INTEGER DEFAULT 0,
  is_day_off INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rotation_availability_plan ON rotation_availability(plan_id);

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

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER v2 — plan configuration
-- ════════════════════════════════════════════════════════════
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
  client_request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  settings_json TEXT DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  last_recalculated_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpp_idempotency
  ON rotation_planner_plans(user_id, client_request_id);
CREATE INDEX IF NOT EXISTS idx_rpp_user ON rotation_planner_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_rpp_status ON rotation_planner_plans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rpp_rotation ON rotation_planner_plans(user_id, rotation_id);

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER v2 — per-day availability
-- ════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER v2 — topic progress
-- ════════════════════════════════════════════════════════════
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
  incorrect_questions_remaining INTEGER NOT NULL DEFAULT 0
    CHECK (incorrect_questions_remaining >= 0),
  mastery_score REAL,
  display_order INTEGER DEFAULT 0,
  UNIQUE(plan_id, normalized_topic_id)
);
CREATE INDEX IF NOT EXISTS idx_rpt_plan ON rotation_planner_topics(plan_id);
CREATE INDEX IF NOT EXISTS idx_rpt_status ON rotation_planner_topics(plan_id, status);
CREATE INDEX IF NOT EXISTS idx_rpt_normalized ON rotation_planner_topics(plan_id, normalized_topic_id);
CREATE INDEX IF NOT EXISTS idx_rpt_shared_key ON rotation_planner_topics(plan_id, shared_topic_key);

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER v2 — daily tasks
-- ════════════════════════════════════════════════════════════
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
  completion_percentage REAL NOT NULL DEFAULT 0
    CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  incorrect_count INTEGER NOT NULL DEFAULT 0
    CHECK (incorrect_count >= 0),
  completed_at TEXT,
  completed_on TEXT,
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

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER v2 — task sessions
-- ════════════════════════════════════════════════════════════
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
  activity_type TEXT,
  mutation_id TEXT
    REFERENCES rotation_planner_task_mutations(id) ON DELETE SET NULL,
  calibration_invalid_reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rpts_task ON rotation_planner_task_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_rpts_user ON rotation_planner_task_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_rpts_source ON rotation_planner_task_sessions(source_id);
CREATE INDEX IF NOT EXISTS idx_rpts_created ON rotation_planner_task_sessions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpts_mutation ON rotation_planner_task_sessions(mutation_id);
CREATE INDEX IF NOT EXISTS idx_rpts_pace_lookup ON rotation_planner_task_sessions(user_id, source_id, activity_type, created_at);

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER v2 — task mutations (idempotency + replay)
-- ════════════════════════════════════════════════════════════
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_rptm_idempotency ON rotation_planner_task_mutations(user_id, client_request_id);
CREATE INDEX IF NOT EXISTS idx_rptm_task ON rotation_planner_task_mutations(task_id);
CREATE INDEX IF NOT EXISTS idx_rptm_plan ON rotation_planner_task_mutations(plan_id);

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER v2 — plan mutations (recalc idempotency)
-- ════════════════════════════════════════════════════════════
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_rppm_idempotency ON rotation_planner_plan_mutations(user_id, client_request_id);
CREATE INDEX IF NOT EXISTS idx_rppm_plan ON rotation_planner_plan_mutations(plan_id);

-- ════════════════════════════════════════════════════════════
-- ROTATION PLANNER v2 — user source pace calibration
-- ════════════════════════════════════════════════════════════
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
