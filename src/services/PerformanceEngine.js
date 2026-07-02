/*
 * ═══════════════════════════════════════════════════════════════════
 *  PerformanceEngine
 *
 *  Pipeline:
 *    User Input → Database → loadData() → PerformanceEngine
 *    └─────────── Performance Report ─────────→ UI
 *
 *  Pure data transformation — never touches the database.
 *  Receives raw data, returns a structured report.
 * ═══════════════════════════════════════════════════════════════════
 */

const READINESS_TIERS = [
  { max: 39, label: 'Beginning', color: 'var(--red)' },
  { max: 59, label: 'Developing', color: 'var(--amber)' },
  { max: 74, label: 'Progressing', color: 'var(--blue)' },
  { max: 89, label: 'Exam Ready', color: 'var(--indigo)' },
  { max: 100, label: 'Outstanding', color: 'var(--emerald)' },
]

const SCORE_WEIGHTS = {
  averageScore: 0.4,
  consistency: 0.2,
  improvementTrend: 0.2,
  studyFrequency: 0.1,
  completionRate: 0.1,
}

export function generate({ uworld = [], mrcp = [], board = [], activity = [] } = {}) {
  const engine = new PerformanceEngine({ uworld, mrcp, board, activity })
  return engine.report()
}

class PerformanceEngine {
  constructor(data) {
    this.uworld = data.uworld
    this.mrcp = data.mrcp
    this.board = data.board
    this.activity = data.activity
  }

  report() {
    return {
      performance: this.#performance(),
      readiness: this.#readiness(),
      analytics: this.#analytics(),
      subjects: this.#subjects(),
      recommendations: this.#recommendations(),
      achievements: [],
      activity: this.#activitySummary(),
    }
  }

  /* ── Performance Score ───────────────────────────────────── */

  #performance() {
    const avgScore = this.#averageScore()
    const consistency = this.#consistencyScore()
    const improvementTrend = this.#improvementTrend()
    const studyFrequency = this.#frequencyScore()
    const completionRate = this.#completionRate()

    const total =
      avgScore.score * SCORE_WEIGHTS.averageScore +
      consistency * SCORE_WEIGHTS.consistency +
      improvementTrend.score * SCORE_WEIGHTS.improvementTrend +
      studyFrequency * SCORE_WEIGHTS.studyFrequency +
      completionRate * SCORE_WEIGHTS.completionRate

