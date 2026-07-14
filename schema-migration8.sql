-- Migration 8: Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  mentions INTEGER NOT NULL DEFAULT 1,
  dms INTEGER NOT NULL DEFAULT 1,
  study_reminders INTEGER NOT NULL DEFAULT 1,
  community_messages INTEGER NOT NULL DEFAULT 1,
  community_mentions INTEGER NOT NULL DEFAULT 1,
  follows INTEGER NOT NULL DEFAULT 1,
  study_streaks INTEGER NOT NULL DEFAULT 0,
  flashcard_milestones INTEGER NOT NULL DEFAULT 0,
  uworld_milestones INTEGER NOT NULL DEFAULT 0,
  goal_completed INTEGER NOT NULL DEFAULT 0,
  announcements INTEGER NOT NULL DEFAULT 1,
  global INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
