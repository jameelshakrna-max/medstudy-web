ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'study',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS tree_type TEXT,
  ADD COLUMN IF NOT EXISTS subject_id TEXT,
  ADD COLUMN IF NOT EXISTS subject_name TEXT;

CREATE INDEX IF NOT EXISTS idx_study_sessions_forest
  ON study_sessions(user_id, status, mode, created_at);
