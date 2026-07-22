const STYLE_TO_MINUTES_KEY = {
  focused: 'focused',
  active: 'activeExpected',
  detailed_notes: 'detailedNotes',
}

export function getLearningMinutesForStyle(topic, studyStyle) {
  const key = STYLE_TO_MINUTES_KEY[studyStyle]
  return topic.learningMinutes?.[key] ?? 0
}

export function normalizeSourcesResponse(data) {
  return Array.isArray(data) ? data : []
}

export function normalizeRotationsResponse(data) {
  return Array.isArray(data) ? data : []
}

export function normalizeTopicsResponse(data) {
  return Array.isArray(data) ? data : []
}

export function buildPreviewPayload(form) {
  return {
    sourceId: form.sourceId,
    rotationId: form.rotationId,
    startDate: form.startDate,
    endDate: form.endDate,
    examDate: form.examDate || null,
    studyStyle: form.studyStyle,
    schedulingMode: form.schedulingMode,
    questionStartRule: form.questionStartRule,
    availability: form.availability,
    blockedDates: [],
    bufferPercentage: form.bufferPercentage,
    preferredQuestionsPerDay: form.preferredQuestionsPerDay,
    minimumQuestionsPerSession: form.minimumQuestionsPerSession,
    maximumQuestionsPerDay: form.maximumQuestionsPerDay,
    averageMinutesPerQuestion: form.averageMinutesPerQuestion,
    maximumActiveTopics: form.maximumActiveTopics,
    personalSourcePaceMultiplier: 1,
    examReviewWindowDays: 0,
    mixedReviewQuestionsPerDay: 0,
    dueReviewMinutesByDate: {},
    topics: form.topics,
  }
}

export function buildCreatePayload(form, previewToken, acceptOverload) {
  return {
    ...buildPreviewPayload(form),
    previewToken,
    acceptOverload: acceptOverload ?? false,
  }
}