    return {
      overallScore: Math.round(total),
      breakdown: [
        { label: 'Average Score', score: avgScore.score, max: 100, weight: SCORE_WEIGHTS.averageScore },
        { label: 'Consistency', score: consistency, max: 100, weight: SCORE_WEIGHTS.consistency, detail: avgScore.detail },
        { label: 'Improvement Trend', score: improvementTrend.score, max: 100, weight: SCORE_WEIGHTS.improvementTrend, detail: improvementTrend.detail },
        { label: 'Study Frequency', score: studyFrequency, max: 100, weight: SCORE_WEIGHTS.studyFrequency },
        { label: 'Completion Rate', score: completionRate, max: 100, weight: SCORE_WEIGHTS.completionRate },
      ],
      total,
    }
  }

  #averageScore() {
    const blocks = this.uworld.filter(b => b.total_questions > 0)
    if (!blocks.length) return { score: 0, detail: 'No blocks recorded' }
    const avg = blocks.reduce((s, b) => s + (b.correct / b.total_questions) * 100, 0) / blocks.length
    return { score: Math.round(avg), detail: `${blocks.length} blocks averaged` }
  }

  #consistencyScore() {
    const days = this.#studyDays()
    if (!days.length) return 0
    const totalDays = days.length
    const recent = days.filter(d => this.#isLastNDays(d, 30)).length
    return Math.min(100, Math.round((recent / 30) * 100))
  }

  #improvementTrend() {
    const blocks = [...this.uworld].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    if (blocks.length < 5) return { score: 50, detail: 'Not enough data (need 5+ blocks)' }

    const mid = Math.floor(blocks.length / 2)
    const firstHalf = blocks.slice(0, mid)
    const secondHalf = blocks.slice(mid)

    const avg1 = firstHalf.reduce((s, b) => s + (b.total_questions ? (b.correct / b.total_questions) * 100 : 0), 0) / firstHalf.length
    const avg2 = secondHalf.reduce((s, b) => s + (b.total_questions ? (b.correct / b.total_questions) * 100 : 0), 0) / secondHalf.length

    const diff = avg2 - avg1
    const score = Math.min(100, Math.max(0, 50 + diff))
    return {
      score: Math.round(score),
      detail: `${avg1.toFixed(0)}% → ${avg2.toFixed(0)}% (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)`,
    }
  }

  #frequencyScore() {
    const activity = this.activity.filter(a => {
      const d = new Date(a.created_at)
      return this.#isLastNDays(d, 30)
    })
    const perWeek = activity.length / 4.3
    return Math.min(100, Math.round((perWeek / 10) * 100))
  }

  #completionRate() {
    const blocks = this.uworld.filter(b => b.total_questions > 0)
    if (!blocks.length) return 0
    const total = blocks.reduce((s, b) => s + b.total_questions, 0)
    const correct = blocks.reduce((s, b) => s + b.correct, 0)
    return Math.round((correct / total) * 100)
  }

  /* ── Readiness Score ─────────────────────────────────────── */

  #readiness() {
    const perf = this.#performance()
    const score = perf.overallScore
    const tier = READINESS_TIERS.find(t => score <= t.max) || READINESS_TIERS[READINESS_TIERS.length - 1]
    return {
      score,
      tier: tier.label,
      color: tier.color,
      breakdown: perf.breakdown,
    }
  }

  /* ── Analytics ───────────────────────────────────────────── */

  #analytics() {
    const days = this.#studyDays()
    const sorted = [...days].sort((a, b) => b - a)
    const streak = this.#currentStreak(sorted)
    const longestStreak = this.#longestStreak(sorted)

    return {
      totalBlocks: this.uworld.length,
      totalQuestions: this.uworld.reduce((s, b) => s + (b.total_questions || 0), 0),
      totalCorrect: this.uworld.reduce((s, b) => s + (b.correct || 0), 0),
      totalCases: this.board.length,
      totalMrcpTopics: this.mrcp.length,
      daysStudied: days.length,
      currentStreak: streak,
      longestStreak,
      weeksActive: this.#weeksActive(sorted),
    }
  }

  #studyDays() {
    const dates = new Set()
    for (const b of this.uworld) {
      if (b.created_at) dates.add(b.created_at.split('T')[0])
    }
    for (const a of this.activity) {
      if (a.created_at) dates.add(a.created_at.split('T')[0])
    }
    return [...dates].map(d => new Date(d).getTime())
  }

  #currentStreak(sorted) {
    if (!sorted.length) return 0
    let streak = 1
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const latest = new Date(sorted[0])
    latest.setHours(0, 0, 0, 0)
    const diff = (today - latest) / 86400000
    if (diff > 1) return 0

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1])
      const curr = new Date(sorted[i])
      prev.setHours(0, 0, 0, 0)
      curr.setHours(0, 0, 0, 0)
      if ((prev - curr) / 86400000 <= 1) {
        streak++
      } else {
        break
      }
    }
    return streak
  }

  #longestStreak(sorted) {
    if (!sorted.length) return 0
    let max = 1
    let curr = 1
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1])
      const currDate = new Date(sorted[i])
      prev.setHours(0, 0, 0, 0)
      currDate.setHours(0, 0, 0, 0)
      if ((prev - currDate) / 86400000 <= 1) {
        curr++
        max = Math.max(max, curr)
      } else {
        curr = 1
      }
    }
    return max
  }

  #weeksActive(sorted) {
    if (!sorted.length) return 0
    const weeks = new Set()
    for (const t of sorted) {
      const d = new Date(t)
      const year = d.getFullYear()
      const jan1 = new Date(year, 0, 1)
      const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
      weeks.add(`${year}-W${week}`)
    }
    return weeks.size
  }

  #isLastNDays(date, n) {
    const now = Date.now()
    return (now - date.getTime()) / 86400000 <= n
  }

  /* ── Subject Rankings ────────────────────────────────────── */

  #subjects() {
    const blocks = this.uworld.filter(b => b.subject_id && b.total_questions > 0)
    const bySubject = {}
    for (const b of blocks) {
      if (!bySubject[b.subject_id]) bySubject[b.subject_id] = []
      bySubject[b.subject_id].push(b)
    }

    const entries = Object.entries(bySubject).map(([id, bs]) => {
      const avg = bs.reduce((s, b) => s + (b.correct / b.total_questions) * 100, 0) / bs.length
      return { subject: id, avgScore: Math.round(avg), blocks: bs.length, questions: bs.reduce((s, b) => s + b.total_questions, 0) }
    })

    entries.sort((a, b) => b.avgScore - a.avgScore)

    return {
      rankings: entries,
      strongest: entries.slice(0, 3),
      weakest: [...entries].reverse().slice(0, 3),
    }
  }

  /* ── Recommendations ─────────────────────────────────────── */

  #recommendations() {
    const recs = []
    const subjects = this.#subjects()

    for (const s of subjects.weakest) {
      const confidence = s.blocks >= 3 ? 'high' : 'low'
      recs.push({
        text: `${s.subject} requires review — average is ${s.avgScore}% across ${s.blocks} block${s.blocks > 1 ? 's' : ''}`,
        confidence,
        data: s,
        action: 'review_subject',
      })
    }

    if (this.uworld.length >= 3) {
      const trend = this.#improvementTrend()
      if (trend.score < 40) {
        recs.push({
          text: 'Your recent performance has declined. Consider reviewing foundational topics before attempting new blocks.',
          confidence: 'high',
          data: trend,
          action: 'trend_warning',
        })
      }
    }

    const analytics = this.#analytics()
    if (analytics.currentStreak >= 5) {
      recs.push({
        text: `Maintain your ${analytics.currentStreak}-day study streak! Consistency is your strongest driver of improvement.`,
        confidence: 'high',
        data: { streak: analytics.currentStreak },
        action: 'maintain_streak',
      })
    }

    const staleActivity = this.#staleSubjects()
    for (const s of staleActivity) {
      recs.push({
        text: `${s.subject} has not been studied for ${s.daysSince} day${s.daysSince > 1 ? 's' : ''}. Schedule a review session soon.`,
        confidence: 'medium',
        data: s,
        action: 'stale_review',
      })
    }

    if (analytics.totalBlocks === 0) {
      recs.push({
        text: 'Start by logging your first UWorld question block to begin tracking your progress.',
        confidence: 'high',
        data: null,
        action: 'first_block',
      })
    }

    return recs
  }

  #staleSubjects() {
    const blocks = [...this.uworld].filter(b => b.subject_id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const lastBySubject = {}
    for (const b of blocks) {
      if (!lastBySubject[b.subject_id]) {
        lastBySubject[b.subject_id] = new Date(b.created_at)
      }
    }
    const now = Date.now()
    return Object.entries(lastBySubject)
      .filter(([_, date]) => (now - date.getTime()) / 86400000 > 7)
      .map(([id, date]) => ({
        subject: id,
        daysSince: Math.floor((now - date.getTime()) / 86400000),
      }))
  }

  /* ── Activity Summary ────────────────────────────────────── */

  #activitySummary() {
    const recent = [...this.activity]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)

    return {
      recent,
      totalEntries: this.activity.length,
    }
  }
}
