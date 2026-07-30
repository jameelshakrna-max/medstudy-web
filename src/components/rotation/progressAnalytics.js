export function calculateOverallTopicProgress(topics) {
  const total = topics.length;
  const completed = topics.filter(t => t.status === 'completed').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

export function calculateLearningProgress(topics, tasks) {
  const totalBaseline = topics.reduce(
    (sum, t) => sum + (t.personalizedLearningMinutes || 0),
    0
  );

  const topicResults = topics.map(topic => {
    const learningTasks = tasks.filter(
      t => t.planTopicId === topic.id && t.taskType === 'learning'
    );

    const rawMinutes = learningTasks.reduce((sum, task) => {
      const fraction = getTaskFraction(task);
      return sum + task.estimatedMinutes * fraction;
    }, 0);

    const baseline = topic.personalizedLearningMinutes || 0;
    const completed = Math.min(baseline, rawMinutes);
    const percent = baseline > 0 ? Math.round((completed / baseline) * 100) : 0;

    return {
      topicId: topic.id,
      topicTitle: topic.topicTitle,
      baseline,
      completed,
      percent,
    };
  });

  const totalCompleted = topicResults.reduce((sum, r) => sum + r.completed, 0);
  const percent =
    totalBaseline > 0 ? Math.round((totalCompleted / totalBaseline) * 100) : 0;

  return {
    total: totalBaseline,
    completed: totalCompleted,
    percent,
    topics: topicResults,
  };
}

function getTaskFraction(task) {
  switch (task.status) {
    case 'completed':
      return 1;
    case 'partial':
    case 'in_progress':
      return (task.completionPercentage ?? 0) / 100;
    case 'pending':
    case 'locked':
    case 'skipped':
    default:
      return 0;
  }
}

export function calculateUworldProgress(topics) {
  const total = topics.reduce((sum, t) => sum + (t.totalUworldQuestions || 0), 0);
  const completed = topics.reduce(
    (sum, t) => sum + (t.completedUworldQuestions || 0),
    0
  );
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

export function calculateIncorrectReviewProgress(tasks) {
  const generated = tasks
    .filter(t => t.taskType === 'uworld_questions')
    .reduce((sum, t) => sum + (t.incorrectCount || 0), 0);

  const reviewed = tasks
    .filter(t => t.taskType === 'incorrect_review')
    .reduce((sum, t) => sum + (t.completedCount || 0), 0);

  const remaining = Math.max(0, generated - reviewed);
  const percent = generated > 0 ? Math.round((reviewed / generated) * 100) : 0;

  return { generated, reviewed, remaining, percent };
}

export function buildScheduledVsLoggedSeries(
  tasks,
  todayKey,
  pastDays = 7,
  futureDays = 3
) {
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const result = [];

  for (let offset = -pastDays; offset <= futureDays; offset++) {
    const d = new Date(ty, tm - 1, td + offset);
    const dateKey = formatLocalDate(d);

    let scheduled = 0;
    let logged = 0;

    for (const task of tasks) {
      if (task.taskDate === dateKey) {
        scheduled += task.estimatedMinutes || 0;
        if (task.actualMinutes > 0) {
          logged += task.actualMinutes;
        }
      }
    }

    result.push({
      date: dateKey,
      scheduled,
      logged,
      isPast: dateKey < todayKey,
      isToday: dateKey === todayKey,
    });
  }

  return result;
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STATUS_LABELS = {
  completed: 'Completed',
  learning: 'Learning',
  uworld_in_progress: 'UWorld In Progress',
  questions_locked: 'Questions Locked',
  not_started: 'Not Started',
  incorrect_review: 'Incorrect Review',
  maintenance: 'Maintenance',
};

export function summarizeTopicStatuses(topics) {
  const counts = {};
  for (const topic of topics) {
    counts[topic.status] = (counts[topic.status] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([status, count]) => ({
      status,
      count,
      label: STATUS_LABELS[status] || status,
    }))
    .sort((a, b) => b.count - a.count);
}

const INCOMPLETE_STATUSES = ['pending', 'in_progress', 'locked'];

export function findDelayedTopics(topics, tasks, todayKey) {
  const tasksByTopic = groupBy(tasks, 'planTopicId');

  return topics
    .map(topic => {
      const topicTasks = tasksByTopic[topic.id] || [];
      const overdueCount = topicTasks.filter(
        t =>
          INCOMPLETE_STATUSES.includes(t.status) &&
          t.taskDate &&
          t.taskDate < todayKey
      ).length;

      if (overdueCount === 0) return null;

      return {
        topicId: topic.id,
        topicTitle: topic.topicTitle,
        groupId: topic.groupId,
        reason: `${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}`,
      };
    })
    .filter(Boolean);
}

export function findTopicsNeedingAttention(topics, tasks, todayKey) {
  const tasksByTopic = groupBy(tasks, 'planTopicId');

  return topics
    .map(topic => {
      const reasons = [];

      if (topic.incorrectQuestionsRemaining > 0) {
        reasons.push(
          `${topic.incorrectQuestionsRemaining} incorrect question${topic.incorrectQuestionsRemaining === 1 ? '' : 's'} remaining`
        );
      }

      const topicTasks = tasksByTopic[topic.id] || [];
      const overdueCount = topicTasks.filter(
        t =>
          INCOMPLETE_STATUSES.includes(t.status) &&
          t.taskDate &&
          t.taskDate < todayKey
      ).length;

      if (overdueCount > 0) {
        reasons.push(`${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}`);
      }

      if (reasons.length === 0) return null;

      return {
        topicId: topic.id,
        topicTitle: topic.topicTitle,
        groupId: topic.groupId,
        reasons,
      };
    })
    .filter(Boolean);
}

export function summarizeConfidence(topics) {
  const counts = {};
  for (const topic of topics) {
    const c = topic.estimateConfidence;
    if (c != null) {
      counts[c] = (counts[c] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([confidence, count]) => ({ confidence, count }))
    .sort((a, b) => b.count - a.count);
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key];
    if (k == null) continue;
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}
