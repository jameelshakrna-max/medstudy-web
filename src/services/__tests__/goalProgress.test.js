import { describe, it, expect } from 'vitest'
import { calculateGoalProgress, getGoalTypeLabel, getGoalCategoryLabel } from '../goalProgress.js'

function makeReport({ analytics = {}, subjects = { rankings: [] }, performance = {} } = {}) {
  return {
    analytics: {
      totalStudyMinutes: 0,
      totalQuestions: 0,
      totalBlocks: 0,
      totalMrcpMastered: 0,
      totalMrcpTopics: 0,
      totalCases: 0,
      currentStreak: 0,
      ...analytics,
    },
    subjects,
    performance,
  }
}

describe('hours-type goals', () => {
  it('current is totalStudyMinutes / 60', () => {
    const report = makeReport({ analytics: { totalStudyMinutes: 600 } })
    const res = calculateGoalProgress({ goal_type: 'hours', target_value: 10 }, report)
    expect(res.current).toBe(10)
    expect(res.pct).toBe(100)
    expect(res.status).toBe('completed')
  })

  it('exceeding the target caps pct at 100', () => {
    const report = makeReport({ analytics: { totalStudyMinutes: 660 } })
    const res = calculateGoalProgress({ goal_type: 'hours', target_value: 10 }, report)
    expect(res.current).toBeCloseTo(11, 10)
    expect(res.pct).toBe(100)
    expect(res.status).toBe('completed')
  })

  it('zero hours gives zero progress', () => {
    const res = calculateGoalProgress({ goal_type: 'hours', target_value: 10 }, makeReport())
    expect(res.current).toBe(0)
    expect(res.pct).toBe(0)
    expect(res.status).toBe('active')
  })

  it('in-progress hours goal reports nextMilestone', () => {
    const report = makeReport({ analytics: { totalStudyMinutes: 300 } })
    const res = calculateGoalProgress({ goal_type: 'hours', target_value: 10 }, report)
    expect(res.current).toBeCloseTo(5, 10)
    expect(res.pct).toBe(50)
    expect(res.status).toBe('active')
    expect(res.nextMilestone).toBe(8)
  })
})

describe('questions-type goals', () => {
  it('in-progress', () => {
    const report = makeReport({ analytics: { totalQuestions: 150 } })
    const res = calculateGoalProgress({ goal_type: 'questions', target_value: 300 }, report)
    expect(res.current).toBe(150)
    expect(res.pct).toBe(50)
    expect(res.status).toBe('active')
    expect(res.nextMilestone).toBe(225)
  })

  it('active transitions to completed at the target', () => {
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 300 },
      makeReport({ analytics: { totalQuestions: 300 } }),
    )
    expect(res.current).toBe(300)
    expect(res.pct).toBe(100)
    expect(res.status).toBe('completed')
  })

  it('past the target pct is capped at 100', () => {
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 300 },
      makeReport({ analytics: { totalQuestions: 400 } }),
    )
    expect(res.current).toBe(400)
    expect(res.pct).toBe(100)
    expect(res.status).toBe('completed')
  })
})

describe('other goal_type variants', () => {
  it('blocks uses totalBlocks', () => {
    const res = calculateGoalProgress(
      { goal_type: 'blocks', target_value: 20 },
      makeReport({ analytics: { totalBlocks: 12 } }),
    )
    expect(res.current).toBe(12)
    expect(res.pct).toBe(60)
    expect(res.status).toBe('active')
  })

  it('topics prefers totalMrcpMastered when nonzero', () => {
    const res = calculateGoalProgress(
      { goal_type: 'topics', target_value: 8 },
      makeReport({ analytics: { totalMrcpMastered: 4, totalMrcpTopics: 10 } }),
    )
    expect(res.current).toBe(4)
    expect(res.pct).toBe(50)
  })

  it('topics falls back to totalMrcpTopics when mastered is 0', () => {
    const res = calculateGoalProgress(
      { goal_type: 'topics', target_value: 10 },
      makeReport({ analytics: { totalMrcpMastered: 0, totalMrcpTopics: 5 } }),
    )
    expect(res.current).toBe(5)
    expect(res.pct).toBe(50)
  })

  it('topics completes at the target', () => {
    const res = calculateGoalProgress(
      { goal_type: 'topics', target_value: 8 },
      makeReport({ analytics: { totalMrcpMastered: 8, totalMrcpTopics: 10 } }),
    )
    expect(res.status).toBe('completed')
  })

  it('cases uses totalCases', () => {
    const res = calculateGoalProgress(
      { goal_type: 'cases', target_value: 12 },
      makeReport({ analytics: { totalCases: 6 } }),
    )
    expect(res.current).toBe(6)
    expect(res.pct).toBe(50)
  })

  it('streak uses currentStreak', () => {
    const res = calculateGoalProgress(
      { goal_type: 'streak', target_value: 10 },
      makeReport({ analytics: { currentStreak: 9 } }),
    )
    expect(res.current).toBe(9)
    expect(res.pct).toBe(90)
    expect(res.status).toBe('active')
  })
})

