import { EL_HUSSEINY_SURGERY } from "../textbooks/elhusseinySurgery.js";
import { resolveRotationAlias } from "../rotationAliases.js";
import { getSharedTopicKey } from "../sharedTopicKeys.js";

export function normalizeSurgery() {
  const normalized = EL_HUSSEINY_SURGERY.topics.map((topic) => {
    const sharedKey = getSharedTopicKey(
      "el-husseiny-essentials-surgery-step2ck",
      topic.topic_id
    );
    const rotationId = resolveRotationAlias(
      "el-husseiny-essentials-surgery-step2ck",
      topic.rotation
    );

    return {
      normalizedTopicId: `el-husseiny-essentials-surgery-step2ck::${topic.topic_id}`,
      canonicalTopicId: sharedKey ?? `el-husseiny-essentials-surgery-step2ck::${topic.topic_id}`,
      sourceTopicId: topic.topic_id,
      sourceId: "el-husseiny-essentials-surgery-step2ck",
      rotationId: rotationId ?? null,
      groupId: topic.group || null,
      title: topic.topic,
      sourceTitle: "EL Husseiny's Essentials for USMLE Step 2 CK Surgery",
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
        chapterTitle: null,
        sourceFileId: topic.source_id,
        contentWarning: null,
      },
    };
  });

  return Object.freeze(normalized);
}
