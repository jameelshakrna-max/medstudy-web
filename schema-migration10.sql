-- Phase 4: Community categories + sort support
ALTER TABLE communities ADD COLUMN category TEXT DEFAULT 'general';
CREATE INDEX IF NOT EXISTS idx_communities_category ON communities(category);
CREATE INDEX IF NOT EXISTS idx_communities_category_members ON communities(category, member_count DESC);
