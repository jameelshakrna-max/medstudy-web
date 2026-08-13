// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ProgressView from '../ProgressView'

vi.mock('../ProgressView.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('recharts', () => ({
  BarChart: ({ children, ...props }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Legend: () => null,
}))

vi.mock('../progressAnalytics', () => ({
  calculateOverallTopicProgress: (topics) => {
    const total = topics.length
    const completed = topics.filter((t) => t.status === 'completed').length
    return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 }
  },
  calculateLearningProgress: (topics) => {
    const total = topics.reduce((s, t) => s + (t.personalizedLearningMinutes || 0), 0)
    return { total, completed: Math.round(total * 0.6), percent: 60, topics: [] }
  },
  calculateUworldProgress: (topics) => {
    const total = topics.reduce((s, t) => s + (t.totalUworldQuestions || 0), 0)
    const completed = topics.reduce((s, t) => s + (t.completedUworldQuestions || 0), 0)
    return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 }
  },
  calculateIncorrectReviewProgress: (tasks) => {
    const generated = tasks.filter((t) => t.taskType === 'uworld_questions').reduce((s, t) => s + (t.incorrectCount || 0), 0)
    const reviewed = tasks.filter((t) => t.taskType === 'incorrect_review').reduce((s, t) => s + (t.completedCount || 0), 0)
    return { generated, reviewed, remaining: Math.max(0, generated - reviewed), percent: generated ? Math.round((reviewed / generated) * 100) : 0 }
  },
  buildScheduledVsLoggedSeries: () => [
    { date: '2026-07-22', scheduled: 60, logged: 45, isPast: true, isToday: false },
    { date: '2026-07-23', scheduled: 90, logged: 90, isPast: true, isToday: false },
    { date: '2026-07-24', scheduled: 45, logged: 0, isPast: true, isToday: false },
    { date: '2026-07-25', scheduled: 120, logged: 60, isPast: false, isToday: true },
    { date: '2026-07-26', scheduled: 30, logged: 0, isPast: false, isToday: false },
  ],
  summarizeTopicStatuses: (topics) => {
    const counts = {}
    for (const t of topics) {
      counts[t.status] = (counts[t.status] || 0) + 1
    }
    return Object.entries(counts)
      .map(([status, count]) => ({
        status,
        count,
        label: status === 'completed' ? 'Completed' : status === 'pending' ? 'Not Started' : status,
      }))
      .sort((a, b) => b.count - a.count)
  },
  findTopicsNeedingAttention: (topics) => {
    return topics
      .filter((t) => (t.incorrectQuestionsRemaining || 0) > 0)
      .map((t) => ({
        topicId: t.id,
        topicTitle: t.topicTitle,
        groupId: t.groupId,
        reasons: [`${t.incorrectQuestionsRemaining} incorrect question${t.incorrectQuestionsRemaining === 1 ? '' : 's'} remaining`],
      }))
  },
  summarizeConfidence: (topics) => {
    const counts = {}
    for (const t of topics) {
      if (t.estimateConfidence) {
        counts[t.estimateConfidence] = (counts[t.estimateConfidence] || 0) + 1
      }
    }
    return Object.entries(counts)
      .map(([confidence, count]) => ({ confidence, count }))
      .sort((a, b) => b.count - a.count)
  },
}))

const mockTopics = [
  { id: 't1', topicTitle: 'Cardiology', groupId: 'g1', status: 'completed', personalizedLearningMinutes: 600, totalUworldQuestions: 40, completedUworldQuestions: 40, incorrectQuestionsRemaining: 0, estimateConfidence: 'high' },
  { id: 't2', topicTitle: 'Neurology', groupId: 'g2', status: 'pending', personalizedLearningMinutes: 400, totalUworldQuestions: 30, completedUworldQuestions: 5, incorrectQuestionsRemaining: 3, estimateConfidence: 'medium' },
]

