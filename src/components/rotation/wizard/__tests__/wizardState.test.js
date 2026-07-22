// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { INITIAL_FORM, PREVIEW_STEP, DRAFT_KEY, saveDraft, loadDraft, clearDraft, onSourceChange, onRotationChange, onTopicsLoaded } from '../wizardState'

describe('INITIAL_FORM', () => {
  it('has correct default values', () => {
    expect(INITIAL_FORM.sourceId).toBe('')
    expect(INITIAL_FORM.rotationId).toBe('')
    expect(INITIAL_FORM.startDate).toBe('')
    expect(INITIAL_FORM.endDate).toBe('')
    expect(INITIAL_FORM.examDate).toBe('')
    expect(INITIAL_FORM.studyStyle).toBe('active')
    expect(INITIAL_FORM.topics).toEqual([])
    expect(INITIAL_FORM.preferredQuestionsPerDay).toBe(30)
    expect(INITIAL_FORM.minimumQuestionsPerSession).toBe(10)
    expect(INITIAL_FORM.maximumQuestionsPerDay).toBe(50)
    expect(INITIAL_FORM.averageMinutesPerQuestion).toBe(1.5)
    expect(INITIAL_FORM.schedulingMode).toBe('efficient')
    expect(INITIAL_FORM.questionStartRule).toBe('next_available_day')
    expect(INITIAL_FORM.bufferPercentage).toBe(20)
    expect(INITIAL_FORM.maximumActiveTopics).toBe(5)
  })

  it('has 7 availability entries', () => {
    expect(INITIAL_FORM.availability).toHaveLength(7)
  })

  it('marks weekends as days off', () => {
    expect(INITIAL_FORM.availability[0].isDayOff).toBe(true)
    expect(INITIAL_FORM.availability[6].isDayOff).toBe(true)
    expect(INITIAL_FORM.availability[0].availableMinutes).toBe(0)
    expect(INITIAL_FORM.availability[6].availableMinutes).toBe(0)
  })

  it('gives weekdays 120 minutes', () => {
    for (let i = 1; i <= 5; i++) {
      expect(INITIAL_FORM.availability[i].availableMinutes).toBe(120)
      expect(INITIAL_FORM.availability[i].isDayOff).toBe(false)
    }
  })
})

describe('saveDraft / loadDraft / clearDraft', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('saveDraft stores schema version 1 with timestamp', () => {
    const before = Date.now()
    saveDraft(3, INITIAL_FORM)
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY))
    expect(raw.schemaVersion).toBe(1)
    expect(raw.step).toBe(3)
    expect(raw.savedAt).toBeGreaterThanOrEqual(before)
    expect(raw.form.sourceId).toBe('')
  })

  it('loadDraft restores within 7-day window', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: Date.now(),
      step: 5,
      form: { ...INITIAL_FORM, sourceId: 'test-source' },
    }))
    const draft = loadDraft()
    expect(draft).not.toBeNull()
    expect(draft.step).toBe(5)
    expect(draft.form.sourceId).toBe('test-source')
  })

  it('loadDraft returns null for expired drafts', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      step: 2,
      form: INITIAL_FORM,
    }))
    expect(loadDraft()).toBeNull()
  })

  it('loadDraft returns null for wrong schemaVersion', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      schemaVersion: 2,
      savedAt: Date.now(),
      step: 2,
      form: INITIAL_FORM,
    }))
    expect(loadDraft()).toBeNull()
  })

  it('loadDraft clamps step >= PREVIEW_STEP to PREVIEW_STEP - 1', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: Date.now(),
      step: 10,
      form: INITIAL_FORM,
    }))
    const draft = loadDraft()
    expect(draft.step).toBe(PREVIEW_STEP - 1)
  })

  it('loadDraft clamps step 11 to PREVIEW_STEP - 1', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: Date.now(),
      step: 11,
      form: INITIAL_FORM,
    }))
    const draft = loadDraft()
    expect(draft.step).toBe(PREVIEW_STEP - 1)
  })

  it('clearDraft removes from localStorage', () => {
    localStorage.setItem(DRAFT_KEY, '{}')
    clearDraft()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })
})

describe('onSourceChange', () => {
  it('sets new sourceId and clears rotationId and topics', () => {
    const form = { ...INITIAL_FORM, sourceId: 'old', rotationId: 'rot', topics: [{ id: 1 }] }
    const result = onSourceChange(form, 'new-source')
    expect(result.sourceId).toBe('new-source')
    expect(result.rotationId).toBe('')
    expect(result.topics).toEqual([])
  })
})

describe('onRotationChange', () => {
  it('sets new rotationId and clears topics', () => {
    const form = { ...INITIAL_FORM, sourceId: 'src', rotationId: 'old-rot', topics: [{ id: 1 }] }
    const result = onRotationChange(form, 'new-rot')
    expect(result.rotationId).toBe('new-rot')
    expect(result.topics).toEqual([])
    expect(result.sourceId).toBe('src')
  })
})

describe('onTopicsLoaded', () => {
  it('preserves existing user values for matching normalizedTopicId', () => {
    const form = {
      ...INITIAL_FORM,
      topics: [
        { normalizedTopicId: 't1', sourceTopicId: 's1', uworldRemainingQuestions: 25, alreadyCompletedLearningPercentage: 50, alreadyCompletedQuestionCount: 10, incorrectQuestionsRemaining: 5 },
        { normalizedTopicId: 't-gone', sourceTopicId: 'x', uworldRemainingQuestions: 99, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0, incorrectQuestionsRemaining: 0 },
      ],
    }
    const apiTopics = [
      { normalizedTopicId: 't1', sourceTopicId: 's1' },
      { normalizedTopicId: 't2', sourceTopicId: 's2' },
    ]
    const result = onTopicsLoaded(form, apiTopics)
    expect(result.topics).toHaveLength(2)
    expect(result.topics[0].uworldRemainingQuestions).toBe(25)
    expect(result.topics[0].alreadyCompletedLearningPercentage).toBe(50)
    expect(result.topics[1].uworldRemainingQuestions).toBe(0)
    expect(result.topics[1].alreadyCompletedLearningPercentage).toBe(0)
  })

  it('defaults new topics to 0', () => {
    const form = { ...INITIAL_FORM, topics: [] }
    const apiTopics = [{ normalizedTopicId: 'new', sourceTopicId: 's' }]
    const result = onTopicsLoaded(form, apiTopics)
    expect(result.topics[0].uworldRemainingQuestions).toBe(0)
    expect(result.topics[0].alreadyCompletedLearningPercentage).toBe(0)
    expect(result.topics[0].alreadyCompletedQuestionCount).toBe(0)
    expect(result.topics[0].incorrectQuestionsRemaining).toBe(0)
  })
})
