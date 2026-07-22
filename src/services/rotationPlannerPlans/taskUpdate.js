const TERMINAL_STATUSES = new Set(['completed', 'partial', 'skipped'])
const TERMINAL_PROGRESS_STATUSES = new Set(['completed', 'partial'])
const VALID_ACTIONS = new Set(['start', 'complete', 'partial', 'skip', 'record_time', 'record_questions'])
const ALLOWED_ACTIONS = {
  locked: new Set(),
  pending: new Set(['start', 'complete', 'partial', 'skip']),
  in_progress: new Set(['complete', 'partial', 'record_time', 'record_questions']),
  partial: new Set(),
  completed: new Set(),
  skipped: new Set(),
}

const PERCENTAGE_TASK_TYPES = new Set(['learning', 'consolidation'])
const COUNT_TASK_TYPES = new Set(['uworld_questions', 'incorrect_review', 'mixed_review', 'optional_book_questions'])

export function applyTaskUpdate(task, action, payload, context) {
  if (!VALID_ACTIONS.has(action)) {
    throw new Error('INVALID_ACTION')
  }

  const allowed = ALLOWED_ACTIONS[task.status]
  if (!allowed || !allowed.has(action)) {
    if (TERMINAL_STATUSES.has(task.status)) {
      throw new Error('COMPLETED_TASK_IMMUTABLE')
    }
    throw new Error('INVALID_ACTION_TRANSITION')
  }

  const updatedFields = {
    actualMinutes: task.actualMinutes ?? null,
    completedCount: task.completedCount ?? 0,
    completionPercentage: task.completionPercentage ?? 0,
    incorrectCount: task.incorrectCount ?? 0,
  }

  const sideEffects = {
    unlocksTopics: [],
    completesTopic: null,
    returnsWorkToPool: { learningMinutes: 0, uworldQuestions: 0, incorrectQuestions: 0 },
  }

  let recalculationRequired = false
  let newStatus = task.status

  switch (action) {
    case 'start':
      newStatus = 'in_progress'
      break

    case 'complete': {
      newStatus = 'completed'
      if (payload.actualMinutes != null) {
        validateNonNegative(payload.actualMinutes, 'actualMinutes')
        updatedFields.actualMinutes = payload.actualMinutes
      }

      if (task.taskType === 'uworld_questions') {
        if (payload.completedCount == null) throw new Error('COMPLETED_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.completedCount, 'completedCount')
        if (task.targetCount != null && payload.completedCount > task.targetCount) {
          throw new Error('COMPLETED_COUNT_EXCEEDS_TARGET')
        }
        updatedFields.completedCount = payload.completedCount

        if (payload.incorrectCount == null) throw new Error('INCORRECT_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.incorrectCount, 'incorrectCount')
        if (payload.incorrectCount > payload.completedCount) {
          throw new Error('INCORRECT_COUNT_EXCEEDS_COMPLETED')
        }
        updatedFields.incorrectCount = payload.incorrectCount
      } else if (task.taskType === 'incorrect_review') {
        if (payload.completedCount == null) throw new Error('COMPLETED_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.completedCount, 'completedCount')
        updatedFields.completedCount = payload.completedCount
      }

      if (PERCENTAGE_TASK_TYPES.has(task.taskType)) {
        updatedFields.completionPercentage = 100
      } else if (task.taskType === 'uworld_questions' || task.taskType === 'incorrect_review') {
        updatedFields.completionPercentage = 100
      } else {
        updatedFields.completionPercentage = 100
      }

      computeReturnToPool(task, 100, sideEffects)
      recalculationRequired = true
      break
    }

    case 'partial': {
      newStatus = 'partial'
      if (payload.actualMinutes != null) {
        validateNonNegative(payload.actualMinutes, 'actualMinutes')
        updatedFields.actualMinutes = payload.actualMinutes
      }

      if (task.taskType === 'learning' || task.taskType === 'consolidation') {
        if (payload.completedPercentage == null) throw new Error('COMPLETED_PERCENTAGE_REQUIRED')
        if (typeof payload.completedPercentage !== 'number' || payload.completedPercentage < 1 || payload.completedPercentage > 99) {
          throw new Error('COMPLETED_PERCENTAGE_OUT_OF_RANGE')
        }
        updatedFields.completionPercentage = payload.completedPercentage
      } else if (task.taskType === 'uworld_questions') {
        if (payload.completedCount == null) throw new Error('COMPLETED_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.completedCount, 'completedCount')
        if (task.targetCount != null && payload.completedCount > task.targetCount) {
          throw new Error('COMPLETED_COUNT_EXCEEDS_TARGET')
        }
        updatedFields.completedCount = payload.completedCount
        if (payload.incorrectCount == null) throw new Error('INCORRECT_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.incorrectCount, 'incorrectCount')
        if (payload.incorrectCount > payload.completedCount) {
          throw new Error('INCORRECT_COUNT_EXCEEDS_COMPLETED')
        }
        updatedFields.incorrectCount = payload.incorrectCount
        if (task.targetCount > 0) {
          updatedFields.completionPercentage = (payload.completedCount / task.targetCount) * 100
        }
      } else if (task.taskType === 'incorrect_review') {
        if (payload.completedCount == null) throw new Error('COMPLETED_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.completedCount, 'completedCount')
        updatedFields.completedCount = payload.completedCount
        if (task.targetCount > 0) {
          updatedFields.completionPercentage = (payload.completedCount / task.targetCount) * 100
        }
      } else if (task.taskType === 'mixed_review' || task.taskType === 'optional_book_questions') {
        if (task.targetCount != null && task.targetCount > 0) {
          if (payload.completedCount == null) throw new Error('COMPLETED_COUNT_REQUIRED')
          validateNonNegativeInteger(payload.completedCount, 'completedCount')
          updatedFields.completedCount = payload.completedCount
          updatedFields.completionPercentage = (payload.completedCount / task.targetCount) * 100
        } else {
          if (payload.completedPercentage == null) throw new Error('COMPLETED_PERCENTAGE_REQUIRED')
          if (typeof payload.completedPercentage !== 'number' || payload.completedPercentage < 1 || payload.completedPercentage > 99) {
            throw new Error('COMPLETED_PERCENTAGE_OUT_OF_RANGE')
          }
          updatedFields.completionPercentage = payload.completedPercentage
        }
      } else if (task.taskType === 'flashcard_review') {
        if (task.targetCount != null && task.targetCount > 0) {
          if (payload.completedCount == null) throw new Error('COMPLETED_COUNT_REQUIRED')
          validateNonNegativeInteger(payload.completedCount, 'completedCount')
          updatedFields.completedCount = payload.completedCount
          updatedFields.completionPercentage = (payload.completedCount / task.targetCount) * 100
        } else {
          throw new Error('PARTIAL_NOT_SUPPORTED_FOR_FLASHCARD_REVIEW')
        }
      }

      computeReturnToPool(task, updatedFields.completionPercentage, sideEffects)
      recalculationRequired = true
      break
    }

    case 'skip': {
      newStatus = 'skipped'
      updatedFields.completionPercentage = 0
      if (task.taskType === 'learning') {
        sideEffects.returnsWorkToPool.learningMinutes += task.estimatedMinutes || 0
      } else if (task.taskType === 'uworld_questions') {
        sideEffects.returnsWorkToPool.uworldQuestions += task.targetCount || 0
      } else if (task.taskType === 'incorrect_review') {
        sideEffects.returnsWorkToPool.incorrectQuestions += task.targetCount || 0
      }
      recalculationRequired = true
      break
    }

    case 'record_time': {
      if (payload.actualMinutes == null) throw new Error('ACTUAL_MINUTES_REQUIRED')
      validateNonNegative(payload.actualMinutes, 'actualMinutes')
      updatedFields.actualMinutes = payload.actualMinutes
      break
    }

    case 'record_questions': {
      if (task.taskType === 'uworld_questions') {
        if (payload.completedCount == null) throw new Error('COMPLETED_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.completedCount, 'completedCount')
        if (task.targetCount != null && payload.completedCount > task.targetCount) {
          throw new Error('COMPLETED_COUNT_EXCEEDS_TARGET')
        }
        updatedFields.completedCount = payload.completedCount
        if (payload.incorrectCount == null) throw new Error('INCORRECT_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.incorrectCount, 'incorrectCount')
        updatedFields.incorrectCount = payload.incorrectCount
      } else if (task.taskType === 'incorrect_review') {
        if (payload.completedCount == null) throw new Error('COMPLETED_COUNT_REQUIRED')
        validateNonNegativeInteger(payload.completedCount, 'completedCount')
        updatedFields.completedCount = payload.completedCount
      } else {
        throw new Error('RECORD_QUESTIONS_NOT_SUPPORTED_FOR_TASK_TYPE')
      }
      if (payload.actualMinutes != null) {
        validateNonNegative(payload.actualMinutes, 'actualMinutes')
        updatedFields.actualMinutes = payload.actualMinutes
      }
      break
    }
  }

  return {
    updatedTask: {
      status: newStatus,
      actualMinutes: updatedFields.actualMinutes,
      completedCount: updatedFields.completedCount,
      completionPercentage: updatedFields.completionPercentage,
      incorrectCount: updatedFields.incorrectCount,
      completedAt: (action === 'complete' || action === 'partial' || action === 'skip') ? context.occurredAt : task.completedAt,
      completedOn: (action === 'complete' || action === 'partial' || action === 'skip') ? context.occurredOn : task.completedOn,
    },
    sideEffects,
    recalculationRequired,
  }
}

function computeReturnToPool(task, completionPercentage, sideEffects) {
  if (task.taskType === 'learning') {
    const completedWork = (task.estimatedMinutes || 0) * (completionPercentage / 100)
    const remaining = Math.max(0, (task.estimatedMinutes || 0) - completedWork)
    sideEffects.returnsWorkToPool.learningMinutes += Math.ceil(remaining)
  } else if (task.taskType === 'uworld_questions') {
    const completedQ = task.completedCount || 0
    const targetQ = task.targetCount || 0
    sideEffects.returnsWorkToPool.uworldQuestions += Math.max(0, targetQ - completedQ)
  } else if (task.taskType === 'incorrect_review') {
    const completedQ = task.completedCount || 0
    const targetQ = task.targetCount || 0
    sideEffects.returnsWorkToPool.incorrectQuestions += Math.max(0, targetQ - completedQ)
  }
}

function validateNonNegative(value, name) {
  if (typeof value !== 'number' || value < 0) {
    throw new Error(`${name.toUpperCase()}_MUST_BE_NONNEGATIVE`)
  }
}

function validateNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name.toUpperCase()}_MUST_BE_NONNEGATIVE_INTEGER`)
  }
}

export { TERMINAL_STATUSES, TERMINAL_PROGRESS_STATUSES, VALID_ACTIONS, ALLOWED_ACTIONS }
