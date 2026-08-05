export const TERMINAL_TASK_STATUSES = ['completed', 'partial', 'skipped']

export function isTerminalTaskStatus(status) {
  return TERMINAL_TASK_STATUSES.includes(status)
}

export function selectNextTask(tasks, todayKey) {
  const list = Array.isArray(tasks) ? tasks : []
  if (list.length === 0) return null

  const eligible = list.filter(
    task =>
      task &&
      !isTerminalTaskStatus(task.status) &&
      (!task.taskDate || task.taskDate >= todayKey)
  )

  if (eligible.length === 0) return null

  return eligible
    .slice()
    .sort((a, b) => {
      const aDate = a.taskDate || '9999-12-31'
      const bDate = b.taskDate || '9999-12-31'
      if (aDate !== bDate) return aDate < bDate ? -1 : 1
      const aOrder = a.displayOrder ?? Number.MAX_SAFE_INTEGER
      const bOrder = b.displayOrder ?? Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      return String(a.id).localeCompare(String(b.id))
    })[0] || null
}

export function describeTaskPrerequisite(task, topics) {
  if (!task || !task.unlockCondition) return null

  const topicList = Array.isArray(topics) ? topics : []
  const findTopic = canonicalTopicId =>
    topicList.find(t => t.canonicalTopicId === canonicalTopicId)

  const fallback = "Complete this task's prerequisite first."

  if (task.unlockCondition.startsWith('learning_completed:')) {
    const canonicalTopicId = task.unlockCondition.slice('learning_completed:'.length)
    const topic = findTopic(canonicalTopicId)
    return topic ? `Complete learning for ${topic.topicTitle} first.` : fallback
  }

  if (task.unlockCondition.startsWith('uworld_completed:')) {
    const canonicalTopicId = task.unlockCondition.slice('uworld_completed:'.length)
    const topic = findTopic(canonicalTopicId)
    return topic ? `Complete the UWorld questions for ${topic.topicTitle} first.` : fallback
  }

  return fallback
}
