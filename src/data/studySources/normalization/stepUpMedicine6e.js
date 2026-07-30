import { STEP_UP_MEDICINE_6E } from "../textbooks/stepUpMedicine6e.js";
import { resolveRotationAlias } from "../rotationAliases.js";
import { getSharedTopicKey } from "../sharedTopicKeys.js";

export function normalizeStepUpMedicine() {
  const normalized = STEP_UP_MEDICINE_6E.topics
    .filter((topic) => topic.heading_kind !== "group")
    .map((topic) => {
      const sharedKey = getSharedTopicKey("step-up-medicine-6e-2024", topic.topic_id);
      const rotationId = resolveRotationAlias("step-up-medicine-6e-2024", topic.rotation) ?? null;

      return {
        normalizedTopicId: `step-up-medicine-6e-2024::${topic.topic_id}`,
        canonicalTopicId: sharedKey ?? `step-up-medicine-6e-2024::${topic.topic_id}`,
        sourceTopicId: topic.topic_id,
        sourceId: "step-up-medicine-6e-2024",
        rotationId,
        groupId: topic.group || null,
        title: topic.topic,
        sourceTitle: "Step-Up to Medicine",
        learningMinutes: {
          focused: topic.focused_minutes,
          activeLow: topic.active_low_minutes,
          activeExpected: topic.active_minutes,
          activeHigh: topic.active_high_minutes,
          detailedNotes: topic.detailed_notes_minutes,
        },
        pageRange: { start: topic.pdf_start_page, end: topic.pdf_end_page },
        confidence: topic.estimate_confidence,
        questionSource: topic.question_source || "uworld",
        studyUnitType: "topic",
        sharedTopicKey: sharedKey,
        metadata: {
          wordCount: topic.word_count,
          chapterTitle: topic.chapter_title,
          sourceFileId: topic.source_id,
          contentWarning: null,
        },
      };
    });

  return Object.freeze(normalized);
}
