-- ════════════════════════════════════════════════════════════
-- PHASE 1: Social Profile System
-- ════════════════════════════════════════════════════════════

-- ── Expand user_profiles ──
ALTER TABLE user_profiles ADD COLUMN username TEXT;
ALTER TABLE user_profiles ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN bio TEXT DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN website TEXT DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN location TEXT DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN banner_url TEXT DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN active_title TEXT DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN pinned_badges TEXT DEFAULT '[]';
ALTER TABLE user_profiles ADD COLUMN profile_visibility TEXT DEFAULT 'public';
ALTER TABLE user_profiles ADD COLUMN activity_visibility TEXT DEFAULT 'everyone';
ALTER TABLE user_profiles ADD COLUMN joined_at TEXT;

-- Add unique constraint on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);

-- Backfill display_name from existing user_name
UPDATE user_profiles SET display_name = user_name WHERE display_name = '' AND user_name != '';

-- ── User statistics (cached) ──
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

-- ── Activity feed ──
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

-- ── Followers (schema only, no UI yet) ──
CREATE TABLE IF NOT EXISTS user_followers (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_followers_following ON user_followers(following_id);

-- Backfill joined_at for existing users
UPDATE user_profiles SET joined_at = datetime('now') WHERE joined_at IS NULL;
