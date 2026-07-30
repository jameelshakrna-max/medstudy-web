-- Migration 20: Performance index for new-card pagination query
-- The forecast new-card query filters by (state = 0 OR last_review IS NULL)
-- and orders by created_at ASC, id ASC. Without this index, D1 does a full table scan.
CREATE INDEX IF NOT EXISTS idx_flashcards_user_new
  ON flashcards(user_id, created_at, id)
  WHERE state = 0 OR last_review IS NULL;
