const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateStr(s) {
  return typeof s === 'string' && DATE_RE.test(s)
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0
}

function validateDateStep(form) {
  const errors = []
  if (!isDateStr(form.startDate)) errors.push('startDate must be a valid YYYY-MM-DD date.')
  if (!isDateStr(form.endDate)) errors.push('endDate must be a valid YYYY-MM-DD date.')
  if (isDateStr(form.startDate) && isDateStr(form.endDate) && form.startDate > form.endDate) {
    errors.push('startDate must be on or before endDate.')
  }
  if (form.examDate !== '' && form.examDate != null && !isDateStr(form.examDate)) {
    errors.push('examDate must be a valid YYYY-MM-DD date.')
  }
  return errors
}

function validateAvailabilityStep(form) {
  const errors = []
  if (!Array.isArray(form.availability) || form.availability.length !== 7) {
    errors.push('availability must contain exactly 7 days.')
    return errors
  }
  const weekdays = new Set()
  for (let i = 0; i < 7; i++) {
    const d = form.availability[i]
    if (!d || typeof d !== 'object') {
      errors.push(`Day ${i} must be an object.`)
      continue
    }
    if (!Number.isInteger(d.weekday) || d.weekday < 0 || d.weekday > 6) {
      errors.push(`Day ${i}: weekday must be 0–6.`)
    }
    if (weekdays.has(d.weekday)) {
      errors.push(`Day ${i}: duplicate weekday ${d.weekday}.`)
    }
    weekdays.add(d.weekday)
    if (!Number.isInteger(d.availableMinutes) || d.availableMinutes < 0) {
      errors.push(`Day ${i}: availableMinutes must be a non-negative integer.`)
    }
    if (typeof d.isDayOff !== 'boolean') {
      errors.push(`Day ${i}: isDayOff must be a boolean.`)
    }
  }
  const hasStudyDay = form.availability.some(d => !d.isDayOff && d.availableMinutes > 0)
  if (!hasStudyDay) {
    errors.push('At least one study day with available minutes is required.')
  }
  return errors
}

function validateTopicsStep(form) {
  const errors = []
  if (!Array.isArray(form.topics) || form.topics.length === 0) {
    errors.push('At least one topic is required.')
    return errors
  }
  const seen = new Set()
  for (let i = 0; i < form.topics.length; i++) {
    const t = form.topics[i]
    const p = `topics[${i}]`
    if (typeof t.normalizedTopicId !== 'string' || t.normalizedTopicId.trim() === '') {
      errors.push(`${p}.normalizedTopicId is required.`)
    } else if (seen.has(t.normalizedTopicId)) {
      errors.push(`${p}: duplicate normalizedTopicId "${t.normalizedTopicId}".`)
    } else {
      seen.add(t.normalizedTopicId)
    }
    if (!isNonNegInt(t.uworldRemainingQuestions)) {
      errors.push(`${p}.uworldRemainingQuestions must be a non-negative integer.`)
    }
    if (typeof t.alreadyCompletedLearningPercentage !== 'number' ||
        t.alreadyCompletedLearningPercentage < 0 ||
        t.alreadyCompletedLearningPercentage > 100) {
      errors.push(`${p}.alreadyCompletedLearningPercentage must be a number 0–100.`)
    }
    if (!isNonNegInt(t.alreadyCompletedQuestionCount)) {
      errors.push(`${p}.alreadyCompletedQuestionCount must be a non-negative integer.`)
    }
    if (t.incorrectQuestionsRemaining != null && !isNonNegInt(t.incorrectQuestionsRemaining)) {
      errors.push(`${p}.incorrectQuestionsRemaining must be a non-negative integer.`)
    }
  }
  return errors
}

function validateQuestionConfigStep(form) {
  const errors = []
  if (!isNonNegInt(form.preferredQuestionsPerDay)) {
    errors.push('preferredQuestionsPerDay must be a non-negative integer.')
  }
  if (!Number.isInteger(form.minimumQuestionsPerSession) || form.minimumQuestionsPerSession < 1) {
    errors.push('minimumQuestionsPerSession must be an integer >= 1.')
  }
  if (!isNonNegInt(form.maximumQuestionsPerDay)) {
    errors.push('maximumQuestionsPerDay must be a non-negative integer.')
  }
  if (isNonNegInt(form.preferredQuestionsPerDay) && isNonNegInt(form.maximumQuestionsPerDay) &&
      form.maximumQuestionsPerDay < form.preferredQuestionsPerDay) {
    errors.push('maximumQuestionsPerDay must be >= preferredQuestionsPerDay.')
  }
  if (Number.isInteger(form.minimumQuestionsPerSession) && isNonNegInt(form.maximumQuestionsPerDay) &&
      form.minimumQuestionsPerSession > form.maximumQuestionsPerDay) {
    errors.push('minimumQuestionsPerSession must be <= maximumQuestionsPerDay.')
  }
  if (typeof form.averageMinutesPerQuestion !== 'number' || !isFinite(form.averageMinutesPerQuestion) ||
      form.averageMinutesPerQuestion <= 0) {
    errors.push('averageMinutesPerQuestion must be a number > 0.')
  }
  return errors
}

function validateSchedulingConfigStep(form) {
  const errors = []
  if (!['focused', 'efficient'].includes(form.schedulingMode)) {
    errors.push('schedulingMode must be "focused" or "efficient".')
  }
  if (!['next_available_day', 'same_day_if_capacity'].includes(form.questionStartRule)) {
    errors.push('questionStartRule must be "next_available_day" or "same_day_if_capacity".')
  }
  if (typeof form.bufferPercentage !== 'number' || form.bufferPercentage < 0 || form.bufferPercentage > 100) {
    errors.push('bufferPercentage must be between 0 and 100.')
  }
  if (!Number.isInteger(form.maximumActiveTopics) || form.maximumActiveTopics < 1) {
    errors.push('maximumActiveTopics must be an integer >= 1.')
  }
  return errors
}

const VALIDATORS = {
  0: (form) => {
    const errors = []
    if (typeof form.sourceId !== 'string' || form.sourceId.trim() === '') errors.push('sourceId is required.')
    if (typeof form.rotationId !== 'string' || form.rotationId.trim() === '') errors.push('rotationId is required.')
    return errors
  },
  1: validateDateStep,
  2: validateAvailabilityStep,
  3: () => [],
  4: (form) => {
    const errors = []
    if (!['focused', 'active', 'detailed_notes'].includes(form.studyStyle)) {
      errors.push('studyStyle must be "focused", "active", or "detailed_notes".')
    }
    return errors
  },
  5: () => [],
  6: validateTopicsStep,
  7: validateQuestionConfigStep,
  8: validateSchedulingConfigStep,
  9: () => [],
  10: () => [],
}

export function validateStep(step, form, topics) {
  const validator = VALIDATORS[step]
  if (!validator) return { valid: true, errors: [] }
  const errors = validator(form, topics)
  return { valid: errors.length === 0, errors }
}

export function canAdvanceStep(step, form, topics) {
  return validateStep(step, form, topics).valid
}
