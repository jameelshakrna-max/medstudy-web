-- ════════════════════════════════════════════════════════════
-- Release Preflight Checks — Rotation Planner Phase 8
-- Run BEFORE applying any migration to production D1.
-- Usage: wrangler d1 execute medstudy-db --remote --file=./preflight.sql
-- If any check returns unexpected results, STOP and investigate.
-- ════════════════════════════════════════════════════════════

-- ── 1. Required Tables ──────────────────────────────────────
SELECT 'TABLE_CHECK' as check_name, name, 'required' as status
FROM sqlite_master
WHERE type='table' AND name IN (
  'rotation_planner_plans',
  'rotation_planner_daily_tasks',
  'rotation_planner_topics',
  'rotation_planner_availability',
  'rotation_planner_task_mutations',
  'rotation_planner_plan_mutations',
  'flashcard_deck_mappings',
  'flashcard_deck_mapping_mutations',
  'flashcards'
)
ORDER BY name;

-- ── 2. Required Columns on rotation_planner_plans ──────────
SELECT 'COLUMN_CHECK' as check_name, name, 'required' as status
FROM pragma_table_info('rotation_planner_plans')
WHERE name IN (
  'id', 'user_id', 'status', 'revision',
  'uses_flashcard_capacity', 'stale_at',
  'last_recalculated_at', 'settings_json',
  'client_request_id', 'request_fingerprint'
)
ORDER BY name;

-- ── 3. Required Indexes ─────────────────────────────────────
SELECT 'INDEX_CHECK' as check_name, name, 'required' as status
FROM sqlite_master
WHERE type='index' AND name IN (
  'idx_rpp_flashcard_owner',
  'idx_rpp_idempotency',
  'idx_rpp_user',
  'idx_rpp_status',
  'idx_fdm_user',
  'idx_fdm_topic',
  'idx_fdmm_user',
  'idx_fdmm_created',
  'idx_flashcards_user_review',
  'idx_flashcards_user',
  'idx_rpd_plan',
  'idx_rpd_date',
  'idx_rpt_plan',
  'idx_rpa_plan',
  'idx_rptm_idempotency',
  'idx_rppm_idempotency'
)
ORDER BY name;

-- ── 4. Migration 16 Check: uses_flashcard_capacity column ───
SELECT 'MIGRATION_16' as check_name,
  CASE WHEN COUNT(*) > 0 THEN 'ALREADY_APPLIED' ELSE 'NEEDS_APPLY' END as status
FROM pragma_table_info('rotation_planner_plans')
WHERE name = 'uses_flashcard_capacity';

-- ── 5. Migration 17 Preflight: Duplicate owner rows ─────────
-- This would violate the partial unique index on
-- (user_id) WHERE uses_flashcard_capacity = 1 AND status IN ('draft', 'active')
SELECT 'MIGRATION_17_PREFLIGHT' as check_name,
  user_id, COUNT(*) as owner_plan_count
FROM rotation_planner_plans
WHERE uses_flashcard_capacity = 1 AND status IN ('draft', 'active')
GROUP BY user_id
HAVING COUNT(*) > 1;

-- ── 6. Migration 17 Check: Partial unique index ────────────
SELECT 'MIGRATION_17' as check_name,
  CASE WHEN COUNT(*) > 0 THEN 'ALREADY_APPLIED' ELSE 'NEEDS_APPLY' END as status
FROM sqlite_master
WHERE type='index' AND name = 'idx_rpp_flashcard_owner'
  AND sql LIKE '%uses_flashcard_capacity%status%draft%active%';

-- ── 7. Migration 18 Check: flashcard_deck_mapping_mutations ─
SELECT 'MIGRATION_18' as check_name,
  CASE WHEN COUNT(*) > 0 THEN 'ALREADY_APPLIED' ELSE 'NEEDS_APPLY' END as status
FROM sqlite_master
WHERE type='table' AND name = 'flashcard_deck_mapping_mutations';

-- ── 8. Migration 19 Preflight: stale_at column ──────────────
SELECT 'MIGRATION_19_PREFLIGHT' as check_name,
  CASE WHEN COUNT(*) > 0 THEN 'COLUMN_EXISTS_SKIP' ELSE 'NEEDS_APPLY' END as status
FROM pragma_table_info('rotation_planner_plans')
WHERE name = 'stale_at';

-- ── 9. Duplicate Deck Mappings ──────────────────────────────
-- These would violate UNIQUE(user_id, deck_name)
SELECT 'DUPLICATE_MAPPINGS' as check_name,
  user_id, deck_name, COUNT(*) as mapping_count
FROM flashcard_deck_mappings
GROUP BY user_id, deck_name
HAVING COUNT(*) > 1;

-- ── 10. Foreign Key Health: tasks referencing non-existent plans
SELECT 'ORPHANED_TASKS' as check_name,
  COUNT(*) as orphan_count
FROM rotation_planner_daily_tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM rotation_planner_plans p WHERE p.id = t.plan_id
);

-- ── 11. Foreign Key Health: topics referencing non-existent plans
SELECT 'ORPHANED_TOPICS' as check_name,
  COUNT(*) as orphan_count
FROM rotation_planner_topics t
WHERE NOT EXISTS (
  SELECT 1 FROM rotation_planner_plans p WHERE p.id = t.plan_id
);

-- ── 12. Summary ─────────────────────────────────────────────
SELECT 'SUMMARY' as check_name, 'All preflight checks complete.' as message;

-- ── 13. Migration 20 Check: idx_flashcards_user_new ─────────
SELECT 'MIGRATION_20' as check_name,
  CASE WHEN COUNT(*) > 0 THEN 'ALREADY_APPLIED' ELSE 'NEEDS_APPLY' END as status
FROM sqlite_master
WHERE type='index' AND name = 'idx_flashcards_user_new';

-- ════════════════════════════════════════════════════════════
-- INTERPRETATION:
-- - MIGRATION_16: If NEEDS_APPLY, run schema-migration16.sql
-- - MIGRATION_17_PREFLIGHT: If any rows returned, fix duplicates before applying migration 17
-- - MIGRATION_17: If NEEDS_APPLY, run schema-migration17.sql (after 16)
-- - MIGRATION_18: If NEEDS_APPLY, run schema-migration18.sql (after 17)
-- - MIGRATION_19_PREFLIGHT: If COLUMN_EXISTS_SKIP, SKIP migration 19 (already applied)
-- - MIGRATION_19_PREFLIGHT: If NEEDS_APPLY, run schema-migration19.sql (after 18)
-- - MIGRATION_20: If NEEDS_APPLY, run schema-migration20.sql (after 19)
-- - DUPLICATE_MAPPINGS: If any rows returned, deduplicate before using mappings
-- - ORPHANED_TASKS/TOPICS: If > 0, investigate. Not critical but indicates data issues.
-- ════════════════════════════════════════════════════════════
