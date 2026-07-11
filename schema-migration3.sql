CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO user_profiles (user_id, user_name)
  SELECT DISTINCT user_id, user_name FROM community_messages
  WHERE user_name != '' AND user_name IS NOT NULL;
