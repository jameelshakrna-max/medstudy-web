import { PLANNER_TABLES } from '../../db/rotationPlannerSchema.js'
import { buildRotationSchedule } from '../rotationPlannerV2/buildRotationSchedule.js'
import { generateDateRange } from '../rotationPlannerV2/dateUtils.js'
import { loadTasksByPlan, loadTopicsByPlan, loadAvailabilityByPlan } from './taskMutation.js'

const T = PLANNER_TABLES

const TERMINAL_STATUSES = new Set(['completed', 'skipped', 'partial'])

export function buildReservedMinutesMap(tasks, dateRange) {
  const reservedByDate = new Map()
  for (const dateStr of dateRange) {
    reservedByDate.set(dateStr, 0)
  }
  for (const task of tasks) {
    if (!TERMINAL_STATUSES.has(task.status)) continue
    const dateStr = task.task_date || task.taskDate
    if (!dateStr || !reservedByDate.has(dateStr)) continue
    const mins = task.actual_minutes || task.estimated_minutes || 0
    reservedByDate.set(dateStr, reservedByDate.get(dateStr) + mins)
  }
  const result = {}
  for (const [dateStr, mins] of reservedByDate) {
    if (mins > 0) result[dateStr] = mins
  }
  return result
}

export function deriveActualTopicStates(topics, tasks) {
  const stateMap = new Map()
  for (const topic of topics) {
    stateMap.set(topic.id, {
      planTopicId: topic.id,
      canonicalTopicId: topic.canonical_topic_id,
      normalizedTopicId: topic.normalized_topic_id,
      learningCompletedAt: topic.learning_completed_at || null,
      questionsUnlockedAt: topic.questions_unlocked_at || null,
      completedUworldQuestions: topic.completed_uworld_questions || 0,
      incorrectQuestionsRemaining: topic.incorrect_questions_remaining || 0,
      personalizedLearningMinutes: topic.personalized_learning_minutes || 0,
      baseLearningMinutes: topic.base_learning_minutes || 0,
      totalUworldQuestions: topic.total_uworld_questions || 0,
      status: topic.status || 'not_started',
    })
  }

  for (const task of tasks) {
    if (!task.plan_topic_id) continue
    const state = stateMap.get(task.plan_topic_id)
    if (!state) continue

    if (task.task_type === 'learning' && task.status === 'completed') {
      if (!state.learningCompletedAt || task.completed_at > state.learningCompletedAt) {
        state.learningCompletedAt = task.completed_at
      }
      state.personalizedLearningMinutes = Math.max(
        0,
        state.personalizedLearningMinutes - (task.actual_minutes || task.estimated_minutes || 0)
      )
    }

    if (task.task_type === 'uworld_questions' && task.completed_count > 0) {
      state.completedUworldQuestions += task.completed_count
    }

    if (task.task_type === 'incorrect_review' && task.completed_count > 0) {
      state.incorrectQuestionsRemaining = Math.max(
        0,
        state.incorrectQuestionsRemaining - task.completed_count
      )
    }

    if (state.completedUworldQuestions > 0 && !state.questionsUnlockedAt) {
      state.questionsUnlockedAt = state.learningCompletedAt || new Date().toISOString().slice(0, 10)
    }
  }

  return Array.from(stateMap.values())
}

