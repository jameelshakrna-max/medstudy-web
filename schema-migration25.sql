-- ════════════════════════════════════════════════════════════
-- Migration 25
-- Rotation Planner v2.4 — flashcard_review snapshot cards.
-- Persists the exact set of due card IDs each flashcard_review
-- task is responsible for, and marks cards satisfied when the
-- user genuinely reviews them (see
-- src/services/rotationPlannerPlans/flashcardReconciliation.js).
-- Requires Migration 24 to be applied first.
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. Per-task flashcard card snapshot
-- One row per (task_id, card_id). card_id is a plain TEXT with
-- NO FK to the flashcards table: a deck/card deletion must not
-- corrupt planner history. deck_name and canonical_topic_id are
-- SNAPSHOT METADATA captured at snapshot time — never looked up
-- live. snapshot_at is the creating batch's ISO timestamp; a
-- review only satisfies a snapshot row when it happened at or
-- after snapshot_at.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_planner_flashcard_task_cards (
  task_id TEXT NOT NULL REFERENCES rotation_planner_daily_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  canonical_topic_id TEXT,
  snapshot_at TEXT NOT NULL,
  satisfied_at TEXT,
  PRIMARY KEY (task_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_rpftc_task ON rotation_planner_flashcard_task_cards(task_id);
CREATE INDEX IF NOT EXISTS idx_rpftc_user_card ON rotation_planner_flashcard_task_cards(user_id, card_id);
CREATE INDEX IF NOT EXISTS idx_rpftc_unsatisfied ON rotation_planner_flashcard_task_cards(user_id, satisfied_at);
