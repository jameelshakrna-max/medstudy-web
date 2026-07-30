import { CASE_BASED_SURGERY_2E } from "../textbooks/caseBasedSurgery2e.js";
import { resolveRotationAlias } from "../rotationAliases.js";
import { getSharedTopicKey } from "../sharedTopicKeys.js";

export function normalizeCaseBasedSurgery() {
  const normalized = CASE_BASED_SURGERY_2E.topics.map((topic) => {
    const sharedKey = getSharedTopicKey(
      "surgery-case-based-clinical-review-2e-2020",
      topic.topic_id
    );
    const rotationId = resolveRotationAlias(
      "surgery-case-based-clinical-review-2e-2020",
      topic.section
    );

    return {
      normalizedTopicId: `surgery-case-based-clinical-review-2e-2020::${topic.topic_id}`,
      canonicalTopicId: sharedKey ?? `surgery-case-based-clinical-review-2e-2020::${topic.topic_id}`,
      sourceTopicId: topic.topic_id,
      sourceId: "surgery-case-based-clinical-review-2e-2020",
      rotationId: rotationId ?? null,
      groupId: null,
      title: topic.primary_topic,
      sourceTitle: "Surgery: A Case Based Clinical Review",
      learningMinutes: {
        focused: topic.focused_minutes,
        activeLow: topic.active_low_minutes,
        activeExpected: topic.active_minutes,
        activeHigh: topic.active_high_minutes,
        detailedNotes: topic.detailed_notes_minutes,
      },
      pageRange: { start: topic.pdf_start, end: topic.pdf_end },
      confidence: topic.estimate_confidence,
      questionSource: topic.question_source || "uworld",
      studyUnitType: topic.study_unit_type || "case_chapter",
      sharedTopicKey: sharedKey,
      metadata: {
        wordCount: topic.words,
        chapterTitle: topic.title,
        sourceFileId: topic.source_id,
        contentWarning: null,
      },
    };
  });

  return Object.freeze(normalized);
}
