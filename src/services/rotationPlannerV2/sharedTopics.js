export function deduplicateSharedTopics(topics) {
  const processedTopics = [];
  const deduplicationLog = [];
  const groups = {};

  for (const topic of topics) {
    if (topic.sharedTopicKey === null || topic.sharedTopicKey === undefined) {
      processedTopics.push({
        ...topic,
        isPrimarySharedUnit: true,
        satisfiedBySharedCompletion: false,
      });
      deduplicationLog.push({
        canonicalTopicId: topic.canonicalTopicId,
        sharedTopicKey: null,
        action: 'passed_through',
        reason: 'No sharedTopicKey — topic is unique',
      });
      continue;
    }

    if (!groups[topic.sharedTopicKey]) {
      groups[topic.sharedTopicKey] = [];
    }
    groups[topic.sharedTopicKey].push(topic);
  }

  for (const [key, group] of Object.entries(groups)) {
    const completed = group.find(
      (t) => t.alreadyCompletedLearningPercentage === 1.0
    );

    if (completed) {
      const primarySourceId = completed.sourceTopicId;

      for (const topic of group) {
        const isPrimary = topic.sourceTopicId === primarySourceId;
        processedTopics.push({
          ...topic,
          isPrimarySharedUnit: isPrimary,
          satisfiedBySharedCompletion: !isPrimary,
        });
        deduplicationLog.push({
          canonicalTopicId: topic.canonicalTopicId,
          sharedTopicKey: key,
          action: isPrimary ? 'kept_as_primary' : 'marked_satisfied',
          reason: isPrimary
            ? 'Completed equivalent selected as primary'
            : `Satisfied by shared completion of ${primarySourceId}`,
        });
      }
    } else {
      const sorted = [...group].sort((a, b) =>
        a.sourceTopicId.localeCompare(b.sourceTopicId)
      );
      const primarySourceId = sorted[0].sourceTopicId;

      for (const topic of group) {
        const isPrimary = topic.sourceTopicId === primarySourceId;
        processedTopics.push({
          ...topic,
          isPrimarySharedUnit: isPrimary,
          satisfiedBySharedCompletion: !isPrimary,
        });
        deduplicationLog.push({
          canonicalTopicId: topic.canonicalTopicId,
          sharedTopicKey: key,
          action: isPrimary ? 'kept_as_primary' : 'marked_satisfied',
          reason: isPrimary
            ? 'Alphabetically first sourceTopicId selected as primary'
            : `Deduplicated against primary ${primarySourceId}`,
        });
      }
    }
  }

  return { processedTopics, deduplicationLog };
}
