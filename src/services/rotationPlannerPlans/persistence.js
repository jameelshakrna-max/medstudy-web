import { PLANNER_TABLES } from '../../db/rotationPlannerSchema.js'
import {
  mapPlanSummaryDto, mapPlanDto, mapAvailabilityDto, mapTopicDto, mapTaskDto, mapQuestionGroupDto,
  AVAILABILITY_COLUMNS, TOPIC_COLUMNS, TASK_COLUMNS, PLAN_NESTED_COLUMNS, QUESTION_GROUP_COLUMNS,
  safeParseJson,
} from './dtoMappers.js'
import { getStudySource } from '../../data/studySources/sourceRegistry.js'
import { getSharedTopicDefinition } from '../../data/studySources/sharedTopicKeys.js'
import { getRotationById } from '../../data/studySources/rotationRegistry.js'
import { generatePlanPreview } from './previewPipeline.js'
import { createEmptyFlashcardForecast } from './forecastIntegration.js'
const TASK_METADATA_FIELDS = {
  flashcard_review: ['priority', 'dueCardCount', 'unmetReviewMinutes', 'scheduledMinutes', 'deckNames'],
  mixed_review: ['topicCount', 'includedTopicIds'],
  uworld_questions: ['selection'],
  learning: ['pageRange', 'studyStyle', 'studyBlockId'],
  incorrect_review: [],
  consolidation: [],
  optional_book_questions: [],
}

export function filterMetadata(taskType, metadata) {
  const allowed = TASK_METADATA_FIELDS[taskType] || []
  if (!allowed.length || !metadata) return {}
  const filtered = {}
  for (const key of allowed) {
    if (metadata[key] !== undefined) filtered[key] = metadata[key]
  }
  return filtered
}

function generateIds(resolvedTopics, previewTasks, questionGroups = []) {
  const planId = crypto.randomUUID()
  const availabilityIds = Array.from({ length: 7 }, () => crypto.randomUUID())
  const topicIds = resolvedTopics.map(() => crypto.randomUUID())
  const taskIds = previewTasks.map(() => crypto.randomUUID())
  const groupIds = questionGroups.map(() => crypto.randomUUID())
  return { planId, availabilityIds, topicIds, taskIds, groupIds }
}