const mockTasks = [
  { id: 'task1', planTopicId: 't1', taskType: 'learning', taskDate: '2026-07-20', status: 'completed', estimatedMinutes: 30, actualMinutes: 30, completionPercentage: 100, incorrectCount: 0, completedCount: 0 },
  { id: 'task2', planTopicId: 't2', taskType: 'uworld_questions', taskDate: '2026-07-22', status: 'completed', estimatedMinutes: 45, actualMinutes: 50, completionPercentage: 100, incorrectCount: 3, completedCount: 0 },
]

const defaultProps = {
  plan: { id: 'plan-1', sourceTitle: 'Internal Medicine' },
  topics: mockTopics,
  tasks: mockTasks,
  topicsById: { t1: mockTopics[0], t2: mockTopics[1] },
  sourcePace: null,
  todayKey: '2026-07-25',
  forecast: null,
  forecastLoading: false,
  forecastError: null,
}

function renderProgress(overrides = {}) {
  return render(<ProgressView {...defaultProps} {...overrides} />)
}

describe('ProgressView', () => {
  describe('Overall Summary (section A)', () => {
    it('renders the heading', () => {
      renderProgress()
      expect(screen.getByText('Progress')).toBeInTheDocument()
    })

    it('renders the three metric cards', () => {
      renderProgress()
      expect(screen.getByText('Overall')).toBeInTheDocument()
      expect(screen.getByText('Learning')).toBeInTheDocument()
      expect(screen.getByText('UWorld')).toBeInTheDocument()
    })

    it('shows overall percentage', () => {
      renderProgress()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('shows topic count', () => {
      renderProgress()
      expect(screen.getByText('1/2 topics')).toBeInTheDocument()
    })

    it('shows learning progress', () => {
      renderProgress()
      expect(screen.getByText('60%')).toBeInTheDocument()
    })

    it('shows uworld percentage', () => {
      renderProgress()
      const card = screen.getByText('UWorld').closest('.metricCard')
      expect(card.textContent).toMatch(/64/)
    })
  })

  describe('Incorrect Review (section B)', () => {
    it('shows empty state when no incorrect reviews', () => {
      renderProgress({ tasks: [] })
      expect(screen.getByText('No incorrect review required')).toBeInTheDocument()
    })

    it('shows stats when incorrect reviews exist', () => {
      renderProgress()
      const metricLine = document.querySelector('.metricLine')
      expect(metricLine).toBeInTheDocument()
      expect(metricLine.textContent).toMatch(/generated/)
      expect(metricLine.textContent).toMatch(/remain/)
    })
  })

  describe('Scheduled vs Logged (section C)', () => {
    it('renders the chart', () => {
      renderProgress()
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })

    it('shows chart legend', () => {
      renderProgress()
      expect(screen.getByText('Scheduled')).toBeInTheDocument()
      expect(screen.getByText('Logged')).toBeInTheDocument()
    })
  })

  describe('Topic Status Distribution (section D)', () => {
    it('renders status bars', () => {
      renderProgress()
      expect(screen.getByText('Topic Status Distribution')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Not Started')).toBeInTheDocument()
    })

    it('shows counts', () => {
      renderProgress()
      const statusBars = document.querySelectorAll('.statusBar')
      expect(statusBars.length).toBe(2)
      expect(statusBars[0].textContent).toContain('Completed')
      expect(statusBars[0].textContent).toContain('1')
      expect(statusBars[1].textContent).toContain('Not Started')
      expect(statusBars[1].textContent).toContain('1')
    })
  })

  describe('Forecast (section E)', () => {
    it('shows loading state', () => {
      renderProgress({ forecastLoading: true })
      expect(screen.getByText('Loading forecast...')).toBeInTheDocument()
    })

    it('shows error state', () => {
      renderProgress({ forecastError: new Error('fail') })
      expect(screen.getByText('Forecast unavailable')).toBeInTheDocument()
    })

    it('shows empty state when no forecast', () => {
      renderProgress()
      expect(screen.getByText('No forecast data available')).toBeInTheDocument()
    })

    it('shows on_track forecast', () => {
      renderProgress({
        forecast: { status: 'on_track', estimatedCompletionDate: '2026-08-15', remainingRequiredMinutes: 1200, missingCapacityMinutes: 0, requiredExtraMinutesPerDay: 0, unscheduledTopics: 0 },
      })
      expect(screen.getByText('On Track')).toBeInTheDocument()
      expect(screen.getByText('Remaining: 20h')).toBeInTheDocument()
    })

    it('shows at_risk forecast', () => {
      renderProgress({
        forecast: { status: 'at_risk', estimatedCompletionDate: '2026-08-30', remainingRequiredMinutes: 2400, missingCapacityMinutes: 600, requiredExtraMinutesPerDay: 30, unscheduledTopics: 2 },
      })
      expect(screen.getByText('At Risk')).toBeInTheDocument()
      expect(screen.getByText('Missing: 10h capacity')).toBeInTheDocument()
      expect(screen.getByText('Extra: 30m/day needed')).toBeInTheDocument()
      expect(screen.getByText('2 unscheduled topics')).toBeInTheDocument()
    })

    it('shows impossible forecast as "Cannot fit"', () => {
      renderProgress({
        forecast: { status: 'impossible', estimatedCompletionDate: null, remainingRequiredMinutes: 5000, missingCapacityMinutes: 3000, requiredExtraMinutesPerDay: 100, unscheduledTopics: 5 },
      })
      expect(screen.getByText('Cannot fit')).toBeInTheDocument()
      expect(screen.queryByText('Impossible')).not.toBeInTheDocument()
    })

    it('shows singular unscheduled topic', () => {
      renderProgress({
        forecast: { status: 'at_risk', remainingRequiredMinutes: 100, missingCapacityMinutes: 0, requiredExtraMinutesPerDay: 0, unscheduledTopics: 1 },
      })
      expect(screen.getByText('1 unscheduled topic')).toBeInTheDocument()
    })
  })

  describe('Topics Needing Attention (section F)', () => {
    it('shows empty state when no attention topics', () => {
      renderProgress({
        topics: [{ ...mockTopics[0], incorrectQuestionsRemaining: 0 }],
        tasks: [],
      })
      expect(screen.getByText('All topics on track')).toBeInTheDocument()
    })

    it('lists topics with reasons', () => {
      renderProgress()
      expect(screen.getByText('Neurology')).toBeInTheDocument()
      expect(screen.getByText('3 incorrect questions remaining')).toBeInTheDocument()
    })
  })

  describe('Source Pace (section G)', () => {
    it('shows empty state when no source pace', () => {
      renderProgress()
      expect(screen.getByText('Not enough calibration data yet')).toBeInTheDocument()
    })

    it('shows pace details when available', () => {
      renderProgress({
        sourcePace: { paceMultiplier: 1.5, sampleCount: 12, updatedAt: '2026-07-20T10:00:00Z' },
      })
      expect(screen.getByText(/Learning pace: 1.5× base/)).toBeInTheDocument()
      expect(screen.getByText(/Calibration samples: 12/)).toBeInTheDocument()
    })
  })

  describe('Estimate Confidence (section H)', () => {
    it('shows empty state when no confidence data', () => {
      renderProgress({
        topics: [{ ...mockTopics[0], estimateConfidence: null }, { ...mockTopics[1], estimateConfidence: null }],
      })
      expect(screen.getByText('No confidence data available')).toBeInTheDocument()
    })

    it('shows confidence distribution', () => {
      renderProgress()
      expect(screen.getByText('high')).toBeInTheDocument()
      expect(screen.getByText('medium')).toBeInTheDocument()
    })

    it('shows topic counts for confidence', () => {
      renderProgress()
      const confidenceRows = document.querySelectorAll('.confidenceRow')
      expect(confidenceRows.length).toBe(2)
      expect(confidenceRows[0].textContent).toContain('high')
      expect(confidenceRows[0].textContent).toContain('1')
      expect(confidenceRows[1].textContent).toContain('medium')
      expect(confidenceRows[1].textContent).toContain('1')
    })
  })
})
