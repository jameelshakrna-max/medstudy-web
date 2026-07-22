import { PLANNER_TABLES } from '../../db/rotationPlannerSchema.js'
import {
  mapPlanSummaryDto, mapPlanDto, mapAvailabilityDto, mapTopicDto, mapTaskDto,
  AVAILABILITY_COLUMNS, TOPIC_COLUMNS, TASK_COLUMNS, PLAN_NESTED_COLUMNS,
  safeParseJson,
} from './dtoMappers.js'
import { getStudySource } from '../../data/studySources/sourceRegistry.js'
import { getSharedTopicDefinition } from '../../data/studySources/sharedTopicKeys.js'

const TASK_METADATA_FIELDS = {
  flashcard_review: ['priority', 'dueCardCount', 'unmetReviewMinutes'],
  mixed_review: ['topicCount', 'includedTopicIds'],
  uworld_questions: ['selection'],
  learning: ['pageRange', 'studyStyle'],
  incorrect_review: [],
  consolidation: [],
  optional_book_questions: [],
}

function filterMetadata(taskType, metadata) {
  const allowed = TASK_METADATA_FIELDS[taskType] || []
  if (!allowed.length || !metadata) return {}
  const filtered = {}
  for (const key of allowed) {
    if (metadata[key] !== undefined) filtered[key] = metadata[key]
  }
  return filtered
}

function generateIds(resolvedTopics, previewTasks) {
  const planId = crypto.randomUUID()
  const availabilityIds = Array.from({ length: 7 }, () => crypto.randomUUID())
  const topicIds = resolvedTopics.map(() => crypto.randomUUID())
  const taskIds = previewTasks.map(() => crypto.randomUUID())
  return { planId, availabilityIds, topicIds, taskIds }
}

export async function persistPlanBatch(env, userId, validatedInput, resolvedTopics, preview, clientRequestId, fingerprint) {
  const source = getStudySource(validatedInput.sourceId)
  const sourceVersion = source?.version || '1.0.0'
  const sourceTitle = source?.title || validatedInput.sourceId

  const { planId, availabilityIds, topicIds, taskIds } = generateIds(resolvedTopics, preview.tasks)

  const topicIdByNormalized = new Map()
  for (let i = 0; i < resolvedTopics.length; i++) {
    topicIdByNormalized.set(resolvedTopics[i].normalizedTopicId, topicIds[i])
  }

  const settingsJson = JSON.stringify({
    blockedDates: validatedInput.blockedDates,
    dueReviewMinutesByDate: validatedInput.dueReviewMinutesByDate,
    personalSourcePaceMultiplier: validatedInput.personalSourcePaceMultiplier,
    examReviewWindowDays: validatedInput.examReviewWindowDays,
    mixedReviewQuestionsPerDay: validatedInput.mixedReviewQuestionsPerDay,
    overloadAccepted: validatedInput.acceptOverload,
    feasibleAtCreation: preview.feasibility.feasible,
    missingCapacityAtCreation: preview.feasibility.missingCapacity,
    schedulerVersion: '2.0.0',
  })

  const topicStateByNormalized = new Map()
  for (const state of preview.topicStates) {
    if (state.normalizedTopicId) {
      topicStateByNormalized.set(state.normalizedTopicId, state)
    }
  }

  const planStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.plans} (
      id, user_id, rotation_id, source_id, source_version,
      start_date, end_date, exam_date,
      study_style, scheduling_mode, question_start_rule,
      preferred_questions_per_day, minimum_questions_per_session,
      maximum_questions_per_day, average_minutes_per_question,
      buffer_percentage, maximum_active_topics,
      status, client_request_id, request_fingerprint, settings_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    planId, userId, validatedInput.rotationId, validatedInput.sourceId, sourceVersion,
    validatedInput.startDate, validatedInput.endDate, validatedInput.examDate || null,
    validatedInput.studyStyle, validatedInput.schedulingMode, validatedInput.questionStartRule,
    validatedInput.preferredQuestionsPerDay, validatedInput.minimumQuestionsPerSession,
    validatedInput.maximumQuestionsPerDay, validatedInput.averageMinutesPerQuestion,
    validatedInput.bufferPercentage, validatedInput.maximumActiveTopics,
    'draft', clientRequestId, fingerprint, settingsJson
  )

  const availJson = JSON.stringify(
    validatedInput.availability.map((a, i) => ({
      id: availabilityIds[i],
      weekday: a.weekday,
      availableMinutes: a.availableMinutes,
      isDayOff: a.isDayOff ? 1 : 0,
    }))
  )
  const availStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.availability} (id, plan_id, weekday, available_minutes, is_day_off)
     SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.weekday'),
            json_extract(value,'$.availableMinutes'), json_extract(value,'$.isDayOff')
     FROM json_each(?)`
  ).bind(planId, availJson)

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
    FROM json_each(?)`
  ).bind(planId, topicsJson)

  const taskRows = preview.tasks.map((task, i) => {
    let planTopicId = null
    if (task.normalizedTopicId) {
      planTopicId = topicIdByNormalized.get(task.normalizedTopicId) || null
    }
    return {
      id: taskIds[i],
      planTopicId,
      taskDate: task.taskDate,
      taskType: task.taskType,
      provider: task.provider,
      estimatedMinutes: task.estimatedMinutes,
      targetCount: task.targetCount,
      mode: task.mode,
      questionPool: task.questionPool,
      status: 'pending',
      unlockCondition: task.unlockCondition,
      displayOrder: task.displayOrder,
      metadataJson: JSON.stringify(filterMetadata(task.taskType, task.metadata)),
    }
  })
  const tasksJson = JSON.stringify(taskRows)
  const tasksStmt = env.DB.prepare(
    `INSERT INTO ${PLANNER_TABLES.dailyTasks} (
      id, plan_id, plan_topic_id, task_date, task_type,
      provider, estimated_minutes, actual_minutes,
      target_count, completed_count, mode, question_pool,
      status, unlock_condition, display_order, metadata_json
    ) SELECT
      json_extract(value,'$.id'), ?,
      json_extract(value,'$.planTopicId'), json_extract(value,'$.taskDate'),
      json_extract(value,'$.taskType'), json_extract(value,'$.provider'),
      json_extract(value,'$.estimatedMinutes'), NULL,
      json_extract(value,'$.targetCount'), 0,
      json_extract(value,'$.mode'), json_extract(value,'$.questionPool'),
      json_extract(value,'$.status'), json_extract(value,'$.unlockCondition'),
      json_extract(value,'$.displayOrder'), json_extract(value,'$.metadataJson')
    FROM json_each(?)`
  ).bind(planId, tasksJson)

  await env.DB.batch([planStmt, availStmt, topicsStmt, tasksStmt])

  return { planId, topicIds, taskIds }
}

