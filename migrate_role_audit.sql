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
