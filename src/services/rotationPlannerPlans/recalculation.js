import { PLANNER_TABLES } from '../../db/rotationPlannerSchema.js'
import { buildRotationSchedule } from '../rotationPlannerV2/buildRotationSchedule.js'
import { generateDateRange } from '../rotationPlannerV2/dateUtils.js'
import { assignStudyBlocks } from '../rotationPlannerV2/studyBlockAssignment.js'
import { loadTasksByPlan, loadTopicsByPlan, loadAvailabilityByPlan } from './taskMutation.js'
import { findNormalizedTopic } from '../../data/studySources/normalizedRegistry.js'
import { computeReviewWorkloadMap } from '../flashcardWorkload.js'

const T = PLANNER_TABLES

const TERMINAL_STATUSES = new Set(['completed', 'skipped', 'partial'])

export function getCompletionFraction(task) {
  if (task.status === 'completed') return 1
  const pct = task.completion_percentage ?? task.completionPercentage
  if ((task.status === 'partial' || task.status === 'in_progress') && typeof pct === 'number') return pct / 100
  return 0
}

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

export function deriveActualTopicStates(topics, tasks, { asOfDate }) {
  const stateMap = new Map()
  for (const topic of topics) {
    stateMap.set(topic.id, {
      planTopicId: topic.id,
      canonicalTopicId: topic.canonical_topic_id,
      normalizedTopicId: topic.normalized_topic_id,
      learningCompletedAt: topic.learning_completed_at || null,
      questionsUnlockedAt: topic.questions_unlocked_at || null,
      completedUworldQuestions: 0,
      incorrectQuestionsRemaining: 0,
      personalizedLearningMinutes: topic.personalized_learning_minutes || 0,
      baseLearningMinutes: topic.base_learning_minutes || 0,
      totalUworldQuestions: topic.total_uworld_questions || 0,
      status: topic.status || 'not_started',
    })
  }

  const topicCompletedEquivalent = new Map()
  const topicLatestCompletionDate = new Map()
  const topicIncorrectFromUworld = new Map()
  const topicIncorrectFromReview = new Map()

  for (const task of tasks) {
    if (!task.plan_topic_id) continue
    const state = stateMap.get(task.plan_topic_id)
    if (!state) continue

    const fraction = getCompletionFraction(task)
    const estimated = task.estimated_minutes || 0

    if (fraction > 0 && task.task_type === 'learning') {
      const current = topicCompletedEquivalent.get(task.plan_topic_id) || 0
      topicCompletedEquivalent.set(task.plan_topic_id, current + estimated * fraction)

      if (task.completed_on) {
        const latest = topicLatestCompletionDate.get(task.plan_topic_id)
        if (!latest || task.completed_on > latest) {
          topicLatestCompletionDate.set(task.plan_topic_id, task.completed_on)
        }
      }
    }

    if ((task.task_type === 'uworld_questions' || task.task_type === 'mixed_review') && task.completed_count > 0) {
      state.completedUworldQuestions += task.completed_count
    }

    if ((task.task_type === 'uworld_questions' || task.task_type === 'mixed_review') && task.incorrect_count > 0) {
      const current = topicIncorrectFromUworld.get(task.plan_topic_id) || 0
      topicIncorrectFromUworld.set(task.plan_topic_id, current + task.incorrect_count)
    }

    if (task.task_type === 'incorrect_review' && task.completed_count > 0) {
      const current = topicIncorrectFromReview.get(task.plan_topic_id) || 0
      topicIncorrectFromReview.set(task.plan_topic_id, current + task.completed_count)
    }
  }

  for (const [topicId, state] of stateMap) {
    const completedEquivalent = topicCompletedEquivalent.get(topicId) || 0
    const remainingLearningMinutes = Math.max(0, state.personalizedLearningMinutes - completedEquivalent)
    const incorrectFromUworld = topicIncorrectFromUworld.get(topicId) || 0
    const incorrectFromReview = topicIncorrectFromReview.get(topicId) || 0
    state.incorrectQuestionsRemaining = Math.max(0, incorrectFromUworld - incorrectFromReview)

    const hasProgress = completedEquivalent > 0
    if (remainingLearningMinutes <= 0) {
      const totalUworld = state.totalUworldQuestions
      if (state.completedUworldQuestions < totalUworld || state.incorrectQuestionsRemaining > 0) {
        state.status = 'uworld_in_progress'
      } else {
        state.status = 'completed'
      }
    } else if (hasProgress) {
      state.status = 'learning'
    } else {
      state.status = 'not_started'
    }

    if (remainingLearningMinutes <= 0 && !state.learningCompletedAt) {
      state.learningCompletedAt = topicLatestCompletionDate.get(topicId) || asOfDate
    }

    if (remainingLearningMinutes <= 0 && state.totalUworldQuestions > 0 && !state.questionsUnlockedAt) {
      state.questionsUnlockedAt = state.learningCompletedAt || asOfDate
    }
  }

  return Array.from(stateMap.values())
}