export async function recalculatePlan(env, planId, userId, recalculationDate) {
  const planRow = await env.DB.prepare(
    `SELECT * FROM ${T.plans} WHERE id = ? AND user_id = ?`
  ).bind(planId, userId).first()

  if (!planRow) throw new Error('PLAN_NOT_FOUND')

  const [topics, tasks, availability] = await Promise.all([
    loadTopicsByPlan(env, planId),
    loadTasksByPlan(env, planId),
    loadAvailabilityByPlan(env, planId),
  ])

  const actualStates = deriveActualTopicStates(topics, tasks)

  const futureTasks = tasks.filter(t => {
    const dateStr = t.task_date || t.taskDate
    return dateStr && dateStr >= recalculationDate
  })

  const remainingDates = generateDateRange(recalculationDate, planRow.end_date)
  const reservedMinutesByDate = buildReservedMinutesMap(futureTasks, remainingDates)

  const settings = typeof planRow.settings_json === 'string'
    ? JSON.parse(planRow.settings_json)
    : (planRow.settings_json || {})

  const topicInputMap = new Map()
  for (const topic of topics) {
    topicInputMap.set(topic.canonical_topic_id, topic)
  }

  const planConfig = {
    rotationId: planRow.rotation_id,
    sourceId: planRow.source_id,
    startDate: recalculationDate,
    endDate: planRow.end_date,
    examDate: planRow.exam_date || undefined,
    studyStyle: planRow.study_style,
    schedulingMode: planRow.scheduling_mode,
    questionStartRule: planRow.question_start_rule,
    preferredQuestionsPerDay: planRow.preferred_questions_per_day,
    minimumQuestionsPerSession: planRow.minimum_questions_per_session,
    maximumQuestionsPerDay: planRow.maximum_questions_per_day,
    averageMinutesPerQuestion: planRow.average_minutes_per_question,
    bufferPercentage: planRow.buffer_percentage,
    maximumActiveTopics: planRow.maximum_active_topics,
    availabilityByWeekday: availability,
    blockedDates: settings.blockedDates || [],
    personalSourcePaceMultiplier: settings.personalSourcePaceMultiplier || 1.0,
    examReviewWindowDays: settings.examReviewWindowDays || 0,
    mixedReviewQuestionsPerDay: settings.mixedReviewQuestionsPerDay || 0,
    dueReviewMinutesByDate: settings.dueReviewMinutesByDate || {},
    topics: topics.map(t => ({
      normalizedTopicId: t.normalized_topic_id,
      canonicalTopicId: t.canonical_topic_id,
      sourceTopicId: t.source_topic_id,
      title: t.topic_title,
      learningMinutes: {
        activeExpected: t.base_learning_minutes || 0,
      },
      uworldRemainingQuestions: Math.max(0, (t.total_uworld_questions || 0) - (t.completed_uworld_questions || 0)),
      alreadyCompletedLearningPercentage: t.learning_completed_at ? 100 : 0,
      alreadyCompletedQuestionCount: t.completed_uworld_questions || 0,
      incorrectQuestionsRemaining: t.incorrect_questions_remaining || 0,
      prerequisiteTopicIds: [],
      sharedTopicKey: t.shared_topic_key || null,
    })),
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
    scheduleStartDate: recalculationDate,
    reservedMinutesByDate,
  })

  return {
    recalculation,
    plan: planRow,
    actualStates,
    recalculationDate,
  }
}

export function buildRecalculationResult(recalculation, plan, replayed) {
  const tasks = recalculation.recalculation?.tasks || recalculation.tasks || []
  const topicStates = recalculation.recalculation?.topicStates || recalculation.topicStates || []
  const feasibility = recalculation.recalculation?.feasibility || recalculation.feasibility || {}

  const created = tasks.filter(t => t.isNew).length || tasks.length
  const preserved = tasks.filter(t => TERMINAL_STATUSES.has(t.status)).length
  const modified = tasks.length - created - preserved

  return {
    planId: plan.id || plan.plan_id,
    revision: plan.revision || 0,
    recalculationDate: recalculation.recalculationDate || recalculationDate,
    replayed: !!replayed,
    tasks: {
      created: created || 0,
      modified: modified || 0,
      preserved: preserved || 0,
    },
    topicStates: topicStates.map(ts => ({
      id: ts.canonicalTopicId || ts.id,
      status: ts.status,
      learningComplete: !!ts.learningCompletedAt,
      projectedQuestionsRemaining: Math.max(
        0,
        (ts.totalUworldQuestions || 0) - (ts.completedUworldQuestions || 0)
      ),
    })),
    feasibility,
  }
}
