ALTER TABLE community_rooms ADD COLUMN realtimekit_meeting_id TEXT;
ALTER TABLE community_rooms ADD COLUMN participant_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_room_participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES community_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  left_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON community_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user ON community_room_participants(user_id);