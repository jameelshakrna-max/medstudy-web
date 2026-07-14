-- Global (cross-community) daily leaderboard snapshots
CREATE TABLE IF NOT EXISTS global_leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL UNIQUE,
  ranking TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Community invitations (invite user by ID)
CREATE TABLE IF NOT EXISTS community_invitations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(community_id, invitee_id)
);
