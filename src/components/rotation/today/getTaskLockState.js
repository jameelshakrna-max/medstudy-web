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

export default function getTaskLockState(task, topicsById) {
  const source = task || {}
  const condition = source.unlockCondition ?? source.unlock_condition

  if (!condition || typeof condition !== 'string') return UNLOCKED

  const parsed = parseCondition(condition)
  if (!parsed) {
    return { isLocked: true, conditionType: null, prerequisiteTopic: null, message: FALLBACK_MESSAGE }
  }

  const { type, canonicalTopicId } = parsed
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
