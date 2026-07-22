import { describe, it, expect } from 'vitest'
import { calculateDailyCapacity, calculateQuestionCapacity } from '../capacity.js'

describe('calculateDailyCapacity', () => {
  it('basic: applies buffer, no flashcards or overdue', () => {
    const result = calculateDailyCapacity({
      availableMinutes: 240,
      dueFlashcardMinutes: 0,
      overdueRequiredMinutes: 0,
      bufferPercentage: 20,
    })
    expect(result.planningBufferMinutes).toBe(48)
    expect(result.usableMinutes).toBe(192)
  })

  it('flashcards consume time', () => {
    const result = calculateDailyCapacity({
      availableMinutes: 240,
      dueFlashcardMinutes: 60,
      overdueRequiredMinutes: 0,
      bufferPercentage: 20,
    })
    expect(result.flashcardMinutes).toBe(60)
    expect(result.usableMinutes).toBe(132)
  })

  it('flashcards capped at remaining after buffer', () => {
    const result = calculateDailyCapacity({
      availableMinutes: 120,
      dueFlashcardMinutes: 120,
      overdueRequiredMinutes: 0,
      bufferPercentage: 20,
    })
    expect(result.flashcardMinutes).toBe(96)
    expect(result.unmetFlashcardMinutes).toBe(24)
    expect(result.usableMinutes).toBe(0)
  })

  it('overdue consumes remaining time after flashcards', () => {
    const result = calculateDailyCapacity({
      availableMinutes: 240,
      dueFlashcardMinutes: 0,
      overdueRequiredMinutes: 200,
      bufferPercentage: 20,
    })
    expect(result.overdueMinutes).toBe(192)
    expect(result.unmetOverdueMinutes).toBe(8)
    expect(result.usableMinutes).toBe(0)
  })

  it('zero available minutes: all zero, no negatives', () => {
    const result = calculateDailyCapacity({
      availableMinutes: 0,
      dueFlashcardMinutes: 10,
      overdueRequiredMinutes: 10,
      bufferPercentage: 20,
    })
    expect(result.planningBufferMinutes).toBe(0)
    expect(result.flashcardMinutes).toBe(0)
    expect(result.overdueMinutes).toBe(0)
    expect(result.usableMinutes).toBe(0)
    expect(result.unmetFlashcardMinutes).toBe(10)
    expect(result.unmetOverdueMinutes).toBe(10)
  })

  it('100% buffer leaves zero usable', () => {
    const result = calculateDailyCapacity({
      availableMinutes: 200,
      dueFlashcardMinutes: 0,
      overdueRequiredMinutes: 0,
      bufferPercentage: 100,
    })
    expect(result.usableMinutes).toBe(0)
  })
})

describe('calculateQuestionCapacity', () => {
  it('basic: respects preferred limit', () => {
    const result = calculateQuestionCapacity({
      usableMinutes: 120,
      questionsRemaining: 30,
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
    })
    expect(result.questionsToday).toBe(30)
    expect(result.minutesConsumed).toBe(45)
  })

  it('preferred cap when time is abundant', () => {
    const result = calculateQuestionCapacity({
      usableMinutes: 200,
      questionsRemaining: 50,
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
    })
    expect(result.questionsToday).toBe(30)
  })

  it('maximum cap when preferred exceeds max', () => {
    const result = calculateQuestionCapacity({
      usableMinutes: 200,
      questionsRemaining: 50,
      preferredQuestionsPerDay: 40,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 30,
      averageMinutesPerQuestion: 1.5,
    })
    expect(result.questionsToday).toBe(30)
  })

  it('allows fewer than preferred when only a small remainder fits', () => {
    const result = calculateQuestionCapacity({
      usableMinutes: 60,
      questionsRemaining: 5,
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
    })
    expect(result.questionsToday).toBe(5)
  })

  it('blocks when fewer than minimum would fit', () => {
    const result = calculateQuestionCapacity({
      usableMinutes: 10,
      questionsRemaining: 30,
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
    })
    expect(result.questionsToday).toBe(0)
  })

  it('invalid averageMinutesPerQuestion (0) returns zero', () => {
    const result = calculateQuestionCapacity({
      usableMinutes: 120,
      questionsRemaining: 30,
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 0,
    })
    expect(result.questionsToday).toBe(0)
  })

  it('zero usable minutes returns zero', () => {
    const result = calculateQuestionCapacity({
      usableMinutes: 0,
      questionsRemaining: 30,
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
    })
    expect(result.questionsToday).toBe(0)
  })
})
