import { json, log } from '../lib/worker-utils.js'
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
  loadPlanById, loadTaskById, loadTopicById, loadPlanRevision,
  loadTopicsByPlan, loadTasksByPlan, loadAvailabilityByPlan,
  checkTaskIdempotency, checkPlanIdempotency,
  classifyCreateBatchError, classifyBatchError, buildTaskMutationBatch, executeTaskMutationBatch,
  applyTaskUpdate, calculateTaskUpdateFingerprint, calculateRecalculationFingerprint,
  recalculatePlan, deriveActualTopicStates, persistRecalculationBatch,
  TERMINAL_STATUSES, VALID_ACTIONS, getFlashcardCapacityOwner,
} from '../services/rotationPlannerPlans/index.js'
import { computeReviewWorkloadMap } from '../services/flashcardWorkload.js'
import { computeSafeNewCardForecast } from '../services/flashcardForecast.js'
import { computeExistingReviewBaseline, createEmptyFlashcardForecast } from '../services/rotationPlannerPlans/forecastIntegration.js'
import { addDays } from '../services/rotationPlannerV2/dateUtils.js'
import { mapPlanSummaryDto, mapPlanDto, mapAvailabilityDto, mapTopicDto, mapTaskDto, mapToSnakeCase } from '../services/rotationPlannerPlans/dtoMappers.js'
import { isValidTimezone, getDateKeyForTimezone } from '../lib/dateUtils.js'
import { buildRotationSchedule } from '../services/rotationPlannerV2/buildRotationSchedule.js'
import { generateDateRange } from '../services/rotationPlannerV2/dateUtils.js'
import { assignStudyBlocks } from '../services/rotationPlannerV2/studyBlockAssignment.js'
import { buildReservedMinutesMap } from '../services/rotationPlannerPlans/recalculation.js'
import { findNormalizedTopic } from '../data/studySources/normalizedRegistry.js'

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

    const owner = await getFlashcardCapacityOwner(env, user.sub)
    if (!owner) {
      try {
        const workload = await computeReviewWorkloadMap({
          env,
          userId: user.sub,
          startDate: validation.parsed.startDate,
          endDate: validation.parsed.endDate,
          effectiveStartDate: validation.parsed.startDate,
          timezone: validation.parsed.timezone || 'UTC',
          availabilityByWeekday: validation.parsed.availability,
          blockedDates: validation.parsed.blockedDates || [],
          planTopics: (validation.parsed.topics || []).map(t => ({
            planTopicId: t.sourceTopicId || t.normalizedTopicId,
            canonicalTopicId: t.canonicalTopicId,
            displayOrder: t.displayOrder ?? Infinity,
          })),
          mappingOverlay: null,
        })
        validation.parsed.dueReviewMinutesByDate = workload.dueReviewMinutesByDate || {}
        validation.parsed.topicBreakdownByDate = workload.topicBreakdownByDate || {}
      } catch (_) {
        // Best-effort
      }
    }

    const { preview, sourceVersion } = generatePlanPreview(resolvedTopics, validation.parsed)
    const fingerprint = await calculateScheduleFingerprint(user.sub, { ...validation.parsed, sourceVersion })

    // ─── Forecast computation for preview (advisory only) ───
    let flashcardForecast = createEmptyFlashcardForecast()
    if (owner) {
      const fs = validation.parsed.flashcardSettings || {}
      const limit = fs.maxProjectedFlashcardReviewMinutesPerDay
      if (Number.isInteger(limit) && limit > 0) {
        try {
          const timezone = validation.parsed.timezone || 'UTC'
          const forecastHorizonEndDate = addDays(validation.parsed.endDate, 30)
          const existingReviewCardCountByDate = await computeExistingReviewBaseline({
            env,
            userId: user.sub,
            forecastHorizonEndDate,
            effectiveStartDate: validation.parsed.startDate,
            timezone,
            availabilityByWeekday: validation.parsed.availability,
            blockedDates: validation.parsed.blockedDates || [],
          })
          flashcardForecast = await computeSafeNewCardForecast({
            env,
            userId: user.sub,
            usesFlashcardCapacity: true,
            startDate: validation.parsed.startDate,
            endDate: validation.parsed.endDate,
            effectiveStartDate: validation.parsed.startDate,
            timezone,
            availabilityByWeekday: validation.parsed.availability,
            blockedDates: validation.parsed.blockedDates || [],
            planTopics: resolvedTopics.map(t => ({
              planTopicId: t.planTopicId || t.normalizedTopicId,
              canonicalTopicId: t.canonicalTopicId,
              displayOrder: t.displayOrder ?? Infinity,
              status: 'not_started',
              learningCompletedAt: null,
            })),
            learningUnlockMode: fs.learningUnlockMode || 'learning_completed',
            maxProjectedFlashcardReviewMinutesPerDay: limit,
            existingReviewCardCountByDate,
          })
        } catch (_) {
          // Best-effort for preview
        }
      }
    }

    const source = (() => {
      try { return getStudySource(validation.parsed.sourceId) } catch { return null }
    })()

    const planDto = {
      id: null,
      userId: user.sub,
      scheduleFingerprint: fingerprint,
      rotationId: validation.parsed.rotationId,
      sourceId: validation.parsed.sourceId,
      sourceTitle: source?.title || validation.parsed.sourceId,
      sourceVersion,
      startDate: validation.parsed.startDate,
      endDate: validation.parsed.endDate,
      examDate: validation.parsed.examDate || null,
      studyStyle: validation.parsed.studyStyle,
      schedulingMode: validation.parsed.schedulingMode,
      questionStartRule: validation.parsed.questionStartRule,
      preferredQuestionsPerDay: validation.parsed.preferredQuestionsPerDay,
      minimumQuestionsPerSession: validation.parsed.minimumQuestionsPerSession,
      maximumQuestionsPerDay: validation.parsed.maximumQuestionsPerDay,
      averageMinutesPerQuestion: validation.parsed.averageMinutesPerQuestion,
      bufferPercentage: validation.parsed.bufferPercentage,
      maximumActiveTopics: validation.parsed.maximumActiveTopics,
      status: 'preview',
      usesFlashcardCapacity: owner ? 1 : 0,
      settingsJson: {
        timezone: validation.parsed.timezone || 'UTC',
        blockedDates: validation.parsed.blockedDates || [],
        availability: validation.parsed.availability,
        topics: validation.parsed.topics,
        forecastSettings: validation.parsed.flashcardSettings || {},
        forecast: flashcardForecast,
      },
      createdAt: null,
      updatedAt: null,
      revision: 0,
      lastRecalculatedAt: null,
    }

    return json({
      plan: planDto,
      topics: resolvedTopics.map(t => ({
        normalizedTopicId: t.normalizedTopicId,
        canonicalTopicId: t.canonicalTopicId,
        sourceTopicId: t.sourceTopicId,
        sourceId: t.sourceId,
        title: t.title,
        groupId: t.groupId,
        learningMinutes: t.learningMinutes,
        uworldRemainingQuestions: t.uworldRemainingQuestions,
        alreadyCompletedLearningPercentage: t.alreadyCompletedLearningPercentage,
        alreadyCompletedQuestionCount: t.alreadyCompletedQuestionCount,
      })),
      tasks: preview.tasks,
      availability: validation.parsed.availability.map((a, i) => ({
        id: null,
        planId: null,
        weekday: a.weekday,
        availableMinutes: a.availableMinutes,
        isDayOff: a.isDayOff ?? false,
      })),
    })
  } catch (e) {
    log('rotation_planner:preview:error', { message: e.message, stack: e.stack?.slice(0, 500), cause: e.cause?.message })
    return errorResponse('INTERNAL_ERROR', 'Failed to generate preview.', 500)
  }
}

