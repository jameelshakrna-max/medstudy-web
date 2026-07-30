const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function applyPrerequisites(topics) {
  const errors = [];
  const idSet = new Set(topics.map(t => t.canonicalTopicId));
  const adj = new Map();
  const inDegree = new Map();

  for (const t of topics) {
    adj.set(t.canonicalTopicId, []);
    inDegree.set(t.canonicalTopicId, 0);
  }

  for (const t of topics) {
    for (const prereqId of t.prerequisiteTopicIds) {
      if (!idSet.has(prereqId)) {
        errors.push(`Missing prerequisite "${prereqId}" referenced by "${t.canonicalTopicId}"`);
        continue;
      }
      adj.get(prereqId).push(t.canonicalTopicId);
      inDegree.set(t.canonicalTopicId, inDegree.get(t.canonicalTopicId) + 1);
    }
  }

  const color = new Map();
  for (const t of topics) {
    color.set(t.canonicalTopicId, WHITE);
  }

  const cycleNodes = new Set();

  function dfs(u, path) {
    color.set(u, GRAY);
    path.push(u);

    for (const v of adj.get(u)) {
      if (!color.has(v)) continue;
      if (color.get(v) === GRAY) {
        for (let i = path.indexOf(v); i < path.length; i++) {
          cycleNodes.add(path[i]);
        }
      } else if (color.get(v) === WHITE) {
        dfs(v, path);
      }
    }

    path.pop();
    color.set(u, BLACK);
  }

  for (const t of topics) {
    if (color.get(t.canonicalTopicId) === WHITE) {
      dfs(t.canonicalTopicId, []);
    }
  }

  if (cycleNodes.size > 0) {
    errors.push(`Cycle detected involving: ${[...cycleNodes].join(', ')}`);
  }

  const queue = [];
  for (const t of topics) {
    if (inDegree.get(t.canonicalTopicId) === 0) {
      queue.push(t.canonicalTopicId);
    }
  }

  const sorted = [];
  const topicMap = new Map(topics.map(t => [t.canonicalTopicId, t]));

  while (queue.length > 0) {
    const u = queue.shift();
    sorted.push(topicMap.get(u));

    for (const v of adj.get(u)) {
      if (!inDegree.has(v)) continue;
      const deg = inDegree.get(v) - 1;
      inDegree.set(v, deg);
      if (deg === 0) {
        queue.push(v);
      }
    }
  }

  for (const t of topics) {
    if (!sorted.some(s => s.canonicalTopicId === t.canonicalTopicId)) {
      sorted.push(t);
    }
  }

  return { sorted, errors };
}
