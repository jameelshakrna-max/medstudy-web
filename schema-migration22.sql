-- ════════════════════════════════════════════════════════════
-- Migration 22
-- display_name column for user-defined V2 plan names
-- Requires Migration 21 to be applied first.
-- This file is NOT idempotent — ALTER TABLE ADD COLUMN will
-- fail if run twice.
-- ════════════════════════════════════════════════════════════

ALTER TABLE rotation_planner_plans
  ADD COLUMN display_name TEXT;
