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
