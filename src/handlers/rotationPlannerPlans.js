import { json } from '../lib/worker-utils.js'
import { getStudySource } from '../data/studySources/sourceRegistry.js'
import { PLANNER_TABLES } from '../db/rotationPlannerSchema.js'
import {
  parseAndValidatePlanRequest,
  resolveTopicsFromRegistry,
  generatePlanPreview,
  calculateScheduleFingerprint,
  calculateRequestFingerprint,
  checkIdempotency,
  persistPlanBatch,
  loadPlanFromDb,
  loadPlanSummaries,
  loadPlanById, loadTaskById, loadPlanRevision, updatePlanRevisionAndRecalculatedAt,
  checkTaskIdempotency, checkPlanIdempotency,
  classifyBatchError, buildTaskMutationBatch, executeTaskMutationBatch,
  applyTaskUpdate, calculateTaskUpdateFingerprint, calculateRecalculationFingerprint,
  recalculatePlan, buildRecalculationResult, recordSession,
  TERMINAL_STATUSES, VALID_ACTIONS,
} from '../services/rotationPlannerPlans/index.js'
import { mapPlanSummaryDto, mapPlanDto, mapAvailabilityDto, mapTopicDto, mapTaskDto, mapToSnakeCase } from '../services/rotationPlannerPlans/dtoMappers.js'

function errorResponse(code, message, status = 400, details = null) {
  const body = { error: { code, message } }
  if (details) body.error.details = details
  return json(body, status)
}

export async function handlePreviewRotationPlan(request, env, user) {
  try {
    const body = await request.json()
    const validation = parseAndValidatePlanRequest(request, body, { requireIdempotencyKey: false })
    if (!validation.valid) {
      return errorResponse('VALIDATION_ERROR', validation.errors.map(e => e.message).join('; '), 400)
    }

    const { resolvedTopics, errors: resolutionErrors } = resolveTopicsFromRegistry(
      validation.parsed.sourceId,
      validation.parsed.rotationId,
      validation.parsed.topics
    )
    if (resolutionErrors.length > 0) {
      return errorResponse(resolutionErrors[0].code, resolutionErrors[0].message, 404)
    }

    const { preview, sourceVersion } = generatePlanPreview(resolvedTopics, validation.parsed)
    const fingerprint = await calculateScheduleFingerprint(user.sub, { ...validation.parsed, sourceVersion })

    return json({
      previewToken: fingerprint,
      sourceVersion,
      tasks: preview.tasks,
      topicStates: preview.topicStates,
      unscheduledWork: preview.unscheduledWork,
      feasibility: preview.feasibility,
      deduplicationLog: preview.deduplicationLog,
    })
  } catch (e) {
    return errorResponse('INTERNAL_ERROR', 'Failed to generate preview.', 500)
  }
}

