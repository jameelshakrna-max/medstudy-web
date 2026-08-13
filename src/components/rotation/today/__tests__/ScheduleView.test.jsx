// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScheduleView from '../ScheduleView'

vi.mock('../ScheduleView.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

const TOPICS = new Map([
  ['topic-1', { id: 'topic-1', topicTitle: 'Stable Angina Pectoris', normalizedTopicId: 'amboss::cardiology.stable-angina' }],
  ['topic-2', { id: 'topic-2', topicTitle: 'Heart Failure', normalizedTopicId: 'amboss::cardiology.heart-failure' }],
])

const TODAY = '2026-07-24'
const SOURCE_TITLE = 'Step-Up to Medicine'

const learningTask = {
  id: 'task-1',
  planTopicId: 'topic-1',
  taskDate: TODAY,
  taskType: 'learning',
  status: 'in_progress',
  estimatedMinutes: 45,
  completedCount: 0,
  targetCount: 0,
  incorrectCount: 0,
  displayOrder: 0,
}

const uworldTask = {
  id: 'task-2',
  planTopicId: 'topic-2',
  taskDate: TODAY,
  taskType: 'uworld_questions',
  status: 'pending',
  estimatedMinutes: 60,
  completedCount: 12,
  targetCount: 40,
  incorrectCount: 0,
  displayOrder: 1,
}

const completedTask = {
  id: 'task-3',
  planTopicId: 'topic-1',
  taskDate: '2026-07-23',
  taskType: 'learning',
  status: 'completed',
  estimatedMinutes: 30,
  completedCount: 0,
  targetCount: 0,
  incorrectCount: 0,
  displayOrder: 0,
}

const overdueTask = {
  id: 'task-4',
  planTopicId: 'topic-2',
  taskDate: '2026-07-22',
  taskType: 'learning',
  status: 'pending',
  estimatedMinutes: 20,
  completedCount: 0,
  targetCount: 0,
  incorrectCount: 0,
  displayOrder: 0,
}

function availabilityForWeekday(weekday, { availableMinutes = 120, isDayOff = false } = {}) {
  return Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    availableMinutes: i === weekday ? availableMinutes : 120,
    isDayOff: i === weekday ? isDayOff : false,
  }))
}

