-- ════════════════════════════════════════════════════════════
-- Migration 24
-- Rotation Planner v2.3 — plan lifecycle.
-- Adds lifecycle timestamps and the at-most-one-active-plan
-- invariant (partial unique index).
-- Requires Migration 23 to be applied first.
-- This file is NOT idempotent — ALTER TABLE ADD COLUMN will
-- fail if run twice.
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. Lifecycle timestamps on rotation_planner_plans
-- activated_at: set once on first activation, preserved across
--   pause/resume cycles.
-- paused_at: set on pause, cleared on resume/activate.
-- completed_at: set once when a plan is completed (terminal).
-- ────────────────────────────────────────────────────────────
ALTER TABLE rotation_planner_plans
  ADD COLUMN activated_at TEXT;

ALTER TABLE rotation_planner_plans
  ADD COLUMN paused_at TEXT;

ALTER TABLE rotation_planner_plans
  ADD COLUMN completed_at TEXT;

-- ────────────────────────────────────────────────────────────
-- 2. At-most-one-active-plan invariant
-- Authoritative guard against concurrent activation requests.
-- The handler pre-check returns 409 ACTIVE_ROTATION_EXISTS for
-- the common case; this index rejects the race and is translated
-- to the same error. Separate from idx_rpp_flashcard_owner
-- (at most one eligible flashcard-capacity owner), which is an
-- independent invariant.
-- ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpp_one_active_plan
  ON rotation_planner_plans(user_id)
  WHERE status = 'active';

-- ────────────────────────────────────────────────────────────
-- 3. Rotation-specific Anki deck associations
-- Presentational/organizational only. Has NO FSRS scheduling
-- meaning and NO flashcard-capacity-owner meaning: linking a deck
-- to a plan does not move cards, create flashcard_review tasks,
-- or transfer ownership. One user owns one flashcard workload;
-- the same deck may be linked to several plans without duplicating
-- cards or due workload.
-- deck_name is the user-owned deck name (exact casing preserved).
-- is_primary is display-only; at most one per plan is enforced by
-- the partial unique index idx_rppd_one_primary.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_planner_plan_decks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL
    REFERENCES rotation_planner_plans(id) ON DELETE CASCADE,
  deck_name TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0
    CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(plan_id, deck_name)
);

CREATE INDEX IF NOT EXISTS idx_rppd_plan ON rotation_planner_plan_decks(plan_id);
CREATE INDEX IF NOT EXISTS idx_rppd_deck ON rotation_planner_plan_decks(deck_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rppd_one_primary
  ON rotation_planner_plan_decks(plan_id)
  WHERE is_primary = 1;
