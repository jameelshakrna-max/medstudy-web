import { calculateQuestionCapacity } from './capacity.js';

export function initializeGroupStates({ groups, topics, initialGroupStates }) {
  const canonicalBySource = new Map();
  for (const topic of topics || []) {
    if (topic.sourceTopicId && topic.canonicalTopicId) {
      canonicalBySource.set(topic.sourceTopicId, topic.canonicalTopicId);
    }
  }

  const states = {};
  for (const group of groups || []) {
    const init = initialGroupStates ? initialGroupStates[group.key] : undefined;
    const requiredTopicIds = group.requiredTopicIds || [];
    const requiredCanonicalTopicIds = requiredTopicIds
      .map((id) => canonicalBySource.get(id))
      .filter(Boolean);

    const targetQuestions = group.targetQuestions || 0;
    const excluded = group.excluded === 1 || group.excluded === true;
    const completedQuestions = init?.completedQuestions ?? 0;
    const incorrectQuestionsRemaining = init?.incorrectQuestionsRemaining ?? 0;
    const requiredLearningCompleted = init?.requiredLearningCompleted ?? false;
    const unlockedAt = init?.unlockedAt ?? null;

    let status;
    if (excluded) {
      status = 'excluded';
    } else if (requiredLearningCompleted) {
      status = 'pending';
    } else {
      status = 'locked';
    }

    states[group.key] = {
      id: group.id || null,
      key: group.key,
      title: group.title,
      system: group.system,
      targetQuestions,
      excluded,
      displayOrder: group.displayOrder || 0,
      completedQuestions,
      remainingQuestions: Math.max(0, targetQuestions - completedQuestions),
      incorrectQuestionsRemaining,
      requiredLearningCompleted,
      requiredTopicIds,
      requiredCanonicalTopicIds,
      status,
      unlockedAt,
    };
  }
  return states;
}

export function evaluateGroupLearning(groupStates, topicStates, dayDate) {
  for (const key of Object.keys(groupStates)) {
    const state = groupStates[key];
    if (state.excluded) continue;
    if (state.requiredLearningCompleted) continue;

    const requiredIds = state.requiredCanonicalTopicIds;
    let latestCompletedAt = null;
    let allComplete = true;

    if (requiredIds.length > 0) {
      for (const canonicalId of requiredIds) {
        const topicState = topicStates ? topicStates[canonicalId] : null;
        const remaining =
          topicState?.remainingLearningMinutes ?? topicState?.personalizedLearningMinutes;
        const learningComplete =
          (typeof remaining === 'number' && remaining <= 0) ||
          Boolean(topicState?.learningCompletedAt);
        if (!learningComplete) {
          allComplete = false;
          break;
        }
        if (
          topicState?.learningCompletedAt &&
          (!latestCompletedAt || topicState.learningCompletedAt > latestCompletedAt)
        ) {
          latestCompletedAt = topicState.learningCompletedAt;
        }
      }
    }

    if (!allComplete) continue;

    state.requiredLearningCompleted = true;
    state.unlockedAt = latestCompletedAt || dayDate;
    if (state.status === 'locked') {
      state.status = 'pending';
    }
  }
  return groupStates;
}

function sortGroupsByDisplayOrder(groups) {
  return [...(groups || [])].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

export function scheduleGroupedUworldTasks({
  dayDate,
  usableMinutes,
  groups,
  groupStates,
  questionStartRule,
  planConfig,
}) {
  const tasks = [];
  let remainingMinutes = usableMinutes;
  let sortOrder = 1;
  const updatedGroupStates = { ...groupStates };

  for (const group of sortGroupsByDisplayOrder(groups)) {
    const state = updatedGroupStates[group.key];
    if (!state) continue;
    if (state.excluded) continue;
    if (!state.requiredLearningCompleted) continue;
    if (state.remainingQuestions <= 0) continue;
    if (remainingMinutes <= 0) break;

    if (
      questionStartRule === 'next_available_day' &&
      dayDate <= state.unlockedAt
    ) {
      continue;
    }

    if (
      questionStartRule === 'same_day_if_capacity' &&
      dayDate === state.unlockedAt &&
      remainingMinutes <
        planConfig.minimumQuestionsPerSession *
          planConfig.averageMinutesPerQuestion
    ) {
      continue;
    }

    const { questionsToday, minutesConsumed } = calculateQuestionCapacity({
      usableMinutes: remainingMinutes,
      questionsRemaining: state.remainingQuestions,
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
      canonicalTopicId: null,
      planQuestionGroupId: group.id || null,
      groupKey: group.key,
      estimatedMinutes: minutesConsumed,
      targetCount: questionsToday,
      provider: 'uworld',
      mode: 'tutor',
      questionPool: 'unused',
      selection: 'group',
      status: 'pending',
      unlockCondition: `learning_group_completed:${group.key}`,
      displayOrder: sortOrder++,
      metadata: { groupKey: group.key },
    });

    remainingMinutes -= minutesConsumed;

    updatedGroupStates[group.key] = {
      ...state,
      completedQuestions: state.completedQuestions + questionsToday,
      remainingQuestions: Math.max(0, state.remainingQuestions - questionsToday),
      status:
        state.status === 'pending' || state.status === 'locked'
          ? 'in_progress'
          : state.status,
    };
  }

  return {
    tasks,
    remainingCapacity: Math.max(0, remainingMinutes),
    groupStates: updatedGroupStates,
  };
}

export function scheduleGroupedIncorrectReview({
  dayDate,
  usableMinutes,
  groups,
  groupStates,
  planConfig,
}) {
  const tasks = [];
  let remainingMinutes = usableMinutes;
  let sortOrder = 1;
  const updatedGroupStates = { ...groupStates };

  for (const group of sortGroupsByDisplayOrder(groups)) {
    const state = updatedGroupStates[group.key];
    if (!state) continue;
    if (state.excluded) continue;
    if (state.remainingQuestions > 0) continue;
    if (state.incorrectQuestionsRemaining <= 0) continue;
    if (remainingMinutes <= 0) break;

    const { questionsToday, minutesConsumed } = calculateQuestionCapacity({
      usableMinutes: remainingMinutes,
      questionsRemaining: state.incorrectQuestionsRemaining,
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
      canonicalTopicId: null,
      planQuestionGroupId: group.id || null,
      groupKey: group.key,
      estimatedMinutes: minutesConsumed,
      targetCount: questionsToday,
      provider: 'uworld',
      mode: 'tutor',
      questionPool: 'unused',
      selection: 'group',
      status: 'pending',
      unlockCondition: `uworld_group_completed:${group.key}`,
      displayOrder: sortOrder++,
      metadata: { groupKey: group.key },
    });

    remainingMinutes -= minutesConsumed;

    const newIncorrect = Math.max(
      0,
      state.incorrectQuestionsRemaining - questionsToday
    );
    updatedGroupStates[group.key] = {
      ...state,
      incorrectQuestionsRemaining: newIncorrect,
      status:
        state.remainingQuestions <= 0 && newIncorrect <= 0
          ? 'completed'
          : state.status,
    };
  }

  return {
    tasks,
    remainingCapacity: Math.max(0, remainingMinutes),
    groupStates: updatedGroupStates,
  };
}
