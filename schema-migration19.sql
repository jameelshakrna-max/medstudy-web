-- ════════════════════════════════════════════════════════════
-- Migration 19
-- stale_at column for flashcard staleness signaling
-- Requires Migration 18 to be applied first.
-- This file is NOT idempotent — ALTER TABLE ADD COLUMN will
-- fail if run twice.
-- ════════════════════════════════════════════════════════════

ALTER TABLE rotation_planner_plans
  ADD COLUMN stale_at TEXT;
