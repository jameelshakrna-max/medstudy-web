const FLASHCARD_TASK_CARDS = 'rotation_planner_flashcard_task_cards'
const DAILY_TASKS = 'rotation_planner_daily_tasks'

const TERMINAL_TASK_STATUSES = `('completed','partial','skipped')`

export function buildFlashcardReconciliationStatements({ env, userId, cardId, reviewedAt }) {
  const satisfyStmt = env.DB.prepare(
    `UPDATE ${FLASHCARD_TASK_CARDS}
     SET satisfied_at = ?
     WHERE user_id = ? AND card_id = ? AND satisfied_at IS NULL
       AND snapshot_at <= ?
       AND EXISTS (
         SELECT 1 FROM ${DAILY_TASKS} t
         WHERE t.id = ${FLASHCARD_TASK_CARDS}.task_id
           AND t.status NOT IN ${TERMINAL_TASK_STATUSES}
       )`
  ).bind(reviewedAt, userId, cardId, reviewedAt)

  const progressStmt = env.DB.prepare(
    `UPDATE ${DAILY_TASKS} SET
       completed_count = (SELECT COUNT(*) FROM ${FLASHCARD_TASK_CARDS} c WHERE c.task_id = ${DAILY_TASKS}.id AND c.satisfied_at IS NOT NULL),
       completion_percentage = CASE
         WHEN target_count > 0 THEN MIN(100.0, 100.0 * (SELECT COUNT(*) FROM ${FLASHCARD_TASK_CARDS} c WHERE c.task_id = ${DAILY_TASKS}.id AND c.satisfied_at IS NOT NULL) / target_count)
         ELSE completion_percentage
       END,
       status = CASE
         WHEN target_count > 0 AND (SELECT COUNT(*) FROM ${FLASHCARD_TASK_CARDS} c WHERE c.task_id = ${DAILY_TASKS}.id AND c.satisfied_at IS NOT NULL) >= target_count THEN 'completed'
         ELSE status
       END,
       completed_at = CASE
         WHEN target_count > 0 AND (SELECT COUNT(*) FROM ${FLASHCARD_TASK_CARDS} c WHERE c.task_id = ${DAILY_TASKS}.id AND c.satisfied_at IS NOT NULL) >= target_count THEN ?
         ELSE completed_at
       END,
       completed_on = CASE
         WHEN target_count > 0 AND (SELECT COUNT(*) FROM ${FLASHCARD_TASK_CARDS} c WHERE c.task_id = ${DAILY_TASKS}.id AND c.satisfied_at IS NOT NULL) >= target_count THEN substr(?, 1, 10)
         ELSE completed_on
       END,
       updated_at = datetime('now')
     WHERE id IN (SELECT DISTINCT task_id FROM ${FLASHCARD_TASK_CARDS} WHERE user_id = ? AND card_id = ?)
       AND task_type = 'flashcard_review'
       AND status NOT IN ${TERMINAL_TASK_STATUSES}
       AND target_count > 0`
  ).bind(reviewedAt, reviewedAt, userId, cardId)

  return [satisfyStmt, progressStmt]
}

export async function markPlannerFlashcardSatisfied({ env, userId, cardId, reviewedAt }) {
  return env.DB.batch(buildFlashcardReconciliationStatements({ env, userId, cardId, reviewedAt }))
}
