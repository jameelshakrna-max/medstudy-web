import { generateDateRange, getDayOfWeek } from './dateUtils.js'
import { validatePlanConfig, validateTopicInputs } from './validation.js'
import { calculateDailyCapacity } from './capacity.js'
import { resolveTopicLearningMinutes, scheduleLearningTasks } from './learning.js'
import { scheduleUworldTasks, scheduleIncorrectReview, scheduleMixedReview } from './questions.js'
import { applyPrerequisites } from './prerequisites.js'
import { deduplicateSharedTopics } from './sharedTopics.js'
import { calculatePlanFeasibility, buildUnscheduledWork } from './feasibility.js'

function buildDayAvailabilityMap(dates, availabilityByWeekday, blockedDates) {
  const blockedSet = new Set(blockedDates)
  const byWeekday = new Map()
  for (const entry of availabilityByWeekday) {
    byWeekday.set(entry.weekday, entry)
  }
  const map = new Map()
  for (const dateStr of dates) {
    const dow = getDayOfWeek(dateStr)
    const config = byWeekday.get(dow) || { weekday: dow, availableMinutes: 0, isDayOff: true }
    map.set(dateStr, {
      availableMinutes: config.availableMinutes || 0,
      isDayOff: !!config.isDayOff,
      isBlocked: blockedSet.has(dateStr),
    })
  }
  return map
}

function initTopicStates(topics, resolvedMinutes, initialTopicStates) {
  const states = {}
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i]
    const remaining = resolvedMinutes[i]
    const base = {
      normalizedTopicId: t.normalizedTopicId || null,
      canonicalTopicId: t.canonicalTopicId,
      sourceTopicId: t.sourceTopicId,
      title: t.title,
      baseLearningMinutes: t.learningMinutes?.activeExpected || 0,
      personalizedLearningMinutes: remaining,
      totalUworldQuestions: t.uworldRemainingQuestions || 0,
      completedUworldQuestions: t.alreadyCompletedQuestionCount || 0,
      remainingUworldQuestions: t.uworldRemainingQuestions || 0,
      learningCompletedAt: null,
      questionsUnlockedAt: null,
      status: remaining > 0 ? 'not_started' : 'questions_locked',
      displayOrder: i,
      satisfiedBySharedCompletion: t.satisfiedBySharedCompletion || false,
      isPrimarySharedUnit: t.isPrimarySharedUnit !== false,
      incorrectQuestionsRemaining: t.incorrectQuestionsRemaining || 0,
    }
    if (initialTopicStates && initialTopicStates[t.canonicalTopicId]) {
      const init = initialTopicStates[t.canonicalTopicId]
      base.completedUworldQuestions = init.completedUworldQuestions ?? base.completedUworldQuestions
      base.remainingUworldQuestions = init.remainingUworldQuestions ?? base.remainingUworldQuestions
      base.learningCompletedAt = init.learningCompletedAt ?? base.learningCompletedAt
      base.questionsUnlockedAt = init.questionsUnlockedAt ?? base.questionsUnlockedAt
      base.status = init.status ?? base.status
      base.incorrectQuestionsRemaining = init.incorrectQuestionsRemaining ?? base.incorrectQuestionsRemaining
      base.personalizedLearningMinutes = init.personalizedLearningMinutes ?? base.personalizedLearningMinutes
    }
    states[t.canonicalTopicId] = base
  }
  return states
}

function getTopicsNeedingLearning(topics, topicStates) {
  return topics.filter((t) => {
    const s = topicStates[t.canonicalTopicId]
    return s && !s.satisfiedBySharedCompletion && (s.status === 'not_started' || s.status === 'learning')
  })
}

function getTopicsWithCompletedLearning(topics, topicStates) {
  return topics.filter((t) => {
    const s = topicStates[t.canonicalTopicId]
    return s && !s.satisfiedBySharedCompletion &&
      (s.status === 'questions_locked' || s.status === 'uworld_in_progress') &&
      s.remainingUworldQuestions > 0
  })
}

function getTopicsNeedingIncorrectReview(topics, topicStates) {
  return topics.filter((t) => {
    const s = topicStates[t.canonicalTopicId]
    return s && !s.satisfiedBySharedCompletion && s.incorrectQuestionsRemaining > 0
  })
}

