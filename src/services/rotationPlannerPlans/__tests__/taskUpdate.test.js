import { describe, it, expect } from 'vitest'
import { applyTaskUpdate } from '../taskUpdate.js'

const CTX = { occurredAt: '2026-07-22T12:00:00Z', occurredOn: '2026-07-22' }

function learningTask(overrides = {}) {
  return {
    id: 'task-1',
    taskType: 'learning',
    status: 'pending',
    estimatedMinutes: 60,
    targetCount: null,
    completedCount: null,
    actualMinutes: null,
    completionPercentage: 0,
    incorrectCount: null,
    completedAt: null,
    completedOn: null,
    ...overrides,
  }
}

function uworldTask(overrides = {}) {
  return {
    id: 'task-2',
    taskType: 'uworld_questions',
    status: 'pending',
    estimatedMinutes: 30,
    targetCount: 20,
    completedCount: null,
    actualMinutes: null,
    completionPercentage: 0,
    incorrectCount: null,
    completedAt: null,
    completedOn: null,
    ...overrides,
  }
}

function incorrectReviewTask(overrides = {}) {
  return {
    id: 'task-3',
    taskType: 'incorrect_review',
    status: 'pending',
    estimatedMinutes: 15,
    targetCount: 10,
    completedCount: null,
    actualMinutes: null,
    completionPercentage: 0,
    incorrectCount: null,
    completedAt: null,
    completedOn: null,
    ...overrides,
  }
}

