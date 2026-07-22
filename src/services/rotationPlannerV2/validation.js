import { isValidDateString } from './dateUtils.js';

export function validatePlanConfig(planConfig) {
  const errors = [];

  if (typeof planConfig.rotationId !== 'string' || planConfig.rotationId.trim() === '') {
    errors.push('rotationId must be a non-empty string');
  }

  if (typeof planConfig.sourceId !== 'string' || planConfig.sourceId.trim() === '') {
    errors.push('sourceId must be a non-empty string');
  }

  if (!isValidDateString(planConfig.startDate)) {
    errors.push('startDate must be a valid date string');
  }

  if (!isValidDateString(planConfig.endDate)) {
    errors.push('endDate must be a valid date string');
  }

  if (isValidDateString(planConfig.startDate) && isValidDateString(planConfig.endDate)) {
    if (planConfig.startDate > planConfig.endDate) {
      errors.push('startDate must be <= endDate');
    }
  }

  if (planConfig.examDate !== undefined && planConfig.examDate !== null) {
    if (!isValidDateString(planConfig.examDate)) {
      errors.push('examDate must be a valid date string');
    }
  }

  const validStudyStyles = ['focused', 'active', 'detailed_notes'];
  if (!validStudyStyles.includes(planConfig.studyStyle)) {
    errors.push(`studyStyle must be one of: ${validStudyStyles.join(', ')}`);
  }

  const validSchedulingModes = ['focused', 'efficient'];
  if (!validSchedulingModes.includes(planConfig.schedulingMode)) {
    errors.push(`schedulingMode must be one of: ${validSchedulingModes.join(', ')}`);
  }

  const validQuestionStartRules = ['next_available_day', 'same_day_if_capacity'];
  if (!validQuestionStartRules.includes(planConfig.questionStartRule)) {
    errors.push(`questionStartRule must be one of: ${validQuestionStartRules.join(', ')}`);
  }

  if (!Number.isInteger(planConfig.maximumActiveTopics) || planConfig.maximumActiveTopics < 1) {
    errors.push('maximumActiveTopics must be an integer >= 1');
  }

  const avail = planConfig.availabilityByWeekday;
  if (!Array.isArray(avail) || avail.length !== 7) {
    errors.push('availabilityByWeekday must be an array of exactly 7 objects');
  } else {
    for (let i = 0; i < avail.length; i++) {
      const day = avail[i];
      if (!day || typeof day !== 'object') {
        errors.push(`availabilityByWeekday[${i}] must be an object`);
        continue;
      }
      if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6) {
        errors.push(`availabilityByWeekday[${i}].weekday must be an integer 0-6`);
      }
      if (!Number.isInteger(day.availableMinutes) || day.availableMinutes < 0) {
        errors.push(`availabilityByWeekday[${i}].availableMinutes must be an integer >= 0`);
      }
      if (typeof day.isDayOff !== 'boolean') {
        errors.push(`availabilityByWeekday[${i}].isDayOff must be a boolean`);
      }
    }
  }

  if (planConfig.blockedDates !== undefined && planConfig.blockedDates !== null) {
    if (!Array.isArray(planConfig.blockedDates)) {
      errors.push('blockedDates must be an array');
    } else {
      const seen = new Set();
      for (let i = 0; i < planConfig.blockedDates.length; i++) {
        const d = planConfig.blockedDates[i];
        if (!isValidDateString(d)) {
          errors.push(`blockedDates[${i}] must be a valid date string`);
        }
        if (seen.has(d)) {
          errors.push(`blockedDates[${i}] is a duplicate`);
        }
        seen.add(d);
      }
    }
  }

  if (typeof planConfig.bufferPercentage !== 'number' || planConfig.bufferPercentage < 0 || planConfig.bufferPercentage > 100) {
    errors.push('bufferPercentage must be a number 0-100');
  }

  if (!Number.isInteger(planConfig.preferredQuestionsPerDay) || planConfig.preferredQuestionsPerDay < 0) {
    errors.push('preferredQuestionsPerDay must be an integer >= 0');
  }

  if (!Number.isInteger(planConfig.minimumQuestionsPerSession) || planConfig.minimumQuestionsPerSession < 1) {
    errors.push('minimumQuestionsPerSession must be an integer >= 1');
  }

  if (!Number.isInteger(planConfig.maximumQuestionsPerDay) || planConfig.maximumQuestionsPerDay < planConfig.preferredQuestionsPerDay) {
    errors.push('maximumQuestionsPerDay must be an integer >= preferredQuestionsPerDay');
  }

  if (typeof planConfig.averageMinutesPerQuestion !== 'number' || !isFinite(planConfig.averageMinutesPerQuestion) || planConfig.averageMinutesPerQuestion <= 0) {
    errors.push('averageMinutesPerQuestion must be a finite number > 0');
  }

  if (!Array.isArray(planConfig.topics) || planConfig.topics.length === 0) {
    errors.push('topics must be a non-empty array');
  }

  if (typeof planConfig.personalSourcePaceMultiplier !== 'number' || !isFinite(planConfig.personalSourcePaceMultiplier) || planConfig.personalSourcePaceMultiplier <= 0) {
    errors.push('personalSourcePaceMultiplier must be a finite number > 0');
  }

  if (planConfig.examReviewWindowDays !== undefined && planConfig.examReviewWindowDays !== null) {
    if (!Number.isInteger(planConfig.examReviewWindowDays) || planConfig.examReviewWindowDays < 0) {
      errors.push('examReviewWindowDays must be an integer >= 0');
    }
  }

  if (planConfig.mixedReviewQuestionsPerDay !== undefined && planConfig.mixedReviewQuestionsPerDay !== null) {
    if (!Number.isInteger(planConfig.mixedReviewQuestionsPerDay) || planConfig.mixedReviewQuestionsPerDay < 0) {
      errors.push('mixedReviewQuestionsPerDay must be an integer >= 0');
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export function validateTopicInputs(topics) {
  const errors = [];

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    const prefix = `topics[${i}]`;

    if (typeof t.canonicalTopicId !== 'string' || t.canonicalTopicId.trim() === '') {
      errors.push(`${prefix}.canonicalTopicId must be a non-empty string`);
    }

    if (typeof t.sourceTopicId !== 'string' || t.sourceTopicId.trim() === '') {
      errors.push(`${prefix}.sourceTopicId must be a non-empty string`);
    }

    if (typeof t.title !== 'string' || t.title.trim() === '') {
      errors.push(`${prefix}.title must be a non-empty string`);
    }

    if (!t.learningMinutes || typeof t.learningMinutes !== 'object') {
      errors.push(`${prefix}.learningMinutes must be an object`);
    } else {
      if (typeof t.learningMinutes.focused !== 'number' || !isFinite(t.learningMinutes.focused)) {
        errors.push(`${prefix}.learningMinutes.focused must be a numeric value`);
      }
      if (typeof t.learningMinutes.activeExpected !== 'number' || !isFinite(t.learningMinutes.activeExpected)) {
        errors.push(`${prefix}.learningMinutes.activeExpected must be a numeric value`);
      }
      if (typeof t.learningMinutes.detailedNotes !== 'number' || !isFinite(t.learningMinutes.detailedNotes)) {
        errors.push(`${prefix}.learningMinutes.detailedNotes must be a numeric value`);
      }
    }

    if (!Number.isInteger(t.uworldRemainingQuestions) || t.uworldRemainingQuestions < 0) {
      errors.push(`${prefix}.uworldRemainingQuestions must be an integer >= 0`);
    }

    if (!Array.isArray(t.prerequisiteTopicIds)) {
      errors.push(`${prefix}.prerequisiteTopicIds must be an array`);
    }

    if (typeof t.alreadyCompletedLearningPercentage !== 'number' || t.alreadyCompletedLearningPercentage < 0 || t.alreadyCompletedLearningPercentage > 1) {
      errors.push(`${prefix}.alreadyCompletedLearningPercentage must be a number 0-1`);
    }

    if (!Number.isInteger(t.alreadyCompletedQuestionCount) || t.alreadyCompletedQuestionCount < 0) {
      errors.push(`${prefix}.alreadyCompletedQuestionCount must be an integer >= 0`);
    }

    if (t.incorrectQuestionsRemaining !== undefined && t.incorrectQuestionsRemaining !== null) {
      if (!Number.isInteger(t.incorrectQuestionsRemaining) || t.incorrectQuestionsRemaining < 0) {
        errors.push(`${prefix}.incorrectQuestionsRemaining must be an integer >= 0`);
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
