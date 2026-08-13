import { getTaskDisplayModel } from './taskDisplayModel'

/**
 * Finds the next scheduled, genuinely actionable block for a rotation plan.
 *
 * Operates only on already-loaded plan detail data (no extra API request):
 * selection is the earliest non-terminal, non-locked block whose local
 * scheduled date is today or later, using the existing schedule order
 * (displayOrder) as the deterministic tie-breaker.
 *
 * Dates are local `YYYY-MM-DD` keys compared lexicographically — never UTC
 * slicing. The caller supplies the browser-local `todayKey`.
 */
export function getNextActionableBlock({ tasks, todayKey, topicsById }) {
  const list = Array.isArray(tasks) ? tasks : []
  const candidates = list
    .filter((t) => t && t.taskDate && todayKey && t.taskDate >= todayKey)
    .map((t) => {
      const topic = topicsById?.get?.(t.planTopicId) ?? null
      return { task: t, model: getTaskDisplayModel(t, todayKey, topic) }
    })
    .filter(({ model }) => !model.isTerminal && !model.isLocked)
    .sort((a, b) => {
      if (a.task.taskDate !== b.task.taskDate) return a.task.taskDate < b.task.taskDate ? -1 : 1
      return (a.task.displayOrder ?? 0) - (b.task.displayOrder ?? 0)
    })

  const best = candidates[0]
  if (!best) return null

  const { task, model } = best
  const questionCount =
    Number.isFinite(task.targetCount) && task.targetCount > 0 ? task.targetCount : null

  return {
    taskId: task.id,
    title: model.topicTitle || model.typeLabel || task.taskType || 'Upcoming block',
    dateKey: task.taskDate,
    typeLabel: model.typeLabel,
    mode: task.mode || null,
    provider: task.provider || null,
    estimatedMinutes: task.estimatedMinutes || 0,
    questionCount,
  }
}

export default getNextActionableBlock