describe('subject_avg-type goals', () => {
  const subjects = { rankings: [{ subject: 'Cardio', avgScore: 85 }] }

  it('current is the subject ranking avgScore', () => {
    const res = calculateGoalProgress(
      { goal_type: 'subject_avg', subject_id: 'Cardio', target_value: 90 },
      makeReport({ subjects }),
    )
    expect(res.current).toBe(85)
    expect(res.pct).toBe(94)
    expect(res.status).toBe('active')
  })

  it('completes when the ranking reaches the target', () => {
    const res = calculateGoalProgress(
      { goal_type: 'subject_avg', subject_id: 'Cardio', target_value: 85 },
      makeReport({ subjects }),
    )
    expect(res.pct).toBe(100)
    expect(res.status).toBe('completed')
  })

  it('preserves one-decimal precision', () => {
    const res = calculateGoalProgress(
      { goal_type: 'subject_avg', subject_id: 'Cardio', target_value: 100 },
      makeReport({ subjects: { rankings: [{ subject: 'Cardio', avgScore: 85.5 }] } }),
    )
    expect(res.current).toBe(85.5)
  })

  it('missing ranking gives zero progress', () => {
    const res = calculateGoalProgress(
      { goal_type: 'subject_avg', subject_id: 'Neuro', target_value: 90 },
      makeReport({ subjects }),
    )
    expect(res.current).toBe(0)
    expect(res.pct).toBe(0)
  })
})

describe('performance-type goals', () => {
  it('current is the overallScore', () => {
    const res = calculateGoalProgress(
      { goal_type: 'performance', target_value: 80 },
      makeReport({ performance: { overallScore: 75 } }),
    )
    expect(res.current).toBe(75)
    expect(res.pct).toBe(94)
    expect(res.status).toBe('active')
  })

  it('completes at the target score', () => {
    const res = calculateGoalProgress(
      { goal_type: 'performance', target_value: 80 },
      makeReport({ performance: { overallScore: 80 } }),
    )
    expect(res.status).toBe('completed')
  })
})

describe('expiry / deadline handling', () => {
  it('past deadline with incomplete progress -> expired', () => {
    const report = makeReport({ analytics: { totalQuestions: 50 } })
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 100, deadline: '2020-01-01' },
      report,
    )
    expect(res.status).toBe('expired')
    expect(res.daysRemaining).toBe(0)
  })

  it('future deadline stays active with daysRemaining > 0', () => {
    const deadline = new Date(Date.now() + 31 * 86400000).toISOString()
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 100, deadline },
      makeReport({ analytics: { totalQuestions: 50 } }),
    )
    const expectedRemaining = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000))
    expect(res.status).toBe('active')
    expect(res.daysRemaining).toBe(expectedRemaining)
    expect(res.daysRemaining).toBeGreaterThanOrEqual(30)
  })

  it('completion wins over an expired deadline', () => {
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 100, deadline: '2020-01-01' },
      makeReport({ analytics: { totalQuestions: 150 } }),
    )
    expect(res.pct).toBe(100)
    expect(res.status).toBe('completed')
  })

  it('no deadline -> daysRemaining is null', () => {
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 100 },
      makeReport({ analytics: { totalQuestions: 50 } }),
    )
    expect(res.daysRemaining).toBe(null)
  })
})

