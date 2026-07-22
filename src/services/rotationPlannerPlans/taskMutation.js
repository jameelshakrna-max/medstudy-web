import { PLANNER_TABLES } from '../../db/rotationPlannerSchema.js'
import { computeSessionValidity } from './sourcePace.js'

const T = PLANNER_TABLES

export async function updateTaskFields(env, taskId, fields) {
  const setClauses = []
  const values = []
  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = ?`)
    values.push(value)
  }
  setClauses.push("updated_at = datetime('now')")
  values.push(taskId)

  await env.DB.prepare(
    `UPDATE ${T.dailyTasks} SET ${setClauses.join(', ')} WHERE id = ?`
  ).bind(...values).run()
}

export async function updateTopicState(env, topicId, fields) {
  const setClauses = []
  const values = []
  for (const [key, value] of Object.entries(fields)) {
    setClauses.push(`${key} = ?`)
    values.push(value)
  }
  values.push(topicId)

  await env.DB.prepare(
    `UPDATE ${T.topics} SET ${setClauses.join(', ')} WHERE id = ?`
  ).bind(...values).run()
}

export async function loadTaskById(env, taskId) {
  const row = await env.DB.prepare(
    `SELECT * FROM ${T.dailyTasks} WHERE id = ?`
  ).bind(taskId).first()
  return row || null
}

export async function loadTasksByPlan(env, planId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM ${T.dailyTasks} WHERE plan_id = ? ORDER BY task_date, display_order`
  ).bind(planId).all()
  return results || []
}

export async function loadPlanById(env, planId, userId) {
  const row = await env.DB.prepare(
    `SELECT * FROM ${T.plans} WHERE id = ? AND user_id = ?`
  ).bind(planId, userId).first()
  return row || null
}

export async function loadTopicById(env, topicId) {
  const row = await env.DB.prepare(
    `SELECT * FROM ${T.topics} WHERE id = ?`
  ).bind(topicId).first()
  return row || null
}

export async function loadTopicsByPlan(env, planId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM ${T.topics} WHERE plan_id = ?`
  ).bind(planId).all()
  return results || []
}

export async function loadAvailabilityByPlan(env, planId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM ${T.availability} WHERE plan_id = ? ORDER BY weekday`
  ).bind(planId).all()
  return results || []
}

export async function executeTaskMutationBatch(env, statements) {
  return env.DB.batch(statements)
}

export async function checkTaskIdempotency(env, userId, clientRequestId) {
  if (!clientRequestId) return { status: 'no_key' }
  const row = await env.DB.prepare(
    `SELECT request_fingerprint, result_json FROM ${T.taskMutations} WHERE user_id = ? AND client_request_id = ?`
  ).bind(userId, clientRequestId).first()
  if (!row) return { status: 'not_found' }
  return {
    status: 'found',
    existingFingerprint: row.request_fingerprint,
    existingResult: typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json,
  }
}

export async function checkPlanIdempotency(env, userId, clientRequestId) {
  if (!clientRequestId) return { status: 'no_key' }
  const row = await env.DB.prepare(
    `SELECT request_fingerprint, result_json FROM ${T.planMutations} WHERE user_id = ? AND client_request_id = ?`
  ).bind(userId, clientRequestId).first()
  if (!row) return { status: 'not_found' }
  return {
    status: 'found',
    existingFingerprint: row.request_fingerprint,
    resultJson: row.result_json,
  }
}

export async function classifyBatchError(env, userId, clientRequestId, requestFingerprint, planId, expectedRevision, tableType) {
  const table = tableType === 'plan' ? T.planMutations : T.taskMutations

  const mutation = await env.DB.prepare(
    `SELECT request_fingerprint, result_json FROM ${table} WHERE user_id = ? AND client_request_id = ?`
  ).bind(userId, clientRequestId).first()

  if (mutation) {
    if (mutation.request_fingerprint === requestFingerprint) {
      return { type: 'replay', resultJson: mutation.result_json }
    }
    return { type: 'IDEMPOTENCY_CONFLICT' }
  }

  const plan = await env.DB.prepare(
    `SELECT revision FROM ${T.plans} WHERE id = ? AND user_id = ?`
  ).bind(planId, userId).first()

  if (plan && plan.revision !== expectedRevision) {
    return { type: 'PLAN_REVISION_CONFLICT' }
  }

  return { type: 'PERSISTENCE_ERROR' }
}

export async function buildTaskMutationBatch({ env, planId, taskId, userId, clientRequestId, requestFingerprint, expectedRevision, resultingRevision, action, resultingTaskStatus, occurredAt, occurredOn, resultJson, taskFields, topicFields, sessionData }) {
  const stmts = []

  const mutationId = crypto.randomUUID()
  stmts.push(env.DB.prepare(
    `INSERT INTO ${T.taskMutations} (id, plan_id, task_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, action, resulting_task_status, occurred_at, occurred_on, result_json) VALUES (?, (SELECT p.id FROM ${T.plans} p WHERE p.id = ? AND p.user_id = ? AND p.revision = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(mutationId, planId, userId, expectedRevision, taskId, userId, clientRequestId, requestFingerprint, expectedRevision, resultingRevision, action, resultingTaskStatus, occurredAt, occurredOn, JSON.stringify(resultJson)))

  stmts.push(env.DB.prepare(
    `UPDATE ${T.plans} SET revision = revision + 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).bind(planId, userId))

  if (taskFields) {
    const setClauses = []
    const vals = []
    for (const [key, value] of Object.entries(taskFields)) {
      setClauses.push(`${key} = ?`)
      vals.push(value)
    }
    setClauses.push("updated_at = datetime('now')")
    vals.push(taskId)
    stmts.push(env.DB.prepare(
      `UPDATE ${T.dailyTasks} SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...vals))
  }

  if (topicFields && topicFields.topicId) {
    const setClauses = []
    const vals = []
    for (const [key, value] of Object.entries(topicFields)) {
      if (key === 'topicId') continue
      setClauses.push(`${key} = ?`)
      vals.push(value)
    }
    vals.push(topicFields.topicId)
    stmts.push(env.DB.prepare(
      `UPDATE ${T.topics} SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...vals))
  }

  if (sessionData) {
    const validity = computeSessionValidity(sessionData.task, sessionData.actualMinutes, sessionData.completedCount, 0)
    const sessionId = crypto.randomUUID()
    stmts.push(env.DB.prepare(
      `INSERT INTO ${T.taskSessions} (id, user_id, task_id, source_id, activity_type, planned_minutes, active_minutes, completion_percentage, interrupted, valid_for_calibration, calibration_invalid_reason, mutation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).bind(sessionId, userId, sessionData.taskId, sessionData.sourceId, sessionData.activityType, sessionData.plannedMinutes, sessionData.actualMinutes, sessionData.completionPercentage, validity.validForCalibration, validity.reason, mutationId))
  }

  return stmts
}
