import { describe, it, expect } from 'vitest'
import { sha256Hex, calculateRequestFingerprint } from '../idempotency.js'

describe('sha256Hex', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await sha256Hex('hello')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', async () => {
    const a = await sha256Hex('test-input')
    const b = await sha256Hex('test-input')
    expect(a).toBe(b)
  })

  it('changes with different input', async () => {
    const a = await sha256Hex('input-a')
    const b = await sha256Hex('input-b')
    expect(a).not.toBe(b)
  })
})

describe('calculateRequestFingerprint', () => {
  it('returns a 64-char hex string', async () => {
    const fp = await calculateRequestFingerprint('user-1', {
      sourceId: 'step-up-medicine-6e-2024',
      sourceVersion: '1.0.0',
      rotationId: 'cardiology',
      startDate: '2026-01-05',
      endDate: '2026-01-11',
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: [{ weekday: 0, availableMinutes: 120, isDayOff: false }],
      blockedDates: [],
      topics: [{ normalizedTopicId: 'a::b::c', uworldRemainingQuestions: 10, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 }],
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      dueReviewMinutesByDate: {},
      acceptOverload: false,
      examDate: null,
    })
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is affected by userId', async () => {
    const base = {
      sourceId: 'step-up-medicine-6e-2024',
      sourceVersion: '1.0.0',
      rotationId: 'cardiology',
      startDate: '2026-01-05',
      endDate: '2026-01-11',
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: [],
      blockedDates: [],
      topics: [],
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      dueReviewMinutesByDate: {},
      acceptOverload: false,
      examDate: null,
    }
    const a = await calculateRequestFingerprint('user-1', base)
    const b = await calculateRequestFingerprint('user-2', base)
    expect(a).not.toBe(b)
  })

  it('is affected by topic list', async () => {
    const base = {
      sourceId: 'step-up-medicine-6e-2024',
      sourceVersion: '1.0.0',
      rotationId: 'cardiology',
      startDate: '2026-01-05',
      endDate: '2026-01-11',
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: [],
      blockedDates: [],
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      dueReviewMinutesByDate: {},
      acceptOverload: false,
      examDate: null,
    }
    const a = await calculateRequestFingerprint('user-1', { ...base, topics: [{ normalizedTopicId: 'a::b::c', uworldRemainingQuestions: 10, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 }] })
    const b = await calculateRequestFingerprint('user-1', { ...base, topics: [{ normalizedTopicId: 'a::b::c', uworldRemainingQuestions: 20, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 }] })
    expect(a).not.toBe(b)
  })

  it('order of topics does not matter', async () => {
    const base = {
      sourceId: 'step-up-medicine-6e-2024',
      sourceVersion: '1.0.0',
      rotationId: 'cardiology',
      startDate: '2026-01-05',
      endDate: '2026-01-11',
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      bufferPercentage: 20,
      maximumActiveTopics: 5,
      availability: [],
      blockedDates: [],
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      dueReviewMinutesByDate: {},
      acceptOverload: false,
      examDate: null,
    }
    const topicsA = [
      { normalizedTopicId: 'x', uworldRemainingQuestions: 1, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 },
      { normalizedTopicId: 'y', uworldRemainingQuestions: 2, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 },
    ]
    const topicsB = [...topicsA].reverse()
    const a = await calculateRequestFingerprint('u', { ...base, topics: topicsA })
    const b = await calculateRequestFingerprint('u', { ...base, topics: topicsB })
    expect(a).toBe(b)
  })
})