export async function persistPlanBatch(env, userId, validatedInput, resolvedTopics, preview, clientRequestId, fingerprint, creationForecast) {
  const source = getStudySource(validatedInput.sourceId)
  const sourceVersion = source?.version || '1.0.0'
  const sourceTitle = source?.source?.title || validatedInput.sourceId

  const questionGroups = preview.questionGroups || []

  const { planId, availabilityIds, topicIds, taskIds, groupIds } = generateIds(resolvedTopics, preview.tasks, questionGroups)

  const groupIdsByKey = new Map()
  questionGroups.forEach((g, i) => groupIdsByKey.set(g.key, groupIds[i]))

  const topicIdByNormalized = new Map()
  for (let i = 0; i < resolvedTopics.length; i++) {
    topicIdByNormalized.set(resolvedTopics[i].normalizedTopicId, topicIds[i])
  }

  const forecastSettings = validatedInput.flashcardSettings || {}
  const settingsObj = {
    blockedDates: validatedInput.blockedDates,
    dueReviewMinutesByDate: validatedInput.dueReviewMinutesByDate,
    topicBreakdownByDate: validatedInput.topicBreakdownByDate,
    personalSourcePaceMultiplier: validatedInput.personalSourcePaceMultiplier,
    examReviewWindowDays: validatedInput.examReviewWindowDays,
    mixedReviewQuestionsPerDay: validatedInput.mixedReviewQuestionsPerDay,
    overloadAccepted: validatedInput.acceptOverload,
    feasibleAtCreation: preview.feasibility.feasible,
    missingCapacityAtCreation: preview.feasibility.missingCapacity,
    schedulerVersion: '2.0.0',
    forecast: creationForecast || createEmptyFlashcardForecast(),
    forecastSettings: {
      learningUnlockMode: forecastSettings.learningUnlockMode || 'learning_completed',
      maxProjectedFlashcardReviewMinutesPerDay: forecastSettings.maxProjectedFlashcardReviewMinutesPerDay ?? null,
    },
  }
  const settingsJson = JSON.stringify(settingsObj)

  const topicStateByNormalized = new Map()
  for (const state of preview.topicStates) {
    if (state.normalizedTopicId) {
      topicStateByNormalized.set(state.normalizedTopicId, state)
    }
  }

  const mutationId = crypto.randomUUID()

  const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const parsedSettingsJson = JSON.parse(settingsJson)

  function buildTaskRows(tasks, topicIdByNormalized, planId, createdAt) {
    return tasks.map((task, i) => {
      let planTopicId = null
      if (task.normalizedTopicId) {
        planTopicId = topicIdByNormalized.get(task.normalizedTopicId) || null
      }
      return {
        id: crypto.randomUUID(),
        planTopicId: planTopicId ?? null,
        planQuestionGroupId: task.groupKey ? (groupIdsByKey.get(task.groupKey) || null) : null,
        taskDate: task.taskDate,
        taskType: task.taskType,
        provider: task.provider ?? null,
        estimatedMinutes: task.estimatedMinutes,
        targetCount: task.targetCount ?? null,
        mode: task.mode ?? null,
        questionPool: task.questionPool ?? null,
        status: 'pending',
        unlockCondition: task.unlockCondition ?? null,
        displayOrder: task.displayOrder,
        metadataJson: JSON.stringify(filterMetadata(task.taskType, task.metadata)),
      }
    })
  }

  // ─── Build base result JSON (deterministic, matches loadPlanFromDb shape) ───

  const basePlanDto = {
    id: planId,
    userId,
    rotationId: validatedInput.rotationId,
    sourceId: validatedInput.sourceId,
    sourceVersion,
    startDate: validatedInput.startDate,
    endDate: validatedInput.endDate,
    examDate: validatedInput.examDate || null,
    studyStyle: validatedInput.studyStyle,
    schedulingMode: validatedInput.schedulingMode,
    questionStartRule: validatedInput.questionStartRule,
    preferredQuestionsPerDay: validatedInput.preferredQuestionsPerDay,
    minimumQuestionsPerSession: validatedInput.minimumQuestionsPerSession,
    maximumQuestionsPerDay: validatedInput.maximumQuestionsPerDay,
    averageMinutesPerQuestion: validatedInput.averageMinutesPerQuestion,
    bufferPercentage: validatedInput.bufferPercentage,
    maximumActiveTopics: validatedInput.maximumActiveTopics,
    status: 'draft',
    usesFlashcardCapacity: 0,
    uworldSchedulingMode: validatedInput.uworldSchedulingMode || 'per_topic',
    displayName: validatedInput.displayName,
    settingsJson: parsedSettingsJson,
    createdAt,
    updatedAt: createdAt,
    revision: 0,
    lastRecalculatedAt: null,
    staleAt: null,
    sourceTitle,
  }

  const baseAvailability = validatedInput.availability.map((a, i) => ({
    id: availabilityIds[i],
    planId,
    weekday: a.weekday,
    availableMinutes: a.availableMinutes,
    isDayOff: a.isDayOff ? 1 : 0,
  }))

  const baseTopics = resolvedTopics.map((t, i) => {
    const state = topicStateByNormalized.get(t.normalizedTopicId)
    return {
      id: topicIds[i],
      planId,
      normalizedTopicId: t.normalizedTopicId,
      canonicalTopicId: t.canonicalTopicId,
      sourceTopicId: t.sourceTopicId,
      sharedTopicKey: t.sharedTopicKey,
      topicTitle: t.title,
      groupId: t.groupId,
      baseLearningMinutes: state?.baseLearningMinutes ?? 0,
      personalizedLearningMinutes: state?.personalizedLearningMinutes ?? 0,
      totalUworldQuestions: state?.totalUworldQuestions ?? 0,
      completedUworldQuestions: state?.completedUworldQuestions ?? 0,
      learningCompletedAt: state?.learningCompletedAt ?? null,
      questionsUnlockedAt: state?.questionsUnlockedAt ?? null,
      status: state?.status ?? 'not_started',
      masteryScore: null,
      displayOrder: state?.displayOrder ?? i,
      incorrectQuestionsRemaining: 0,
    }
  })

  const baseTasks = preview.tasks.map((task, i) => {
    let planTopicId = null
    if (task.normalizedTopicId) {
      planTopicId = topicIdByNormalized.get(task.normalizedTopicId) || null
    }
    const filteredMeta = filterMetadata(task.taskType, task.metadata)
    return {
      id: taskIds[i],
      planId,
      planTopicId: planTopicId ?? null,
      planQuestionGroupId: task.groupKey ? (groupIdsByKey.get(task.groupKey) || null) : null,
      taskDate: task.taskDate,
      taskType: task.taskType,
      provider: task.provider ?? null,
      estimatedMinutes: task.estimatedMinutes,
      actualMinutes: null,
      targetCount: task.targetCount ?? null,
      completedCount: 0,
      mode: task.mode ?? null,
      questionPool: task.questionPool ?? null,
      status: 'pending',
      unlockCondition: task.unlockCondition ?? null,
      displayOrder: task.displayOrder,
      isPinned: 0,
      metadataJson: filteredMeta,
      createdAt,
      updatedAt: createdAt,
      completionPercentage: 0,
      incorrectCount: 0,
      completedAt: null,
      completedOn: null,
      studyBlockId: filteredMeta.studyBlockId ?? null,
    }
  })

  const baseResultJson = {
    plan: basePlanDto,
    availability: baseAvailability,
    topics: baseTopics,
    tasks: baseTasks,
    questionGroups: questionGroups.map((g, i) => ({ id: groupIds[i], ...g })),
  }

  // ─── Batch statements ───

  // S1: Insert new plan as draft with explicit timestamps
  const planStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.plans} (
      id, user_id, rotation_id, source_id, source_version,
      start_date, end_date, exam_date,
      study_style, scheduling_mode, question_start_rule,
      preferred_questions_per_day, minimum_questions_per_session,
      maximum_questions_per_day, average_minutes_per_question,
      buffer_percentage, maximum_active_topics,
      status, uses_flashcard_capacity, uworld_scheduling_mode, display_name, client_request_id, request_fingerprint, settings_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    planId, userId, validatedInput.rotationId, validatedInput.sourceId, sourceVersion,
    validatedInput.startDate, validatedInput.endDate, validatedInput.examDate || null,
    validatedInput.studyStyle, validatedInput.schedulingMode, validatedInput.questionStartRule,
    validatedInput.preferredQuestionsPerDay, validatedInput.minimumQuestionsPerSession,
    validatedInput.maximumQuestionsPerDay, validatedInput.averageMinutesPerQuestion,
    validatedInput.bufferPercentage, validatedInput.maximumActiveTopics,
    validatedInput.uworldSchedulingMode || 'per_topic', validatedInput.displayName, clientRequestId, fingerprint, settingsJson,
    createdAt, createdAt
  )

  // S2: Claim the idempotent creation mutation (FK to plan is now satisfied)
  const claimStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.planMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, operation, result_json)
     VALUES (?, ?, ?, ?, ?, 0, 0, 'create', '{}')`
  ).bind(mutationId, planId, userId, clientRequestId, fingerprint)

  const availJson = JSON.stringify(
    validatedInput.availability.map((a, i) => ({
      id: availabilityIds[i],
      weekday: a.weekday,
      availableMinutes: a.availableMinutes,
      isDayOff: a.isDayOff ? 1 : 0,
    }))
  )
  // S3: Insert availability
  const availStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.availability} (id, plan_id, weekday, available_minutes, is_day_off)
     SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.weekday'),
            json_extract(value,'$.availableMinutes'), json_extract(value,'$.isDayOff')
     FROM json_each(?)
     WHERE EXISTS (SELECT 1 FROM ${PLANNER_TABLES.planMutations} WHERE id = ?)`
  ).bind(planId, availJson, mutationId)

  const topicsJson = JSON.stringify(
    resolvedTopics.map((t, i) => {
      const state = topicStateByNormalized.get(t.normalizedTopicId)
      return {
        id: topicIds[i],
        normalizedTopicId: t.normalizedTopicId,
        canonicalTopicId: t.canonicalTopicId,
        sourceTopicId: t.sourceTopicId,
        sharedTopicKey: t.sharedTopicKey,
        topicTitle: t.title,
        groupId: t.groupId,
        baseLearningMinutes: state?.baseLearningMinutes ?? 0,
        personalizedLearningMinutes: state?.personalizedLearningMinutes ?? 0,
        totalUworldQuestions: state?.totalUworldQuestions ?? 0,
        completedUworldQuestions: state?.completedUworldQuestions ?? 0,
        learningCompletedAt: state?.learningCompletedAt ?? null,
        questionsUnlockedAt: state?.questionsUnlockedAt ?? null,
        status: state?.status ?? 'not_started',
        masteryScore: null,
        displayOrder: state?.displayOrder ?? i,
      }
    })
  )
  // S4: Insert topics
  const topicsStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.topics} (
      id, plan_id, normalized_topic_id, canonical_topic_id, source_topic_id, shared_topic_key,
      topic_title, group_id, base_learning_minutes, personalized_learning_minutes,
      total_uworld_questions, completed_uworld_questions,
      learning_completed_at, questions_unlocked_at, status, mastery_score, display_order
    ) SELECT
      json_extract(value,'$.id'), ?,
      json_extract(value,'$.normalizedTopicId'), json_extract(value,'$.canonicalTopicId'),
      json_extract(value,'$.sourceTopicId'), json_extract(value,'$.sharedTopicKey'),
      json_extract(value,'$.topicTitle'), json_extract(value,'$.groupId'),
      json_extract(value,'$.baseLearningMinutes'), json_extract(value,'$.personalizedLearningMinutes'),
      json_extract(value,'$.totalUworldQuestions'), json_extract(value,'$.completedUworldQuestions'),
      json_extract(value,'$.learningCompletedAt'), json_extract(value,'$.questionsUnlockedAt'),
      json_extract(value,'$.status'), json_extract(value,'$.masteryScore'),
      json_extract(value,'$.displayOrder')
    FROM json_each(?)
    WHERE EXISTS (SELECT 1 FROM ${PLANNER_TABLES.planMutations} WHERE id = ?)`
  ).bind(planId, topicsJson, mutationId)

  const groupsJson = JSON.stringify(questionGroups.map((g, i) => ({
    id: groupIds[i],
    groupKey: g.key,
    title: g.title,
    system: g.system || null,
    targetQuestions: g.targetQuestions,
    memberTopicIds: g.memberTopicIds || [],
    requiredTopicIds: g.requiredTopicIds || [],
    excluded: g.excluded ? 1 : 0,
    displayOrder: g.displayOrder || 0,
  })))
  // S5b: Insert question groups. Must run after S4 (topics) and before S5 (tasks):
  // daily_tasks.plan_question_group_id references question_groups.id.
  const groupsStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.questionGroups} (
       id, plan_id, group_key, title, system, target_questions,
       member_topic_ids_json, required_topic_ids_json, excluded, display_order
     ) SELECT
       json_extract(value,'$.id'), ?,
       json_extract(value,'$.groupKey'), json_extract(value,'$.title'), json_extract(value,'$.system'),
       CAST(json_extract(value,'$.targetQuestions') AS INTEGER),
       json_extract(value,'$.memberTopicIds'), json_extract(value,'$.requiredTopicIds'),
       CAST(json_extract(value,'$.excluded') AS INTEGER), CAST(json_extract(value,'$.displayOrder') AS INTEGER)
     FROM json_each(?)
     WHERE EXISTS (SELECT 1 FROM ${PLANNER_TABLES.planMutations} WHERE id = ?)`
  ).bind(planId, groupsJson, mutationId)

  const taskRows = preview.tasks.map((task, i) => {
    let planTopicId = null
    if (task.normalizedTopicId) {
      planTopicId = topicIdByNormalized.get(task.normalizedTopicId) || null
    }
    return {
      id: taskIds[i],
      planTopicId: planTopicId ?? null,
      planQuestionGroupId: task.groupKey ? (groupIdsByKey.get(task.groupKey) || null) : null,
      taskDate: task.taskDate,
      taskType: task.taskType,
      provider: task.provider ?? null,
      estimatedMinutes: task.estimatedMinutes,
      targetCount: task.targetCount ?? null,
      mode: task.mode ?? null,
      questionPool: task.questionPool ?? null,
      status: 'pending',
      unlockCondition: task.unlockCondition ?? null,
      displayOrder: task.displayOrder,
      metadataJson: JSON.stringify(filterMetadata(task.taskType, task.metadata)),
    }
  })
  const tasksJson = JSON.stringify(taskRows)
  // S5: Insert tasks with explicit timestamps
  const tasksStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.dailyTasks} (
      id, plan_id, plan_topic_id, plan_question_group_id, task_date, task_type,
      provider, estimated_minutes, actual_minutes,
      target_count, completed_count, mode, question_pool,
      status, unlock_condition, display_order, metadata_json,
      created_at, updated_at
    ) SELECT
      json_extract(value,'$.id'), ?,
      json_extract(value,'$.planTopicId'), json_extract(value,'$.planQuestionGroupId'), json_extract(value,'$.taskDate'),
      json_extract(value,'$.taskType'), json_extract(value,'$.provider'),
      json_extract(value,'$.estimatedMinutes'), NULL,
      json_extract(value,'$.targetCount'), 0,
      json_extract(value,'$.mode'), json_extract(value,'$.questionPool'),
      json_extract(value,'$.status'), json_extract(value,'$.unlockCondition'),
      json_extract(value,'$.displayOrder'), json_extract(value,'$.metadataJson'),
      ?, ?
    FROM json_each(?)
    WHERE EXISTS (SELECT 1 FROM ${PLANNER_TABLES.planMutations} WHERE id = ?)`
  ).bind(planId, createdAt, createdAt, tasksJson, mutationId)

  // S6: Claim flashcard capacity ownership.
  // The partial unique index idx_rpp_flashcard_owner enforces one owner per user
  // (user_id WHERE uses_flashcard_capacity = 1 AND status IN ('draft', 'active')).
  // If another owner already exists the index violation rolls back the batch and
  // triggers the non-owner retry below — no silent zero-row commits.
  const ownershipStmt = env.DB.prepare(
    `UPDATE ${PLANNER_TABLES.plans}
     SET uses_flashcard_capacity = 1
     WHERE id = ? AND user_id = ?
       AND status IN ('draft', 'active')
       AND uses_flashcard_capacity = 0
       AND EXISTS (
         SELECT 1 FROM ${PLANNER_TABLES.planMutations} WHERE id = ?
       )`
  ).bind(planId, userId, mutationId)

  const resultJsonPayload = JSON.stringify(baseResultJson)
  // S7: Store authoritative creation result_json — overlays persisted plan fields
  // so the snapshot reflects the committed row (e.g. usesFlashcardCapacity after S6).
  const resultJsonStmt = env.DB.prepare(
    `UPDATE ${PLANNER_TABLES.planMutations}
     SET result_json = (
       SELECT json_set(
         ?,
         '$.plan.id', p.id,
         '$.plan.status', p.status,
         '$.plan.revision', p.revision,
         '$.plan.usesFlashcardCapacity', p.uses_flashcard_capacity,
         '$.plan.createdAt', p.created_at,
         '$.plan.updatedAt', p.updated_at
       )
       FROM ${PLANNER_TABLES.plans} p
       WHERE p.id = ? AND p.user_id = ?
     )
     WHERE id = ? AND plan_id = ? AND user_id = ?`
  ).bind(resultJsonPayload, planId, userId, mutationId, planId, userId)

  try {
    const batchResults = await env.DB.batch([planStmt, claimStmt, availStmt, topicsStmt, groupsStmt, tasksStmt, ownershipStmt, resultJsonStmt])
    // Defensive: if S6 (index 6) affected zero rows, ownership claim failed silently.
    // This should no longer happen after removing NOT EXISTS (the unique index fires),
    // but guard against it to prevent silent invariant violations.
    const s6Changes = batchResults[6]?.meta?.changes
    if (s6Changes === 0) {
      const { results: blockers } = await env.DB.prepare(
        `SELECT 1 FROM ${PLANNER_TABLES.plans}
         WHERE user_id = ? AND status IN ('draft', 'active') AND uses_flashcard_capacity = 1
         LIMIT 1`
      ).bind(userId).all()
      if (blockers.length > 0) {
        throw new Error('idx_rpp_flashcard_owner: zero-row claim (existing owner blocked)')
      }
    }
  } catch (e) {
    const msg = e.message || ''
    const isOwnerConflict = msg.includes('idx_rpp_flashcard_owner') ||
      (msg.includes('UNIQUE constraint failed') && msg.includes('user_id') && !msg.includes('client_request_id'))
    if (isOwnerConflict) {
      const { preview: noWorkloadPreview } = generatePlanPreview(resolvedTopics, {
        ...validatedInput,
        dueReviewMinutesByDate: {},
        dueReviewCardCountByDate: {},
        topicBreakdownByDate: {},
        acceptOverload: true,
      })
      // Ownership race lost — use empty forecast but preserve requested forecastSettings (for future ownership transfer & deterministic replay)
      const retrySettingsObj = { ...settingsObj, forecast: createEmptyFlashcardForecast(), forecastSettings: settingsObj.forecastSettings }
      const retryQuestionGroups = noWorkloadPreview.questionGroups || []
      const retryGroupIds = retryQuestionGroups.map(() => crypto.randomUUID())
      const retryGroupIdsByKey = new Map()
      retryQuestionGroups.forEach((g, i) => retryGroupIdsByKey.set(g.key, retryGroupIds[i]))
      const retryTaskIds = noWorkloadPreview.tasks.map(() => crypto.randomUUID())
      const retryTaskRows = noWorkloadPreview.tasks.map((task, i) => {
        let planTopicId = null
        if (task.normalizedTopicId) {
          planTopicId = topicIdByNormalized.get(task.normalizedTopicId) || null
        }
        return {
          id: retryTaskIds[i],
          planTopicId: planTopicId ?? null,
          planQuestionGroupId: task.groupKey ? (retryGroupIdsByKey.get(task.groupKey) || null) : null,
          taskDate: task.taskDate,
          taskType: task.taskType,
          provider: task.provider ?? null,
          estimatedMinutes: task.estimatedMinutes,
          targetCount: task.targetCount ?? null,
          mode: task.mode ?? null,
          questionPool: task.questionPool ?? null,
          status: 'pending',
          unlockCondition: task.unlockCondition ?? null,
          displayOrder: task.displayOrder,
          metadataJson: JSON.stringify(filterMetadata(task.taskType, task.metadata)),
        }
      })
      const retryTasksJson = JSON.stringify(retryTaskRows)
      const retryGroupsJson = JSON.stringify(retryQuestionGroups.map((g, i) => ({
        id: retryGroupIds[i],
        groupKey: g.key,
        title: g.title,
        system: g.system || null,
        targetQuestions: g.targetQuestions,
        memberTopicIds: g.memberTopicIds || [],
        requiredTopicIds: g.requiredTopicIds || [],
        excluded: g.excluded ? 1 : 0,
        displayOrder: g.displayOrder || 0,
      })))
      const retryGroupsStmt = env.DB.prepare(
        `INSERT INTO ${PLANNER_TABLES.questionGroups} (
           id, plan_id, group_key, title, system, target_questions,
           member_topic_ids_json, required_topic_ids_json, excluded, display_order
         ) SELECT
           json_extract(value,'$.id'), ?,
           json_extract(value,'$.groupKey'), json_extract(value,'$.title'), json_extract(value,'$.system'),
           CAST(json_extract(value,'$.targetQuestions') AS INTEGER),
           json_extract(value,'$.memberTopicIds'), json_extract(value,'$.requiredTopicIds'),
           CAST(json_extract(value,'$.excluded') AS INTEGER), CAST(json_extract(value,'$.displayOrder') AS INTEGER)
         FROM json_each(?)
         WHERE EXISTS (SELECT 1 FROM ${PLANNER_TABLES.planMutations} WHERE id = ?)`
      ).bind(planId, retryGroupsJson, mutationId)
      const retryTasksStmt = env.DB.prepare(
        `INSERT INTO ${PLANNER_TABLES.dailyTasks} (
           id, plan_id, plan_topic_id, plan_question_group_id, task_date, task_type,
           provider, estimated_minutes, target_count, mode, question_pool,
           status, unlock_condition, display_order, metadata_json,
           created_at, updated_at
         ) SELECT
           json_extract(value,'$.id'), ?,
           json_extract(value,'$.planTopicId'), json_extract(value,'$.planQuestionGroupId'), json_extract(value,'$.taskDate'),
           json_extract(value,'$.taskType'), json_extract(value,'$.provider'),
           json_extract(value,'$.estimatedMinutes'), json_extract(value,'$.targetCount'),
           json_extract(value,'$.mode'), json_extract(value,'$.questionPool'),
           json_extract(value,'$.status'), json_extract(value,'$.unlockCondition'),
           json_extract(value,'$.displayOrder'), json_extract(value,'$.metadataJson'),
           ?, ?
         FROM json_each(?)
         WHERE EXISTS (SELECT 1 FROM ${PLANNER_TABLES.planMutations} WHERE id = ?)`
      ).bind(planId, createdAt, createdAt, retryTasksJson, mutationId)

      const retryBaseTasks = noWorkloadPreview.tasks.map((task, i) => {
        let planTopicId = null
        if (task.normalizedTopicId) {
          planTopicId = topicIdByNormalized.get(task.normalizedTopicId) || null
        }
        const filteredMeta = filterMetadata(task.taskType, task.metadata)
        return {
          id: retryTaskIds[i],
          planId,
          planTopicId: planTopicId ?? null,
          planQuestionGroupId: task.groupKey ? (retryGroupIdsByKey.get(task.groupKey) || null) : null,
          taskDate: task.taskDate,
          taskType: task.taskType,
          provider: task.provider ?? null,
          estimatedMinutes: task.estimatedMinutes,
          actualMinutes: null,
          targetCount: task.targetCount ?? null,
          completedCount: 0,
          mode: task.mode ?? null,
          questionPool: task.questionPool ?? null,
          status: 'pending',
          unlockCondition: task.unlockCondition ?? null,
          displayOrder: task.displayOrder,
          isPinned: 0,
          metadataJson: filteredMeta,
          createdAt,
          updatedAt: createdAt,
          completionPercentage: 0,
          incorrectCount: 0,
          completedAt: null,
          completedOn: null,
          studyBlockId: filteredMeta.studyBlockId ?? null,
        }
      })
      const retrySettingsJson = JSON.stringify(retrySettingsObj)
      const retryPlanStmt = env.DB.prepare(
        `INSERT INTO ${PLANNER_TABLES.plans} (
          id, user_id, rotation_id, source_id, source_version,
          start_date, end_date, exam_date,
          study_style, scheduling_mode, question_start_rule,
          preferred_questions_per_day, minimum_questions_per_session,
          maximum_questions_per_day, average_minutes_per_question,
          buffer_percentage, maximum_active_topics,
          status, uses_flashcard_capacity, uworld_scheduling_mode, display_name, client_request_id, request_fingerprint, settings_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        planId, userId, validatedInput.rotationId, validatedInput.sourceId, sourceVersion,
        validatedInput.startDate, validatedInput.endDate, validatedInput.examDate || null,
        validatedInput.studyStyle, validatedInput.schedulingMode, validatedInput.questionStartRule,
        validatedInput.preferredQuestionsPerDay, validatedInput.minimumQuestionsPerSession,
        validatedInput.maximumQuestionsPerDay, validatedInput.averageMinutesPerQuestion,
        validatedInput.bufferPercentage, validatedInput.maximumActiveTopics,
        validatedInput.uworldSchedulingMode || 'per_topic', validatedInput.displayName, clientRequestId, fingerprint, retrySettingsJson,
        createdAt, createdAt
      )

      const retryPlanDto = { ...basePlanDto, settingsJson: retrySettingsObj }
      const retryResultJson = { ...baseResultJson, plan: retryPlanDto, tasks: retryBaseTasks, questionGroups: retryQuestionGroups.map((g, i) => ({ id: retryGroupIds[i], ...g })) }
      const retryResultJsonPayload = JSON.stringify(retryResultJson)
      const retryResultJsonStmt = env.DB.prepare(
        `UPDATE ${PLANNER_TABLES.planMutations}
         SET result_json = (
           SELECT json_set(
             ?,
             '$.plan.id', p.id,
             '$.plan.status', p.status,
             '$.plan.revision', p.revision,
             '$.plan.usesFlashcardCapacity', p.uses_flashcard_capacity,
             '$.plan.createdAt', p.created_at,
             '$.plan.updatedAt', p.updated_at
           )
           FROM ${PLANNER_TABLES.plans} p
           WHERE p.id = ? AND p.user_id = ?
         )
         WHERE id = ? AND plan_id = ? AND user_id = ?`
      ).bind(retryResultJsonPayload, planId, userId, mutationId, planId, userId)

      await env.DB.batch([retryPlanStmt, claimStmt, availStmt, topicsStmt, retryGroupsStmt, retryTasksStmt, retryResultJsonStmt])
    } else {
      throw e
    }
  }

  return { planId, topicIds, taskIds }
}

