ALTER TABLE community_members ADD COLUMN title TEXT;
ALTER TABLE community_members ADD COLUMN last_seen_at TEXT;

CREATE TABLE IF NOT EXISTS community_mutes (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  muted_by TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mutes_community ON community_mutes(community_id);

-- Index for profile lookups
CREATE INDEX IF NOT EXISTS idx_ssl_user_created ON study_sessions_log(user_id, created_at);