describe('ScheduleView', () => {
  it('renders week strip with day names', () => {
    render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
  })

  it('renders selected day agenda title', () => {
    render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText(/Friday/)).toBeInTheDocument()
  })

  it('shows TODAY badge for today', () => {
    render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText('TODAY')).toBeInTheDocument()
  })

  it('shows empty message when no tasks', () => {
    render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText(/Nothing scheduled/)).toBeInTheDocument()
  })

  it('renders tasks for selected day', () => {
    render(<ScheduleView tasks={[learningTask, uworldTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText('Stable Angina Pectoris')).toBeInTheDocument()
    expect(screen.getByText('Heart Failure')).toBeInTheDocument()
  })

  it('shows topic titles, not technical IDs', () => {
    render(<ScheduleView tasks={[learningTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText('Stable Angina Pectoris')).toBeInTheDocument()
    expect(screen.queryByText('amboss::cardiology.stable-angina')).not.toBeInTheDocument()
    expect(screen.queryByText('amboss')).not.toBeInTheDocument()
    expect(screen.queryByText('cardiology')).not.toBeInTheDocument()
  })

  it('never renders normalizedTopicId slugs', () => {
    render(<ScheduleView tasks={[learningTask, uworldTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.queryByText(/amboss::/)).not.toBeInTheDocument()
    expect(screen.queryByText(/stable-angina/)).not.toBeInTheDocument()
    expect(screen.queryByText(/heart-failure/)).not.toBeInTheDocument()
  })

  it('shows sourceTitle when provided', () => {
    render(<ScheduleView tasks={[learningTask]} topicsById={TOPICS} todayKey={TODAY} sourceTitle={SOURCE_TITLE} />)
    expect(screen.getByText(SOURCE_TITLE)).toBeInTheDocument()
  })

  it('does not show sourceTitle when not provided', () => {
    render(<ScheduleView tasks={[learningTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.queryByText(SOURCE_TITLE)).not.toBeInTheDocument()
  })

  it('shows learning workload as minutes', () => {
    render(<ScheduleView tasks={[learningTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText('45m')).toBeInTheDocument()
  })

  it('shows UWorld workload as question counts', () => {
    render(<ScheduleView tasks={[uworldTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText('12 / 40 questions')).toBeInTheDocument()
  })

  it('shows type-aware summary: learning tasks with minutes', () => {
    render(<ScheduleView tasks={[learningTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText(/1 learning task · 45m/)).toBeInTheDocument()
  })

  it('shows type-aware summary: UWorld tasks with questions', () => {
    render(<ScheduleView tasks={[uworldTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText(/1 UWorld task · 40 questions/)).toBeInTheDocument()
  })

  it('shows type-aware summary: mixed learning and question tasks', () => {
    render(<ScheduleView tasks={[learningTask, uworldTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText(/1 learning task · 45m/)).toBeInTheDocument()
    expect(screen.getByText(/1 UWorld task · 40 questions/)).toBeInTheDocument()
  })

  it('shows In Progress status for in_progress tasks', () => {
    render(<ScheduleView tasks={[learningTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('shows Pending status for pending tasks', () => {
    render(<ScheduleView tasks={[uworldTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows Completed status for completed tasks on past dates', () => {
    render(<ScheduleView tasks={[completedTask]} topicsById={TOPICS} todayKey={TODAY} />)
    fireEvent.click(screen.getByText('23'))
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('shows Overdue for past unfinished tasks', () => {
    render(<ScheduleView tasks={[overdueTask]} topicsById={TOPICS} todayKey={TODAY} />)
    fireEvent.click(screen.getByText('22'))
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('does not show Overdue for completed past tasks', () => {
    render(<ScheduleView tasks={[completedTask]} topicsById={TOPICS} todayKey={TODAY} />)
    fireEvent.click(screen.getByText('23'))
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
  })

  it('does not render action buttons', () => {
    render(<ScheduleView tasks={[learningTask]} topicsById={TOPICS} todayKey={TODAY} />)
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
    expect(screen.queryByText('Skip')).not.toBeInTheDocument()
  })

  it('navigates to previous week', () => {
    render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
    const prevBtn = screen.getByLabelText('Previous week')
    fireEvent.click(prevBtn)
    expect(screen.getByText(/Jul 13/)).toBeInTheDocument()
  })

  it('navigates to next week', () => {
    render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
    const nextBtn = screen.getByLabelText('Next week')
    fireEvent.click(nextBtn)
    expect(screen.getByText(/Jul 27/)).toBeInTheDocument()
  })

  it('Today button returns to current week', () => {
    render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
    const nextBtn = screen.getByLabelText('Next week')
    fireEvent.click(nextBtn)
    fireEvent.click(screen.getByText('Today'))
    expect(screen.getByText(/Jul 20/)).toBeInTheDocument()
  })

  describe('external todayKey re-sync', () => {
    it('rebases the current week when today moves within the same week', () => {
      const { rerender } = render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
      expect(screen.getByText(/Jul 20/)).toBeInTheDocument()
      expect(screen.getByText('TODAY')).toBeInTheDocument()

      rerender(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey="2026-07-25" />)
      expect(screen.getByText(/Jul 20/)).toBeInTheDocument()
      expect(screen.getByText('TODAY')).toBeInTheDocument()
    })

    it('does not move the user off a different week when today changes', () => {
      const { rerender } = render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
      fireEvent.click(screen.getByLabelText('Next week'))
      expect(screen.getByText(/Jul 27/)).toBeInTheDocument()

      rerender(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey="2026-07-25" />)
      expect(screen.getByText(/Jul 27/)).toBeInTheDocument()
      expect(screen.queryByText(/Jul 20/)).not.toBeInTheDocument()
      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    it('keeps an intentionally selected day when today changes', () => {
      const { rerender } = render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
      fireEvent.click(screen.getByText('22'))
      expect(screen.getByText(/Wednesday, Jul 22/)).toBeInTheDocument()

      rerender(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey="2026-07-25" />)
      expect(screen.getByText(/Wednesday, Jul 22/)).toBeInTheDocument()
    })
  })

  it('renders without topicsById', () => {
    render(<ScheduleView tasks={[learningTask]} topicsById={null} todayKey={TODAY} />)
    expect(screen.getAllByText('Learning').length).toBeGreaterThan(0)
  })

  describe('day-off vs empty day', () => {
    it('shows day-off message when availability isDayOff and no tasks', () => {
      const availability = availabilityForWeekday(5, { isDayOff: true }) // Saturday = day 6, but Fri=5
      // Jul 24 2026 is Friday (day 5)
      const avail = Array.from({ length: 7 }, (_, i) => ({
        weekday: i,
        availableMinutes: i === 5 ? 0 : 120,
        isDayOff: i === 5,
      }))
      render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} availability={avail} />)
      expect(screen.getByText('Day off')).toBeInTheDocument()
      expect(screen.getByText('No study time planned.')).toBeInTheDocument()
    })

    it('shows nothing-scheduled when availability > 0 but no tasks', () => {
      const avail = availabilityForWeekday(5, { availableMinutes: 120, isDayOff: false })
      render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} availability={avail} />)
      expect(screen.getByText(/Nothing scheduled/)).toBeInTheDocument()
      expect(screen.queryByText('Day off')).not.toBeInTheDocument()
    })

    it('shows nothing-scheduled when no availability data', () => {
      render(<ScheduleView tasks={[]} topicsById={TOPICS} todayKey={TODAY} />)
      expect(screen.getByText(/Nothing scheduled/)).toBeInTheDocument()
      expect(screen.queryByText('Day off')).not.toBeInTheDocument()
    })
  })
})
