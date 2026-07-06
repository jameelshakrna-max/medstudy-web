export function calculateGoalProgress(goal, report) {
  const { analytics, subjects, performance } = report
  let current = 0

  switch (goal.goal_type) {
    case 'questions':
      current = analytics.totalQuestions
      break
    case 'blocks':
      current = analytics.totalBlocks
      break
    case 'topics':
      current = analytics.totalMrcpMastered || analytics.totalMrcpTopics || 0
      break
    case 'cases':
      current = analytics.totalCases
      break
    case 'hours':
      current = (analytics.totalStudyMinutes || 0) / 60
      break
    case 'streak':
      current = analytics.currentStreak
      break
    case 'subject_avg': {
      const ranking = (subjects?.rankings || []).find(r => r.subject === goal.subject_id)
      current = ranking ? Math.round(ranking.avgScore * 10) / 10 : 0
      break
    }
    case 'performance':
      current = performance?.overallScore || 0
      break
  }

  const pct = goal.target_value > 0
    ? Math.min(100, Math.round((current / goal.target_value) * 100))
    : 0

  let status = 'active'
  if (pct >= 100) {
    status = 'completed'
  } else if (goal.deadline) {
    const deadline = new Date(goal.deadline)
    const now = new Date()
    if (deadline < now) status = 'expired'
  }

  let daysRemaining = null
  if (goal.deadline) {
    const deadline = new Date(goal.deadline)
    const now = new Date()
    daysRemaining = Math.max(0, Math.ceil((deadline - now) / 86400000))
  }

  let estimatedDate = null
  const createdDate = goal.created_at ? new Date(goal.created_at) : null
  if (createdDate && current > 0 && pct < 100) {
    const daysSince = Math.max(1, (Date.now() - createdDate.getTime()) / 86400000)
    const pacePerDay = current / daysSince
    if (pacePerDay > 0) {
      const daysToTarget = (goal.target_value - current) / pacePerDay
      estimatedDate = new Date(Date.now() + daysToTarget * 86400000)
    }
  }

  let nextMilestone = null
  const milestones = [0.25, 0.5, 0.75, 1.0]
  for (const fraction of milestones) {
    const ms = Math.round(goal.target_value * fraction)
    if (ms > current && ms <= goal.target_value) {
      nextMilestone = ms
      break
    }
  }

  return {
    ...goal,
    current,
    pct,
    status,
    daysRemaining,
    estimatedDate,
    nextMilestone,
  }
}

export function getGoalTypeLabel(type) {
  const labels = {
    questions: 'Questions',
    blocks: 'Blocks',
    topics: 'Topics',
    cases: 'Cases',
    hours: 'Hours',
    streak: 'Study Streak',
    subject_avg: 'Subject Average',
    performance: 'Performance Score',
  }
  return labels[type] || type
}

export function getGoalCategoryLabel(cat) {
  const labels = { daily: 'Daily', weekly: 'Weekly', long_term: 'Long-Term' }
  return labels[cat] || cat
}
