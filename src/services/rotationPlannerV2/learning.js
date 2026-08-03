import { parseDateParts } from './dateUtils.js';

export function resolveTopicLearningMinutes(topic, studyStyle, paceMultiplier) {
  const lm = topic.learningMinutes || {};
  let base;

  switch (studyStyle) {
    case 'focused':
      base = lm.focused;
      break;
    case 'active':
      base = lm.activeExpected;
      break;
    case 'detailed_notes':
      base = lm.detailedNotes;
      break;
    default:
      base = lm.activeExpected;
  }

  const remaining = (1 - (topic.alreadyCompletedLearningPercentage || 0));
  return Math.max(0, Math.ceil((base || 0) * paceMultiplier * remaining));
}

export function scheduleLearningTasks({
  dayDate,
  usableMinutes,
  activeTopics,
  topicStates,
  schedulingMode,
  maximumActiveTopics,
}) {
  const states = { ...topicStates };
  const tasks = [];
  let remainingCapacity = usableMinutes;
  let sortOrder = 0;

  const needsLearning = activeTopics.filter((t) => {
    const state = states[t.canonicalTopicId];
    return state && (state.status === 'not_started' || state.status === 'learning');
  });

  const learningTopics = needsLearning;
  let topicsStartedThisCycle = 0;

  if (schedulingMode === 'focused') {
    let currentTopic = null;

    for (const topic of learningTopics) {
      const state = states[topic.canonicalTopicId];
      if (state.remainingLearningMinutes == null) {
        state.remainingLearningMinutes = state.personalizedLearningMinutes;
      }
      const topicRemaining = state.remainingLearningMinutes;

      if (topicRemaining <= 0) continue;

      if (!currentTopic) {
        if (state.status === 'not_started') {
          if (topicsStartedThisCycle >= maximumActiveTopics) break;
          topicsStartedThisCycle++;
        }
        currentTopic = topic;
      }

      if (topic.canonicalTopicId !== currentTopic.canonicalTopicId) break;

      const minutesToAssign = Math.min(remainingCapacity, topicRemaining);
      if (minutesToAssign <= 0) break;

      if (state.status === 'not_started') {
        state.status = 'learning';
      }

      remainingCapacity -= minutesToAssign;
      state.remainingLearningMinutes = topicRemaining - minutesToAssign;

      tasks.push({
        taskDate: dayDate,
        taskType: 'learning',
        normalizedTopicId: topic.normalizedTopicId || null,
        canonicalTopicId: topic.canonicalTopicId,
        estimatedMinutes: minutesToAssign,
        targetCount: null,
        provider: null,
        mode: null,
        questionPool: null,
        selection: null,
        status: 'pending',
        unlockCondition: null,
        displayOrder: sortOrder++,
        metadata: {},
      });

      if (state.remainingLearningMinutes <= 0) {
        state.status = 'questions_locked';
        state.learningCompletedAt = dayDate;
        currentTopic = null;
      }
    }
  } else {
    // efficient mode
    for (const topic of learningTopics) {
      const state = states[topic.canonicalTopicId];
      if (state.remainingLearningMinutes == null) {
        state.remainingLearningMinutes = state.personalizedLearningMinutes;
      }
      const topicRemaining = state.remainingLearningMinutes;

      if (topicRemaining <= 0) continue;

      if (state.status === 'not_started') {
        if (topicsStartedThisCycle >= maximumActiveTopics) break;
        topicsStartedThisCycle++;
        state.status = 'learning';
      }

      const minutesToAssign = Math.min(remainingCapacity, topicRemaining);
      if (minutesToAssign <= 0) break;

      remainingCapacity -= minutesToAssign;
      state.remainingLearningMinutes = topicRemaining - minutesToAssign;

      tasks.push({
        taskDate: dayDate,
        taskType: 'learning',
        normalizedTopicId: topic.normalizedTopicId || null,
        canonicalTopicId: topic.canonicalTopicId,
        estimatedMinutes: minutesToAssign,
        targetCount: null,
        provider: null,
        mode: null,
        questionPool: null,
        selection: null,
        status: 'pending',
        unlockCondition: null,
        displayOrder: sortOrder++,
        metadata: {},
      });

      if (state.remainingLearningMinutes <= 0) {
        state.status = 'questions_locked';
        state.learningCompletedAt = dayDate;
      }
    }
  }

  return { tasks, remainingCapacity, topicStates: states };
}
