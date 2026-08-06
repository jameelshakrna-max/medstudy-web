import { describe, it, expect } from 'vitest'
import {
  parseUnlockCondition,
  hasCompletedLearning,
  hasCompletedUworld,
  isUnlockConditionSatisfied,
  isTaskEffectivelyLocked,
} from '../unlockRules.js'

describe('parseUnlockCondition', () => {
  it('parses a condition of the form <type>:<canonicalTopicId>', () => {
    expect(parseUnlockCondition('learning_completed:cardiology.stable-angina-pectoris')).toEqual({
      type: 'learning_completed',
      canonicalTopicId: 'cardiology.stable-angina-pectoris',
    })
    expect(parseUnlockCondition('uworld_completed:cardiology.stable-angina-pectoris')).toEqual({
      type: 'uworld_completed',
      canonicalTopicId: 'cardiology.stable-angina-pectoris',
    })
  })

  it('returns null for missing, empty, or malformed conditions', () => {
    expect(parseUnlockCondition(null)).toBeNull()
    expect(parseUnlockCondition(undefined)).toBeNull()
    expect(parseUnlockCondition('')).toBeNull()
    expect(parseUnlockCondition('learning_completed')).toBeNull()
    expect(parseUnlockCondition(':')).toBeNull()
  })
})

describe('hasCompletedLearning', () => {
  it('is true only when the actual remaining learning minutes are exhausted', () => {
    expect(hasCompletedLearning({ remainingLearningMinutes: 0 })).toBe(true)
    expect(hasCompletedLearning({ remainingLearningMinutes: 37 })).toBe(false)
    expect(hasCompletedLearning({ remaining_learning_minutes: 0 })).toBe(true)
    expect(hasCompletedLearning({ remaining_learning_minutes: 12 })).toBe(false)
    expect(hasCompletedLearning({})).toBe(false)
    expect(hasCompletedLearning(null)).toBe(false)
  })
})

describe('hasCompletedUworld', () => {
  it('is true only when the persisted uworld question count is fully completed', () => {
    expect(hasCompletedUworld({ totalUworldQuestions: 20, completedUworldQuestions: 20 })).toBe(true)
    expect(hasCompletedUworld({ total_uworld_questions: 20, completed_uworld_questions: 20 })).toBe(true)
    expect(hasCompletedUworld({ totalUworldQuestions: 20, completedUworldQuestions: 10 })).toBe(false)
    expect(hasCompletedUworld({ totalUworldQuestions: 0, completedUworldQuestions: 0 })).toBe(false)
    expect(hasCompletedUworld({ completedUworldQuestions: 20 })).toBe(false)
    expect(hasCompletedUworld(null)).toBe(false)
  })
})

describe('isUnlockConditionSatisfied', () => {
  it('treats a task without an unlock condition as satisfied', () => {
    expect(isUnlockConditionSatisfied(null, null)).toBe(true)
    expect(isUnlockConditionSatisfied('', null)).toBe(true)
  })

  it('evaluates learning_completed against actual derived topic state', () => {
    expect(isUnlockConditionSatisfied('learning_completed:abc', { remainingLearningMinutes: 0 })).toBe(true)
    expect(isUnlockConditionSatisfied('learning_completed:abc', { remainingLearningMinutes: 5 })).toBe(false)
    expect(isUnlockConditionSatisfied('learning_completed:abc', null)).toBe(false)
  })

  it('evaluates uworld_completed against actual derived topic state', () => {
    expect(isUnlockConditionSatisfied('uworld_completed:abc', { totalUworldQuestions: 10, completedUworldQuestions: 10 })).toBe(true)
    expect(isUnlockConditionSatisfied('uworld_completed:abc', { totalUworldQuestions: 10, completedUworldQuestions: 4 })).toBe(false)
    expect(isUnlockConditionSatisfied('uworld_completed:abc', null)).toBe(false)
  })

  it('evaluates learning_group_completed against derived group state', () => {
    expect(isUnlockConditionSatisfied('learning_group_completed:ischemic-heart-disease', { requiredLearningCompleted: true })).toBe(true)
    expect(isUnlockConditionSatisfied('learning_group_completed:ischemic-heart-disease', { requiredLearningCompleted: false })).toBe(false)
    expect(isUnlockConditionSatisfied('learning_group_completed:ischemic-heart-disease', {})).toBe(false)
    expect(isUnlockConditionSatisfied('learning_group_completed:ischemic-heart-disease', null)).toBe(false)
  })

  it('evaluates uworld_group_completed against derived group state', () => {
    expect(isUnlockConditionSatisfied('uworld_group_completed:ischemic-heart-disease', { remainingQuestions: 0 })).toBe(true)
    expect(isUnlockConditionSatisfied('uworld_group_completed:ischemic-heart-disease', { remainingQuestions: 5 })).toBe(false)
    expect(isUnlockConditionSatisfied('uworld_group_completed:ischemic-heart-disease', { remainingQuestions: 30 })).toBe(false)
  })

  it('treats unknown condition types as unsatisfied (conservative)', () => {
    expect(isUnlockConditionSatisfied('some_future_condition:abc', {})).toBe(false)
  })
})

describe('isTaskEffectivelyLocked', () => {
  it('is false for tasks without an unlock condition', () => {
    expect(isTaskEffectivelyLocked({ taskType: 'learning', unlockCondition: null }, null)).toBe(false)
    expect(isTaskEffectivelyLocked({ taskType: 'uworld_questions', unlockCondition: null }, null)).toBe(false)
  })

  it('is true for a task with an unsatisfied condition', () => {
    expect(isTaskEffectivelyLocked(
      { taskType: 'uworld_questions', unlockCondition: 'learning_completed:abc' },
      { remainingLearningMinutes: 37 },
    )).toBe(true)
    expect(isTaskEffectivelyLocked(
      { taskType: 'incorrect_review', unlockCondition: 'uworld_completed:abc' },
      { totalUworldQuestions: 10, completedUworldQuestions: 2 },
    )).toBe(true)
  })

  it('is false once the persisted prerequisite is satisfied', () => {
    expect(isTaskEffectivelyLocked(
      { taskType: 'uworld_questions', unlockCondition: 'learning_completed:abc' },
      { remainingLearningMinutes: 0 },
    )).toBe(false)
    expect(isTaskEffectivelyLocked(
      { taskType: 'incorrect_review', unlockCondition: 'uworld_completed:abc' },
      { totalUworldQuestions: 10, completedUworldQuestions: 10 },
    )).toBe(false)
  })

  it('is true for a group-condition task with a locked group state', () => {
    expect(isTaskEffectivelyLocked(
      { taskType: 'uworld_questions', unlockCondition: 'learning_group_completed:ischemic-heart-disease' },
      { requiredLearningCompleted: false },
    )).toBe(true)
    expect(isTaskEffectivelyLocked(
      { taskType: 'incorrect_review', unlockCondition: 'uworld_group_completed:ischemic-heart-disease' },
      { remainingQuestions: 12 },
    )).toBe(true)
  })

  it('is false for a group-condition task with an unlocked group state', () => {
    expect(isTaskEffectivelyLocked(
      { taskType: 'uworld_questions', unlockCondition: 'learning_group_completed:ischemic-heart-disease' },
      { requiredLearningCompleted: true },
    )).toBe(false)
    expect(isTaskEffectivelyLocked(
      { taskType: 'incorrect_review', unlockCondition: 'uworld_group_completed:ischemic-heart-disease' },
      { remainingQuestions: 0 },
    )).toBe(false)
  })
})
