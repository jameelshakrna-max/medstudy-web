-- ════════════════════════════════════════════════════════════
-- TASK 11 — Migration 16
-- Flashcard & Spaced-Repetition Integration: owner model,
-- deck mappings, review-due query index
-- Requires Migration 15 to be applied first.
-- ════════════════════════════════════════════════════════════

-- 1. Flashcard capacity ownership column
ALTER TABLE rotation_planner_plans
  ADD COLUMN uses_flashcard_capacity INTEGER NOT NULL DEFAULT 0;

-- 2. Active-owner partial unique index: at most one owner per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpp_flashcard_owner
  ON rotation_planner_plans(user_id)
  WHERE uses_flashcard_capacity = 1 AND status = 'active';

-- 3. Deck mapping table
CREATE TABLE IF NOT EXISTS flashcard_deck_mappings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  canonical_topic_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, deck_name)
);
CREATE INDEX IF NOT EXISTS idx_fdm_user ON flashcard_deck_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_fdm_topic ON flashcard_deck_mappings(canonical_topic_id);

-- 4. Performance index for review-due query
CREATE INDEX IF NOT EXISTS idx_flashcards_user_review
  ON flashcards(user_id, state, next_review)
  WHERE last_review IS NOT NULL;
