import { PLANNER_TABLES } from '../../db/rotationPlannerSchema.js'

export async function getActiveFlashcardCapacityOwner(env, userId) {
  const row = await env.DB.prepare(
    `SELECT id, revision, status, uses_flashcard_capacity
     FROM ${PLANNER_TABLES.plans}
      WHERE user_id = ? AND status IN ('draft', 'active') AND uses_flashcard_capacity = 1
     LIMIT 1`
  ).bind(userId).first()

  if (!row) return null

  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    usesFlashcardCapacity: row.uses_flashcard_capacity === 1,
  }
}
