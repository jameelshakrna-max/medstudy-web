-- Migration 7: DMs, Presence, Mentions, Pinned Resources, Reputation
-- Applied: wrangler d1 execute medstudy-db --file=./schema-migration7.sql

-- ════════════════════════════════════════════════════════════
-- DIRECT MESSAGING
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
-- USER PRESENCE
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
-- USER MENTIONS
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
-- PINNED RESOURCES (on profile)
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
-- EXPAND USER_PROFILES
-- ════════════════════════════════════════════════════════════

ALTER TABLE user_profiles ADD COLUMN reputation INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN university TEXT DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN graduation_year INTEGER;
ALTER TABLE user_profiles ADD COLUMN specialty TEXT DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN languages TEXT DEFAULT '[]';
ALTER TABLE user_profiles ADD COLUMN favorite_subjects TEXT DEFAULT '[]';