export async function handleCreateRotationPlan(request, env, user) {
  let clientRequestId, requestFingerprint
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

    const owner = await getFlashcardCapacityOwner(env, user.sub)
    if (!owner) {
      try {
        const workload = await computeReviewWorkloadMap({
          env,
          userId: user.sub,
          startDate: validation.parsed.startDate,
          endDate: validation.parsed.endDate,
          effectiveStartDate: validation.parsed.startDate,
          timezone: validation.parsed.timezone || 'UTC',
          availabilityByWeekday: validation.parsed.availability,
          blockedDates: validation.parsed.blockedDates || [],
          planTopics: (validation.parsed.topics || []).map(t => ({
            planTopicId: t.sourceTopicId || t.normalizedTopicId,
            canonicalTopicId: t.canonicalTopicId,
            displayOrder: t.displayOrder ?? Infinity,
          })),
          mappingOverlay: null,
        })
        validation.parsed.dueReviewMinutesByDate = workload.dueReviewMinutesByDate || {}
        validation.parsed.topicBreakdownByDate = workload.topicBreakdownByDate || {}
      } catch (_) {
        // Best-effort
      }
    }

    const { preview, sourceVersion, config } = generatePlanPreview(resolvedTopics, validation.parsed)
    const scheduleFingerprint = await calculateScheduleFingerprint(user.sub, { ...validation.parsed, sourceVersion })
    requestFingerprint = await calculateRequestFingerprint(user.sub, { ...validation.parsed, sourceVersion })
    clientRequestId = validation.parsed.clientRequestId

    const idemCheck = await checkPlanIdempotency(env, user.sub, clientRequestId)
    if (idemCheck.status === 'found') {
      if (idemCheck.existingFingerprint === requestFingerprint) {
        return json(idemCheck.resultJson)
      }
      return errorResponse('IDEMPOTENCY_CONFLICT', 'Same idempotency key with different input.', 409)
    }

    if (validation.parsed.previewToken && validation.parsed.previewToken !== scheduleFingerprint) {
      return errorResponse('PREVIEW_STALE', 'previewToken does not match current input. Regenerate preview.', 409)
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

    // ─── Forecast computation for creation (best-effort) ───
    let creationForecast = createEmptyFlashcardForecast()
    if (owner) {
      const fs = validation.parsed.flashcardSettings || {}
      const limit = fs.maxProjectedFlashcardReviewMinutesPerDay
      if (Number.isInteger(limit) && limit > 0) {
        try {
          const timezone = validation.parsed.timezone || 'UTC'
          const forecastHorizonEndDate = addDays(validation.parsed.endDate, 30)
          const existingReviewCardCountByDate = await computeExistingReviewBaseline({
            env,
            userId: user.sub,
            forecastHorizonEndDate,
            effectiveStartDate: validation.parsed.startDate,
            timezone,
            availabilityByWeekday: validation.parsed.availability,
            blockedDates: validation.parsed.blockedDates || [],
          })
          creationForecast = await computeSafeNewCardForecast({
            env,
            userId: user.sub,
            usesFlashcardCapacity: true,
            startDate: validation.parsed.startDate,
            endDate: validation.parsed.endDate,
            effectiveStartDate: validation.parsed.startDate,
            timezone,
            availabilityByWeekday: validation.parsed.availability,
            blockedDates: validation.parsed.blockedDates || [],
            planTopics: resolvedTopics.map(t => ({
              planTopicId: t.planTopicId || t.normalizedTopicId,
              canonicalTopicId: t.canonicalTopicId,
              displayOrder: t.displayOrder ?? Infinity,
              status: 'not_started',
              learningCompletedAt: null,
            })),
            learningUnlockMode: fs.learningUnlockMode || 'learning_completed',
            maxProjectedFlashcardReviewMinutesPerDay: limit,
            existingReviewCardCountByDate,
          })
        } catch (_) {
          // Best-effort for creation
        }
      }
    }

    const { planId } = await persistPlanBatch(
      env, user.sub, validation.parsed, resolvedTopics, preview,
      clientRequestId, requestFingerprint, creationForecast
    )

    const plan = await loadPlanFromDb(env, planId, user.sub)
    return json(plan, 201)
  } catch (e) {
    log('rotation_planner:create_plan:error', {
      message: e.message,
      stack: e.stack?.slice(0, 500),
      cause: e.cause?.message,
      userId: user?.sub,
    })
    if (clientRequestId && e.message && e.message.includes('UNIQUE constraint failed')) {
      try {
        const classified = await classifyCreateBatchError(env, user.sub, clientRequestId, requestFingerprint)
        if (classified.type === 'replay') return json(classified.resultJson)
        if (classified.type === 'IDEMPOTENCY_CONFLICT') {
          return errorResponse('IDEMPOTENCY_CONFLICT', 'Same idempotency key with different input.', 409)
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
    log('rotation_planner:list_plans:error', { message: e.message, stack: e.stack?.slice(0, 500) })
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

    try {
      const { results: paceRows } = await env.DB.prepare(
        'SELECT pace_multiplier, sample_count, updated_at FROM user_source_pace WHERE user_id = ? AND source_id = ? AND activity_type = ?'
      ).bind(user.sub, plan.plan.sourceId, 'learning').all()

      plan.sourcePace = paceRows.length > 0 ? {
        paceMultiplier: paceRows[0].pace_multiplier,
        sampleCount: paceRows[0].sample_count,
        updatedAt: paceRows[0].updated_at,
      } : null
    } catch (_e) {
      plan.sourcePace = null
    }

    const source = getStudySource(plan.plan.sourceId)
    if (source && plan.topics) {
      for (const topic of plan.topics) {
        const registryTopic = source.topics?.find(
          t => t.topic_id === topic.sourceTopicId
        )
        topic.estimateConfidence = registryTopic?.estimate_confidence || null
      }
    }

    return json(plan)
  } catch (e) {
    log('rotation_planner:get_plan:error', { message: e.message, stack: e.stack?.slice(0, 500) })
    return errorResponse('INTERNAL_ERROR', 'Failed to get plan.', 500)
  }
}

export async function handleDeleteRotationPlan(request, env, user) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const planId = pathParts[pathParts.length - 1]

    if (!planId) return errorResponse('VALIDATION_ERROR', 'Plan ID is required.', 400)

    const { meta } = await env.DB.prepare(
      'DELETE FROM rotation_planner_plans WHERE id = ? AND user_id = ?'
    ).bind(planId, user.sub).run()

    if (meta.changes === 0) return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)

    return json({ success: true })
  } catch (e) {
    log('rotation_planner:delete_plan:error', { message: e.message, stack: e.stack?.slice(0, 500) })
    return errorResponse('INTERNAL_ERROR', 'Failed to delete plan.', 500)
  }
}

