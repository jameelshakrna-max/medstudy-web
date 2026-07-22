import { describe, it, expect } from 'vitest'
import { computeSessionValidity, getActivityIdentity } from '../sourcePace.js'

function learningTask(overrides = {}) {
  return { taskType: 'learning', estimatedMinutes: 60, completionPercentage: 50, ...overrides }
}

function uworldTask(overrides = {}) {
  return { taskType: 'uworld_questions', estimatedMinutes: 30, targetCount: 20, ...overrides }
}

describe('computeSessionValidity', () => {
  describe('learning tasks', () => {
    it('valid when ratio is in range', () => {
      const task = learningTask({ estimatedMinutes: 60, completionPercentage: 50 })
      const result = computeSessionValidity(task, 30, null, 0)
      expect(result).toEqual({ validForCalibration: 1, reason: null })
    })

    it('valid at ratio boundary 0.1', () => {
      const task = learningTask({ estimatedMinutes: 100, completionPercentage: 100 })
      const result = computeSessionValidity(task, 10, null, 0)
      expect(result).toEqual({ validForCalibration: 1, reason: null })
    })

    it('valid at ratio boundary 10.0', () => {
      const task = learningTask({ estimatedMinutes: 10, completionPercentage: 100 })
      const result = computeSessionValidity(task, 100, null, 0)
      expect(result).toEqual({ validForCalibration: 1, reason: null })
    })

    it('invalid for zero estimatedMinutes', () => {
      const task = learningTask({ estimatedMinutes: 0 })
      const result = computeSessionValidity(task, 30, null, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('zero_planned_minutes')
    })

    it('invalid for zero expected minutes via completionPercentage', () => {
      const task = learningTask({ estimatedMinutes: 60, completionPercentage: 0 })
      const result = computeSessionValidity(task, 30, null, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('zero_expected_minutes')
    })

    it('invalid for outlier ratio below range', () => {
      const task = learningTask({ estimatedMinutes: 60, completionPercentage: 50 })
      const result = computeSessionValidity(task, 2, null, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('outlier_ratio')
    })

    it('invalid for outlier ratio above range', () => {
      const task = learningTask({ estimatedMinutes: 60, completionPercentage: 10 })
      const result = computeSessionValidity(task, 700, null, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('outlier_ratio')
    })
  })

  describe('uworld_questions', () => {
    it('valid when ratio is in range', () => {
      const task = uworldTask({ estimatedMinutes: 30, targetCount: 20 })
      const result = computeSessionValidity(task, 30, 20, 0)
      expect(result).toEqual({ validForCalibration: 1, reason: null })
    })

    it('invalid for zero targetCount', () => {
      const task = uworldTask({ targetCount: 0 })
      const result = computeSessionValidity(task, 30, 5, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('zero_target_count')
    })

    it('invalid for zero completedCount', () => {
      const task = uworldTask({ estimatedMinutes: 30, targetCount: 20 })
      const result = computeSessionValidity(task, 30, 0, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('zero_completed')
    })

    it('invalid for outlier ratio', () => {
      const task = uworldTask({ estimatedMinutes: 20, targetCount: 20 })
      const result = computeSessionValidity(task, 500, 10, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('outlier_ratio')
    })
  })

  describe('unsupported task types', () => {
    it('returns validForCalibration: 0 for mixed_review', () => {
      const task = { taskType: 'mixed_review', estimatedMinutes: 30, targetCount: 10 }
      const result = computeSessionValidity(task, 30, 10, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('unsupported_task_type')
    })

    it('returns validForCalibration: 0 for consolidation', () => {
      const task = { taskType: 'consolidation', estimatedMinutes: 30, completionPercentage: 50 }
      const result = computeSessionValidity(task, 30, null, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('unsupported_task_type')
    })

    it('returns validForCalibration: 0 for flashcard_review', () => {
      const task = { taskType: 'flashcard_review', estimatedMinutes: 30, targetCount: 50 }
      const result = computeSessionValidity(task, 30, 50, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('unsupported_task_type')
    })
  })

  describe('interrupted sessions', () => {
    it('always invalid', () => {
      const task = learningTask({ estimatedMinutes: 60, completionPercentage: 50 })
      const result = computeSessionValidity(task, 30, null, 1)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('interrupted')
    })
  })

  describe('zero active minutes', () => {
    it('always invalid', () => {
      const task = learningTask({ estimatedMinutes: 60, completionPercentage: 50 })
      const result = computeSessionValidity(task, 0, null, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('zero_active_minutes')
    })

    it('invalid for null actualMinutes', () => {
      const task = learningTask({ estimatedMinutes: 60, completionPercentage: 50 })
      const result = computeSessionValidity(task, null, null, 0)
      expect(result.validForCalibration).toBe(0)
      expect(result.reason).toBe('zero_active_minutes')
    })
  })
})

describe('getActivityIdentity', () => {
  it('learning returns sourceId + activityType with studyStyle', () => {
    const result = getActivityIdentity('learning', 'src-123', 'focused')
    expect(result).toEqual({ sourceId: 'src-123', activityType: 'learning:focused' })
  })

  it('learning defaults studyStyle to active', () => {
    const result = getActivityIdentity('learning', 'src-123', null)
    expect(result).toEqual({ sourceId: 'src-123', activityType: 'learning:active' })
  })

  it('uworld returns fixed identity', () => {
    const result = getActivityIdentity('uworld_questions', 'any-source', 'any-style')
    expect(result).toEqual({ sourceId: 'uworld', activityType: 'questions:tutor:topic-specific' })
  })

  it('unsupported returns null', () => {
    expect(getActivityIdentity('consolidation', 'src-123', 'active')).toBeNull()
    expect(getActivityIdentity('mixed_review', 'src-123', 'active')).toBeNull()
  })
})
