export const LIFECYCLE_ACTIONS = new Set(['activate', 'pause', 'resume', 'complete'])

export const LIFECYCLE_OPERATIONS = {
  activate: 'activate_plan',
  pause: 'pause_plan',
  resume: 'resume_plan',
  complete: 'complete_plan',
}

export const LIFECYCLE_TRANSITIONS = {
  activate: { from: 'draft', to: 'active' },
  pause: { from: 'active', to: 'paused' },
  resume: { from: 'paused', to: 'active' },
  complete: { from: ['active', 'paused'], to: 'completed' },
}

export function isValidLifecycleTransition(action, currentStatus) {
  const rule = LIFECYCLE_TRANSITIONS[action]
  if (!rule) return false
  const froms = Array.isArray(rule.from) ? rule.from : [rule.from]
  return froms.includes(currentStatus)
}

// Outstanding-work summary used to guard plan completion. A task is
// "outstanding" unless it is completed or skipped. Locked future tasks
// count as outstanding on purpose — completion freezes the whole schedule.
export function computeOutstandingSummary(tasks) {
  const outstanding = (tasks || []).filter(t => t.status !== 'completed' && t.status !== 'skipped')

  let learningTasks = 0
  let uworldTasks = 0
  let incorrectReviewTasks = 0
  let remainingLearningMinutes = 0
  let remainingQuestions = 0

  for (const task of outstanding) {
    switch (task.taskType) {
      case 'learning':
      case 'consolidation':
        learningTasks += 1
        remainingLearningMinutes += Math.round(
          (task.estimatedMinutes || 0) * (1 - (task.completionPercentage || 0) / 100)
        )
        break
      case 'uworld_questions':
      case 'mixed_review':
        uworldTasks += 1
        remainingQuestions += Math.max(0, (task.targetCount || 0) - (task.completedCount || 0))
        break
      case 'incorrect_review':
        incorrectReviewTasks += 1
        remainingQuestions += Math.max(0, (task.targetCount || 0) - (task.completedCount || 0))
        break
      default:
        break
    }
  }

  return {
    learningTasks,
    uworldTasks,
    incorrectReviewTasks,
    totalTasks: outstanding.length,
    remainingLearningMinutes,
    remainingQuestions,
  }
}

export function buildLifecycleTimestamps(action, now) {
  switch (action) {
    case 'activate':
      return {
        activatedAt: { value: now, coalesce: true },
        pausedAt: { value: null, coalesce: false },
      }
    case 'pause':
      return { pausedAt: { value: now, coalesce: false } }
    case 'resume':
      return { pausedAt: { value: null, coalesce: false } }
    case 'complete':
      return { completedAt: { value: now, coalesce: true } }
    default:
      return {}
  }
}
