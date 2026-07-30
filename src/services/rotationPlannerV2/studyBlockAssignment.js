const BLOCK_TARGET_MINUTES = 25
const BLOCK_MAX_MINUTES = 45

function encodeSegment(str) {
  if (str == null) return '_'
  return String(str).replace(/%/g, '%%').replace(/:/g, '%c')
}

function isBetterCandidate(a, b) {
  if (!b) return true
  if (a.shortfall !== b.shortfall) return a.shortfall < b.shortfall
  if (a.numBlocks !== b.numBlocks) return a.numBlocks < b.numBlocks
  return a.splits[0] < b.splits[0]
}

function optimalPartition(minutes) {
  const n = minutes.length
  if (n === 0) return []

  const prefix = [0]
  for (let i = 0; i < n; i++) {
    prefix.push(prefix[i] + minutes[i])
  }

  const dp = new Array(n + 1).fill(null)
  dp[0] = { shortfall: 0, numBlocks: 0, splits: [] }

  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < i; j++) {
      if (!dp[j]) continue
      const blockMinutes = prefix[i] - prefix[j]
      const isSingleTask = i - j === 1
      if (!isSingleTask && blockMinutes > BLOCK_MAX_MINUTES) continue

      const blockShortfall = Math.max(0, BLOCK_TARGET_MINUTES - blockMinutes)
      const candidate = {
        shortfall: dp[j].shortfall + blockShortfall,
        numBlocks: dp[j].numBlocks + 1,
        splits: [...dp[j].splits, i],
      }

      if (!isBetterCandidate(candidate, dp[i])) continue
      dp[i] = candidate
    }
  }

  return dp[n] ? dp[n].splits : []
}

export function assignStudyBlocks(tasks, topicMap) {
  const byDate = new Map()
  for (const task of tasks) {
    const date = task.taskDate
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push(task)
  }

  const result = []

  for (const [date, dayTasks] of byDate) {
    const sorted = [...dayTasks].sort((a, b) => a.displayOrder - b.displayOrder)

    const runs = []
    let currentRun = []
    const noBlockTasks = []
    const nonLearningTasks = []

    for (const task of sorted) {
      if (task.taskType !== 'learning') {
        if (currentRun.length > 0) { runs.push(currentRun); currentRun = [] }
        nonLearningTasks.push(task)
        continue
      }

      const topicInfo = topicMap.get(task.normalizedTopicId)
      if (!topicInfo?.sourceId || !topicInfo?.groupId) {
        if (currentRun.length > 0) { runs.push(currentRun); currentRun = [] }
        noBlockTasks.push(task)
        continue
      }

      if (currentRun.length > 0) {
        const lastTask = currentRun[currentRun.length - 1]
        const lastInfo = topicMap.get(lastTask.normalizedTopicId)
        if (lastInfo.sourceId !== topicInfo.sourceId || lastInfo.groupId !== topicInfo.groupId) {
          runs.push(currentRun)
          currentRun = []
        }
      }

      currentRun.push(task)
    }
    if (currentRun.length > 0) runs.push(currentRun)

    const allBlocks = []

    for (const run of runs) {
      const minutes = run.map(t => t.estimatedMinutes)
      const splits = optimalPartition(minutes)

      let startIdx = 0
      for (const endIdx of splits) {
        allBlocks.push({
          tasks: run.slice(startIdx, endIdx),
          sourceId: topicMap.get(run[0].normalizedTopicId).sourceId,
          groupId: topicMap.get(run[0].normalizedTopicId).groupId,
        })
        startIdx = endIdx
      }
    }

    const ordinalCounters = new Map()

    for (const block of allBlocks) {
      const key = `${block.sourceId}::${block.groupId}`
      const ordinal = ordinalCounters.get(key) || 0
      ordinalCounters.set(key, ordinal + 1)

      const sourceSlug = encodeSegment(block.sourceId)
      const sectionSlug = encodeSegment(block.groupId)
      const blockId = `sb::${date}::${sourceSlug}::${sectionSlug}::${ordinal}`

      for (const task of block.tasks) {
        result.push({
          ...task,
          metadata: {
            ...task.metadata,
            studyBlockId: blockId,
          },
        })
      }
    }

    for (const task of noBlockTasks) {
      result.push({ ...task })
    }
    for (const task of nonLearningTasks) {
      result.push({ ...task })
    }
  }

  result.sort((a, b) => {
    if (a.taskDate !== b.taskDate) return a.taskDate < b.taskDate ? -1 : 1
    return a.displayOrder - b.displayOrder
  })

  return result
}

export { BLOCK_TARGET_MINUTES, BLOCK_MAX_MINUTES }
