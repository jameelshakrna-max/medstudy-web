import { calculateQuestionCapacity } from './capacity.js';

export function scheduleUworldTasks({
  dayDate,
  usableMinutes,
  eligibleTopics,
  topicStates,
  questionStartRule,
  planConfig,
}) {
  const tasks = [];
  let remainingMinutes = usableMinutes;
  let sortOrder = 1;
  const updatedStates = {};

  for (const topic of eligibleTopics) {
    const state = topicStates[topic.canonicalTopicId];
    if (!state) continue;

    if (
      questionStartRule === 'next_available_day' &&
      dayDate <= state.learningCompletedAt
    ) {
      continue;
    }

    if (
      questionStartRule === 'same_day_if_capacity' &&
      dayDate === state.learningCompletedAt &&
      remainingMinutes <
        planConfig.minimumQuestionsPerSession *
          planConfig.averageMinutesPerQuestion
    ) {
      continue;
    }

    if (remainingMinutes <= 0) break;

    const { questionsToday, minutesConsumed } = calculateQuestionCapacity({
      usableMinutes: remainingMinutes,
      questionsRemaining: state.remainingUworldQuestions,
      preferredQuestionsPerDay: planConfig.preferredQuestionsPerDay,
      minimumQuestionsPerSession: planConfig.minimumQuestionsPerSession,
      maximumQuestionsPerDay: planConfig.maximumQuestionsPerDay,
      averageMinutesPerQuestion: planConfig.averageMinutesPerQuestion,
    });

    if (questionsToday <= 0) continue;

    tasks.push({
      taskDate: dayDate,
      taskType: 'uworld_questions',
      normalizedTopicId: null,
      canonicalTopicId: topic.canonicalTopicId,
      estimatedMinutes: minutesConsumed,
      targetCount: questionsToday,
      provider: 'uworld',
      mode: 'tutor',
      questionPool: 'unused',
      selection: 'topic-specific',
      status: 'pending',
      unlockCondition: `learning_completed:${topic.canonicalTopicId}`,
      displayOrder: sortOrder++,
      metadata: {},
    });

    remainingMinutes -= minutesConsumed;

    const newRemaining = state.remainingUworldQuestions - questionsToday;
    updatedStates[topic.canonicalTopicId] = {
      ...state,
      remainingUworldQuestions: Math.max(0, newRemaining),
      status:
        newRemaining <= 0 && (state.incorrectQuestionsRemaining || 0) <= 0
          ? 'completed'
          : 'uworld_in_progress',
      questionsUnlockedAt: dayDate,
    };
  }

  return {
    tasks,
    remainingCapacity: Math.max(0, remainingMinutes),
    topicStates: updatedStates,
  };
}

export function scheduleIncorrectReview({
  dayDate,
  usableMinutes,
  topicsNeedingReview,
  planConfig,
}) {
  if (!topicsNeedingReview || topicsNeedingReview.length === 0) {
    return { tasks: [], remainingCapacity: usableMinutes };
  }

  const tasks = [];
  let remainingMinutes = usableMinutes;
  let sortOrder = 1;

  for (const topic of topicsNeedingReview) {
    if (topic.incorrectQuestionsRemaining <= 0) continue;
    if (remainingMinutes <= 0) break;

    const { questionsToday, minutesConsumed } = calculateQuestionCapacity({
      usableMinutes: remainingMinutes,
      questionsRemaining: topic.incorrectQuestionsRemaining,
      preferredQuestionsPerDay: planConfig.preferredQuestionsPerDay,
      minimumQuestionsPerSession: planConfig.minimumQuestionsPerSession,
      maximumQuestionsPerDay: planConfig.maximumQuestionsPerDay,
      averageMinutesPerQuestion: planConfig.averageMinutesPerQuestion,
    });

    if (questionsToday <= 0) continue;

    tasks.push({
      taskDate: dayDate,
      taskType: 'incorrect_review',
      normalizedTopicId: null,
      canonicalTopicId: topic.canonicalTopicId,
      estimatedMinutes: minutesConsumed,
      targetCount: questionsToday,
      provider: 'uworld',
      mode: 'tutor',
      questionPool: 'unused',
      selection: 'topic-specific',
      status: 'pending',
      unlockCondition: `uworld_completed:${topic.canonicalTopicId}`,
      displayOrder: sortOrder++,
      metadata: {},
    });

    remainingMinutes -= minutesConsumed;
  }

  return {
    tasks,
    remainingCapacity: Math.max(0, remainingMinutes),
  };
}

export function scheduleMixedReview({
  dayDate,
  usableMinutes,
  completedTopics,
  planConfig,
}) {
  if (
    !planConfig.examReviewWindowDays ||
    planConfig.examReviewWindowDays <= 0 ||
    !planConfig.mixedReviewQuestionsPerDay ||
    planConfig.mixedReviewQuestionsPerDay <= 0
  ) {
    return { tasks: [], remainingCapacity: usableMinutes };
  }

  if (!completedTopics || completedTopics.length === 0) {
    return { tasks: [], remainingCapacity: usableMinutes };
  }

  const estimatedMinutes = Math.ceil(
    planConfig.mixedReviewQuestionsPerDay *
      planConfig.averageMinutesPerQuestion
  );

  if (estimatedMinutes > usableMinutes) {
    return { tasks: [], remainingCapacity: usableMinutes };
  }

  return {
    tasks: [
      {
        taskDate: dayDate,
        taskType: 'mixed_review',
        normalizedTopicId: null,
        canonicalTopicId: null,
        estimatedMinutes,
        targetCount: planConfig.mixedReviewQuestionsPerDay,
        provider: 'uworld',
        mode: 'timed',
        questionPool: 'mixed',
        selection: 'mixed',
        status: 'pending',
        unlockCondition: null,
        displayOrder: 1,
        metadata: { topicCount: completedTopics.length },
      },
    ],
    remainingCapacity: usableMinutes - estimatedMinutes,
  };
}
