import { describe, it, expect } from 'vitest'
import { sha256Hex, calculateScheduleFingerprint, calculateRequestFingerprint } from '../idempotency.js'

const BASE_INPUT = {
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
  topics: [{ normalizedTopicId: 'a::b', uworldRemainingQuestions: 10, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 }],
  personalSourcePaceMultiplier: 1.0,
  examReviewWindowDays: 0,
  mixedReviewQuestionsPerDay: 0,
  dueReviewMinutesByDate: {},
  examDate: null,
}

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

describe('calculateScheduleFingerprint', () => {
  it('returns a 64-char hex string', async () => {
    const fp = await calculateScheduleFingerprint('user-1', { ...BASE_INPUT, acceptOverload: false })
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is affected by userId', async () => {
    const a = await calculateScheduleFingerprint('user-1', BASE_INPUT)
    const b = await calculateScheduleFingerprint('user-2', BASE_INPUT)
    expect(a).not.toBe(b)
  })

  it('is affected by topic list', async () => {
    const a = await calculateScheduleFingerprint('user-1', {
      ...BASE_INPUT,
      topics: [{ normalizedTopicId: 'a::b', uworldRemainingQuestions: 10, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 }],
    })
    const b = await calculateScheduleFingerprint('user-1', {
      ...BASE_INPUT,
      topics: [{ normalizedTopicId: 'a::b', uworldRemainingQuestions: 20, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 }],
    })
    expect(a).not.toBe(b)
  })

  it('order of topics does not matter', async () => {
    const topicsA = [
      { normalizedTopicId: 'x', uworldRemainingQuestions: 1, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 },
      { normalizedTopicId: 'y', uworldRemainingQuestions: 2, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 },
    ]
    const topicsB = [...topicsA].reverse()
    const a = await calculateScheduleFingerprint('u', { ...BASE_INPUT, topics: topicsA })
    const b = await calculateScheduleFingerprint('u', { ...BASE_INPUT, topics: topicsB })
    expect(a).toBe(b)
  })

  it('does NOT include acceptOverload — same inputs with different acceptOverload produce the same fingerprint', async () => {
    const a = await calculateScheduleFingerprint('user-1', { ...BASE_INPUT, acceptOverload: false })
    const b = await calculateScheduleFingerprint('user-1', { ...BASE_INPUT, acceptOverload: true })
    expect(a).toBe(b)
  })
})

describe('calculateRequestFingerprint', () => {
  it('returns a 64-char hex string', async () => {
    const fp = await calculateRequestFingerprint('user-1', { ...BASE_INPUT, acceptOverload: false })
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is affected by userId', async () => {
    const a = await calculateRequestFingerprint('user-1', BASE_INPUT)
    const b = await calculateRequestFingerprint('user-2', BASE_INPUT)
    expect(a).not.toBe(b)
  })

  it('IS affected by acceptOverload — different acceptOverload produces different fingerprint', async () => {
    const a = await calculateRequestFingerprint('user-1', { ...BASE_INPUT, acceptOverload: false })
    const b = await calculateRequestFingerprint('user-1', { ...BASE_INPUT, acceptOverload: true })
    expect(a).not.toBe(b)
  })

  it('schedule and request fingerprints differ', async () => {
    const schedule = await calculateScheduleFingerprint('user-1', { ...BASE_INPUT, acceptOverload: true })
    const request = await calculateRequestFingerprint('user-1', { ...BASE_INPUT, acceptOverload: true })
    expect(schedule).not.toBe(request)
  })
})

describe('acceptOverload flow', () => {
  it('preview with acceptOverload=false can later be created with acceptOverload=true without PREVIEW_STALE', async () => {
    const previewFingerprint = await calculateScheduleFingerprint('user-1', { ...BASE_INPUT, acceptOverload: false })
    const createFingerprint = await calculateScheduleFingerprint('user-1', { ...BASE_INPUT, acceptOverload: true })
    expect(previewFingerprint).toBe(createFingerprint)
  })
})