const SUPPORTED_RESCHEDULE_TYPES = new Set(['learning', 'uworld_questions'])

async function handleRescheduleCompound({
  env, user, planId, taskId, plan, taskRow, task, updatedTask, payload,
  timezone, occurredAt, occurredOn,
  currentRevision, resultingRevision, clientRequestId, fingerprint,
  resultJson,
}) {
  const T = PLANNER_TABLES
  const newTaskDate = payload.newTaskDate

  const [topics, dbTasks, availability] = await Promise.all([
    loadTopicsByPlan(env, planId),
    loadTasksByPlan(env, planId),
    loadAvailabilityByPlan(env, planId),
  ])

  if (!SUPPORTED_RESCHEDULE_TYPES.has(task.taskType)) {
    return errorResponse('UNSUPPORTED_TASK_TYPE', `Cannot reschedule task type '${task.taskType}'.`, 400)
  }

  if (newTaskDate < plan.startDate || newTaskDate > plan.endDate) {
    return errorResponse('INVALID_TARGET_DATE', 'Target date must be within the plan date range.', 400)
  }

  const todayKey = getDateKeyForTimezone(new Date().toISOString(), timezone)
  if (newTaskDate < todayKey) {
    return errorResponse('INVALID_TARGET_DATE', 'Cannot reschedule to a past date.', 400)
  }

  const dayOfWeek = new Date(newTaskDate + 'T12:00:00Z').getUTCDay()
  const availForDay = availability.find(a => a.weekday === dayOfWeek)
  if (availForDay && availForDay.isDayOff) {
    return errorResponse('TARGET_IS_DAY_OFF', 'Cannot reschedule to a day off.', 400)
  }

  const settings = typeof plan.settings_json === 'string'
    ? JSON.parse(plan.settings_json)
    : (plan.settings_json || {})
  if (settings.blockedDates && settings.blockedDates.includes(newTaskDate)) {
    return errorResponse('TARGET_IS_BLOCKED', 'Cannot reschedule to a blocked date.', 400)
  }

  if (task.taskType === 'uworld_questions' && taskRow.plan_topic_id) {
    const topic = topics.find(t => t.id === taskRow.plan_topic_id)
    if (topic && !topic.learning_completed_at) {
      const hasPinnedLearning = dbTasks.some(t =>
        t.is_pinned && t.plan_topic_id === taskRow.plan_topic_id &&
        t.task_type === 'learning' && t.task_date <= newTaskDate
      )
      if (!hasPinnedLearning) {
        return errorResponse('PREREQUISITE_NOT_MET', 'Learning must be completed before scheduling UWorld questions.', 400)
      }
    }
  }

  const actualStates = deriveActualTopicStates(topics, dbTasks, { asOfDate: occurredOn })

  const topicInputMap = new Map()
  for (const topic of topics) {
    topicInputMap.set(topic.canonical_topic_id, topic)
  }

  const pinnedTasks = dbTasks
    .filter(t => t.is_pinned && t.status === 'pending' && t.id !== taskId)
    .map(t => {
      const tp = topics.find(x => x.id === t.plan_topic_id)
      return {
        ...t,
        taskDate: t.task_date,
        taskType: t.task_type,
        estimatedMinutes: t.estimated_minutes,
        targetCount: t.target_count,
        planTopicId: t.plan_topic_id,
        canonicalTopicId: tp?.canonical_topic_id || null,
      }
    })

  pinnedTasks.push({
    id: taskId,
    taskDate: newTaskDate,
    taskType: task.taskType,
    estimatedMinutes: task.estimatedMinutes,
    targetCount: task.targetCount,
    planTopicId: taskRow.plan_topic_id,
    isPinned: 1,
    canonicalTopicId: taskRow.plan_topic_id ? (topics.find(t => t.id === taskRow.plan_topic_id)?.canonical_topic_id || null) : null,
  })

  const remainingDates = generateDateRange(occurredOn, plan.end_date)
  const terminalTasks = dbTasks.filter(t => TERMINAL_STATUSES.has(t.status))
  const reservedMinutesByDate = buildReservedMinutesMap(terminalTasks, remainingDates)

  const planConfig = {
    rotationId: plan.rotation_id,
    sourceId: plan.source_id,
    startDate: occurredOn,
    endDate: plan.end_date,
    examDate: plan.exam_date || undefined,
    studyStyle: plan.study_style,
    schedulingMode: plan.scheduling_mode,
    questionStartRule: plan.question_start_rule,
    preferredQuestionsPerDay: plan.preferred_questions_per_day,
    minimumQuestionsPerSession: plan.minimum_questions_per_session,
    maximumQuestionsPerDay: plan.maximum_questions_per_day,
    averageMinutesPerQuestion: plan.average_minutes_per_question,
    bufferPercentage: plan.buffer_percentage,
    maximumActiveTopics: plan.maximum_active_topics,
    availabilityByWeekday: availability,
    blockedDates: settings.blockedDates || [],
    personalSourcePaceMultiplier: settings.personalSourcePaceMultiplier || 1.0,
    examReviewWindowDays: settings.examReviewWindowDays || 0,
    mixedReviewQuestionsPerDay: settings.mixedReviewQuestionsPerDay || 0,
    dueReviewMinutesByDate: settings.dueReviewMinutesByDate || {},
    topicBreakdownByDate: settings.topicBreakdownByDate || {},
    topics: topics.map(t => {
      const registryTopic = findNormalizedTopic(plan.source_id, t.normalized_topic_id?.split('::')[1])
      const learningMinutes = registryTopic?.learningMinutes || {
        focused: t.base_learning_minutes || 0,
        activeExpected: t.base_learning_minutes || 0,
        detailedNotes: t.base_learning_minutes || 0,
      }
      return {
        normalizedTopicId: t.normalized_topic_id,
        canonicalTopicId: t.canonical_topic_id,
        sourceTopicId: t.source_topic_id || registryTopic?.sourceTopicId || '',
        title: t.topic_title,
        learningMinutes,
        uworldRemainingQuestions: Math.max(0, (t.total_uworld_questions || 0) - (t.completed_uworld_questions || 0)),
        alreadyCompletedLearningPercentage: t.learning_completed_at ? 1.0 : 0,
        alreadyCompletedQuestionCount: t.completed_uworld_questions || 0,
        incorrectQuestionsRemaining: t.incorrect_questions_remaining || 0,
        prerequisiteTopicIds: [],
        sharedTopicKey: t.shared_topic_key || registryTopic?.sharedTopicKey || null,
      }
    }),
  }

  const initialTopicStates = {}
  for (const state of actualStates) {
    initialTopicStates[state.canonicalTopicId] = {
      normalizedTopicId: state.normalizedTopicId,
      canonicalTopicId: state.canonicalTopicId,
      sourceTopicId: topicInputMap.get(state.canonicalTopicId)?.source_topic_id || null,
      title: topicInputMap.get(state.canonicalTopicId)?.topic_title || '',
      baseLearningMinutes: state.baseLearningMinutes,
      personalizedLearningMinutes: state.personalizedLearningMinutes,
      totalUworldQuestions: state.totalUworldQuestions,
      completedUworldQuestions: state.completedUworldQuestions,
      remainingUworldQuestions: Math.max(0, state.totalUworldQuestions - state.completedUworldQuestions),
      learningCompletedAt: state.learningCompletedAt,
      questionsUnlockedAt: state.questionsUnlockedAt,
      status: state.status,
      incorrectQuestionsRemaining: state.incorrectQuestionsRemaining,
      displayOrder: topics.findIndex(t => t.canonical_topic_id === state.canonicalTopicId),
      satisfiedBySharedCompletion: false,
      isPrimarySharedUnit: true,
    }
  }

  const recalculation = buildRotationSchedule(planConfig, {
    initialTopicStates,
    scheduleStartDate: occurredOn,
    reservedMinutesByDate,
    pinnedTasks,
  })

  const topicMap = new Map()
  for (const t of topics) {
    topicMap.set(t.normalized_topic_id, { sourceId: plan.source_id, groupId: t.group_id })
  }

  const generatedTasks = recalculation.recalculation?.tasks || recalculation.tasks || []
  const assignedTasks = assignStudyBlocks(generatedTasks, topicMap)

  const movedTaskUpdated = assignedTasks.find(t => t.id === taskId)
  const movedDisplayOrder = movedTaskUpdated?.displayOrder ?? 0
  const movedMetadata = movedTaskUpdated?.metadata || {}

  const regeneratedForInsert = assignedTasks
    .filter(t => t.id !== taskId)
    .map(t => ({
      id: crypto.randomUUID(),
      planTopicId: t.planTopicId || null,
      taskDate: t.taskDate,
      taskType: t.taskType,
      provider: t.provider || null,
      estimatedMinutes: t.estimatedMinutes || 0,
      targetCount: t.targetCount || 0,
      mode: t.mode || null,
      questionPool: t.questionPool || null,
      status: 'pending',
      unlockCondition: t.unlockCondition || null,
      displayOrder: t.displayOrder || 0,
      metadataJson: JSON.stringify(t.metadata || {}),
    }))

  const mutationId = crypto.randomUUID()
  const tasksJson = JSON.stringify(regeneratedForInsert)

  const updatedTopicStates = recalculation.recalculation?.topicStates || recalculation.topicStates || []
  const topicsJson = JSON.stringify(updatedTopicStates.map(ts => ({
    id: topics.find(t => t.canonical_topic_id === ts.canonicalTopicId)?.id,
    completedUworldQuestions: ts.completedUworldQuestions,
    incorrectQuestionsRemaining: ts.incorrectQuestionsRemaining,
    learningCompletedAt: ts.learningCompletedAt,
    questionsUnlockedAt: ts.questionsUnlockedAt,
    status: ts.status,
  })).filter(t => t.id))

  // Enrich the result BEFORE persisting so the stored mutation result_json is the
  // exact response shape — an idempotent replay must return an identical body.
  resultJson.isPinned = true
  resultJson.taskDate = newTaskDate
  resultJson.displayOrder = movedDisplayOrder
  resultJson.studyBlockId = movedTaskUpdated?.studyBlockId || null
  resultJson.created = regeneratedForInsert.length
  resultJson.preserved = pinnedTasks.length

  const statements = []

  statements.push(env.DB.prepare(
    `INSERT INTO ${T.planMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, operation, result_json)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE EXISTS (
       SELECT 1 FROM ${T.plans} WHERE id = ? AND user_id = ? AND revision = ?
     )`
  ).bind(
    mutationId, planId, user.sub, clientRequestId || `reschedule-${taskId}-${Date.now()}`, fingerprint,
    currentRevision, resultingRevision, 'reschedule', JSON.stringify(resultJson),
    planId, user.sub, currentRevision
  ))

  statements.push(env.DB.prepare(
    `UPDATE ${T.plans} SET revision = revision + 1, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND EXISTS (
       SELECT 1 FROM ${T.planMutations} WHERE id = ?
     )`
  ).bind(planId, user.sub, mutationId))

  statements.push(env.DB.prepare(
    `UPDATE ${T.dailyTasks} SET task_date = ?, is_pinned = 1, display_order = ?, metadata_json = ?, updated_at = datetime('now')
     WHERE id = ? AND EXISTS (
       SELECT 1 FROM ${T.planMutations} WHERE id = ?
     )`
  ).bind(newTaskDate, movedDisplayOrder, JSON.stringify({ ...movedMetadata, studyBlockId: movedTaskUpdated?.studyBlockId || null }), taskId, mutationId))

  statements.push(env.DB.prepare(
    `DELETE FROM ${T.dailyTasks}
     WHERE plan_id = ? AND status IN ('pending', 'locked') AND is_pinned = 0
       AND EXISTS (
         SELECT 1 FROM ${T.planMutations} WHERE id = ?
       )`
  ).bind(planId, mutationId))

  statements.push(env.DB.prepare(
    `INSERT INTO ${T.dailyTasks} (id, plan_id, plan_topic_id, task_date, task_type, provider, estimated_minutes, target_count, completed_count, mode, question_pool, status, unlock_condition, display_order, is_pinned, metadata_json)
     SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.planTopicId'), json_extract(value, '$.taskDate'), json_extract(value, '$.taskType'), json_extract(value, '$.provider'), json_extract(value, '$.estimatedMinutes'), json_extract(value, '$.targetCount'), 0, json_extract(value, '$.mode'), json_extract(value, '$.questionPool'), json_extract(value, '$.status'), json_extract(value, '$.unlockCondition'), json_extract(value, '$.displayOrder'), 0, json_extract(value, '$.metadataJson')
     FROM json_each(?)
     WHERE EXISTS (SELECT 1 FROM ${T.planMutations} WHERE id = ?)`
  ).bind(planId, tasksJson, mutationId))

  if (topicsJson && topicsJson !== '[]') {
    statements.push(env.DB.prepare(
      `UPDATE ${T.topics} SET
         completed_uworld_questions = CAST(json_extract(j.value, '$.completedUworldQuestions') AS INTEGER),
         incorrect_questions_remaining = CAST(json_extract(j.value, '$.incorrectQuestionsRemaining') AS INTEGER),
         learning_completed_at = json_extract(j.value, '$.learningCompletedAt'),
         questions_unlocked_at = json_extract(j.value, '$.questionsUnlockedAt'),
         status = json_extract(j.value, '$.status')
       FROM json_each(?) AS j
       WHERE ${T.topics}.id = json_extract(j.value, '$.id')
         AND ${T.topics}.plan_id = ?
         AND EXISTS (
           SELECT 1 FROM ${T.planMutations} WHERE id = ?
         )`
    ).bind(topicsJson, planId, mutationId))
  }

  const batchResults = await env.DB.batch(statements)

  // The planMutations INSERT (statement 0) is the authoritative revision CAS.
  // Zero affected rows means the revision advanced between the pre-flight check
  // and this batch — perform zero writes and report the conflict.
  if (batchResults[0]?.meta?.changes === 0) {
    return errorResponse('PLAN_REVISION_CONFLICT', 'Plan has been modified since you last loaded it. Please refresh.', 409)
  }

  return json(resultJson)
}

