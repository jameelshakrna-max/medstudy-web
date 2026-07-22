export function calculateDailyCapacity({ availableMinutes, dueFlashcardMinutes, overdueRequiredMinutes, bufferPercentage }) {
  const planningBufferMinutes = Math.floor(availableMinutes * bufferPercentage / 100);
  const remainingAfterBuffer = Math.max(0, availableMinutes - planningBufferMinutes);
  const flashcardMinutes = Math.min(dueFlashcardMinutes, remainingAfterBuffer);
  const remainingAfterFlashcards = remainingAfterBuffer - flashcardMinutes;
  const overdueMinutes = Math.min(overdueRequiredMinutes, remainingAfterFlashcards);
  const usableMinutes = remainingAfterFlashcards - overdueMinutes;
  const unmetFlashcardMinutes = Math.max(0, dueFlashcardMinutes - flashcardMinutes);
  const unmetOverdueMinutes = Math.max(0, overdueRequiredMinutes - overdueMinutes);

  return {
    availableMinutes,
    planningBufferMinutes,
    flashcardMinutes,
    overdueMinutes,
    usableMinutes,
    unmetFlashcardMinutes,
    unmetOverdueMinutes,
  };
}

export function calculateQuestionCapacity({ usableMinutes, questionsRemaining, preferredQuestionsPerDay, minimumQuestionsPerSession, maximumQuestionsPerDay, averageMinutesPerQuestion }) {
  if (!Number.isFinite(averageMinutesPerQuestion) || averageMinutesPerQuestion <= 0) {
    return { questionsToday: 0, minutesConsumed: 0 };
  }

  if (usableMinutes <= 0 || questionsRemaining <= 0) {
    return { questionsToday: 0, minutesConsumed: 0 };
  }

  const maxByTime = Math.floor(usableMinutes / averageMinutesPerQuestion);
  let questionsToday = Math.min(questionsRemaining, maxByTime, preferredQuestionsPerDay, maximumQuestionsPerDay);

  if (questionsRemaining > 0 && questionsRemaining < minimumQuestionsPerSession) {
    questionsToday = questionsRemaining;
  } else if (questionsRemaining >= minimumQuestionsPerSession && questionsToday < minimumQuestionsPerSession) {
    return { questionsToday: 0, minutesConsumed: 0 };
  }

  let minutesConsumed = Math.ceil(questionsToday * averageMinutesPerQuestion);
  while (minutesConsumed > usableMinutes && questionsToday > 0) {
    questionsToday--;
    minutesConsumed = Math.ceil(questionsToday * averageMinutesPerQuestion);
  }

  return { questionsToday, minutesConsumed };
}