export async function loadPlanFromDb(env, planId, userId) {
  const { results: planRows } = await env.DB.prepare(
    'SELECT id, user_id, rotation_id, source_id, source_version, start_date, end_date, exam_date, study_style, scheduling_mode, question_start_rule, preferred_questions_per_day, minimum_questions_per_session, maximum_questions_per_day, average_minutes_per_question, buffer_percentage, maximum_active_topics, status, uses_flashcard_capacity, uworld_scheduling_mode, settings_json, created_at, updated_at, revision, last_recalculated_at, stale_at, display_name FROM rotation_planner_plans WHERE id = ? AND user_id = ?'
  ).bind(planId, userId).all()

  if (!planRows.length) return null

  const { results: availRows } = await env.DB.prepare(
    'SELECT id, plan_id, weekday, available_minutes, is_day_off FROM rotation_planner_availability WHERE plan_id = ? ORDER BY weekday'
  ).bind(planId).all()

  const { results: topicRows } = await env.DB.prepare(
    'SELECT id, plan_id, normalized_topic_id, canonical_topic_id, source_topic_id, shared_topic_key, topic_title, group_id, base_learning_minutes, personalized_learning_minutes, total_uworld_questions, completed_uworld_questions, learning_completed_at, questions_unlocked_at, status, mastery_score, display_order, incorrect_questions_remaining FROM rotation_planner_topics WHERE plan_id = ? ORDER BY display_order'
  ).bind(planId).all()

  const { results: taskRows } = await env.DB.prepare(
    'SELECT id, plan_id, plan_topic_id, plan_question_group_id, task_date, task_type, provider, estimated_minutes, actual_minutes, target_count, completed_count, mode, question_pool, status, unlock_condition, display_order, is_pinned, metadata_json, created_at, updated_at, completion_percentage, incorrect_count, completed_at, completed_on FROM rotation_planner_daily_tasks WHERE plan_id = ? ORDER BY task_date, display_order'
  ).bind(planId).all()

  const { results: questionGroupRows } = await env.DB.prepare(
    `SELECT ${QUESTION_GROUP_COLUMNS.join(', ')} FROM ${PLANNER_TABLES.questionGroups} WHERE plan_id = ? ORDER BY display_order`
  ).bind(planId).all()

  return {
    plan: (() => {
      const source = getStudySource(planRows[0].source_id)
      const sourceTitle = source?.source?.title || planRows[0].source_id
      const rotation = getRotationById(planRows[0].rotation_id)
      const dto = mapPlanDto(
        planRows[0],
        sourceTitle,
        rotation?.displayLabel || null
      )
      dto.sourceTitle = sourceTitle
      return dto
    })(),
    availability: availRows.map(r => mapAvailabilityDto(r)),
    topics: topicRows.map(r => mapTopicDto(r)),
    tasks: taskRows.map(r => mapTaskDto(r)),
    questionGroups: questionGroupRows.map(mapQuestionGroupDto),
  }
}

