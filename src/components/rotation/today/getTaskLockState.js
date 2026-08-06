const UNLOCKED = { isLocked: false, conditionType: null, prerequisiteTopic: null, message: null }

const LEARNING_SATISFIED_STATUSES = new Set(['uworld_in_progress', 'completed', 'questions_locked'])

const FALLBACK_MESSAGE = "Complete this task's prerequisite first."

function parseCondition(condition) {
  const idx = condition.indexOf(':')
  if (idx <= 0 || idx === condition.length - 1) return null
  return { type: condition.slice(0, idx), canonicalTopicId: condition.slice(idx + 1) }
}

function topicValues(topicsById) {
  if (!topicsById) return []
  if (typeof topicsById.values === 'function') return Array.from(topicsById.values())
  if (typeof topicsById === 'object') return Object.values(topicsById)
  return []
}

function findTopicByCanonicalId(topicsById, canonicalTopicId) {
  return topicValues(topicsById).find(topic => topic && topic.canonicalTopicId === canonicalTopicId) || null
}

function groupStateValues(context) {
  const states = context?.questionGroupStates
  if (!states) return []
  if (Array.isArray(states)) return states
  if (typeof states.values === 'function') return Array.from(states.values())
  if (typeof states === 'object') return Object.values(states)
  return []
}

function findGroupState(context, groupKey) {
  const key = groupKey == null ? '' : String(groupKey)
  if (!key) return null

  if (context?.questionGroupStates instanceof Map) {
    const direct = context.questionGroupStates.get(key) || context.questionGroupStates.get(groupKey)
    if (direct) return direct
  }

  for (const state of groupStateValues(context)) {
    const stateKey = state?.groupKey ?? state?.key
    if (stateKey != null && String(stateKey) === key) return state
  }
  return null
}

function groupProgress(state) {
  const completed = state?.completedCount ?? state?.completedQuestions ?? 0
  const target = state?.targetCount ?? state?.targetQuestions ?? 0
  return { completed: Number(completed) || 0, target: Number(target) || 0 }
}

function resolveGroupLock({ type, canonicalTopicId }, context) {
  const groupState = findGroupState(context, canonicalTopicId)
  const groupKey = groupState?.groupKey ?? groupState?.key ?? canonicalTopicId
  const groupTitle = groupState?.title || null

  if (groupState) {
    const { completed, target } = groupProgress(groupState)
    if (target > 0 && completed >= target) return UNLOCKED
  }

  const message = groupTitle
    ? type === 'learning_group_completed'
      ? `Complete learning for ${groupTitle} to unlock these questions.`
      : `Complete the UWorld questions for ${groupTitle} to unlock this task.`
    : FALLBACK_MESSAGE

  return {
    isLocked: true,
    conditionType: type,
    prerequisiteTopic: null,
    prerequisiteGroup: groupState ? { groupKey, groupTitle } : null,
    message,
  }
}

export default function getTaskLockState(task, topicsById, context = {}) {
  const source = task || {}
  const condition = source.unlockCondition ?? source.unlock_condition

  if (!condition || typeof condition !== 'string') return UNLOCKED

  const parsed = parseCondition(condition)
  if (!parsed) {
    return { isLocked: true, conditionType: null, prerequisiteTopic: null, message: FALLBACK_MESSAGE }
  }

  const { type, canonicalTopicId } = parsed

  if (type === 'learning_group_completed' || type === 'uworld_group_completed') {
    return resolveGroupLock(parsed, context)
  }

  const topic = findTopicByCanonicalId(topicsById, canonicalTopicId)
  const prerequisiteTopic = topic
    ? { canonicalTopicId: topic.canonicalTopicId, topicTitle: topic.topicTitle }
    : null

  if (type === 'learning_completed') {
    const satisfied = !!topic && LEARNING_SATISFIED_STATUSES.has(topic.status)
    if (satisfied) return UNLOCKED
    const message = topic && topic.topicTitle
      ? `Complete learning for ${topic.topicTitle} to unlock these questions.`
      : FALLBACK_MESSAGE
    return { isLocked: true, conditionType: type, prerequisiteTopic, message }
  }

  if (type === 'uworld_completed') {
    const total = topic?.totalUworldQuestions ?? 0
    const completed = topic?.completedUworldQuestions ?? 0
    const satisfied = !!topic && total > 0 && completed >= total
    if (satisfied) return UNLOCKED
    const message = topic && topic.topicTitle
      ? `Complete the UWorld questions for ${topic.topicTitle} to unlock this task.`
      : FALLBACK_MESSAGE
    return { isLocked: true, conditionType: type, prerequisiteTopic, message }
  }

  return { isLocked: true, conditionType: type, prerequisiteTopic, message: FALLBACK_MESSAGE }
}
