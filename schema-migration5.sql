ALTER TABLE notifications ADD COLUMN priority TEXT DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN category TEXT DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN action_url TEXT;
ALTER TABLE notifications ADD COLUMN action_label TEXT;
ALTER TABLE notifications ADD COLUMN group_key TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_user_category ON notifications(user_id, category, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_priority ON notifications(user_id, priority, read);
CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(user_id, group_key);
