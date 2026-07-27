import { getAvailableTaskActions } from './taskActionRules';

const TERMINAL_FRACTION_STATUSES = new Set(['completed']);

function getProgressFraction(task) {
  if (TERMINAL_FRACTION_STATUSES.has(task.status)) return 1;
  if (task.status === 'partial') return (task.completionPercentage ?? 0) / 100;
  if (task.status === 'in_progress') return (task.completionPercentage ?? 0) / 100;
  return 0;
}

function selectPrimaryTask(tasks) {
  const inProgress = tasks.find((t) => t.status === 'in_progress');
  if (inProgress) return inProgress;

  const startable = tasks.find((t) => {
    const actions = getAvailableTaskActions(t);
    return actions.includes('start');
  });
  if (startable) return startable;

  return null;
}

function deriveTitle(tasks) {
  const sections = tasks.map((t) => t.topicSection).filter(Boolean);
  if (sections.length > 0 && sections.every((s) => s === sections[0])) {
    return `${sections[0]} Study Block`;
  }
  return 'Study Block';
}

function buildTopicPreview(tasks) {
  const names = tasks.map((t) => t.topicTitle).filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      unique.push(name);
    }
  }
  const topicCount = unique.length;
  return {
    topicNames: unique.slice(0, 3),
    hasMoreTopics: topicCount > 3,
    topicCount,
  };
}

function buildStudyBlockEntry(blockTasks) {
  const totalEstimatedMinutes = blockTasks.reduce(
    (sum, t) => sum + (t.estimatedMinutes ?? 0),
    0,
  );

  const totalWeight = totalEstimatedMinutes;
  let weightedSum = 0;
  const counts = {
    completed: 0,
    partial: 0,
    inProgress: 0,
    skipped: 0,
    remaining: 0,
  };

  for (const t of blockTasks) {
    const fraction = getProgressFraction(t);
    weightedSum += (t.estimatedMinutes ?? 0) * fraction;

    if (t.status === 'completed') counts.completed++;
    else if (t.status === 'partial') counts.partial++;
    else if (t.status === 'in_progress') counts.inProgress++;
    else if (t.status === 'skipped') counts.skipped++;
    else counts.remaining++;
  }

  const percent = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
  const topicPreview = buildTopicPreview(blockTasks);

  return {
    type: 'study_block',
    studyBlockId: blockTasks[0].studyBlockId,
    tasks: blockTasks,
    totalEstimatedMinutes,
    progress: {
      percent,
      completed: counts.completed,
      partial: counts.partial,
      inProgress: counts.inProgress,
      skipped: counts.skipped,
      remaining: counts.remaining,
    },
    primaryTask: selectPrimaryTask(blockTasks),
    title: deriveTitle(blockTasks),
    ...topicPreview,
  };
}

function canGroup(task) {
  return task.taskType === 'learning' && task.studyBlockId != null;
}

export function groupTasksIntoStudyBlocks(tasks, topicsById) {
  const blockBuckets = new Map();

  for (const task of tasks) {
    if (!canGroup(task)) continue;
    const id = task.studyBlockId;
    if (!blockBuckets.has(id)) {
      blockBuckets.set(id, []);
    }
    blockBuckets.get(id).push(task);
  }

  const validBlockIds = new Set();
  for (const [id, blockTasks] of blockBuckets) {
    if (blockTasks.length >= 2) {
      validBlockIds.add(id);
    }
  }

  const emitted = new Set();
  const result = [];

  for (const task of tasks) {
    if (canGroup(task) && validBlockIds.has(task.studyBlockId)) {
      if (!emitted.has(task.studyBlockId)) {
        emitted.add(task.studyBlockId);
        result.push(buildStudyBlockEntry(blockBuckets.get(task.studyBlockId)));
      }
      continue;
    }
    result.push({ type: 'task', task });
  }

  return result;
}
