-- ════════════════════════════════════════════════════════════
-- TASK 11 — Migration 17
-- Replace flashcard owner index: draft+active (Model B)
-- Requires Migration 16 to be applied first.
-- ════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_rpp_flashcard_owner;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rpp_flashcard_owner
  ON rotation_planner_plans(user_id)
  WHERE uses_flashcard_capacity = 1 AND status IN ('draft', 'active');
