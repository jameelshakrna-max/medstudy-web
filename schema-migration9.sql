-- Migration 9: Achievement system
CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_achievements_unique ON user_achievements(user_id, achievement_type);
