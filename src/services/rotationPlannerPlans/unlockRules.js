function parseUnlockCondition(unlockCondition) {
  if (!unlockCondition || typeof unlockCondition !== 'string') return null
  const idx = unlockCondition.indexOf(':')
  if (idx <= 0 || idx === unlockCondition.length - 1) return null
  return { type: unlockCondition.slice(0, idx), canonicalTopicId: unlockCondition.slice(idx + 1) }
}

function hasCompletedLearning(topicState) {
  if (!topicState) return false
  const remaining = topicState.remainingLearningMinutes ?? topicState.remaining_learning_minutes
  if (typeof remaining === 'number' && Number.isFinite(remaining)) return remaining <= 0
  return false
}

function hasCompletedUworld(topicState) {
  if (!topicState) return false
  const total = topicState.totalUworldQuestions ?? topicState.total_uworld_questions ?? 0
  const completed = topicState.completedUworldQuestions ?? topicState.completed_uworld_questions ?? 0
  return total > 0 && completed >= total
}

function isUnlockConditionSatisfied(unlockCondition, topicState) {
  const parsed = parseUnlockCondition(unlockCondition)
  if (!parsed) return true
  switch (parsed.type) {
    case 'learning_completed':
      return hasCompletedLearning(topicState)
    case 'uworld_completed':
      return hasCompletedUworld(topicState)
    case 'learning_group_completed':
      return !!(topicState?.requiredLearningCompleted)
    case 'uworld_group_completed':
      return (topicState?.remainingQuestions ?? -1) <= 0
    default:
      return false
  }
}

function isTaskEffectivelyLocked(task, topicState) {
  if (!task) return false
  const unlockCondition = task.unlockCondition ?? task.unlock_condition
  if (!unlockCondition) return false
  return !isUnlockConditionSatisfied(unlockCondition, topicState)
}

export {
  parseUnlockCondition,
  hasCompletedLearning,
  hasCompletedUworld,
  isUnlockConditionSatisfied,
  isTaskEffectivelyLocked,
}