export async function handleCreateRotationPlan(request, env, user) {
  try {
    const body = await request.json()
    const validation = parseAndValidatePlanRequest(request, body, { requireIdempotencyKey: true })
    if (!validation.valid) {
      return errorResponse('VALIDATION_ERROR', validation.errors.map(e => e.message).join('; '), 400)
    }

    const { resolvedTopics, errors: resolutionErrors } = resolveTopicsFromRegistry(
      validation.parsed.sourceId,
      validation.parsed.rotationId,
      validation.parsed.topics
    )
    if (resolutionErrors.length > 0) {
      return errorResponse(resolutionErrors[0].code, resolutionErrors[0].message, 404)
    }

    const { preview, sourceVersion, config } = generatePlanPreview(resolvedTopics, validation.parsed)
    const scheduleFingerprint = await calculateScheduleFingerprint(user.sub, { ...validation.parsed, sourceVersion })
    const requestFingerprint = await calculateRequestFingerprint(user.sub, { ...validation.parsed, sourceVersion })

    if (validation.parsed.previewToken && validation.parsed.previewToken !== scheduleFingerprint) {
      return errorResponse('PREVIEW_STALE', 'previewToken does not match current input. Regenerate preview.', 409)
    }

    const idemCheck = await checkIdempotency(env, user.sub, validation.parsed.clientRequestId)
    if (idemCheck.status === 'found') {
      if (idemCheck.existingFingerprint === requestFingerprint) {
        const existing = await loadPlanFromDb(env, idemCheck.existingPlanId, user.sub)
        return json(existing)
      }
      return errorResponse('IDEMPOTENCY_CONFLICT', 'Same idempotency key with different input.', 409)
    }

    if (!preview.feasibility.feasible && !validation.parsed.acceptOverload) {
      return json({
        error: {
          code: 'PLAN_INFEASIBLE',
          message: 'Plan exceeds available capacity. Set acceptOverload to true to create a draft.',
          details: {
            missingCapacityMinutes: preview.feasibility.missingCapacity,
            topicsLeftUnscheduled: preview.feasibility.topicsLeftUnscheduled,
            possibleSolutions: preview.feasibility.possibleSolutions,
          },
        },
      }, 422)
    }

    const { planId } = await persistPlanBatch(
      env, user.sub, validation.parsed, resolvedTopics, preview,
      validation.parsed.clientRequestId, requestFingerprint
    )

    const plan = await loadPlanFromDb(env, planId, user.sub)
    return json(plan, 201)
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE constraint failed')) {
      try {
        const body = await request.clone().json()
        const validation = parseAndValidatePlanRequest(request, body, { requireIdempotencyKey: true })
        if (validation.valid) {
          const idemCheck = await checkIdempotency(env, user.sub, validation.parsed.clientRequestId)
          if (idemCheck.status === 'found') {
            const existing = await loadPlanFromDb(env, idemCheck.existingPlanId, user.sub)
            return json(existing)
          }
        }
      } catch (_) {}
    }
    return errorResponse('INTERNAL_ERROR', 'Failed to create plan.', 500)
  }
}

export async function handleListRotationPlans(request, env, user) {
  try {
    const summaries = await loadPlanSummaries(env, user.sub)
    return json(summaries)
  } catch (e) {
    return errorResponse('INTERNAL_ERROR', 'Failed to list plans.', 500)
  }
}

export async function handleGetRotationPlan(request, env, user) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const planId = pathParts[pathParts.length - 1]

    if (!planId) return errorResponse('VALIDATION_ERROR', 'Plan ID is required.', 400)

    const plan = await loadPlanFromDb(env, planId, user.sub)
    if (!plan) return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)

    return json(plan)
  } catch (e) {
    return errorResponse('INTERNAL_ERROR', 'Failed to get plan.', 500)
  }
}

export async function handleDeleteRotationPlan(request, env, user) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const planId = pathParts[pathParts.length - 1]

    if (!planId) return errorResponse('VALIDATION_ERROR', 'Plan ID is required.', 400)

    const { results: existing } = await env.DB.prepare(
      'SELECT id FROM rotation_planner_plans WHERE id = ? AND user_id = ?'
    ).bind(planId, user.sub).all()

    if (!existing.length) return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)

    await env.DB.prepare('DELETE FROM rotation_planner_plans WHERE id = ?').bind(planId).run()

    return json({ success: true })
  } catch (e) {
    return errorResponse('INTERNAL_ERROR', 'Failed to delete plan.', 500)
  }
}

