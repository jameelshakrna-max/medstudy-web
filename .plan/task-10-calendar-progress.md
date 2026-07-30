# Task 10: Calendar & Progress Analytics — Final Architecture Spec

## Overview

Add a Calendar tab (monthly grid + weekly delegation) and Progress tab (13 metrics + forecast)
to the Rotation Planner. Backend gains durable move semantics via `is_pinned` column, compound
reschedule mutations, and a read-only forecast API.

## Status: APPROVED — Ready for Implementation

---

## A. Compound Reschedule Transaction

The `reschedule` action performs all work server-side in a single handler invocation.

**Route:** `PATCH /rotation-planner/plans/:planId/tasks/:taskId` (existing route, new action)

**Server-side flow:**
1. Validate inputs (action, newTaskDate, status=pending)
2. Validate target date (>= today, within plan range, not day-off, not blocked, prerequisite met)
3. Load full plan context (plan, topics, tasks, availability)
4. deriveActualTopicStates (terminal tasks only)
5. Build scheduling constraints (pinnedTasks = all is_pinned=1 tasks excluding moved task + moved task with new date)
6. Generate remaining schedule via buildRotationSchedule with pinnedTasks + reservedMinutesByDate
7. assignStudyBlocks on merged list, update pinned task's displayOrder/studyBlockId
8. Persist atomically via DB.batch():
   - [0] INSERT plan_mutations (idempotency claim + revision check)
   - [1] UPDATE plans SET revision = revision + 1
   - [2] UPDATE daily_tasks SET task_date, is_pinned=1, display_order, metadata_json
   - [3] DELETE pending/locked WHERE is_pinned=0
   - [4] INSERT regenerated tasks
   - [5] UPDATE topics SET derived fields
9. Return: revision (once), updated task, counts, topicStates, feasibility

## B. Idempotency / Revision Behavior

Same mechanism as recalculation:
- clientRequestId in plan_mutations (plan-level mutation)
- Fingerprint: SHA-256 of {userId, taskId, action, payload, timezone}
- Duplicate + matching fingerprint → replay cached result
- Duplicate + different fingerprint → 409 IDEMPOTENCY_CONFLICT
- ExpectedRevision must match before batch executes
- Conditional INSERT in statement [0] ensures atomicity

## C. Supported Movable Task Types

**Status:** `pending` ONLY

| taskType | Movable? | Notes |
|----------|----------|-------|
| `learning` | YES | No prerequisite |
| `uworld_questions` | YES | Must verify learning completed |
| `consolidation` | NO | |
| `flashcard_review` | NO | System-level |
| `incorrect_review` | NO | Complex unlock chain |
| `mixed_review` | NO | System-level |
| `optional_book_questions` | NO | |

UWorld prerequisite: `topic.learningCompletedAt !== null` OR all learning tasks completed/pinned-completing by newTaskDate.

## D. Expired Pin Behavior

A pinned pending task is "expired" when:
- `is_pinned = 1 AND status = 'pending' AND task_date < recalculationDate`

During recalculation, before DELETE:
```sql
UPDATE rotation_planner_daily_tasks
SET is_pinned = 0
WHERE plan_id = ? AND is_pinned = 1 AND status = 'pending'
AND task_date < ?
```

Then the unpinned tasks enter the normal replaceable pool.

Reschedule validation prevents pinning to past dates (targetDate >= todayKey).

## E. Target Date Validation

| Rule | Check | Error |
|------|-------|-------|
| Not in past | newTaskDate >= todayKey | INVALID_TARGET_DATE |
| Within plan range | startDate <= newTaskDate <= endDate | INVALID_TARGET_DATE |
| Not a day off | availability[dayOfWeek].isDayOff === false | TARGET_IS_DAY_OFF |
| Not blocked | !blockedDates.includes(newTaskDate) | TARGET_IS_BLOCKED |
| Task is pending | task.status === 'pending' | INVALID_ACTION_TRANSITION |
| Task type supported | taskType ∈ [learning, uworld_questions] | UNSUPPORTED_TASK_TYPE |
| UWorld prereq | Learning completed by newTaskDate | PREREQUISITE_NOT_MET |

Destination overload is allowed (explicit user choice).

## F. Pinned Workload Reservation

For each pinned task on date D:
- learning: reserve estimatedMinutes from topic remaining, deduct from day capacity
- uworld_questions: reserve targetCount, deduct targetCount × avgMinutesPerQuestion from day capacity

Scheduler skips generating duplicate work for pinned topic/type. If pinned learning fully satisfies topic, scheduler excludes topic from `getTopicsNeedingLearning`.

## G. Pinned StudyBlock/DisplayOrder Persistence

After assignStudyBlocks, UPDATE pinned task's displayOrder and metadataJson.studyBlockId.
Response must equal immediate GET (no refetch needed).

## H. Dry-Run Forecast Algorithm

`GET /rotation-planner/plans/:planId/forecast` — read-only, no writes.

1. Derive actual states from terminal tasks
2. Build date capacities from availability + plan settings
3. Compute reservedMinutes from terminal tasks
4. Run dry-run scheduler (real buildRotationSchedule, no DB)
5. Compute feasibility from dry-run
6. Estimate completion from dry-run schedule
7. Compute on-track status

Returns: estimatedCompletionDate, status, remainingRequiredMinutes, availableMinutes,
missingCapacityMinutes, requiredExtraMinutesPerDay, unscheduledTopics, feasible.

## I. On-Track / At-Risk / Impossible Rules

- Infeasible → impossible (insufficient_capacity)
- Has overdue incomplete work → at_risk (overdue_work)
- Any day with hard overload (planned > raw available) → at_risk (overloaded_days)
- Otherwise → on_track

Deterministic criteria, no arbitrary thresholds.