export async function recalculatePlan(env, planId, userId, recalculationDate, opts = {}) {
  const planRow = await env.DB.prepare(
    `SELECT * FROM ${T.plans} WHERE id = ? AND user_id = ?`
  ).bind(planId, userId).first()

  if (!planRow) throw new Error('PLAN_NOT_FOUND')

  const [topics, dbTasks, availability] = await Promise.all([
    loadTopicsByPlan(env, planId),
    loadTasksByPlan(env, planId),
    loadAvailabilityByPlan(env, planId),
  ])

  const actualStates = opts.derivedTopicStates || deriveActualTopicStates(topics, dbTasks, { asOfDate: recalculationDate })
  const tasksForReserved = opts.preservedTasks || dbTasks

  const futureTasks = tasksForReserved.filter(t => {
    const dateStr = t.task_date || t.taskDate
    return dateStr && dateStr >= recalculationDate && !t.is_pinned
  })

  const pinnedTasks = dbTasks
    .filter(t => t.is_pinned && t.status === 'pending')
    .map(t => {
      const topic = topics.find(tp => tp.id === t.plan_topic_id)
      return {
        ...t,
        canonicalTopicId: topic?.canonical_topic_id || null,
      }
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
    dueReviewMinutesByDate: {},
    topicBreakdownByDate: {},
    topics: topics.map(t => {
      const registryTopic = findNormalizedTopic(planRow.source_id, t.normalized_topic_id?.split('::')[1])
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

  let workloadSnapshot = {}
  if (planRow.uses_flashcard_capacity === 1 && recalculationDate <= planRow.end_date) {
    const workload = await computeReviewWorkloadMap({
      env,
      userId,
      startDate: recalculationDate,
      endDate: planRow.end_date,
      effectiveStartDate: recalculationDate,
      timezone: settings.timezone || 'UTC',
      availabilityByWeekday: availability,
      blockedDates: settings.blockedDates || [],
      planTopics: topics.map(t => ({
        planTopicId: t.id,
        canonicalTopicId: t.canonical_topic_id,
        displayOrder: t.display_order ?? Infinity,
      })),
      mappingOverlay: null,
    })
    planConfig.dueReviewMinutesByDate = workload.dueReviewMinutesByDate || {}
    planConfig.dueReviewCardCountByDate = workload.dueReviewCardCountByDate || {}
    planConfig.topicBreakdownByDate = workload.topicBreakdownByDate || {}
    workloadSnapshot = {
      usesFlashcardCapacity: 1,
      dueReviewMinutesByDate: workload.dueReviewMinutesByDate || {},
      dueReviewCardCountByDate: workload.dueReviewCardCountByDate || {},
      topicBreakdownByDate: workload.topicBreakdownByDate || {},
      unscheduled: workload.unscheduled || { totalCards: 0, totalMinutes: 0, cards: [] },
      effectiveStartDate: recalculationDate,
      timezone: settings.timezone || 'UTC',
    }
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
    pinnedTasks,
  })

  const topicMap = new Map()
  for (const t of topics) {
    topicMap.set(t.normalized_topic_id, { sourceId: planRow.source_id, groupId: t.group_id })
  }

  const tasks = recalculation.recalculation?.tasks || recalculation.tasks || []
  const assignedTasks = assignStudyBlocks(tasks, topicMap)

  if (recalculation.recalculation?.tasks) {
    recalculation.recalculation.tasks = assignedTasks
  } else if (recalculation.tasks) {
    recalculation.tasks = assignedTasks
  }

  return {
    recalculation,
    plan: planRow,
    actualStates,
    recalculationDate,
    workloadSnapshot,
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
    workloadSnapshot: recalculation.workloadSnapshot || null,
  }
}