export async function handleUpdateTask(request, env, user) {
  let planId, taskId, clientRequestId, expectedRevision, fingerprint, recalculationRequired
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    taskId = pathParts[pathParts.length - 1]
    planId = pathParts[pathParts.length - 3]

    if (!planId || !taskId) return errorResponse('VALIDATION_ERROR', 'Plan ID and Task ID are required.', 400)

    const body = await request.json()
    const { action, payload = {}, clientRequestId: bodyClientId, expectedRevision: bodyRev } = body
    clientRequestId = request.headers.get('Idempotency-Key') || bodyClientId || null
    expectedRevision = bodyRev

    if (!action || !VALID_ACTIONS.has(action)) {
      return errorResponse('VALIDATION_ERROR', `Invalid action. Must be one of: ${[...VALID_ACTIONS].join(', ')}`, 400)
    }

    if (typeof expectedRevision !== 'number' || expectedRevision < 0 || !Number.isInteger(expectedRevision)) {
      return errorResponse('VALIDATION_ERROR', 'expectedRevision is required and must be a non-negative integer.', 400)
    }

    const plan = await loadPlanById(env, planId, user.sub)
    if (!plan) return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)

    const taskRow = await loadTaskById(env, taskId)
    if (!taskRow || taskRow.plan_id !== planId) return errorResponse('TASK_NOT_FOUND', 'Task not found.', 404)

    const currentRevision = await loadPlanRevision(env, planId)

    if (expectedRevision !== currentRevision) {
      return errorResponse('PLAN_REVISION_CONFLICT', 'Plan has been modified since you last loaded it. Please refresh.', 409)
    }

    const occurredAt = new Date().toISOString()
    const occurredOn = occurredAt.slice(0, 10)

    fingerprint = await calculateTaskUpdateFingerprint(user.sub, taskId, action, payload)

    if (clientRequestId) {
      const idemCheck = await checkTaskIdempotency(env, user.sub, clientRequestId)
      if (idemCheck.status === 'found') {
        if (idemCheck.existingFingerprint === fingerprint) {
          return json(idemCheck.existingResult)
        }
        return errorResponse('IDEMPOTENCY_CONFLICT', 'Same idempotency key with different input.', 409)
      }
    }

    const task = mapTaskDto(taskRow)
    let updatedTask
    try {
      ({ updatedTask, recalculationRequired } = applyTaskUpdate(task, action, payload, { occurredAt, occurredOn }))
    } catch (stateErr) {
      if (stateErr.message === 'INVALID_ACTION_TRANSITION') {
        return errorResponse('INVALID_ACTION_TRANSITION', `Action '${action}' is not allowed for task status '${task.status}'.`, 409)
      }
      if (stateErr.message === 'COMPLETED_TASK_IMMUTABLE') {
        return errorResponse('COMPLETED_TASK_IMMUTABLE', 'Cannot modify a completed or skipped task.', 409)
      }
      if (stateErr.message && stateErr.message.endsWith('_REQUIRED')) {
        return errorResponse('VALIDATION_ERROR', stateErr.message, 400)
      }
      return errorResponse('VALIDATION_ERROR', stateErr.message, 400)
    }

    const resultingRevision = currentRevision + 1
    const resultJson = {
      taskId,
      action,
      status: updatedTask.status,
      revision: resultingRevision,
      startedAt: updatedTask.startedAt || null,
      completedAt: updatedTask.completedAt || null,
      recalculationRequired: Boolean(recalculationRequired),
    }

    const taskFields = mapToSnakeCase({
      status: updatedTask.status,
      actualMinutes: updatedTask.actualMinutes,
      completedCount: updatedTask.completedCount,
      completionPercentage: updatedTask.completionPercentage,
      incorrectCount: updatedTask.incorrectCount,
      completedAt: updatedTask.completedAt,
      completedOn: updatedTask.completedOn,
    })

    const batch = await buildTaskMutationBatch({
      env,
      planId,
      taskId,
      userId: user.sub,
      clientRequestId: clientRequestId || `task-${taskId}-${Date.now()}`,
      requestFingerprint: fingerprint,
      expectedRevision: currentRevision,
      resultingRevision,
      action,
      resultingTaskStatus: updatedTask.status,
      occurredAt,
      occurredOn,
      resultJson,
      taskFields,
    })

    await executeTaskMutationBatch(env, batch)

    return json(resultJson)
  } catch (e) {
    if (clientRequestId && e.message && e.message.includes('UNIQUE constraint failed')) {
      try {
        const classified = await classifyBatchError(
          env, user.sub, clientRequestId, fingerprint, planId, expectedRevision, 'task'
        )
        if (classified.type === 'replay') return json(classified.resultJson)
        if (classified.type === 'IDEMPOTENCY_CONFLICT') {
          return errorResponse('IDEMPOTENCY_CONFLICT', 'Same idempotency key with different input.', 409)
        }
        if (classified.type === 'PLAN_REVISION_CONFLICT') {
          return errorResponse('PLAN_REVISION_CONFLICT', 'Plan was modified by another request.', 409)
        }
      } catch (_) {}
    }
    return errorResponse('INTERNAL_ERROR', 'Failed to update task.', 500)
  }
}