describe('estimatedDate / nextMilestone', () => {
  it('estimatedDate is a future Date for in-progress goals with activity', () => {
    const created = new Date(Date.now() - 30 * 86400000).toISOString()
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 60, created_at: created },
      makeReport({ analytics: { totalQuestions: 30 } }),
    )
    expect(res.estimatedDate).toBeInstanceOf(Date)
    expect(res.estimatedDate.getTime()).toBeGreaterThan(Date.now())
    expect(res.nextMilestone).toBe(45)
  })

  it('estimatedDate is null without created_at', () => {
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 60 },
      makeReport({ analytics: { totalQuestions: 30 } }),
    )
    expect(res.estimatedDate).toBe(null)
  })

  it('estimatedDate is null at zero current', () => {
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 60, created_at: '2026-01-01' },
      makeReport(),
    )
    expect(res.estimatedDate).toBe(null)
  })

  it('estimatedDate is null once complete', () => {
    const res = calculateGoalProgress(
      { goal_type: 'questions', target_value: 60, created_at: '2026-01-01' },
      makeReport({ analytics: { totalQuestions: 60 } }),
    )
    expect(res.estimatedDate).toBe(null)
  })

  it('nextMilestone walks up the 25/50/75/100% ladder and is null when done', () => {
    const goal = { goal_type: 'questions', target_value: 100 }
    expect(calculateGoalProgress(goal, makeReport()).nextMilestone).toBe(25)
    expect(calculateGoalProgress(goal, makeReport({ analytics: { totalQuestions: 30 } })).nextMilestone).toBe(50)
    expect(calculateGoalProgress(goal, makeReport({ analytics: { totalQuestions: 55 } })).nextMilestone).toBe(75)
    expect(calculateGoalProgress(goal, makeReport({ analytics: { totalQuestions: 80 } })).nextMilestone).toBe(100)
    expect(calculateGoalProgress(goal, makeReport({ analytics: { totalQuestions: 100 } })).nextMilestone).toBe(null)
  })
})

describe('pct bounds', () => {
  it('pct never exceeds 100', () => {
    for (const [current, target] of [[200, 50], [60, 60], [999, 10]]) {
      const res = calculateGoalProgress(
        { goal_type: 'questions', target_value: target },
        makeReport({ analytics: { totalQuestions: current } }),
      )
      expect(res.pct).toBe(100)
      expect(res.pct).toBeLessThanOrEqual(100)
    }
  })

  it('pct never below 0', () => {
    expect(calculateGoalProgress({ goal_type: 'questions', target_value: 100 }, makeReport()).pct).toBe(0)
    expect(calculateGoalProgress({ goal_type: 'questions', target_value: 0 }, makeReport()).pct).toBe(0)
    expect(calculateGoalProgress({ goal_type: 'questions', target_value: -5 }, makeReport()).pct).toBe(0)
  })
})

describe('edge cases', () => {
  it('zeroed report produces zero progress without throwing', () => {
    const res = calculateGoalProgress({ goal_type: 'questions', target_value: 100 }, makeReport())
    expect(res.current).toBe(0)
    expect(res.pct).toBe(0)
    expect(res.status).toBe('active')
  })

  it('goal with only an id (no goal_type/target_value) does not throw', () => {
    const res = calculateGoalProgress({ id: 'x' }, makeReport())
    expect(res.id).toBe('x')
    expect(res.current).toBe(0)
    expect(res.pct).toBe(0)
    expect(res.status).toBe('active')
    expect(res.daysRemaining).toBe(null)
    expect(res.estimatedDate).toBe(null)
    expect(res.nextMilestone).toBe(null)
  })

  it('unknown goal_type gives zero progress', () => {
    const res = calculateGoalProgress({ goal_type: 'bogus', target_value: 10 }, makeReport())
    expect(res.current).toBe(0)
    expect(res.pct).toBe(0)
  })

  it('null goal throws (matches real behavior)', () => {
    expect(() => calculateGoalProgress(null, makeReport())).toThrow()
  })
})

describe('label helpers', () => {
  it('getGoalTypeLabel maps known types and falls back to the raw value', () => {
    expect(getGoalTypeLabel('questions')).toBe('Questions')
    expect(getGoalTypeLabel('blocks')).toBe('Blocks')
    expect(getGoalTypeLabel('topics')).toBe('Topics')
    expect(getGoalTypeLabel('cases')).toBe('Cases')
    expect(getGoalTypeLabel('hours')).toBe('Hours')
    expect(getGoalTypeLabel('streak')).toBe('Study Streak')
    expect(getGoalTypeLabel('subject_avg')).toBe('Subject Average')
    expect(getGoalTypeLabel('performance')).toBe('Performance Score')
    expect(getGoalTypeLabel('nope')).toBe('nope')
  })

  it('getGoalCategoryLabel maps known categories and falls back', () => {
    expect(getGoalCategoryLabel('daily')).toBe('Daily')
    expect(getGoalCategoryLabel('weekly')).toBe('Weekly')
    expect(getGoalCategoryLabel('long_term')).toBe('Long-Term')
    expect(getGoalCategoryLabel('nope')).toBe('nope')
  })
})
