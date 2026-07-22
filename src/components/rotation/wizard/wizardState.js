export const INITIAL_FORM = {
  sourceId: '',
  rotationId: '',
  startDate: '',
  endDate: '',
  examDate: '',
  availability: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    availableMinutes: weekday === 0 || weekday === 6 ? 0 : 120,
    isDayOff: weekday === 0 || weekday === 6,
  })),
  studyStyle: 'active',
  topics: [],
  preferredQuestionsPerDay: 30,
  minimumQuestionsPerSession: 10,
  maximumQuestionsPerDay: 50,
  averageMinutesPerQuestion: 1.5,
  schedulingMode: 'efficient',
  questionStartRule: 'next_available_day',
  bufferPercentage: 20,
  maximumActiveTopics: 5,
};

export const PREVIEW_STEP = 10;

export const DRAFT_KEY = 'rotationWizardDraft';

export function saveDraft(step, form) {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ schemaVersion: 1, savedAt: Date.now(), step, form })
  );
}

export function loadDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;

  const draft = JSON.parse(raw);
  if (draft.schemaVersion !== 1 || !draft.savedAt) return null;

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - draft.savedAt > sevenDays) return null;

  let step = draft.step;
  if (step >= PREVIEW_STEP) step = PREVIEW_STEP - 1;

  return { step, form: draft.form };
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function onSourceChange(form, newSourceId) {
  return { ...form, sourceId: newSourceId, rotationId: '', topics: [] };
}

export function onRotationChange(form, newRotationId) {
  return { ...form, rotationId: newRotationId, topics: [] };
}

export function onTopicsLoaded(form, apiTopics) {
  const existingById = new Map(form.topics.map((t) => [t.normalizedTopicId, t]));

  const topics = apiTopics.map((apiTopic) => {
    const existing = existingById.get(apiTopic.normalizedTopicId);
    return {
      ...apiTopic,
      uworldRemainingQuestions: existing?.uworldRemainingQuestions ?? 0,
      alreadyCompletedLearningPercentage: existing?.alreadyCompletedLearningPercentage ?? 0,
      alreadyCompletedQuestionCount: existing?.alreadyCompletedQuestionCount ?? 0,
      incorrectQuestionsRemaining: existing?.incorrectQuestionsRemaining ?? 0,
    };
  });

  return { ...form, topics };
}