export async function handleRecalculatePlan(request, env, user) {
  let planId, clientRequestId, expectedRevision, fingerprint
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    planId = pathParts[pathParts.length - 2]

    if (!planId) return errorResponse('VALIDATION_ERROR', 'Plan ID is required.', 400)

    const body = await request.json()
    const { recalculationDate, clientRequestId: bodyClientId, expectedRevision: bodyRev } = body
    clientRequestId = request.headers.get('Idempotency-Key') || bodyClientId || null
    expectedRevision = bodyRev

    if (!recalculationDate || isNaN(Date.parse(recalculationDate))) {
      return errorResponse('VALIDATION_ERROR', 'Valid recalculationDate is required.', 400)
    }

    if (typeof expectedRevision !== 'number' || expectedRevision < 0 || !Number.isInteger(expectedRevision)) {
      return errorResponse('VALIDATION_ERROR', 'expectedRevision is required and must be a non-negative integer.', 400)
    }

    if (clientRequestId) {
      const idemCheck = await checkPlanIdempotency(env, user.sub, clientRequestId)
      if (idemCheck.status === 'found') {
        return json(idemCheck.resultJson)
      }
    }

    fingerprint = await calculateRecalculationFingerprint(user.sub, planId, recalculationDate, expectedRevision)

    const currentRevision = await loadPlanRevision(env, planId)

    if (expectedRevision !== currentRevision) {
      return errorResponse('PLAN_REVISION_CONFLICT', 'Plan has been modified since you last loaded it. Please refresh.', 409)
    }

    const { results: inProgressTasks } = await env.DB.prepare(
      `SELECT id FROM ${PLANNER_TABLES.dailyTasks} WHERE plan_id = ? AND status = 'in_progress' LIMIT 1`
    ).bind(planId).all()

    if (inProgressTasks.length > 0) {
      return errorResponse('TASK_IN_PROGRESS', 'Finish the active task before recalculating.', 409, {
        inProgressTaskId: inProgressTasks[0].id,
      })
    }

    let recalcResult
    try {
      recalcResult = await recalculatePlan(env, planId, user.sub, recalculationDate)
    } catch (e) {
      if (e.message === 'PLAN_NOT_FOUND') {
        return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)
      }
      throw e
    }

    const result = buildRecalculationResult(recalcResult, recalcResult.plan, false)

    const newRevision = currentRevision + 1
    await updatePlanRevisionAndRecalculatedAt(env, planId, newRevision, recalculationDate)

    for (const task of recalcResult.completedTasks || []) {
      recordSession(env, user.sub, task).catch(() => {})
    }

    const resultJson = {
      ...result,
      planId,
      revision: newRevision,
      recalculationDate,
    }

    const mutationId = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO ${PLANNER_TABLES.planMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, operation, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(mutationId, planId, user.sub, clientRequestId || `recalc-${planId}-${Date.now()}`, fingerprint, expectedRevision, newRevision, 'recalculate', JSON.stringify(resultJson)).run()

    return json(resultJson)
  } catch (e) {
    if (clientRequestId && e.message && e.message.includes('UNIQUE constraint failed')) {
      try {
        const classified = await classifyBatchError(
          env, user.sub, clientRequestId, fingerprint, planId, expectedRevision, 'plan'
        )
        if (classified.type === 'replay') return json(classified.resultJson)
        if (classified.type === 'IDEMPOTENCY_CONFLICT') {
          return errorResponse('IDEMPOTENCY_CONFLICT', 'Same idempotency key with different input.', 409)
        }
        if (classified.type === 'PLAN_REVISION_CONFLICT') {
          return errorResponse('PLAN_REVISION_CONFLICT', 'Plan was modified by another request.', 409)
        }
      } catch (_) {}
    }
    return errorResponse('INTERNAL_ERROR', 'Failed to recalculate plan.', 500)
  }
}