export async function handleUpdateTask(request, env, user) {
  let planId, taskId, clientRequestId, expectedRevision, fingerprint, recalculationRequired, action
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    taskId = pathParts[pathParts.length - 1]
    planId = pathParts[pathParts.length - 3]

    if (!planId || !taskId) return errorResponse('VALIDATION_ERROR', 'Plan ID and Task ID are required.', 400)

    const body = await request.json()
    const { action: bodyAction, payload = {}, clientRequestId: bodyClientId, expectedRevision: bodyRev, timezone: bodyTimezone } = body
    action = bodyAction
    clientRequestId = request.headers.get('Idempotency-Key') || bodyClientId || null
    expectedRevision = bodyRev

    if (bodyTimezone && !isValidTimezone(bodyTimezone)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid timezone.', 400)
    }
    const timezone = bodyTimezone || 'UTC'

    if (!action || !VALID_ACTIONS.has(action)) {
      return errorResponse('VALIDATION_ERROR', `Invalid action. Must be one of: ${[...VALID_ACTIONS].join(', ')}`, 400)
    }

    if (typeof expectedRevision !== 'number' || expectedRevision < 0 || !Number.isInteger(expectedRevision)) {
      return errorResponse('VALIDATION_ERROR', 'expectedRevision is required and must be a non-negative integer.', 400)
    }

    const plan = await loadPlanById(env, planId, user.sub)
    if (!plan) return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)

    const taskRow = await loadTaskById(env, taskId, planId)
    if (!taskRow) return errorResponse('TASK_NOT_FOUND', 'Task not found.', 404)

    const currentRevision = await loadPlanRevision(env, planId)

    if (expectedRevision !== currentRevision) {
      return errorResponse('PLAN_REVISION_CONFLICT', 'Plan has been modified since you last loaded it. Please refresh.', 409)
    }

    const occurredAt = new Date().toISOString()
    const occurredOn = getDateKeyForTimezone(occurredAt, timezone)

    fingerprint = await calculateTaskUpdateFingerprint(user.sub, taskId, action, payload, bodyTimezone)

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

    if (action === 'reschedule' && recalculationRequired) {
      return await handleRescheduleCompound({
        env, user, planId, taskId, plan, taskRow, task, updatedTask, payload,
        timezone, occurredAt, occurredOn,
        currentRevision, resultingRevision, clientRequestId, fingerprint,
        resultJson,
      })
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

    let topicFields = null
    const topicRow = await loadTopicById(env, taskRow.plan_topic_id)
    if (topicRow) {
      const currentStatus = topicRow.status || 'not_started'
      const STATUS_ORDER = ['not_started', 'learning', 'questions_locked', 'uworld_in_progress', 'incorrect_review', 'maintenance', 'completed']
      const currentIdx = STATUS_ORDER.indexOf(currentStatus)

      let newTopicStatus = null

      if (action === 'start') {
        if ((task.taskType === 'learning' || task.taskType === 'consolidation') && currentStatus === 'not_started') {
          newTopicStatus = 'learning'
        } else if (task.taskType === 'uworld_questions' && currentIdx < STATUS_ORDER.indexOf('uworld_in_progress')) {
          newTopicStatus = 'uworld_in_progress'
        }
      } else if (action === 'complete') {
        // Topic status transitions for learning completion are handled by recalculation.
        // Individual task completion should not prematurely set questions_locked.
      }

      if (newTopicStatus && newTopicStatus !== currentStatus) {
        topicFields = { topicId: topicRow.id, status: newTopicStatus }
      }
    }

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
      topicFields,
    })

    await executeTaskMutationBatch(env, batch)

    return json(resultJson)
  } catch (e) {
    if (clientRequestId && e.message && e.message.includes('UNIQUE constraint failed')) {
      try {
        const classified = await classifyBatchError(
          env, user.sub, clientRequestId, fingerprint, planId, expectedRevision,
          action === 'reschedule' ? 'plan' : 'task'
        )
        if (classified.type === 'replay') {
          const storedResult = typeof classified.resultJson === 'string'
            ? JSON.parse(classified.resultJson)
            : classified.resultJson
          return json(storedResult)
        }
        if (classified.type === 'IDEMPOTENCY_CONFLICT') {
          return errorResponse('IDEMPOTENCY_CONFLICT', 'Same idempotency key with different input.', 409)
        }
        if (classified.type === 'PLAN_REVISION_CONFLICT') {
          return errorResponse('PLAN_REVISION_CONFLICT', 'Plan was modified by another request.', 409)
        }
      } catch (_) {}
    }
    log('rotation_planner:update_task:error', { message: e.message, stack: e.stack?.slice(0, 500), taskId, planId })
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

    fingerprint = await calculateRecalculationFingerprint(user.sub, planId, recalculationDate, expectedRevision)

    if (clientRequestId) {
      const idemCheck = await checkPlanIdempotency(env, user.sub, clientRequestId)
      if (idemCheck.status === 'found') {
        if (idemCheck.existingFingerprint === fingerprint) {
          return json(idemCheck.resultJson)
        }
        return errorResponse('IDEMPOTENCY_CONFLICT', 'Same idempotency key with different input.', 409)
      }
    }

    const plan = await loadPlanById(env, planId, user.sub)
    if (!plan) return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)

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

    const [topics, allTasks, availability] = await Promise.all([
      loadTopicsByPlan(env, planId),
      loadTasksByPlan(env, planId),
      loadAvailabilityByPlan(env, planId),
    ])

    const PRESERVED_STATUSES = new Set(['completed', 'partial', 'skipped'])
    const preservedTasks = allTasks.filter(t => PRESERVED_STATUSES.has(t.status))

    const derivedTopicStates = deriveActualTopicStates(topics, preservedTasks, { asOfDate: recalculationDate })

    let recalcResult
    try {
      recalcResult = await recalculatePlan(env, planId, user.sub, recalculationDate, {
        derivedTopicStates,
        preservedTasks,
      })
    } catch (e) {
      if (e.message === 'PLAN_NOT_FOUND') {
        return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)
      }
      throw e
    }

    const topicIdByNormalized = new Map()
    for (const topic of topics) {
      topicIdByNormalized.set(topic.normalized_topic_id, topic.id)
    }

    const schedulerTasks = recalcResult.recalculation?.tasks || recalcResult.recalculation?.recalculation?.tasks || []
    const regeneratedTasks = schedulerTasks.map(task => ({
      ...task,
      id: crypto.randomUUID(),
      planTopicId: topicIdByNormalized.get(task.normalizedTopicId) || null,
    }))

    const resultingRevision = expectedRevision + 1
    const recalculatedAt = new Date().toISOString()

    const resultJson = {
      planId,
      revision: resultingRevision,
      recalculationDate,
      replayed: false,
      tasks: {
        created: regeneratedTasks.length,
        modified: 0,
        preserved: preservedTasks.length,
      },
      topicStates: derivedTopicStates.map(ts => ({
        id: ts.canonicalTopicId,
        status: ts.status,
        learningComplete: !!ts.learningCompletedAt,
        projectedQuestionsRemaining: Math.max(0, ts.totalUworldQuestions - ts.completedUworldQuestions),
      })),
      feasibility: recalcResult.recalculation?.feasibility || recalcResult.recalculation?.recalculation?.feasibility || {},
    }

    // ─── Forecast computation for recalculation (best-effort) ───
    let forecastSnapshot = createEmptyFlashcardForecast()
    const planSettings = typeof plan.settings_json === 'string'
      ? JSON.parse(plan.settings_json)
      : (plan.settings_json || {})
    const forecastSettings = planSettings.forecastSettings || {}
    const limit = forecastSettings.maxProjectedFlashcardReviewMinutesPerDay
    if (plan.uses_flashcard_capacity === 1 && Number.isInteger(limit) && limit > 0) {
      try {
        const timezone = planSettings.timezone || 'UTC'
        const forecastHorizonEndDate = addDays(plan.end_date, 30)
        const existingReviewCardCountByDate = await computeExistingReviewBaseline({
          env,
          userId: user.sub,
          forecastHorizonEndDate,
          effectiveStartDate: recalculationDate,
          timezone,
          availabilityByWeekday: availability,
          blockedDates: planSettings.blockedDates || [],
        })
        const topicStatesForForecast = recalcResult.recalculation?.topicStates || recalcResult.recalculation?.recalculation?.topicStates || []
        forecastSnapshot = await computeSafeNewCardForecast({
          env,
          userId: user.sub,
          usesFlashcardCapacity: true,
          startDate: recalculationDate,
          endDate: plan.end_date,
          effectiveStartDate: recalculationDate,
          timezone,
          availabilityByWeekday: availability,
          blockedDates: planSettings.blockedDates || [],
          planTopics: topicStatesForForecast.map(ts => ({
            planTopicId: ts.planTopicId || topics.find(t => t.canonical_topic_id === ts.canonicalTopicId)?.id,
            canonicalTopicId: ts.canonicalTopicId,
            displayOrder: ts.displayOrder ?? Infinity,
            status: ts.status || 'not_started',
            learningCompletedAt: ts.learningCompletedAt || null,
          })),
          learningUnlockMode: forecastSettings.learningUnlockMode || 'learning_completed',
          maxProjectedFlashcardReviewMinutesPerDay: limit,
          existingReviewCardCountByDate,
        })
      } catch (_) {
        // Best-effort for recalculation
      }
    }

    const recalculationMutationId = crypto.randomUUID()
    const batchResults = await persistRecalculationBatch(env, {
      planId,
      userId: user.sub,
      expectedRevision,
      clientRequestId: clientRequestId || `recalc-${planId}-${Date.now()}`,
      requestFingerprint: fingerprint,
      operation: 'recalculate',
      regeneratedTasks,
      updatedTopics: derivedTopicStates,
      resultJson,
      recalculationMutationId,
      recalculatedAt,
      recalculationDate,
      workloadSnapshot: recalcResult.workloadSnapshot,
      forecastSnapshot,
    })

    if (batchResults[0]?.meta?.changes === 0) {
      return errorResponse('PLAN_REVISION_CONFLICT', 'Plan has been modified since you last loaded it. Please refresh.', 409)
    }

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
    log('rotation_planner:recalculate:error', { message: e.message, stack: e.stack?.slice(0, 500), planId })
    return errorResponse('INTERNAL_ERROR', 'Failed to recalculate plan.', 500)
  }
}

