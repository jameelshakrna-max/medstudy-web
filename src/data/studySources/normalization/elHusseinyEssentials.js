import { EL_HUSSEINY_ESSENTIALS } from "../textbooks/elHusseinyEssentials.js";
import { resolveRotationAlias } from "../rotationAliases.js";
import { getSharedTopicKey } from "../sharedTopicKeys.js";

export function normalizeEssentials() {
  const normalized = EL_HUSSEINY_ESSENTIALS.topics.map((topic) => {
    const sharedKey = getSharedTopicKey(
      "el-husseiny-essentials-step2ck",
      topic.topic_id
    );
    const rotationId = resolveRotationAlias(
      "el-husseiny-essentials-step2ck",
      topic.rotation
    );

    return {
      normalizedTopicId: `el-husseiny-essentials-step2ck::${topic.topic_id}`,
      canonicalTopicId: sharedKey ?? `el-husseiny-essentials-step2ck::${topic.topic_id}`,
      sourceTopicId: topic.topic_id,
      sourceId: "el-husseiny-essentials-step2ck",
      rotationId: rotationId ?? null,
      groupId: topic.group || null,
      title: topic.topic,
      sourceTitle: "EL Husseiny's Essentials for USMLE Step 2 CK",
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
        contentWarning:
          topic.word_count === 0 && topic.group === topic.topic
            ? "zero-content section divider"
            : null,
      },
    };
  });

  return Object.freeze(normalized);
}
