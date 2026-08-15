// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TrendLineChart from '../TrendLineChart'
import SubjectBarChart from '../SubjectBarChart'
import ActivityBarChart from '../ActivityBarChart'
import DistributionDoughnut from '../DistributionDoughnut'
import DailyStatsBar from '../DailyStatsBar'
import ChartCard from '../ChartCard'
import CalendarHeatmap from '../CalendarHeatmap'

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const longDate = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

describe('chart accessibility labels', () => {
  it('TrendLineChart exposes a descriptive accessible name and hides itself when empty', () => {
    const { rerender } = render(
      <TrendLineChart data={[{ week: 'W1', avgScore: 70 }, { week: 'W2', avgScore: 85 }]} />
    )
    expect(screen.getByRole('img', { name: 'Score by week: W1 70%, W2 85%. Overall: 70% to 85%' })).toBeInTheDocument()

    rerender(<TrendLineChart data={[]} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('SubjectBarChart lists subjects sorted by average score with question counts', () => {
    render(
      <SubjectBarChart
        data={[
          { subject: 'cardiology', avgScore: 80, questions: 100 },
          { subject: 'respiratory', avgScore: 60, questions: 50 },
        ]}
      />
    )
    expect(screen.getByRole('img', {
      name: 'Cardiology: 80% average across 100 questions, Respiratory: 60% average across 50 questions',
    })).toBeInTheDocument()
  })

  it('ActivityBarChart describes each week’s questions, cases and topics', () => {
    render(
      <ActivityBarChart
        data={[
          { week: 1, questions: 10, cases: 2, topics: 3 },
          { week: 2, questions: 15, cases: 4, topics: 6 },
        ]}
      />
    )
    expect(screen.getByRole('img', {
      name: 'Week 1: 10 questions, 2 cases, 3 topics, Week 2: 15 questions, 4 cases, 6 topics',
    })).toBeInTheDocument()
  })

  it('DistributionDoughnut describes subject share of questions', () => {
    render(
      <DistributionDoughnut
        data={[
          { subject: 'cardiology', percentage: 60, questions: 60 },
          { subject: 'respiratory', percentage: 40, questions: 40 },
        ]}
      />
    )
    expect(screen.getByRole('img', {
      name: 'Cardiology: 60% of questions (60 questions), Respiratory: 40% of questions (40 questions)',
    })).toBeInTheDocument()
  })

  it('DailyStatsBar exposes its stat group with a labelled region', () => {
    render(
      <DailyStatsBar
        analytics={{ currentStreak: 5, longestStreak: 7 }}
        monthlyStats={{ daysThisMonth: 10, monthTotal: 20, completionPct: 50 }}
      />
    )
    const group = screen.getByRole('group', { name: 'Daily study stats' })
    expect(group).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('Monthly Completion')).toBeInTheDocument()
  })
})

describe('ChartCard', () => {
  it('renders an img role with title and summary when it has content', () => {
    render(
      <ChartCard title="Weekly Trend" summary="Scores improved 4% this month">
        <span>chart body</span>
      </ChartCard>
    )
    expect(screen.getByRole('img', { name: 'Weekly Trend. Scores improved 4% this month' })).toBeInTheDocument()
    expect(screen.getByText('chart body')).toBeInTheDocument()
  })

  it('falls back to just the title when no summary is provided', () => {
    render(
      <ChartCard title="Weekly Trend">
        <span>chart body</span>
      </ChartCard>
    )
    expect(screen.getByRole('img', { name: 'Weekly Trend' })).toBeInTheDocument()
  })

  it('renders the empty state without an img role when empty', () => {
    render(<ChartCard title="Weekly Trend" isEmpty emptyMessage="No trend data yet." />)
    expect(screen.getByText('No trend data yet.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('CalendarHeatmap', () => {
  const year = new Date().getFullYear()

  it('shows a prompt when there is no activity data', () => {
    render(<CalendarHeatmap data={[]} />)
    expect(screen.getByText(/Complete your first UWorld block/)).toBeInTheDocument()
    expect(screen.queryByTestId('heatmap-day-active')).not.toBeInTheDocument()
  })

  it('labels active days accessibly and keeps empty cells decorative', () => {
    const date1 = `${year}-08-01`
    const date2 = `${year}-08-02`
    render(
      <CalendarHeatmap
        data={[
          { date: date1, questions: 10, minutes: 20, topics: 2, cases: 1, count: 4, level: 3 },
          { date: date2, questions: 5, minutes: 45, topics: 1, cases: 0, count: 2, level: 2 },
        ]}
      />
    )
    const active = screen.getAllByTestId('heatmap-day-active')
    expect(active).toHaveLength(2)
    expect(active[0]).toHaveAttribute('aria-label', `${longDate(date1)}: 10 questions, 20 minutes, 2 topics, 1 case`)
    expect(active[1]).toHaveAttribute('aria-label', `${longDate(date2)}: 5 questions, 45 minutes, 1 topic`)

    const empty = screen.getAllByTestId('heatmap-day-empty')
    expect(empty.length).toBeGreaterThan(0)
    expect(empty[0]).toHaveAttribute('aria-hidden', 'true')

    expect(screen.getByText('Activity calendar: 2 active days this year.')).toBeInTheDocument()
  })

  it('shows a tooltip when an active day receives focus', () => {
    const date = `${year}-08-01`
    render(
      <CalendarHeatmap
        data={[{ date, questions: 10, minutes: 20, topics: 2, cases: 1, count: 4, level: 3 }]}
      />
    )
    const cell = screen.getAllByTestId('heatmap-day-active')[0]
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(cell)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})
