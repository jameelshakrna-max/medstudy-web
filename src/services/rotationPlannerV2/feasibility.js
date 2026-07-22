import { calculateQuestionCapacity } from './capacity.js';

export function calculatePlanFeasibility({
  resolvedTopics,
  dateCapacities,
  planConfig,
  topicStates,
}) {
  let totalRequiredMinutes = 0;
  const topicsLeftUnscheduled = [];

  for (const topic of resolvedTopics) {
    const state = topicStates[topic.canonicalTopicId];
    if (!state || state.satisfiedBySharedCompletion) continue;

    const questionMinutes = Math.ceil(
      state.remainingUworldQuestions * planConfig.averageMinutesPerQuestion
    );
    totalRequiredMinutes += state.personalizedLearningMinutes + questionMinutes;

    if (state.personalizedLearningMinutes > 0 || state.remainingUworldQuestions > 0) {
      topicsLeftUnscheduled.push(topic.canonicalTopicId);
    }
  }

  let availableMinutes = 0;
  let studyDays = 0;

  for (const [dateStr, capacity] of Object.entries(dateCapacities)) {
    if (!capacity.isBlocked && !capacity.isDayOff && capacity.usableMinutes > 0) {
      availableMinutes += capacity.usableMinutes;
      studyDays++;
    }
  }

  const missingCapacity = Math.max(0, totalRequiredMinutes - availableMinutes);
  const requiredExtraMinutesPerDay =
    missingCapacity > 0 ? Math.ceil(missingCapacity / studyDays) : 0;

  const possibleSolutions = [];

  if (missingCapacity > 0) {
    const avgDailyCapacity = studyDays > 0 ? availableMinutes / studyDays : 0;
    const extraDaysNeeded = Math.ceil(missingCapacity / avgDailyCapacity);
    possibleSolutions.push(
      `Extend plan by ${extraDaysNeeded} study days`
    );
    possibleSolutions.push(
      `Add ${requiredExtraMinutesPerDay} minutes per active day`
    );
  }

  if (planConfig.studyStyle === 'detailed_notes') {
    possibleSolutions.push(
      'Reduce detailed_notes to active study style'
    );
  }

  if (
    planConfig.examReviewWindowDays > 0 &&
    planConfig.mixedReviewQuestionsPerDay > 0
  ) {
    possibleSolutions.push(
      'Reduce or disable mixed review workload'
    );
  }

  if (planConfig.bufferPercentage > 10) {
    possibleSolutions.push(
      `Reduce planning buffer from ${planConfig.bufferPercentage}% to ${Math.max(0, planConfig.bufferPercentage - 10)}%`
    );
  }

  return {
    feasible: missingCapacity === 0,
    totalRequiredMinutes,
    availableMinutes,
    missingCapacity,
    requiredExtraMinutesPerDay,
    topicsLeftUnscheduled,
    possibleSolutions,
  };
}

export function buildUnscheduledWork({ tasks, resolvedTopics, topicStates }) {
  const learningMinutesByTopic = {};
  const questionCountByTopic = {};

  for (const task of tasks) {
    if (task.taskType === 'learning') {
      learningMinutesByTopic[task.canonicalTopicId] =
        (learningMinutesByTopic[task.canonicalTopicId] || 0) +
        task.estimatedMinutes;
    } else if (task.taskType === 'uworld_questions') {
      questionCountByTopic[task.canonicalTopicId] =
        (questionCountByTopic[task.canonicalTopicId] || 0) +
        task.targetCount;
    }
  }

  const unscheduledWork = [];

  for (const topic of resolvedTopics) {
    const state = topicStates[topic.canonicalTopicId];
    if (!state || state.satisfiedBySharedCompletion) continue;
    if (state.status === 'completed') continue;

    const scheduledLearningMinutes =
      learningMinutesByTopic[topic.canonicalTopicId] || 0;
    const scheduledQuestions =
      questionCountByTopic[topic.canonicalTopicId] || 0;

    const remainingLearningMinutes = Math.max(
      0,
      state.personalizedLearningMinutes - scheduledLearningMinutes
    );
    const remainingQuestions = Math.max(
      0,
      state.remainingUworldQuestions - scheduledQuestions
    );

    if (remainingLearningMinutes > 0 || remainingQuestions > 0) {
      unscheduledWork.push({
        canonicalTopicId: topic.canonicalTopicId,
        title: topic.title,
        remainingLearningMinutes,
        remainingQuestions,
      });
    }
  }

  return unscheduledWork;
}
