import { json } from '../lib/worker-utils.js'
import { getStudySource } from '../data/studySources/sourceRegistry.js'
import {
  parseAndValidatePlanRequest,
  resolveTopicsFromRegistry,
  generatePlanPreview,
  calculateRequestFingerprint,
  checkIdempotency,
  persistPlanBatch,
  loadPlanFromDb,
  loadPlanSummaries,
} from '../services/rotationPlannerPlans/index.js'
import { mapPlanSummaryDto, mapPlanDto, mapAvailabilityDto, mapTopicDto, mapTaskDto } from '../services/rotationPlannerPlans/dtoMappers.js'

function errorResponse(code, message, status = 400) {
  return json({ error: { code, message } }, status)
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
    const fingerprint = await calculateRequestFingerprint(user.sub, { ...validation.parsed, sourceVersion })

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
    const fingerprint = await calculateRequestFingerprint(user.sub, { ...validation.parsed, sourceVersion })

    if (validation.parsed.previewToken && validation.parsed.previewToken !== fingerprint) {
      return errorResponse('PREVIEW_STALE', 'previewToken does not match current input. Regenerate preview.', 409)
    }

    const idemCheck = await checkIdempotency(env, user.sub, validation.parsed.clientRequestId)
    if (idemCheck.status === 'found') {
      if (idemCheck.existingFingerprint === fingerprint) {
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
      validation.parsed.clientRequestId, fingerprint
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
