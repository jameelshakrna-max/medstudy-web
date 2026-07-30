import { VALID_ROTATION_IDS } from "./sourceValidator.js";
import { VALID_SOURCES } from "./normalizedRegistry.js";

const VALID_CONFIDENCE_VALUES = ["good", "medium", "low", "medium-high"];
const VALID_STUDY_UNIT_TYPES = ["topic", "case_chapter"];

function validateNormalizedTopic(topic) {
  const errors = [];

  if (typeof topic !== "object" || topic === null) {
    return { valid: false, errors: ["Topic is not an object"] };
  }

  if (typeof topic.normalizedTopicId !== "string" || !topic.normalizedTopicId.includes("::")) {
    errors.push("INVALID_NORMALIZED_TOPIC_ID: normalizedTopicId must be a string containing '::'");
  }

  if (typeof topic.canonicalTopicId !== "string") {
    errors.push("INVALID_CANONICAL_TOPIC_ID: canonicalTopicId must be a string");
  }

  if (typeof topic.sourceTopicId !== "string") {
    errors.push("INVALID_SOURCE_TOPIC_ID: sourceTopicId must be a string");
  }

  if (!VALID_SOURCES.includes(topic.sourceId)) {
    errors.push(`INVALID_SOURCE_ID: sourceId "${topic.sourceId}" is not a valid source`);
  }

  if (topic.rotationId !== null && !VALID_ROTATION_IDS.includes(topic.rotationId)) {
    errors.push(`INVALID_ROTATION_ID: rotationId "${topic.rotationId}" is not a valid canonical rotation`);
  }

  if (typeof topic.title !== "string" || topic.title.length === 0) {
    errors.push("INVALID_TITLE: title must be a non-empty string");
  }

  if (typeof topic.sourceTitle !== "string" || topic.sourceTitle.length === 0) {
    errors.push("INVALID_SOURCE_TITLE: sourceTitle must be a non-empty string");
  }

  if (!topic.learningMinutes || typeof topic.learningMinutes !== "object") {
    errors.push("INVALID_LEARNING_MINUTES: learningMinutes must be an object");
  } else {
    const lm = topic.learningMinutes;
    for (const field of ["focused", "activeLow", "activeExpected", "activeHigh", "detailedNotes"]) {
      if (typeof lm[field] !== "number" || !Number.isFinite(lm[field]) || lm[field] < 0) {
        errors.push(`INVALID_LEARNING_MINUTES: learningMinutes.${field} must be a non-negative finite number`);
      }
    }
  }

  if (topic.pageRange !== null) {
    if (!topic.pageRange || typeof topic.pageRange !== "object") {
      errors.push("INVALID_PAGE_RANGE: pageRange must be an object or null");
    } else if (
      typeof topic.pageRange.start !== "number" ||
      typeof topic.pageRange.end !== "number" ||
      topic.pageRange.start < 0 ||
      topic.pageRange.end < topic.pageRange.start
    ) {
      errors.push("INVALID_PAGE_RANGE: pageRange must have start <= end with non-negative values");
    }
  }

  if (!VALID_CONFIDENCE_VALUES.includes(topic.confidence)) {
    errors.push(`INVALID_CONFIDENCE: confidence "${topic.confidence}" must be one of: ${VALID_CONFIDENCE_VALUES.join(", ")}`);
  }

  if (!VALID_STUDY_UNIT_TYPES.includes(topic.studyUnitType)) {
    errors.push(`INVALID_STUDY_UNIT_TYPE: studyUnitType "${topic.studyUnitType}" must be one of: ${VALID_STUDY_UNIT_TYPES.join(", ")}`);
  }

  if (topic.sharedTopicKey !== null && typeof topic.sharedTopicKey !== "string") {
    errors.push("INVALID_SHARED_TOPIC_KEY: sharedTopicKey must be a string or null");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateNormalizedTopics(topics) {
  const allErrors = [];
  for (let i = 0; i < topics.length; i++) {
    const result = validateNormalizedTopic(topics[i]);
    if (!result.valid) {
      allErrors.push({
        index: i,
        normalizedTopicId: topics[i].normalizedTopicId,
        errors: result.errors,
      });
    }
  }
  return {
    valid: allErrors.length === 0,
    errorCount: allErrors.length,
    errors: allErrors,
  };
}

export { validateNormalizedTopic, validateNormalizedTopics };