function getFullyCompletedTopics(topics, topicStates) {
  return topics.filter((t) => {
    const s = topicStates[t.canonicalTopicId]
    return s && !s.satisfiedBySharedCompletion &&
      (s.status === 'completed' || s.status === 'uworld_in_progress' ||
       (s.status === 'questions_locked' && s.remainingUworldQuestions <= 0)) &&
      s.remainingUworldQuestions <= 0
  })
}

export function buildRotationSchedule(planConfig, options = {}) {
  const planErrors = validatePlanConfig(planConfig)
  if (!planErrors.valid) {
    return { tasks: [], topicStates: [], unscheduledWork: [], feasibility: { feasible: false, totalRequiredMinutes: 0, availableMinutes: 0, missingCapacity: 0, requiredExtraMinutesPerDay: 0, topicsLeftUnscheduled: [], possibleSolutions: planErrors.errors }, deduplicationLog: [] }
  }

  const topicErrors = validateTopicInputs(planConfig.topics || [])
  if (!topicErrors.valid) {
    return { tasks: [], topicStates: [], unscheduledWork: [], feasibility: { feasible: false, totalRequiredMinutes: 0, availableMinutes: 0, missingCapacity: 0, requiredExtraMinutesPerDay: 0, topicsLeftUnscheduled: [], possibleSolutions: topicErrors.errors }, deduplicationLog: [] }
  }

  const dates = generateDateRange(planConfig.startDate, planConfig.endDate)
  if (dates.length === 0) {
    return { tasks: [], topicStates: [], unscheduledWork: [], feasibility: { feasible: true, totalRequiredMinutes: 0, availableMinutes: 0, missingCapacity: 0, requiredExtraMinutesPerDay: 0, topicsLeftUnscheduled: [], possibleSolutions: [] }, deduplicationLog: [] }
  }

  const dayAvailability = buildDayAvailabilityMap(dates, planConfig.availabilityByWeekday, planConfig.blockedDates || [])

  const { processedTopics, deduplicationLog } = deduplicateSharedTopics(planConfig.topics || [])

  const { sorted: orderedTopics, errors: prereqErrors } = applyPrerequisites(processedTopics)

  const pace = planConfig.personalSourcePaceMultiplier || 1.0
  const studyStyle = planConfig.studyStyle || 'active'
  const resolvedMinutes = orderedTopics.map((t) => {
    if (t.satisfiedBySharedCompletion) return 0
    return resolveTopicLearningMinutes(t, studyStyle, pace)
  })

  const topicStates = initTopicStates(orderedTopics, resolvedMinutes, options.initialTopicStates)

  const examReviewWindowDays = planConfig.examReviewWindowDays || 0
  const mixedReviewQPd = planConfig.mixedReviewQuestionsPerDay || 0

  const allTasks = []
  let sortOrderGlobal = 0

  for (const dateStr of dates) {
    const avail = dayAvailability.get(dateStr)
    if (avail.isDayOff || avail.isBlocked) continue
    if (options.scheduleStartDate && dateStr < options.scheduleStartDate) continue

    const capacity = calculateDailyCapacity({
      availableMinutes: avail.availableMinutes,
      dueFlashcardMinutes: planConfig.dueReviewMinutesByDate?.[dateStr] || 0,
      overdueRequiredMinutes: 0,
      bufferPercentage: planConfig.bufferPercentage || 0,
    })

    if (capacity.flashcardMinutes > 0) {
      allTasks.push({
        taskDate: dateStr,
        taskType: 'flashcard_review',
        normalizedTopicId: null,
        canonicalTopicId: null,
        estimatedMinutes: capacity.flashcardMinutes,
        targetCount: null,
        provider: null,
        mode: null,
        questionPool: null,
        selection: null,
        status: 'pending',
        unlockCondition: null,
        displayOrder: sortOrderGlobal++,
        metadata: { priority: 'required' },
      })
    }

    let remainingMinutes = capacity.usableMinutes

    if (options.reservedMinutesByDate && options.reservedMinutesByDate[dateStr]) {
      remainingMinutes = Math.max(0, remainingMinutes - options.reservedMinutesByDate[dateStr])
    }

    const topicsForLearning = getTopicsNeedingLearning(orderedTopics, topicStates)
    if (topicsForLearning.length > 0 && remainingMinutes > 0) {
      const lr = scheduleLearningTasks({
        dayDate: dateStr,
        usableMinutes: remainingMinutes,
        activeTopics: topicsForLearning,
        topicStates,
        schedulingMode: planConfig.schedulingMode || 'efficient',
        maximumActiveTopics: planConfig.maximumActiveTopics || 5,
      })
      allTasks.push(...lr.tasks)
      remainingMinutes = lr.remainingCapacity
    }

    const topicsForQuestions = getTopicsWithCompletedLearning(orderedTopics, topicStates)
    if (topicsForQuestions.length > 0 && remainingMinutes > 0) {
      const qr = scheduleUworldTasks({
        dayDate: dateStr,
        usableMinutes: remainingMinutes,
        eligibleTopics: topicsForQuestions,
        topicStates,
        questionStartRule: planConfig.questionStartRule || 'next_available_day',
        planConfig,
      })
      allTasks.push(...qr.tasks)
      remainingMinutes = qr.remainingCapacity
      if (qr.topicStates) {
        for (const [id, state] of Object.entries(qr.topicStates)) {
          topicStates[id] = state
        }
      }
    }

    const topicsForIncorrect = getTopicsNeedingIncorrectReview(orderedTopics, topicStates)
    if (topicsForIncorrect.length > 0 && remainingMinutes > 0) {
      const ir = scheduleIncorrectReview({
        dayDate: dateStr,
        usableMinutes: remainingMinutes,
        topicsNeedingReview: topicsForIncorrect,
        planConfig,
      })
      allTasks.push(...ir.tasks)
      remainingMinutes = ir.remainingCapacity
    }

    if (examReviewWindowDays > 0 && mixedReviewQPd > 0 && dateStr > (planConfig.examDate || '')) {
      const completedTopics = getFullyCompletedTopics(orderedTopics, topicStates)
      if (completedTopics.length > 0 && remainingMinutes > 0) {
        const mr = scheduleMixedReview({
          dayDate: dateStr,
          usableMinutes: remainingMinutes,
          completedTopics,
          planConfig,
        })
        allTasks.push(...mr.tasks)
        remainingMinutes = mr.remainingCapacity
      }
    }
  }

  for (const task of allTasks) {
    sortOrderGlobal = Math.max(sortOrderGlobal, task.displayOrder + 1)
  }

  const dateCapacities = {}
  for (const dateStr of dates) {
    const avail = dayAvailability.get(dateStr)
    dateCapacities[dateStr] = {
      usableMinutes: (avail.isDayOff || avail.isBlocked) ? 0 : calculateDailyCapacity({
        availableMinutes: avail.availableMinutes,
        dueFlashcardMinutes: planConfig.dueReviewMinutesByDate?.[dateStr] || 0,
        overdueRequiredMinutes: 0,
        bufferPercentage: planConfig.bufferPercentage || 0,
      }).usableMinutes,
      isDayOff: avail.isDayOff,
      isBlocked: avail.isBlocked,
    }
  }

  const feasibility = calculatePlanFeasibility({
    resolvedTopics: orderedTopics,
    dateCapacities,
    planConfig,
    topicStates,
  })

  const unscheduledWork = buildUnscheduledWork({
    tasks: allTasks,
    resolvedTopics: orderedTopics,
    topicStates,
  })

  if (prereqErrors.length > 0) {
    feasibility.possibleSolutions = [...feasibility.possibleSolutions, ...prereqErrors]
  }

  const topicStatesArray = orderedTopics.map((t) => ({ ...topicStates[t.canonicalTopicId] }))

  return {
    tasks: allTasks,
    topicStates: topicStatesArray,
    unscheduledWork,
    feasibility,
    deduplicationLog,
  }
}

export function mergeTopicProgress(existingDbTopics, schedulerTopicStates) {
  const merged = {}
  for (const dbTopic of existingDbTopics) {
    const id = dbTopic.canonicalTopicId
    if (!id) continue
    merged[id] = { ...dbTopic }
  }
  for (const sched of schedulerTopicStates) {
    const id = sched.canonicalTopicId
    if (!id) continue
    if (!merged[id]) {
      merged[id] = { ...sched }
    } else {
      merged[id] = {
        ...merged[id],
        ...sched,
        learningCompletedAt: merged[id].learningCompletedAt || sched.learningCompletedAt,
        questionsUnlockedAt: merged[id].questionsUnlockedAt || sched.questionsUnlockedAt,
      }
    }
  }
  return merged
}
