// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import * as Dialog from '@radix-ui/react-dialog'
import { LayerProvider } from '../../../context/LayerContext'
import CalendarView from '../CalendarView'
import DailyTaskPanel from '../DailyTaskPanel'

vi.mock('../CalendarView.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../today/ScheduleView', () => ({
  default: function MockScheduleView() {
    return <div data-testid="schedule-view">Schedule View</div>
  },
}))

vi.mock('../today/taskActionRules', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    TASK_TYPE_COLORS: {
      learning: 'var(--blue)',
      consolidation: 'var(--blue)',
      uworld_questions: 'var(--emerald)',
      incorrect_review: 'var(--amber, #ffb800)',
      flashcard_review: 'var(--indigo)',
      mixed_review: 'var(--amber, #ffb800)',
      optional_book_questions: 'var(--text-secondary)',
    },
  }
})

function makeTask(overrides) {
  return {
    id: 'task-1',
    planTopicId: 'topic-1',
    taskDate: '2026-07-27',
    taskType: 'learning',
    status: 'pending',
    estimatedMinutes: 37,
    displayOrder: 0,
    targetCount: 0,
    completedCount: 0,
    incorrectCount: 0,
    ...overrides,
  }
}

function makeTopic(overrides) {
  return {
    id: 'topic-1',
    topicTitle: 'Stable Angina Pectoris',
    groupId: 'Cardiology',
    ...overrides,
  }
}

function makePlan(overrides) {
  return {
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    sourceTitle: 'Step-Up Medicine',
    ...overrides,
  }
}

function makeAvailability() {
  return [
    { weekday: 0, availableMinutes: 0, isDayOff: true },
    { weekday: 1, availableMinutes: 120, isDayOff: false },
    { weekday: 2, availableMinutes: 120, isDayOff: false },
    { weekday: 3, availableMinutes: 120, isDayOff: false },
    { weekday: 4, availableMinutes: 120, isDayOff: false },
    { weekday: 5, availableMinutes: 120, isDayOff: false },
    { weekday: 6, availableMinutes: 0, isDayOff: true },
  ]
}

function buildTopicsById(topics) {
  const map = new Map()
  for (const t of topics) {
    map.set(t.id, t)
  }
  return map
}

const TODAY = '2026-07-27'

function renderWithProviders(ui) {
  return render(<LayerProvider>{ui}</LayerProvider>)
}

function defaultCalendarProps(overrides = {}) {
  return {
    tasks: [],
    topicsById: buildTopicsById([makeTopic()]),
    plan: makePlan(),
    availability: makeAvailability(),
    sourceTitle: 'Step-Up Medicine',
    todayKey: TODAY,
    onReschedule: vi.fn(),
    isMutating: false,
    ...overrides,
  }
}

function renderCalendar(overrides = {}) {
  return renderWithProviders(<CalendarView {...defaultCalendarProps(overrides)} />)
}

