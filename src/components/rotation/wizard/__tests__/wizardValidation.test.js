import { describe, it, expect } from 'vitest'
import { validateStep, canAdvanceStep } from '../wizardValidation'
import { INITIAL_FORM } from '../wizardState'

const VALID_FORM = {
  ...INITIAL_FORM,
  sourceId: 'step-up-medicine-6e-2024',
  rotationId: 'cardiology',
  startDate: '2025-01-06',
  endDate: '2025-04-06',
  examDate: '',
  studyStyle: 'active',
  topics: [
    { normalizedTopicId: 't1', sourceTopicId: 's1', uworldRemainingQuestions: 10, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 },
  ],
}

describe('Step 0 — Select Rotation', () => {
  it('fails without sourceId', () => {
    const form = { ...VALID_FORM, sourceId: '' }
    const result = validateStep(0, form)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('sourceId'))).toBe(true)
  })

  it('fails without rotationId', () => {
    const form = { ...VALID_FORM, rotationId: '' }
    const result = validateStep(0, form)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('rotationId'))).toBe(true)
  })

  it('passes with valid values', () => {
    expect(validateStep(0, VALID_FORM).valid).toBe(true)
  })
})

describe('Step 1 — Select Dates', () => {
  it('fails with empty startDate', () => {
    const form = { ...VALID_FORM, startDate: '' }
    expect(validateStep(1, form).valid).toBe(false)
  })

  it('fails with endDate before startDate', () => {
    const form = { ...VALID_FORM, startDate: '2025-04-06', endDate: '2025-01-06' }
    const result = validateStep(1, form)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('startDate'))).toBe(true)
  })

  it('fails with invalid examDate format', () => {
    const form = { ...VALID_FORM, examDate: 'not-a-date' }
    expect(validateStep(1, form).valid).toBe(false)
  })

  it('passes with empty examDate', () => {
    const form = { ...VALID_FORM, examDate: '' }
    expect(validateStep(1, form).valid).toBe(true)
  })
})

describe('Step 2 — Availability', () => {
  it('fails if all days are off', () => {
    const form = {
      ...VALID_FORM,
      availability: Array.from({ length: 7 }, (_, weekday) => ({ weekday, availableMinutes: 0, isDayOff: true })),
    }
    const result = validateStep(2, form)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('study day'))).toBe(true)
  })

  it('fails with negative availableMinutes', () => {
    const avail = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      availableMinutes: weekday === 0 || weekday === 6 ? 0 : -10,
      isDayOff: weekday === 0 || weekday === 6,
    }))
    const form = { ...VALID_FORM, availability: avail }
    expect(validateStep(2, form).valid).toBe(false)
  })

  it('passes with at least one study day', () => {
    expect(validateStep(2, VALID_FORM).valid).toBe(true)
  })
})

describe('Step 4 — Study Style', () => {
  it('fails with invalid style', () => {
    const form = { ...VALID_FORM, studyStyle: 'invalid' }
    expect(validateStep(4, form).valid).toBe(false)
  })

  it('passes with valid styles', () => {
    for (const style of ['focused', 'active', 'detailed_notes']) {
      expect(validateStep(4, { ...VALID_FORM, studyStyle: style }).valid).toBe(true)
    }
  })
})

describe('Step 6 — UWorld Questions', () => {
  it('fails with empty topics', () => {
    const form = { ...VALID_FORM, topics: [] }
    expect(validateStep(6, form).valid).toBe(false)
  })

  it('fails with duplicate normalizedTopicId', () => {
    const form = {
      ...VALID_FORM,
      topics: [
        { normalizedTopicId: 't1', sourceTopicId: 's1', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 },
        { normalizedTopicId: 't1', sourceTopicId: 's2', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 },
      ],
    }
    expect(validateStep(6, form).valid).toBe(false)
  })

  it('fails with negative uworldRemainingQuestions', () => {
    const form = {
      ...VALID_FORM,
      topics: [{ normalizedTopicId: 't1', sourceTopicId: 's1', uworldRemainingQuestions: -1, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }],
    }
    expect(validateStep(6, form).valid).toBe(false)
  })

  it('fails with learning percentage out of range', () => {
    const form = {
      ...VALID_FORM,
      topics: [{ normalizedTopicId: 't1', sourceTopicId: 's1', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 150, alreadyCompletedQuestionCount: 0 }],
    }
    expect(validateStep(6, form).valid).toBe(false)
  })
})

describe('Step 7 — Question Config', () => {
  it('fails if minimumQuestionsPerSession < 1', () => {
    const form = { ...VALID_FORM, minimumQuestionsPerSession: 0 }
    expect(validateStep(7, form).valid).toBe(false)
  })

  it('fails if maximumQuestionsPerDay < preferredQuestionsPerDay', () => {
    const form = { ...VALID_FORM, preferredQuestionsPerDay: 50, maximumQuestionsPerDay: 30 }
    expect(validateStep(7, form).valid).toBe(false)
  })

  it('fails if averageMinutesPerQuestion <= 0', () => {
    const form = { ...VALID_FORM, averageMinutesPerQuestion: 0 }
    expect(validateStep(7, form).valid).toBe(false)
  })

  it('fails if minimumQuestionsPerSession > maximumQuestionsPerDay', () => {
    const form = { ...VALID_FORM, minimumQuestionsPerSession: 100, maximumQuestionsPerDay: 50 }
    expect(validateStep(7, form).valid).toBe(false)
  })
})

describe('Step 8 — Scheduling Config', () => {
  it('fails with invalid schedulingMode', () => {
    const form = { ...VALID_FORM, schedulingMode: 'invalid' }
    expect(validateStep(8, form).valid).toBe(false)
  })

  it('fails with invalid questionStartRule', () => {
    const form = { ...VALID_FORM, questionStartRule: 'invalid' }
    expect(validateStep(8, form).valid).toBe(false)
  })

  it('fails with bufferPercentage > 100', () => {
    const form = { ...VALID_FORM, bufferPercentage: 150 }
    expect(validateStep(8, form).valid).toBe(false)
  })

  it('fails with maximumActiveTopics < 1', () => {
    const form = { ...VALID_FORM, maximumActiveTopics: 0 }
    expect(validateStep(8, form).valid).toBe(false)
  })
})

describe('canAdvanceStep', () => {
  it('returns true for read-only steps', () => {
    expect(canAdvanceStep(3, VALID_FORM)).toBe(true)
    expect(canAdvanceStep(5, VALID_FORM)).toBe(true)
    expect(canAdvanceStep(9, VALID_FORM)).toBe(true)
    expect(canAdvanceStep(10, VALID_FORM)).toBe(true)
  })

  it('returns false when validation fails', () => {
    expect(canAdvanceStep(0, { ...VALID_FORM, sourceId: '' })).toBe(false)
  })
})