export async function loadQuestionGroupsByPlan(env, planId) {
  const { results } = await env.DB.prepare(
    `SELECT ${QUESTION_GROUP_COLUMNS.join(', ')} FROM ${PLANNER_TABLES.questionGroups}
     WHERE plan_id = ? ORDER BY display_order`
  ).bind(planId).all()
  return (results || []).map(mapQuestionGroupDto)
}

export async function loadPlanSummaries(env, userId) {
  const { results: planRows } = await env.DB.prepare(
    'SELECT id, user_id, rotation_id, source_id, source_version, start_date, end_date, exam_date, study_style, scheduling_mode, question_start_rule, preferred_questions_per_day, minimum_questions_per_session, maximum_questions_per_day, average_minutes_per_question, buffer_percentage, maximum_active_topics, status, uses_flashcard_capacity, uworld_scheduling_mode, settings_json, created_at, updated_at, revision, last_recalculated_at, stale_at, display_name FROM rotation_planner_plans WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all()

  const summaries = []
  for (const row of planRows) {
    const planId = row.id

    const { results: topicCounts } = await env.DB.prepare(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = \'completed\' THEN 1 ELSE 0 END) as completed FROM rotation_planner_topics WHERE plan_id = ?'
    ).bind(planId).all()

    const { results: taskCounts } = await env.DB.prepare(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = \'completed\' THEN 1 ELSE 0 END) as completed FROM rotation_planner_daily_tasks WHERE plan_id = ?'
    ).bind(planId).all()

    const source = getStudySource(row.source_id)
    const sourceTitle = source?.source?.title || row.source_id
    const rotation = getRotationById(row.rotation_id)

    summaries.push(mapPlanSummaryDto(row, sourceTitle, {
      topicCount: topicCounts[0]?.total ?? 0,
      completedTopicCount: topicCounts[0]?.completed ?? 0,
      taskCount: taskCounts[0]?.total ?? 0,
      completedTaskCount: taskCounts[0]?.completed ?? 0,
    }, rotation?.displayLabel || null))
  }

  return summaries
}

export async function loadPlanRevision(env, planId) {
  const row = await env.DB.prepare(
    `SELECT revision FROM ${PLANNER_TABLES.plans} WHERE id = ?`
  ).bind(planId).first()
  return row ? row.revision : 0
}

export async function updatePlanRevisionAndRecalculatedAt(env, planId, revision) {
  await env.DB.prepare(
    `UPDATE ${PLANNER_TABLES.plans} SET revision = ?, last_recalculated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).bind(revision, planId).run()
}

export async function updatePlanStatus(env, planId, userId, newStatus) {
  if (newStatus === 'active') {
    await env.DB.prepare(
      `UPDATE ${PLANNER_TABLES.plans}
       SET status = 'active',
           uses_flashcard_capacity = CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM ${PLANNER_TABLES.plans}
               WHERE user_id = ? AND id != ? AND status IN ('draft', 'active') AND uses_flashcard_capacity = 1
             ) THEN 1
             ELSE 0
           END,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).bind(userId, planId, planId, userId).run()
  } else {
    await env.DB.prepare(
      `UPDATE ${PLANNER_TABLES.plans}
       SET status = ?,
           uses_flashcard_capacity = 0,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).bind(newStatus, planId, userId).run()
  }
}

export async function persistRecalculationBatch(env, {
  planId,
  userId,
  expectedRevision,
  clientRequestId,
  requestFingerprint,
  operation,
  regeneratedTasks,
  updatedTopics,
  resultJson,
  recalculationMutationId,
  recalculatedAt,
  recalculationDate,
  workloadSnapshot,
  forecastSnapshot,
}) {
  const T = PLANNER_TABLES
  const resultingRevision = expectedRevision + 1

  const claimStmt = env.DB.prepare(
    `INSERT INTO ${T.planMutations} (id, plan_id, user_id, client_request_id, request_fingerprint, expected_revision, resulting_revision, operation, result_json)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE EXISTS (
       SELECT 1 FROM ${T.plans} WHERE id = ? AND user_id = ? AND revision = ?
     )`
  ).bind(
    recalculationMutationId, planId, userId, clientRequestId, requestFingerprint,
    expectedRevision, resultingRevision, operation, JSON.stringify(resultJson),
    planId, userId, expectedRevision
  )

  const revisionStmt = env.DB.prepare(
    `UPDATE ${T.plans} SET revision = ?, last_recalculated_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND EXISTS (
       SELECT 1 FROM ${T.planMutations} WHERE id = ?
     )`
  ).bind(resultingRevision, recalculatedAt, recalculatedAt, planId, userId, recalculationMutationId)

  const deleteStmt = env.DB.prepare(
    `DELETE FROM ${T.dailyTasks}
     WHERE plan_id = ? AND status IN ('pending', 'locked')
     AND is_pinned = 0
     AND EXISTS (
       SELECT 1 FROM ${T.planMutations} WHERE id = ?
     )`
  ).bind(planId, recalculationMutationId)

  const unpinExpiredStmt = recalculationDate
    ? env.DB.prepare(
        `UPDATE ${T.dailyTasks}
         SET is_pinned = 0
         WHERE plan_id = ? AND is_pinned = 1 AND status = 'pending'
         AND task_date < ?`
      ).bind(planId, recalculationDate)
    : null

  const tasksJson = JSON.stringify(regeneratedTasks.map(task => ({
    id: task.id,
    planTopicId: task.planTopicId || null,
    planQuestionGroupId: task.planQuestionGroupId || null,
    taskDate: task.taskDate,
    taskType: task.taskType,
    provider: task.provider || null,
    estimatedMinutes: task.estimatedMinutes || 0,
    targetCount: task.targetCount || 0,
    mode: task.mode || null,
    questionPool: task.questionPool || null,
    status: 'pending',
    unlockCondition: task.unlockCondition || null,
    displayOrder: task.displayOrder || 0,
    metadataJson: JSON.stringify(filterMetadata(task.taskType, task.metadata)),
  })))

  const insertTasksStmt = env.DB.prepare(
    `INSERT INTO ${T.dailyTasks} (
       id, plan_id, plan_topic_id, plan_question_group_id, task_date, task_type, provider,
       estimated_minutes, target_count, completed_count,
       mode, question_pool, status, unlock_condition, display_order,
       is_pinned, metadata_json
     )
     SELECT
       json_extract(value, '$.id'), ?,
       json_extract(value, '$.planTopicId'), json_extract(value, '$.planQuestionGroupId'), json_extract(value, '$.taskDate'),
       json_extract(value, '$.taskType'), json_extract(value, '$.provider'),
       json_extract(value, '$.estimatedMinutes'), json_extract(value, '$.targetCount'),
       0,
       json_extract(value, '$.mode'), json_extract(value, '$.questionPool'),
       json_extract(value, '$.status'), json_extract(value, '$.unlockCondition'),
       json_extract(value, '$.displayOrder'),
       0, json_extract(value, '$.metadataJson')
     FROM json_each(?)
     WHERE EXISTS (
       SELECT 1 FROM ${T.planMutations} WHERE id = ?
     )`
  ).bind(planId, tasksJson, recalculationMutationId)

  const topicsJson = JSON.stringify(updatedTopics.map(topic => ({
    id: topic.planTopicId,
    completedUworldQuestions: topic.completedUworldQuestions,
    incorrectQuestionsRemaining: topic.incorrectQuestionsRemaining,
    learningCompletedAt: topic.learningCompletedAt,
    questionsUnlockedAt: topic.questionsUnlockedAt,
    status: topic.status,
  })))

  const updateTopicsStmt = env.DB.prepare(
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
  ).bind(topicsJson, planId, recalculationMutationId)

  const updateSettingsStmt = workloadSnapshot
    ? env.DB.prepare(
        `UPDATE ${T.plans}
         SET settings_json = json_set(settings_json, '$.workloadSnapshot', ?)
         WHERE id = ? AND EXISTS (
           SELECT 1 FROM ${T.planMutations} WHERE id = ?
         )`
      ).bind(JSON.stringify(workloadSnapshot), planId, recalculationMutationId)
    : null

  const updateForecastStmt = env.DB.prepare(
    `UPDATE ${T.plans}
     SET settings_json = json_set(settings_json, '$.forecast', json(?))
     WHERE id = ? AND EXISTS (
       SELECT 1 FROM ${T.planMutations} WHERE id = ?
     )`
  ).bind(JSON.stringify(forecastSnapshot), planId, recalculationMutationId)

  const batch = [claimStmt, revisionStmt]
  if (unpinExpiredStmt) batch.push(unpinExpiredStmt)
  batch.push(deleteStmt, insertTasksStmt, updateTopicsStmt)
  if (updateSettingsStmt) batch.push(updateSettingsStmt)
  batch.push(updateForecastStmt)
  return env.DB.batch(batch)
}
