import { describe, it, expect } from 'vitest'
import { generate } from '../PerformanceEngine.js'

const SCORE_WEIGHTS = {
  averageScore: 0.4,
  consistency: 0.2,
  improvementTrend: 0.2,
  studyFrequency: 0.1,
  completionRate: 0.1,
}

const TIER_BY_MAX = [
  { max: 39, label: 'Beginning', color: 'var(--red)' },
  { max: 59, label: 'Developing', color: 'var(--amber)' },
  { max: 74, label: 'Progressing', color: 'var(--blue)' },
  { max: 89, label: 'Exam Ready', color: 'var(--indigo)' },
  { max: 100, label: 'Outstanding', color: 'var(--emerald)' },
]

function tierFor(score) {
  return TIER_BY_MAX.find(t => score <= t.max) || TIER_BY_MAX[TIER_BY_MAX.length - 1]
}

const OLD_DATE = '2020-01-01'

function block(pct, date) {
  return { total_questions: 100, correct: pct, created_at: date }
}

function daysAgo(k) {
  return new Date(Date.now() - k * 86400000).toISOString().split('T')[0]
}

// 30 distinct recent days (offsets 0..29, all guaranteed inside the 30-day
// window even across a DST transition) plus 13 extra same-day entries ->
// consistency reaches its 100 cap and frequency reaches its 100 cap.
function recentActivity() {
  const entries = []
  for (let k = 0; k < 30; k++) entries.push({ created_at: daysAgo(k), module: 'UWorld' })
  for (let i = 0; i < 13; i++) entries.push({ created_at: daysAgo(0), module: 'UWorld' })
  return entries
}

// Mirrors the engine's exact weighted-sum expression (same operand order) so
// the floating point result is bit-identical.
function expectedOverall(avg, consistency, trend, frequency, completion) {
  return Math.round(
    avg * SCORE_WEIGHTS.averageScore +
      consistency * SCORE_WEIGHTS.consistency +
      trend * SCORE_WEIGHTS.improvementTrend +
      frequency * SCORE_WEIGHTS.studyFrequency +
      completion * SCORE_WEIGHTS.completionRate,
  )
}

function isoDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const tierCases = [
  { name: 'minimum reachable score (0%) is Beginning', pct: 0, c: 0, f: 0, expected: 10, tier: 'Beginning' },
  { name: 'score 39 stays Beginning', pct: 58, c: 0, f: 0, expected: 39, tier: 'Beginning' },
  { name: 'score 40 crosses into Developing', pct: 59, c: 0, f: 0, expected: 40, tier: 'Developing' },
  { name: 'score 60 crosses into Progressing', pct: 100, c: 0, f: 0, expected: 60, tier: 'Progressing' },
  { name: 'score 59 stays Developing', pct: 38, c: 100, f: 100, expected: 59, tier: 'Developing' },
  { name: 'score 60 crosses into Progressing', pct: 39, c: 100, f: 100, expected: 60, tier: 'Progressing' },
  { name: 'score 74 stays Progressing', pct: 68, c: 100, f: 100, expected: 74, tier: 'Progressing' },
  { name: 'score 75 crosses into Exam Ready', pct: 69, c: 100, f: 100, expected: 75, tier: 'Exam Ready' },
  { name: 'score 89 stays Exam Ready', pct: 98, c: 100, f: 100, expected: 89, tier: 'Exam Ready' },
  { name: 'score 90 crosses into Outstanding (max reachable)', pct: 99, c: 100, f: 100, expected: 90, tier: 'Outstanding' },
]

describe('readiness tier boundaries', () => {
  it.each(tierCases)('$name', ({ pct, c, f, expected, tier }) => {
    const activity = c === 0 ? [] : recentActivity()
    const report = generate({ uworld: [block(pct, OLD_DATE)], activity })

    expect(report.performance.breakdown.map(b => b.score)).toEqual([pct, c, 50, f, pct])
    expect(report.performance.breakdown.map(b => b.weight)).toEqual([0.4, 0.2, 0.2, 0.1, 0.1])

    const computed = expectedOverall(pct, c, 50, f, pct)
    expect(computed).toBe(expected)
    expect(report.performance.overallScore).toBe(expected)
    expect(report.readiness.score).toBe(report.performance.overallScore)
    expect(report.readiness.tier).toBe(tier)
    expect(report.readiness.color).toBe(tierFor(expected).color)
  })
})

