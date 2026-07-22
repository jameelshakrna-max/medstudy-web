import { PLANNER_TABLES } from '../../db/rotationPlannerSchema.js'

const T = PLANNER_TABLES

const CALIBRATABLE_TYPES = new Set(['learning', 'uworld_questions'])

export function computeSessionValidity(task, actualMinutes, completedCount, interrupted) {
  if (interrupted) return { validForCalibration: 0, reason: 'interrupted' }
  if (!actualMinutes || actualMinutes <= 0) return { validForCalibration: 0, reason: 'zero_active_minutes' }

  if (!CALIBRATABLE_TYPES.has(task.taskType)) {
    return { validForCalibration: 0, reason: 'unsupported_task_type' }
  }

  if (task.taskType === 'learning') {
    if (!task.estimatedMinutes || task.estimatedMinutes <= 0) return { validForCalibration: 0, reason: 'zero_planned_minutes' }
    const completionPct = task.completionPercentage ?? 0
    const expectedMinutes = task.estimatedMinutes * (completionPct / 100)
    if (expectedMinutes <= 0) return { validForCalibration: 0, reason: 'zero_expected_minutes' }
    const ratio = actualMinutes / expectedMinutes
    if (!isFinite(ratio) || ratio < 0.1 || ratio > 10.0) return { validForCalibration: 0, reason: 'outlier_ratio' }
    return { validForCalibration: 1, reason: null }
  }

  if (task.taskType === 'uworld_questions') {
    if (!task.targetCount || task.targetCount <= 0) return { validForCalibration: 0, reason: 'zero_target_count' }
    if (!completedCount || completedCount <= 0) return { validForCalibration: 0, reason: 'zero_completed' }
    const plannedMinutesPerQuestion = task.estimatedMinutes / task.targetCount
    const expectedMinutes = completedCount * plannedMinutesPerQuestion
    if (expectedMinutes <= 0) return { validForCalibration: 0, reason: 'zero_expected_minutes' }
    const ratio = actualMinutes / expectedMinutes
    if (!isFinite(ratio) || ratio < 0.1 || ratio > 10.0) return { validForCalibration: 0, reason: 'outlier_ratio' }
    return { validForCalibration: 1, reason: null }
  }

  return { validForCalibration: 0, reason: 'unsupported_task_type' }
}

export function getActivityIdentity(taskType, sourceId, studyStyle) {
  if (taskType === 'learning') {
    return { sourceId, activityType: `learning:${studyStyle || 'active'}` }
  }
  if (taskType === 'uworld_questions') {
    return { sourceId: 'uworld', activityType: 'questions:tutor:topic-specific' }
  }
  return null
}

export async function recordSession(env, userId, task, actualMinutes, completedCount, mutationId) {
  const identity = getActivityIdentity(task.taskType, task.provider || task.sourceId, task.mode)
  if (!identity) return null

  const validity = computeSessionValidity(task, actualMinutes, completedCount, 0)
  const completionPct = task.completionPercentage ?? 0

  const sessionId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO ${T.taskSessions} (id, user_id, task_id, source_id, activity_type, planned_minutes, active_minutes, completion_percentage, interrupted, valid_for_calibration, calibration_invalid_reason, mutation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(sessionId, userId, task.id, identity.sourceId, identity.activityType, task.estimatedMinutes, actualMinutes, completionPct, validity.validForCalibration, validity.reason, mutationId).run()

  return sessionId
}

export async function calculateSourcePace(env, userId, sourceId, activityType) {
  const { results } = await env.DB.prepare(
    `SELECT active_minutes, planned_minutes, completion_percentage FROM ${T.taskSessions} WHERE user_id = ? AND source_id = ? AND activity_type = ? AND valid_for_calibration = 1 AND active_minutes > 0 AND planned_minutes > 0 ORDER BY created_at DESC LIMIT 10`
  ).bind(userId, sourceId, activityType).all()

  const recent = (results || []).filter(r => {
    const created = r.created_at
    if (created) {
      const d = new Date(created)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      if (d < thirtyDaysAgo) return false
    }
    return true
  })

  if (recent.length < 3) return 1.0

  const ratios = recent.map(r => {
    if (!r.planned_minutes || r.planned_minutes <= 0 || !r.active_minutes || r.active_minutes <= 0) return null
    const expected = r.planned_minutes
    const ratio = r.active_minutes / expected
    if (!isFinite(ratio) || ratio < 0.1 || ratio > 10.0) return null
    return ratio
  }).filter(r => r !== null)

  if (ratios.length < 3) return 1.0

  ratios.sort((a, b) => a - b)
  const mid = Math.floor(ratios.length / 2)
  const median = ratios.length % 2 !== 0 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2

  return Math.max(0.5, Math.min(2.0, median))
}

export async function updateUserSourcePace(env, userId, sourceId, activityType) {
  const pace = await calculateSourcePace(env, userId, sourceId, activityType)
  const { results: samples } = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM ${T.taskSessions} WHERE user_id = ? AND source_id = ? AND activity_type = ? AND valid_for_calibration = 1`
  ).bind(userId, sourceId, activityType).all()

  const sampleCount = samples?.[0]?.cnt ?? 0

  await env.DB.prepare(
    `INSERT OR REPLACE INTO ${T.userSourcePace} (user_id, source_id, activity_type, pace_multiplier, sample_count, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).bind(userId, sourceId, activityType, pace, sampleCount).run()

  return pace
}
