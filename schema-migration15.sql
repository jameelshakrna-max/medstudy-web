-- ════════════════════════════════════════════════════════════
-- TASK 10 — Migration 15
-- Calendar & Progress: is_pinned column for durable move semantics
-- Requires Migration 14 to be applied first.
-- This file is NOT idempotent — ALTER TABLE ADD COLUMN will
-- fail if run twice.
-- ════════════════════════════════════════════════════════════

ALTER TABLE rotation_planner_daily_tasks
  ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