## J. Complete Progress Metric Matrix

| # | Metric | Source | Formula |
|---|--------|--------|---------|
| 1 | Overall rotation | topics | completedTopics / totalTopics × 100 |
| 2 | Learning completion | tasks + topics | per-topic min(completedEquiv, personalizedLearningMinutes) / sum(personalizedLearningMinutes) |
| 3 | UWorld completed/total | topics | sum(completedUworld) / sum(totalUworld) × 100 |
| 4 | Incorrect review | tasks | reviewed/generated × 100 (null if 0 generated) |
| 5 | Flashcard workload | tasks | planned/actual minutes (omit if 0 tasks) |
| 6 | Current scheduled vs logged | tasks (terminal) | per-week bar chart |
| 7 | Topic status | topics | count by status |
| 8 | Delayed topics | tasks + todayKey | taskDate < todayKey AND status not terminal |
| 9 | Needs attention | topics + tasks | incorrectRemaining > 0 OR delayed |
| 10 | Estimated completion | Forecast API | last scheduled date or null |
| 11 | On-track status | Forecast API | on_track/at_risk/impossible |
| 12 | Source pace | user_source_pace | pace_multiplier WHERE activity_type='learning' |
| 13 | Estimate confidence | Source catalog | distribution of confidence values per topic |

## K. Source Pace Query

5th query in loadPlanFromDb:
```sql
SELECT pace_multiplier, sample_count, updated_at
FROM user_source_pace
WHERE user_id = ? AND source_id = ? AND activity_type = 'learning'
```

Response adds: `sourcePace: { paceMultiplier, sampleCount, updatedAt }`.

## L. Confidence Display

Per-topic `estimateConfidence` from source catalog lookup in handler.
Display raw distribution: Good: N, Medium-high: N, Medium: N, Low: N.
No synthetic score.

## M. DTO / Schema / Migration Additions

**Migration 15:** `ALTER TABLE rotation_planner_daily_tasks ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;`

**Cumulative schema:** Add `is_pinned` to CREATE TABLE.

**Schema changes:**
- `ALL_PLANNER_COLUMNS.dailyTasks`: add `'is_pinned'`
- `TASK_COLUMNS`: add `'is_pinned'`
- `mapTaskDto`: automatic via camelCase mapping
- `persistRecalculationBatch` INSERT: add `is_pinned`
- `persistRescheduleBatch` UPDATE: set `is_pinned=1`

## N. Exact File List (27 files)

### NEW (10)
1. `schema-migration15.sql` — ALTER TABLE
2. `src/components/rotation/CalendarView.jsx` — Monthly grid + week toggle
3. `src/components/rotation/CalendarView.module.css` — Calendar styles
4. `src/components/rotation/calendarUtils.js` — Timezone-safe date math
5. `src/components/rotation/DailyTaskPanel.jsx` — Drawer-based daily panel
6. `src/components/rotation/DailyTaskPanel.module.css` — Panel styles
7. `src/components/rotation/ProgressView.jsx` — Progress dashboard
8. `src/components/rotation/ProgressView.module.css` — Progress styles
9. `src/components/rotation/progressAnalytics.js` — 13 metric computations
10. `src/components/rotation/__tests__/calendarUtils.test.js`

### MODIFIED (17)
11. `schema.sql` — Add `is_pinned` to task table
12. `src/db/rotationPlannerSchema.js` — Add to ALL_PLANNER_COLUMNS
13. `src/services/rotationPlannerPlans/dtoMappers.js` — Add to TASK_COLUMNS
14. `src/services/rotationPlannerPlans/taskUpdate.js` — Add reschedule action
15. `src/services/rotationPlannerPlans/persistence.js` — Pinned exclusion + reschedule batch
16. `src/services/rotationPlannerPlans/recalculation.js` — Expired pin logic + pinned reservation
17. `src/services/rotationPlannerPlans/taskMutation.js` — buildRescheduleBatch
18. `src/services/rotationPlannerV2/buildRotationSchedule.js` — Pinned task support
19. `src/handlers/rotationPlannerPlans.js` — Reschedule + forecast + sourcePace + confidence
20. `src/components/rotation/V2PlanDetail.jsx` — Calendar + Progress tabs
21. `src/components/rotation/today/usePlannerTaskMutations.js` — rescheduleTask mutation
22-27. Test files (CalendarView, progressAnalytics, ProgressView, taskUpdate, recalculation, handler)

## O. Implementation Phases

**Phase 1:** Schema + DTO Foundation (migration, schema, columns, mapper, regression tests)
**Phase 2:** Backend Compound Reschedule (validation, scheduler mods, atomic batch, expired pins)
**Phase 3:** Forecast API (handler, on-track status, route)
**Phase 4:** Source Pace + Confidence Exposure (5th query, catalog lookup, GET response)
**Phase 5:** CalendarView (calendarUtils, monthly grid, DailyTaskPanel, move action)
**Phase 6:** ProgressView (analytics, recharts, forecast section, attention section)
**Phase 7:** Integration & Verification (tabs, mutations, tests, build, deploy)

## P. Required Tests

### Backend
- Reschedule happy path (learning, uworld)
- Validation rejections (past date, day-off, blocked, wrong status, wrong type, prereq)
- Concurrent revision conflict → 409
- Idempotency replay
- Pinned task survives recalculation
- Expired pin unpinned before DELETE
- Pinned workload reservation
- Scheduler skips pinned topic/type
- Forecast feasible + infeasible
- GET includes sourcePace + estimateConfidence
- is_pinned default false on old rows

### Frontend
- calendarUtils: addDays, getMonthGrid, day-off, overload
- CalendarView: monthly grid, week toggle, day click, move action
- progressAnalytics: all 13 metrics with edge cases
- ProgressView: render sections, flashcard omit, forecast fallback
