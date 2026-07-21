const VALID_ROTATION_IDS = [
  "acute-care-surgery",
  "allergy-and-immunology",
  "ambulatory-medicine",
  "antimicrobials",
  "breast-surgery",
  "cardiology",
  "cardiothoracic-surgery",
  "dermatology",
  "dermatology-hypersensitivity",
  "emergency-medicine",
  "endocrinology",
  "endocrine-surgery",
  "ent",
  "fluids-electrolytes-acid-base",
  "gastroenterology",
  "general-surgery",
  "head-neck-surgery",
  "hematology",
  "hematology-oncology",
  "hepatopancreaticobiliary",
  "infectious-disease",
  "infectious-diseases",
  "lower-gastrointestinal",
  "nephrology",
  "neurology",
  "neurosurgery",
  "ophthalmology",
  "orthopedic-surgery",
  "pediatric-surgery",
  "preoperative-postoperative-care",
  "pulmonology",
  "rheumatology",
  "shock",
  "surgical-complications",
  "trauma",
  "upper-gastrointestinal",
  "urology",
  "vascular",
  "vascular-surgery",
];

const REQUIRED_SOURCE_KEYS = [
  "edition",
  "year",
  "version",
  "questionSource",
  "supportedRotations",
];

const TIME_FIELDS = ["focused_minutes", "active_minutes", "detailed_notes_minutes"];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateSource(sources) {
  const errors = [];
  const seenSourceIds = new Set();

  for (const source of sources) {
    const sourceId = source.source?.id;

    if (!sourceId) {
      errors.push({
        code: "MISSING_SOURCE_ID",
        sourceId: null,
        topicId: null,
        path: "source.id",
        message: "Source object is missing an id",
      });
      continue;
    }

    if (seenSourceIds.has(sourceId)) {
      errors.push({
        code: "DUPLICATE_SOURCE_ID",
        sourceId,
        topicId: null,
        path: "source.id",
        message: `Duplicate source id: ${sourceId}`,
      });
    }
    seenSourceIds.add(sourceId);

    for (const key of REQUIRED_SOURCE_KEYS) {
      if (!(key in source.source)) {
        errors.push({
          code: "MISSING_METADATA_KEY",
          sourceId,
          topicId: null,
          path: `source.${key}`,
          message: `Source "${sourceId}" is missing required key: ${key}`,
        });
      }
    }

    if ("supportedRotations" in source.source) {
      if (!Array.isArray(source.source.supportedRotations)) {
        errors.push({
          code: "INVALID_SUPPORTED_ROTATIONS",
          sourceId,
          topicId: null,
          path: "source.supportedRotations",
          message: `supportedRotations must be an array for source "${sourceId}"`,
        });
      } else {
        for (const rotId of source.source.supportedRotations) {
          if (!VALID_ROTATION_IDS.includes(rotId)) {
            errors.push({
              code: "UNSUPPORTED_ROTATION_ID",
              sourceId,
              topicId: null,
              path: `source.supportedRotations[${rotId}]`,
              message: `Unknown rotation id "${rotId}" in source "${sourceId}"`,
            });
          }
        }
      }
    }

    if (!source.source.questionSource) {
      errors.push({
        code: "MISSING_QUESTION_SOURCE",
        sourceId,
        topicId: null,
        path: "source.questionSource",
        message: `Source "${sourceId}" has no questionSource`,
      });
    }

    const topics = source.topics;
    if (Array.isArray(topics)) {
      const seenTopicIds = new Set();
      for (const topic of topics) {
        const topicId = topic.topic_id;
        if (topicId) {
          if (seenTopicIds.has(topicId)) {
            errors.push({
              code: "DUPLICATE_TOPIC_ID",
              sourceId,
              topicId,
              path: `topics[].topic_id`,
              message: `Duplicate topic_id "${topicId}" in source "${sourceId}"`,
            });
          }
          seenTopicIds.add(topicId);
        }

        for (const field of TIME_FIELDS) {
          const key = [
            "focused_minutes",
            "active_minutes",
            "detailed_notes_minutes",
          ].includes(field)
            ? field
            : null;
          if (!key) continue;

          if (!(field in topic)) {
            errors.push({
              code: "MISSING_TIME_ESTIMATE",
              sourceId,
              topicId,
              path: `topics[].${field}`,
              message: `Topic "${topicId || "unknown"}" in source "${sourceId}" is missing ${field}`,
            });
          } else if (
            !isFiniteNumber(topic[field]) ||
            topic[field] < 0
          ) {
            errors.push({
              code: "INVALID_TIME_VALUE",
              sourceId,
              topicId,
              path: `topics[].${field}`,
              message: `Topic "${topicId || "unknown"}" in source "${sourceId}" has invalid ${field}: ${topic[field]}`,
            });
          }
        }
      }
    }
  }

  return errors;
}

function validateAllSources(sources) {
  const errors = validateSource(sources);
  return {
    valid: errors.length === 0,
    errors,
  };
}

export { validateAllSources, VALID_ROTATION_IDS };