function computeOnTrackStatus(plan, feasibility, tasks, todayKey) {
  if (!feasibility.feasible) {
    return { status: 'impossible', reason: 'insufficient_capacity' }
  }
  const PRESERVED = new Set(['completed', 'partial', 'skipped'])
  const hasOverdue = tasks.some(t =>
    !PRESERVED.has(t.status) && t.task_date && t.task_date < todayKey
  )
  if (hasOverdue) {
    return { status: 'at_risk', reason: 'overdue_work' }
  }
  return { status: 'on_track', reason: null }
}

export async function handleGetPlanForecast(request, env, user) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const planId = pathParts[pathParts.length - 2]

    if (!planId) return errorResponse('VALIDATION_ERROR', 'Plan ID is required.', 400)

    const plan = await loadPlanById(env, planId, user.sub)
    if (!plan) return errorResponse('PLAN_NOT_FOUND', 'Plan not found.', 404)

    const [topics, allTasks, availability] = await Promise.all([
      loadTopicsByPlan(env, planId),
      loadTasksByPlan(env, planId),
      loadAvailabilityByPlan(env, planId),
    ])

    const settings = typeof plan.settings_json === 'string'
      ? JSON.parse(plan.settings_json)
      : (plan.settings_json || {})

    const timezone = settings.timezone || 'UTC'
    const todayKey = getDateKeyForTimezone(new Date().toISOString(), timezone)

    const PRESERVED = new Set(['completed', 'partial', 'skipped'])
    const terminalTasks = allTasks.filter(t => PRESERVED.has(t.status))
    const derivedStates = deriveActualTopicStates(topics, terminalTasks, { asOfDate: todayKey })

    const remainingDates = generateDateRange(todayKey, plan.end_date)
    const reservedMinutesByDate = buildReservedMinutesMap(terminalTasks, remainingDates)

    const topicInputMap = new Map()
    for (const topic of topics) {
      topicInputMap.set(topic.canonical_topic_id, topic)
    }

    const planConfig = {
      rotationId: plan.rotation_id,
      sourceId: plan.source_id,
      startDate: todayKey,
      endDate: plan.end_date,
      examDate: plan.exam_date || undefined,
      studyStyle: plan.study_style,
      schedulingMode: plan.scheduling_mode,
      questionStartRule: plan.question_start_rule,
      preferredQuestionsPerDay: plan.preferred_questions_per_day,
      minimumQuestionsPerSession: plan.minimum_questions_per_session,
      maximumQuestionsPerDay: plan.maximum_questions_per_day,
      averageMinutesPerQuestion: plan.average_minutes_per_question,
      bufferPercentage: plan.buffer_percentage,
      maximumActiveTopics: plan.maximum_active_topics,
      availabilityByWeekday: availability,
      blockedDates: settings.blockedDates || [],
      personalSourcePaceMultiplier: settings.personalSourcePaceMultiplier || 1.0,
      examReviewWindowDays: settings.examReviewWindowDays || 0,
      mixedReviewQuestionsPerDay: settings.mixedReviewQuestionsPerDay || 0,
      dueReviewMinutesByDate: settings.dueReviewMinutesByDate || {},
      topicBreakdownByDate: settings.topicBreakdownByDate || {},
      topics: topics.map(t => {
        const registryTopic = findNormalizedTopic(plan.source_id, t.normalized_topic_id?.split('::')[1])
        const learningMinutes = registryTopic?.learningMinutes || {
          focused: t.base_learning_minutes || 0,
          activeExpected: t.base_learning_minutes || 0,
          detailedNotes: t.base_learning_minutes || 0,
        }
        return {
          normalizedTopicId: t.normalized_topic_id,
          canonicalTopicId: t.canonical_topic_id,
          sourceTopicId: t.source_topic_id || registryTopic?.sourceTopicId || '',
          title: t.topic_title,
          learningMinutes,
          uworldRemainingQuestions: Math.max(0, (t.total_uworld_questions || 0) - (t.completed_uworld_questions || 0)),
          alreadyCompletedLearningPercentage: t.learning_completed_at ? 1.0 : 0,
          alreadyCompletedQuestionCount: t.completed_uworld_questions || 0,
          incorrectQuestionsRemaining: t.incorrect_questions_remaining || 0,
          prerequisiteTopicIds: [],
          sharedTopicKey: t.shared_topic_key || registryTopic?.sharedTopicKey || null,
        }
      }),
    }

    const initialTopicStates = {}
    for (const state of derivedStates) {
      initialTopicStates[state.canonicalTopicId] = {
        normalizedTopicId: state.normalizedTopicId,
        canonicalTopicId: state.canonicalTopicId,
        sourceTopicId: topicInputMap.get(state.canonicalTopicId)?.source_topic_id || null,
        title: topicInputMap.get(state.canonicalTopicId)?.topic_title || '',
        baseLearningMinutes: state.baseLearningMinutes,
        personalizedLearningMinutes: state.personalizedLearningMinutes,
        totalUworldQuestions: state.totalUworldQuestions,
        completedUworldQuestions: state.completedUworldQuestions,
        remainingUworldQuestions: Math.max(0, state.totalUworldQuestions - state.completedUworldQuestions),
        learningCompletedAt: state.learningCompletedAt,
        questionsUnlockedAt: state.questionsUnlockedAt,
        status: state.status,
        incorrectQuestionsRemaining: state.incorrectQuestionsRemaining,
        displayOrder: topics.findIndex(t => t.canonical_topic_id === state.canonicalTopicId),
        satisfiedBySharedCompletion: false,
        isPrimarySharedUnit: true,
      }
    }

    const dryRunResult = buildRotationSchedule(planConfig, {
      initialTopicStates,
      scheduleStartDate: todayKey,
      reservedMinutesByDate,
    })

    const feasibility = dryRunResult.feasibility || {}

    const dryRunTasks = dryRunResult.tasks || []
    const scheduledDates = dryRunTasks.map(t => t.taskDate).filter(Boolean).sort()
    const lastScheduledDate = scheduledDates.length > 0 ? scheduledDates[scheduledDates.length - 1] : null

    const status = computeOnTrackStatus(plan, feasibility, allTasks, todayKey)

    return json({
      estimatedCompletionDate: feasibility.feasible ? lastScheduledDate : null,
      status: status.status,
      statusReason: status.reason,
      remainingRequiredMinutes: feasibility.totalRequiredMinutes || 0,
      availableMinutes: feasibility.availableMinutes || 0,
      missingCapacityMinutes: feasibility.missingCapacity || 0,
      requiredExtraMinutesPerDay: feasibility.requiredExtraMinutesPerDay || 0,
      unscheduledTopics: feasibility.topicsLeftUnscheduled || [],
      feasible: feasibility.feasible !== false,
    })
  } catch (e) {
    log('rotation_planner:forecast:error', { message: e.message, stack: e.stack?.slice(0, 500) })
    return errorResponse('INTERNAL_ERROR', 'Failed to compute forecast.', 500)
  }
}