describe('CalendarView', () => {
  it('month is default view with grid and selected tab', () => {
    renderCalendar()
    expect(screen.getByRole('grid', { name: /July 2026/i })).toBeInTheDocument()
    const monthTab = screen.getByRole('tab', { name: 'Month' })
    expect(monthTab).toHaveAttribute('aria-selected', 'true')
  })

  it('week toggle renders ScheduleView', () => {
    renderCalendar()
    expect(screen.queryByTestId('schedule-view')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Week' }))
    expect(screen.getByTestId('schedule-view')).toBeInTheDocument()
  })

  it('switching back from week returns month', () => {
    const { unmount } = renderCalendar()
    fireEvent.click(screen.getByRole('tab', { name: 'Week' }))
    expect(screen.getByTestId('schedule-view')).toBeInTheDocument()
    unmount()
    renderCalendar()
    expect(screen.queryByTestId('schedule-view')).not.toBeInTheDocument()
    expect(screen.getByRole('grid', { name: /July 2026/i })).toBeInTheDocument()
  })

  it('month navigation changes month label', () => {
    renderCalendar()
    expect(screen.getByText('July 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Previous month'))
    expect(screen.getByText('July 2026')).toBeInTheDocument()
  })

  it('today button returns to current month', () => {
    renderCalendar()
    fireEvent.click(screen.getByLabelText('Next month'))
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Today'))
    expect(screen.getByText('July 2026')).toBeInTheDocument()
  })

  it('day cells show task minutes', () => {
    const task = makeTask({ estimatedMinutes: 37 })
    renderCalendar({ tasks: [task] })
    const cell = screen.getByRole('button', { name: /July 27, 2026.*1 task.*37 minutes/i })
    expect(cell).toBeInTheDocument()
    expect(cell.textContent).toContain('37m')
  })

  it('day with no tasks shows empty message when clicked', () => {
    renderCalendar()
    const cell = screen.getByRole('button', { name: /July 20, 2026.*No tasks/i })
    fireEvent.click(cell)
    expect(screen.getByText('No tasks scheduled for this day.')).toBeInTheDocument()
  })

  it('day-off cells have day-off class', () => {
    renderCalendar()
    const july26 = screen.getByRole('button', { name: /July 26/i })
    expect(july26.className).toContain('dayCellDayOff')
  })

  it('today cell has today class', () => {
    renderCalendar()
    const july27 = screen.getByRole('button', { name: /July 27/i })
    expect(july27.className).toContain('dayCellToday')
  })

  it('overload indicator shows when minutes exceed available', () => {
    const task = makeTask({ estimatedMinutes: 200 })
    renderCalendar({ tasks: [task] })
    const cell = screen.getByRole('button', { name: /July 27/i })
    expect(cell.textContent).toContain('\u26A0')
  })

  it('human topic titles shown in panel', () => {
    const task = makeTask()
    const topic = makeTopic()
    const topicsById = buildTopicsById([topic])
    renderCalendar({ tasks: [task], topicsById })
    fireEvent.click(screen.getByRole('button', { name: /July 27/i }))
    expect(screen.getByText('Stable Angina Pectoris')).toBeInTheDocument()
  })

  it('no technical IDs shown in panel', () => {
    const task = makeTask()
    const topic = { ...makeTopic(), normalizedTopicId: 'amboss::cardiology.stable-angina' }
    const topicsById = buildTopicsById([topic])
    renderCalendar({ tasks: [task], topicsById })
    fireEvent.click(screen.getByRole('button', { name: /July 27/i }))
    expect(screen.queryByText(/normalizedTopicId/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/planTopicId/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/amboss::/)).not.toBeInTheDocument()
  })
})

describe('DailyTaskPanel', () => {
  function defaultPanelProps(overrides = {}) {
    return {
      dateKey: '2026-07-27',
      tasks: [],
      topicsById: new Map(),
      availability: makeAvailability(),
      todayKey: TODAY,
      onReschedule: vi.fn(),
      isMutating: false,
      plan: makePlan(),
      onClose: vi.fn(),
      ...overrides,
    }
  }

  function renderPanel(overrides = {}) {
    return renderWithProviders(
      <Dialog.Root>
        <DailyTaskPanel {...defaultPanelProps(overrides)} />
      </Dialog.Root>
    )
  }

  it('shows date header', () => {
    renderPanel()
    expect(screen.getByText('Monday, Jul 27')).toBeInTheDocument()
  })

  it('shows task summary with count and minutes', () => {
    const tasks = [
      makeTask({ id: 't1', estimatedMinutes: 40 }),
      makeTask({ id: 't2', estimatedMinutes: 30 }),
      makeTask({ id: 't3', estimatedMinutes: 30 }),
    ]
    renderPanel({ tasks })
    expect(screen.getByText('3 tasks \u00B7 1h 40m')).toBeInTheDocument()
  })

  it('shows available time', () => {
    renderPanel()
    expect(screen.getByText('Available: 2h')).toBeInTheDocument()
  })

  it('day off shows empty state', () => {
    renderPanel({ dateKey: '2026-07-26' })
    expect(screen.getAllByText('Day off').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('No study time planned.')).toBeInTheDocument()
  })

  it('move button visible for pending learning task', () => {
    const task = makeTask({ status: 'pending', taskType: 'learning' })
    renderPanel({ tasks: [task] })
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument()
  })

  it('no move button for completed task', () => {
    const task = makeTask({ status: 'completed', taskType: 'learning' })
    renderPanel({ tasks: [task] })
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })

  it('no move button for in_progress task', () => {
    const task = makeTask({ status: 'in_progress', taskType: 'learning' })
    renderPanel({ tasks: [task] })
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })

  it('clicking move shows suggested dates', () => {
    const task = makeTask()
    renderPanel({ tasks: [task] })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(screen.getByText('Jul 28')).toBeInTheDocument()
    expect(screen.getByText('Jul 29')).toBeInTheDocument()
    expect(screen.getByText('Jul 30')).toBeInTheDocument()
    expect(screen.getByText('Jul 31')).toBeInTheDocument()
  })

  it('clicking suggested date calls onReschedule', () => {
    const onReschedule = vi.fn()
    const task = makeTask()
    renderPanel({ tasks: [task], onReschedule })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    fireEvent.click(screen.getByText('Jul 28'))
    expect(onReschedule).toHaveBeenCalledWith('task-1', '2026-07-28')
  })

  it('cancel exits move mode', () => {
    const task = makeTask()
    renderPanel({ tasks: [task] })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(screen.getByText('Jul 28')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Jul 28')).not.toBeInTheDocument()
  })

  it('status badges visible', () => {
    const pendingTask = makeTask({ id: 't1', status: 'pending' })
    const completedTask = makeTask({ id: 't2', status: 'completed' })
    renderPanel({ tasks: [pendingTask, completedTask] })
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})