describe('applyTaskUpdate', () => {
  describe('invalid actions', () => {
    it('throws INVALID_ACTION for unknown action', () => {
      expect(() => applyTaskUpdate(learningTask(), 'bogus', {}, CTX)).toThrow('INVALID_ACTION')
    })

    it('throws INVALID_ACTION_TRANSITION for start on locked task', () => {
      expect(() => applyTaskUpdate(learningTask({ status: 'locked' }), 'start', {}, CTX)).toThrow('INVALID_ACTION_TRANSITION')
    })
  })

  describe('terminal state immutability', () => {
    const terminalStatuses = ['completed', 'partial', 'skipped']

    for (const status of terminalStatuses) {
      for (const action of ['start', 'complete', 'partial', 'skip', 'record_time', 'record_questions']) {
        it(`rejects "${action}" on "${status}" task with COMPLETED_TASK_IMMUTABLE`, () => {
          expect(
            () => applyTaskUpdate(learningTask({ status }), action, { actualMinutes: 10, completedPercentage: 50, completedCount: 5, incorrectCount: 0 }, CTX)
          ).toThrow('COMPLETED_TASK_IMMUTABLE')
        })
      }
    }
  })

  describe('action transitions', () => {
    it('start moves pending → in_progress', () => {
      const result = applyTaskUpdate(learningTask(), 'start', {}, CTX)
      expect(result.updatedTask.status).toBe('in_progress')
    })

    it('complete moves pending → completed', () => {
      const result = applyTaskUpdate(learningTask(), 'complete', { actualMinutes: 30 }, CTX)
      expect(result.updatedTask.status).toBe('completed')
    })

    it('complete moves in_progress → completed', () => {
      const result = applyTaskUpdate(learningTask({ status: 'in_progress' }), 'complete', { actualMinutes: 30 }, CTX)
      expect(result.updatedTask.status).toBe('completed')
    })

    it('partial moves pending → partial', () => {
      const result = applyTaskUpdate(learningTask(), 'partial', { completedPercentage: 50 }, CTX)
      expect(result.updatedTask.status).toBe('partial')
    })

    it('partial moves in_progress → partial', () => {
      const result = applyTaskUpdate(learningTask({ status: 'in_progress' }), 'partial', { completedPercentage: 50 }, CTX)
      expect(result.updatedTask.status).toBe('partial')
    })

    it('skip moves pending → skipped', () => {
      const result = applyTaskUpdate(learningTask(), 'skip', {}, CTX)
      expect(result.updatedTask.status).toBe('skipped')
    })

    it('skip is not allowed from in_progress', () => {
      expect(() => applyTaskUpdate(learningTask({ status: 'in_progress' }), 'skip', {}, CTX)).toThrow('INVALID_ACTION_TRANSITION')
    })
  })

  describe('payload validation', () => {
    it('complete on uworld requires completedCount', () => {
      expect(
        () => applyTaskUpdate(uworldTask(), 'complete', { incorrectCount: 0 }, CTX)
      ).toThrow('COMPLETED_COUNT_REQUIRED')
    })

    it('complete on uworld requires incorrectCount', () => {
      expect(
        () => applyTaskUpdate(uworldTask(), 'complete', { completedCount: 5 }, CTX)
      ).toThrow('INCORRECT_COUNT_REQUIRED')
    })

    it('complete rejects negative actualMinutes', () => {
      expect(
        () => applyTaskUpdate(learningTask(), 'complete', { actualMinutes: -1 }, CTX)
      ).toThrow('ACTUALMINUTES_MUST_BE_NONNEGATIVE')
    })

    it('complete rejects negative completedCount', () => {
      expect(
        () => applyTaskUpdate(uworldTask(), 'complete', { completedCount: -1, incorrectCount: 0 }, CTX)
      ).toThrow('COMPLETEDCOUNT_MUST_BE_NONNEGATIVE_INTEGER')
    })

    it('complete rejects non-integer completedCount', () => {
      expect(
        () => applyTaskUpdate(uworldTask(), 'complete', { completedCount: 5.5, incorrectCount: 0 }, CTX)
      ).toThrow('COMPLETEDCOUNT_MUST_BE_NONNEGATIVE_INTEGER')
    })

    it('complete rejects completedCount > targetCount', () => {
      expect(
        () => applyTaskUpdate(uworldTask(), 'complete', { completedCount: 25, incorrectCount: 0 }, CTX)
      ).toThrow('COMPLETED_COUNT_EXCEEDS_TARGET')
    })

    it('complete rejects incorrectCount > completedCount', () => {
      expect(
        () => applyTaskUpdate(uworldTask(), 'complete', { completedCount: 5, incorrectCount: 10 }, CTX)
      ).toThrow('INCORRECT_COUNT_EXCEEDS_COMPLETED')
    })

    it('partial on learning requires completedPercentage', () => {
      expect(
        () => applyTaskUpdate(learningTask(), 'partial', {}, CTX)
      ).toThrow('COMPLETED_PERCENTAGE_REQUIRED')
    })

    it('partial rejects completedPercentage < 1', () => {
      expect(
        () => applyTaskUpdate(learningTask(), 'partial', { completedPercentage: 0 }, CTX)
      ).toThrow('COMPLETED_PERCENTAGE_OUT_OF_RANGE')
    })

    it('partial rejects completedPercentage > 99', () => {
      expect(
        () => applyTaskUpdate(learningTask(), 'partial', { completedPercentage: 100 }, CTX)
      ).toThrow('COMPLETED_PERCENTAGE_OUT_OF_RANGE')
    })
  })

  describe('side effects', () => {
    it('skip returns learning minutes to pool', () => {
      const task = learningTask({ estimatedMinutes: 45 })
      const result = applyTaskUpdate(task, 'skip', {}, CTX)
      expect(result.sideEffects.returnsWorkToPool.learningMinutes).toBe(45)
    })

    it('skip returns uworld questions to pool', () => {
      const task = uworldTask({ targetCount: 20 })
      const result = applyTaskUpdate(task, 'skip', {}, CTX)
      expect(result.sideEffects.returnsWorkToPool.uworldQuestions).toBe(20)
    })

    it('skip returns incorrect questions to pool', () => {
      const task = incorrectReviewTask({ targetCount: 10 })
      const result = applyTaskUpdate(task, 'skip', {}, CTX)
      expect(result.sideEffects.returnsWorkToPool.incorrectQuestions).toBe(10)
    })

    it('complete computes return to pool for learning', () => {
      const task = learningTask({ estimatedMinutes: 60, completedCount: 0 })
      const result = applyTaskUpdate(task, 'complete', { actualMinutes: 60 }, CTX)
      expect(result.sideEffects.returnsWorkToPool.learningMinutes).toBe(0)
    })

    it('complete computes return to pool for uworld', () => {
      const task = uworldTask({ targetCount: 20, completedCount: 20 })
      const result = applyTaskUpdate(task, 'complete', { completedCount: 20, incorrectCount: 2 }, CTX)
      expect(result.sideEffects.returnsWorkToPool.uworldQuestions).toBe(0)
    })

    it('complete returns uncompleted uworld questions to pool', () => {
      const task = uworldTask({ targetCount: 20, completedCount: 5 })
      const result = applyTaskUpdate(task, 'complete', { completedCount: 15, incorrectCount: 2 }, CTX)
      expect(result.sideEffects.returnsWorkToPool.uworldQuestions).toBe(15)
    })

    it('partial computes return to pool for learning', () => {
      const task = learningTask({ estimatedMinutes: 60 })
      const result = applyTaskUpdate(task, 'partial', { completedPercentage: 50 }, CTX)
      expect(result.sideEffects.returnsWorkToPool.learningMinutes).toBe(30)
    })
  })

  describe('record_time', () => {
    it('updates actualMinutes only, no status change', () => {
      const task = learningTask({ status: 'in_progress' })
      const result = applyTaskUpdate(task, 'record_time', { actualMinutes: 25 }, CTX)
      expect(result.updatedTask.actualMinutes).toBe(25)
      expect(result.updatedTask.status).toBe('in_progress')
    })

    it('requires actualMinutes', () => {
      expect(
        () => applyTaskUpdate(learningTask({ status: 'in_progress' }), 'record_time', {}, CTX)
      ).toThrow('ACTUAL_MINUTES_REQUIRED')
    })

    it('rejects negative actualMinutes', () => {
      expect(
        () => applyTaskUpdate(learningTask({ status: 'in_progress' }), 'record_time', { actualMinutes: -5 }, CTX)
      ).toThrow('ACTUALMINUTES_MUST_BE_NONNEGATIVE')
    })
  })

  describe('record_questions', () => {
    it('works for uworld_questions', () => {
      const task = uworldTask({ status: 'in_progress' })
      const result = applyTaskUpdate(task, 'record_questions', { completedCount: 5, incorrectCount: 1 }, CTX)
      expect(result.updatedTask.completedCount).toBe(5)
      expect(result.updatedTask.incorrectCount).toBe(1)
      expect(result.updatedTask.status).toBe('in_progress')
    })

    it('works for incorrect_review', () => {
      const task = incorrectReviewTask({ status: 'in_progress' })
      const result = applyTaskUpdate(task, 'record_questions', { completedCount: 3 }, CTX)
      expect(result.updatedTask.completedCount).toBe(3)
      expect(result.updatedTask.status).toBe('in_progress')
    })

    it('throws for learning task type', () => {
      expect(
        () => applyTaskUpdate(learningTask({ status: 'in_progress' }), 'record_questions', { completedCount: 5 }, CTX)
      ).toThrow('RECORD_QUESTIONS_NOT_SUPPORTED_FOR_TASK_TYPE')
    })

    it('optionally updates actualMinutes', () => {
      const task = uworldTask({ status: 'in_progress' })
      const result = applyTaskUpdate(task, 'record_questions', { completedCount: 5, incorrectCount: 1, actualMinutes: 10 }, CTX)
      expect(result.updatedTask.actualMinutes).toBe(10)
    })
  })

  describe('completedAt / completedOn', () => {
    it('set on complete', () => {
      const result = applyTaskUpdate(learningTask(), 'complete', { actualMinutes: 30 }, CTX)
      expect(result.updatedTask.completedAt).toBe(CTX.occurredAt)
      expect(result.updatedTask.completedOn).toBe(CTX.occurredOn)
    })

    it('set on partial', () => {
      const result = applyTaskUpdate(learningTask(), 'partial', { completedPercentage: 50 }, CTX)
      expect(result.updatedTask.completedAt).toBe(CTX.occurredAt)
      expect(result.updatedTask.completedOn).toBe(CTX.occurredOn)
    })

    it('set on skip', () => {
      const result = applyTaskUpdate(learningTask(), 'skip', {}, CTX)
      expect(result.updatedTask.completedAt).toBe(CTX.occurredAt)
      expect(result.updatedTask.completedOn).toBe(CTX.occurredOn)
    })

    it('unchanged on start', () => {
      const task = learningTask({ completedAt: 'old-at', completedOn: 'old-on' })
      const result = applyTaskUpdate(task, 'start', {}, CTX)
      expect(result.updatedTask.completedAt).toBe('old-at')
      expect(result.updatedTask.completedOn).toBe('old-on')
    })

    it('unchanged on record_time', () => {
      const task = learningTask({ status: 'in_progress', completedAt: 'old-at', completedOn: 'old-on' })
      const result = applyTaskUpdate(task, 'record_time', { actualMinutes: 10 }, CTX)
      expect(result.updatedTask.completedAt).toBe('old-at')
      expect(result.updatedTask.completedOn).toBe('old-on')
    })
  })

  describe('recalculationRequired', () => {
    it('false for start', () => {
      expect(applyTaskUpdate(learningTask(), 'start', {}, CTX).recalculationRequired).toBe(false)
    })

    it('true for complete', () => {
      expect(applyTaskUpdate(learningTask(), 'complete', { actualMinutes: 30 }, CTX).recalculationRequired).toBe(true)
    })

    it('true for partial', () => {
      expect(applyTaskUpdate(learningTask(), 'partial', { completedPercentage: 50 }, CTX).recalculationRequired).toBe(true)
    })

    it('true for skip', () => {
      expect(applyTaskUpdate(learningTask(), 'skip', {}, CTX).recalculationRequired).toBe(true)
    })

    it('false for record_time', () => {
      expect(applyTaskUpdate(learningTask({ status: 'in_progress' }), 'record_time', { actualMinutes: 10 }, CTX).recalculationRequired).toBe(false)
    })

    it('false for record_questions', () => {
      expect(applyTaskUpdate(uworldTask({ status: 'in_progress' }), 'record_questions', { completedCount: 5, incorrectCount: 1 }, CTX).recalculationRequired).toBe(false)
    })
  })
})