describe('analytics', () => {
  it('totalStudyMinutes sums ONLY uworld block time_minutes', () => {
    const report = generate({
      uworld: [
        { total_questions: 40, correct: 30, time_minutes: 40, created_at: '2026-03-02' },
        { total_questions: 40, correct: 25, time_minutes: 60, created_at: '2026-03-02' },
        { total_questions: 40, correct: 35, time_minutes: 25, created_at: '2026-03-09' },
      ],
      mrcp: [
        { status: 'Mastered', created_at: '2026-03-02', minutes: 90, duration: 120, time_minutes: 90 },
        { status: 'Not Started', created_at: '2026-03-09', minutes: 30, duration: 60, time_minutes: 30 },
      ],
      board: [{ created_at: '2026-03-02', minutes: 120, duration: 240, time_minutes: 120 }],
      activity: [{ created_at: '2026-03-02', module: 'UWorld', minutes: 200, duration: 300, time_minutes: 200 }],
    })

    expect(report.analytics.totalStudyMinutes).toBe(125)
    expect(report.analytics.studyMinutesByModule).toEqual({ UWorld: 125 })
    expect(report.analytics.totalBlocks).toBe(3)
    expect(report.analytics.totalQuestions).toBe(120)
    expect(report.analytics.totalCorrect).toBe(90)
    expect(report.analytics.totalCases).toBe(1)
    expect(report.analytics.totalMrcpTopics).toBe(2)
    expect(report.analytics.totalMrcpMastered).toBe(1)
  })

  it('hours-type goal current is totalStudyMinutes / 60', () => {
    const report = generate({
      uworld: [
        { total_questions: 40, correct: 30, time_minutes: 40, created_at: '2026-03-02' },
        { total_questions: 40, correct: 25, time_minutes: 60, created_at: '2026-03-02' },
        { total_questions: 40, correct: 35, time_minutes: 25, created_at: '2026-03-09' },
      ],
      goals: [{ goal_type: 'hours', target_value: 10, id: 'g1' }],
    })

    expect(report.analytics.totalStudyMinutes).toBe(125)
    expect(report.goals[0].current).toBeCloseTo(125 / 60, 10)
    expect(report.goals[0].pct).toBe(21)
    expect(report.goals[0].status).toBe('active')
  })
})

describe('charts', () => {
  it('trendData groups blocks by week and sorts ascending', () => {
    const report = generate({
      uworld: [
        block(50, '2026-03-02'),
        block(70, '2026-03-02'),
        block(90, '2026-03-09'),
      ],
    })

    expect(report.charts.trendData.map(d => d.week)).toEqual(['2026-W10', '2026-W11'])
    expect(report.charts.trendData).toEqual([
      { week: '2026-W10', avgScore: 60, blocks: 2 },
      { week: '2026-W11', avgScore: 90, blocks: 1 },
    ])
  })

  it('subjectDistribution percentages sum to ~100 and map per-subject avgScore', () => {
    const report = generate({
      uworld: [
        { subject_id: 'cardio', total_questions: 60, correct: 54, created_at: '2026-03-02' },
        { subject_id: 'neuro', total_questions: 20, correct: 10, created_at: '2026-03-02' },
        { subject_id: 'pulm', total_questions: 40, correct: 28, created_at: '2026-03-09' },
      ],
    })

    const dist = report.charts.subjectDistribution
    expect(dist.map(d => d.subject)).toEqual(['cardio', 'pulm', 'neuro'])
    expect(dist.map(d => d.questions)).toEqual([60, 40, 20])
    expect(dist.map(d => d.percentage)).toEqual([50, 33, 17])
    expect(dist.reduce((s, d) => s + d.percentage, 0)).toBeGreaterThanOrEqual(98)
    expect(dist.reduce((s, d) => s + d.percentage, 0)).toBeLessThanOrEqual(102)

    const rankings = report.subjects.rankings
    expect(rankings.map(r => [r.subject, r.avgScore, r.questions])).toEqual([
      ['cardio', 90, 60],
      ['pulm', 70, 40],
      ['neuro', 50, 20],
    ])
    expect(report.subjects.strongest).toEqual(rankings)
    expect(report.subjects.weakest.map(r => r.subject)).toEqual(['neuro', 'pulm', 'cardio'])
  })

  it('weeklyActivity combines questions/cases/topics but minutes only from UWorld', () => {
    const report = generate({
      uworld: [
        { total_questions: 40, time_minutes: 60, created_at: '2026-03-02' },
        { total_questions: 30, time_minutes: 45, created_at: '2026-03-09' },
      ],
      board: [{ created_at: '2026-03-02' }, { created_at: '2026-03-02' }],
      mrcp: [{ created_at: '2026-03-02' }, { created_at: '2026-03-09' }, { created_at: '2026-03-09' }],
    })

    expect(report.charts.weeklyActivity).toEqual([
      { week: '2026-W10', questions: 40, cases: 2, topics: 1, minutes: 60 },
      { week: '2026-W11', questions: 30, cases: 0, topics: 2, minutes: 45 },
    ])
  })

  it('studyTime series uses UWorld minutes only', () => {
    const report = generate({
      uworld: [
        { total_questions: 40, time_minutes: 60, created_at: '2026-03-02' },
        { total_questions: 30, time_minutes: 45, created_at: '2026-03-09' },
      ],
      board: [{ created_at: '2026-03-02', time_minutes: 120 }],
    })

    expect(report.charts.studyTime).toEqual([
      { week: '2026-W10', minutes: 60 },
      { week: '2026-W11', minutes: 45 },
    ])
  })

  it('dailyActivity maps events to date/level with real value fields', () => {
    const report = generate({
      uworld: [{ total_questions: 40, correct: 30, time_minutes: 60, created_at: '2026-03-02T08:00:00.000Z' }],
      mrcp: [{ status: 'Mastered', created_at: '2026-03-03T09:00:00.000Z' }],
      board: [{ created_at: '2026-03-03T10:00:00.000Z' }],
      activity: [{ created_at: '2026-03-03T11:00:00.000Z', module: 'MRCP' }],
    })

    expect(report.charts.dailyActivity).toEqual([
      {
        date: '2026-03-02',
        questions: 40,
        topics: 0,
        cases: 0,
        minutes: 60,
        modules: ['UWorld'],
        count: 1,
        level: 1,
      },
      {
        date: '2026-03-03',
        questions: 0,
        topics: 1,
        cases: 1,
        minutes: 0,
        modules: ['MRCP', 'Local Board'],
        count: 3,
        level: 3,
      },
    ])
  })

  it('monthlyStats counts distinct current-month days only', () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const prevYear = month === 0 ? year - 1 : year
    const prevMonth = month === 0 ? 11 : month - 1

    const report = generate({
      uworld: [{ total_questions: 40, correct: 30, time_minutes: 30, created_at: isoDate(year, month, 1) }],
      activity: [
        { created_at: isoDate(year, month, 1), module: 'UWorld' },
        { created_at: isoDate(year, month, 10), module: 'MRCP' },
        { created_at: isoDate(prevYear, prevMonth, 15), module: 'UWorld' },
      ],
    })

    const seen = new Set()
    for (const s of [isoDate(year, month, 1), isoDate(year, month, 1), isoDate(year, month, 10), isoDate(prevYear, prevMonth, 15)]) {
      const d = new Date(s)
      if (d.getFullYear() === year && d.getMonth() === month) seen.add(d.toISOString().split('T')[0])
    }
    const expectedDays = seen.size
    const dayOfMonth = now.getDate()
    const expectedPct = Math.round((expectedDays / Math.max(1, dayOfMonth)) * 100)

    expect(report.charts.monthlyStats.daysThisMonth).toBe(expectedDays)
    expect(report.charts.monthlyStats.monthTotal).toBe(Math.max(1, dayOfMonth))
    expect(report.charts.monthlyStats.completionPct).toBe(expectedPct)
    expect(report.charts.monthlyStats.daysThisMonth).toBeGreaterThan(0)
  })
})

