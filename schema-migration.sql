-- ═══════════════════════════════════════════
-- STUDY HOURS & LEADERBOARD (D1-compatible)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS study_sessions_log (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  minutes REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ssl_community_user ON study_sessions_log(community_id, user_id, created_at);

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

CREATE TABLE IF NOT EXISTS community_monthly_badges (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT DEFAULT '',
  awarded_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, year, month, rank)
);

CREATE TABLE IF NOT EXISTS community_leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  ranking TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, snapshot_date)
);