export async function loadPlanFromDb(env, planId, userId) {
  const { results: planRows } = await env.DB.prepare(
    'SELECT id, user_id, rotation_id, source_id, source_version, start_date, end_date, exam_date, study_style, scheduling_mode, question_start_rule, preferred_questions_per_day, minimum_questions_per_session, maximum_questions_per_day, average_minutes_per_question, buffer_percentage, maximum_active_topics, status, settings_json, created_at, updated_at, revision, last_recalculated_at FROM rotation_planner_plans WHERE id = ? AND user_id = ?'
  ).bind(planId, userId).all()

  if (!planRows.length) return null

  const { results: availRows } = await env.DB.prepare(
    'SELECT id, plan_id, weekday, available_minutes, is_day_off FROM rotation_planner_availability WHERE plan_id = ? ORDER BY weekday'
  ).bind(planId).all()

  const { results: topicRows } = await env.DB.prepare(
    'SELECT id, plan_id, normalized_topic_id, canonical_topic_id, source_topic_id, shared_topic_key, topic_title, group_id, base_learning_minutes, personalized_learning_minutes, total_uworld_questions, completed_uworld_questions, learning_completed_at, questions_unlocked_at, status, mastery_score, display_order, incorrect_questions_remaining FROM rotation_planner_topics WHERE plan_id = ? ORDER BY display_order'
  ).bind(planId).all()

  const { results: taskRows } = await env.DB.prepare(
    'SELECT id, plan_id, plan_topic_id, task_date, task_type, provider, estimated_minutes, actual_minutes, target_count, completed_count, mode, question_pool, status, unlock_condition, display_order, metadata_json, created_at, updated_at, completion_percentage, incorrect_count, completed_at, completed_on FROM rotation_planner_daily_tasks WHERE plan_id = ? ORDER BY task_date, display_order'
  ).bind(planId).all()

  return {
    plan: mapPlanDto(planRows[0]),
    availability: availRows.map(r => mapAvailabilityDto(r)),
    topics: topicRows.map(r => mapTopicDto(r)),
    tasks: taskRows.map(r => mapTaskDto(r)),
  }
}

export async function loadPlanSummaries(env, userId) {
  const { results: planRows } = await env.DB.prepare(
    'SELECT id, user_id, rotation_id, source_id, source_version, start_date, end_date, exam_date, study_style, scheduling_mode, question_start_rule, preferred_questions_per_day, minimum_questions_per_session, maximum_questions_per_day, average_minutes_per_question, buffer_percentage, maximum_active_topics, status, settings_json, created_at, updated_at, revision, last_recalculated_at FROM rotation_planner_plans WHERE user_id = ? ORDER BY created_at DESC'
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
    const sourceTitle = source?.title || row.source_id

    summaries.push(mapPlanSummaryDto(row, sourceTitle, {
      topicCount: topicCounts[0]?.total ?? 0,
      completedTopicCount: topicCounts[0]?.completed ?? 0,
      taskCount: taskCounts[0]?.total ?? 0,
      completedTaskCount: taskCounts[0]?.completed ?? 0,
    }))
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