describe('empty inputs', () => {
  it('generate() with no data returns an empty report without throwing', () => {
    const report = generate()

    expect(report.analytics).toMatchObject({
      totalBlocks: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      totalCases: 0,
      totalMrcpTopics: 0,
      totalMrcpMastered: 0,
      daysStudied: 0,
      currentStreak: 0,
      longestStreak: 0,
      weeksActive: 0,
      totalStudyMinutes: 0,
    })
    expect(report.analytics.studyMinutesByModule).toEqual({})
    expect(report.performance.overallScore).toBe(10)
    expect(report.readiness.score).toBe(10)
    expect(report.readiness.tier).toBe('Beginning')
    expect(report.charts.trendData).toEqual([])
    expect(report.charts.subjectDistribution).toEqual([])
    expect(report.charts.weeklyActivity).toEqual([])
    expect(report.charts.studyTime).toEqual([])
    expect(report.charts.dailyActivity).toEqual([])
    expect(report.charts.monthlyStats.daysThisMonth).toBe(0)
    expect(report.recommendations.some(r => r.action === 'first_block')).toBe(true)
    expect(report.activity).toEqual({ recent: [], totalEntries: 0 })
    expect(report.goals).toEqual([])
  })

  it('generate({}) behaves the same as generate()', () => {
    expect(() => generate({})).not.toThrow()
    expect(generate({}).analytics.totalStudyMinutes).toBe(0)
  })
})

describe('weighted performance score', () => {
  it('overall score is the weighted sum of the five components', () => {
    const report = generate({
      uworld: [
        block(50, '2020-01-01'),
        block(50, '2020-01-02'),
        block(50, '2020-01-03'),
        block(80, '2020-02-01'),
        block(80, '2020-02-02'),
        block(80, '2020-02-03'),
      ],
    })

    const breakdown = report.performance.breakdown
    const scores = breakdown.map(b => b.score)
    expect(scores).toEqual([65, 0, 80, 0, 65])
    expect(breakdown.map(b => b.label)).toEqual([
      'Average Score',
      'Consistency',
      'Improvement Trend',
      'Study Frequency',
      'Completion Rate',
    ])
    expect(breakdown.map(b => b.weight)).toEqual([0.4, 0.2, 0.2, 0.1, 0.1])

    const total = scores[0] * 0.4 + scores[1] * 0.2 + scores[2] * 0.2 + scores[3] * 0.1 + scores[4] * 0.1
    expect(report.performance.total).toBeCloseTo(total, 10)
    expect(report.performance.overallScore).toBe(Math.round(total))
    expect(report.performance.overallScore).toBe(49)
    expect(report.readiness.score).toBe(report.performance.overallScore)
  })
})
