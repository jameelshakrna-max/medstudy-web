import { describe, it, expect } from 'vitest'
import { getLearningMinutesForStyle, normalizeSourcesResponse, normalizeRotationsResponse, normalizeTopicsResponse, buildPreviewPayload, buildCreatePayload } from '../buildPlanRequest'

describe('getLearningMinutesForStyle', () => {
  const topic = {
    learningMinutes: { focused: 10, activeExpected: 20, detailedNotes: 30, activeLow: 5, activeHigh: 25 },
  }

  it('maps focused correctly', () => {
    expect(getLearningMinutesForStyle(topic, 'focused')).toBe(10)
  })

  it('maps active to activeExpected', () => {
    expect(getLearningMinutesForStyle(topic, 'active')).toBe(20)
  })

  it('maps detailed_notes to detailedNotes', () => {
    expect(getLearningMinutesForStyle(topic, 'detailed_notes')).toBe(30)
  })

  it('returns 0 for missing topic learningMinutes', () => {
    expect(getLearningMinutesForStyle({}, 'active')).toBe(0)
  })

  it('returns 0 for unknown style', () => {
    expect(getLearningMinutesForStyle(topic, 'unknown')).toBe(0)
  })
})

describe('normalizeSourcesResponse', () => {
  it('returns array as-is', () => {
    const data = [{ id: 'src1' }]
    expect(normalizeSourcesResponse(data)).toBe(data)
  })

  it('returns empty array for non-array', () => {
    expect(normalizeSourcesResponse(null)).toEqual([])
    expect(normalizeSourcesResponse(undefined)).toEqual([])
    expect(normalizeSourcesResponse({})).toEqual([])
  })
})

describe('normalizeRotationsResponse', () => {
  it('returns array as-is', () => {
    const data = [{ id: 'rot1' }]
    expect(normalizeRotationsResponse(data)).toBe(data)
  })

  it('returns empty array for non-array', () => {
    expect(normalizeRotationsResponse(null)).toEqual([])
  })
})

describe('normalizeTopicsResponse', () => {
  it('returns array as-is', () => {
    const data = [{ normalizedTopicId: 't1' }]
    expect(normalizeTopicsResponse(data)).toBe(data)
  })

  it('returns empty array for non-array', () => {
    expect(normalizeTopicsResponse(null)).toEqual([])
  })
})

describe('buildPreviewPayload', () => {
  const form = {
    sourceId: 'step-up-medicine-6e-2024',
    rotationId: 'cardiology',
    startDate: '2025-01-06',
    endDate: '2025-04-06',
    examDate: '2025-04-15',
    studyStyle: 'active',
    schedulingMode: 'efficient',
    questionStartRule: 'next_available_day',
    availability: [{ weekday: 0, availableMinutes: 0, isDayOff: true }],
    bufferPercentage: 20,
    preferredQuestionsPerDay: 30,
    minimumQuestionsPerSession: 10,
    maximumQuestionsPerDay: 50,
    averageMinutesPerQuestion: 1.5,
    maximumActiveTopics: 5,
    topics: [{ normalizedTopicId: 't1', sourceTopicId: 's1', uworldRemainingQuestions: 10, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 }],
  }

  it('builds correct payload', () => {
    const payload = buildPreviewPayload(form)
    expect(payload.sourceId).toBe('step-up-medicine-6e-2024')
    expect(payload.rotationId).toBe('cardiology')
    expect(payload.startDate).toBe('2025-01-06')
    expect(payload.endDate).toBe('2025-04-06')
    expect(payload.examDate).toBe('2025-04-15')
    expect(payload.studyStyle).toBe('active')
    expect(payload.blockedDates).toEqual([])
    expect(payload.personalSourcePaceMultiplier).toBe(1)
    expect(payload.examReviewWindowDays).toBe(0)
    expect(payload.mixedReviewQuestionsPerDay).toBe(0)
    expect(payload.dueReviewMinutesByDate).toEqual({})
    expect(payload.topics).toHaveLength(1)
  })

  it('sets examDate to null when empty', () => {
    const payload = buildPreviewPayload({ ...form, examDate: '' })
    expect(payload.examDate).toBeNull()
  })
})

describe('buildCreatePayload', () => {
  const form = {
    sourceId: 'src', rotationId: 'rot', startDate: '2025-01-06', endDate: '2025-04-06',
    examDate: '', studyStyle: 'active', schedulingMode: 'efficient', questionStartRule: 'next_available_day',
    availability: [], bufferPercentage: 20, preferredQuestionsPerDay: 30, minimumQuestionsPerSession: 10,
    maximumQuestionsPerDay: 50, averageMinutesPerQuestion: 1.5, maximumActiveTopics: 5,
    topics: [{ normalizedTopicId: 't1', sourceTopicId: 's1', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }],
  }

  it('includes previewToken and acceptOverload', () => {
    const payload = buildCreatePayload(form, 'token-abc', true)
    expect(payload.previewToken).toBe('token-abc')
    expect(payload.acceptOverload).toBe(true)
  })

  it('defaults acceptOverload to false', () => {
    const payload = buildCreatePayload(form, 'token-abc')
    expect(payload.acceptOverload).toBe(false)
  })
})
