import { describe, it, expect } from 'vitest'
import { parseAndValidatePlanRequest } from '../requestValidation.js'

function makeRequest(overrides = {}) {
  return {
    headers: {
      get: (name) => overrides.headers?.[name] ?? null,
      ...overrides.headers,
    },
  }
}

const VALID_BODY = {
  sourceId: 'step-up-medicine-6e-2024',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-11',
  studyStyle: 'active',
  schedulingMode: 'efficient',
  questionStartRule: 'next_available_day',
  availability: Array.from({ length: 7 }, (_, i) => ({
    weekday: i, availableMinutes: 120, isDayOff: false,
  })),
  topics: [{
    normalizedTopicId: 'step-up-medicine-6e-2024::cardiology::ascvd',
    uworldRemainingQuestions: 20,
    alreadyCompletedLearningPercentage: 0,
    alreadyCompletedQuestionCount: 0,
  }],
}

describe('parseAndValidatePlanRequest', () => {
  it('accepts a valid body', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, VALID_BODY, {})
    expect(result.valid).toBe(true)
    expect(result.parsed.sourceId).toBe('step-up-medicine-6e-2024')
    expect(result.parsed.rotationId).toBe('cardiology')
    expect(result.parsed.topics).toHaveLength(1)
  })

  it('returns errors for missing required fields', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, {}, {})
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    const fields = result.errors.map(e => e.field)
    expect(fields).toContain('sourceId')
    expect(fields).toContain('rotationId')
    expect(fields).toContain('startDate')
  })

  it('returns error for invalid sourceId', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, { ...VALID_BODY, sourceId: 'unknown' }, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'SOURCE_NOT_FOUND')).toBe(true)
  })

  it('returns error for invalid studyStyle', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, { ...VALID_BODY, studyStyle: 'invalid' }, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'studyStyle')).toBe(true)
  })

  it('returns error for startDate > endDate', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, { ...VALID_BODY, startDate: '2026-01-11', endDate: '2026-01-05' }, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('startDate must be <= endDate'))).toBe(true)
  })

  it('returns error for non-array availability', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, { ...VALID_BODY, availability: 'bad' }, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'availability')).toBe(true)
  })

  it('returns error for empty topics', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, { ...VALID_BODY, topics: [] }, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'topics')).toBe(true)
  })

  it('returns error for duplicate normalizedTopicId', () => {
    const dup = { ...VALID_BODY, topics: [
      { normalizedTopicId: 'a', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 },
      { normalizedTopicId: 'a', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 },
    ]}
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, dup, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'DUPLICATE_TOPIC')).toBe(true)
  })

  it('requires idempotency key when requireIdempotencyKey is true', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, VALID_BODY, { requireIdempotencyKey: true })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'IDEMPOTENCY_KEY_REQUIRED')).toBe(true)
  })

  it('accepts idempotency key from header', () => {
    const req = makeRequest({ headers: { 'Idempotency-Key': 'req-123' } })
    const result = parseAndValidatePlanRequest(req, VALID_BODY, { requireIdempotencyKey: true })
    expect(result.valid).toBe(true)
    expect(result.parsed.clientRequestId).toBe('req-123')
  })

  it('accepts idempotency key from body', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, { ...VALID_BODY, clientRequestId: 'body-key' }, { requireIdempotencyKey: true })
    expect(result.valid).toBe(true)
    expect(result.parsed.clientRequestId).toBe('body-key')
  })

  it('uses defaults for optional numeric fields', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, VALID_BODY, {})
    expect(result.parsed.preferredQuestionsPerDay).toBe(30)
    expect(result.parsed.bufferPercentage).toBe(20)
    expect(result.parsed.averageMinutesPerQuestion).toBe(1.5)
    expect(result.parsed.personalSourcePaceMultiplier).toBe(1.0)
  })

  it('accepts examDate when provided', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, { ...VALID_BODY, examDate: '2026-06-01' }, {})
    expect(result.valid).toBe(true)
    expect(result.parsed.examDate).toBe('2026-06-01')
  })

  it('returns error for invalid examDate format', () => {
    const req = makeRequest()
    const result = parseAndValidatePlanRequest(req, { ...VALID_BODY, examDate: '06-01-2026' }, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'examDate')).toBe(true)
  })

  it('passes percentage through as-is (conversion happens in topicResolution)', () => {
    const req = makeRequest()
    const body = { ...VALID_BODY, topics: [{ ...VALID_BODY.topics[0], alreadyCompletedLearningPercentage: 50 }] }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(true)
    expect(result.parsed.topics[0].alreadyCompletedLearningPercentage).toBe(50)
  })

  it('returns error for out-of-range percentage', () => {
    const req = makeRequest()
    const body = { ...VALID_BODY, topics: [{ ...VALID_BODY.topics[0], alreadyCompletedLearningPercentage: 150 }] }
    const result = parseAndValidatePlanRequest(req, body, {})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'topics[0].alreadyCompletedLearningPercentage')).toBe(true)
  })
})
