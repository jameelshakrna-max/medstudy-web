// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import RotationView from '../RotationView'

vi.mock('../RotationView.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

const EMPTY_TOPICS = new Map()

function renderView(props = {}) {
  return render(
    <RotationView
      plan={null}
      forecast={null}
      forecastLoading={false}
      forecastError={null}
      topicsById={EMPTY_TOPICS}
      usesFlashcardCapacity={false}
      tasks={[]}
      todayKey="2026-08-13"
      {...props}
    />
  )
}

const ON_TRACK_FORECAST = {
  status: 'on_track',
  statusReason: null,
  estimatedCompletionDate: '2026-08-20',
  remainingRequiredMinutes: 300,
  availableMinutes: 420,
  missingCapacityMinutes: 0,
  requiredExtraMinutesPerDay: 0,
  unscheduledTopics: [],
  feasible: true,
}

describe('RotationView', () => {
  it('shows a loading state while the forecast is loading', () => {
    renderView({ forecastLoading: true })
    expect(screen.getByText('Loading forecast...')).toBeInTheDocument()
  })

  it('shows a forecast unavailable state on error', () => {
    renderView({ forecastError: new Error('boom') })
    expect(screen.getByText('Forecast unavailable')).toBeInTheDocument()
  })

  it('shows an empty state when no forecast data exists', () => {
    renderView()
    expect(screen.getByText('No forecast data available')).toBeInTheDocument()
  })

  it('renders an on-track status with remaining and available capacity', () => {
    renderView({ forecast: ON_TRACK_FORECAST })
    expect(screen.getByText('On Track')).toBeInTheDocument()
    expect(screen.getByText('Est. completion Aug 20')).toBeInTheDocument()
    expect(screen.getByText('5h')).toBeInTheDocument()
    expect(screen.getByText('7h')).toBeInTheDocument()
  })

  it('renders at-risk status with missing capacity and extra-per-day warnings', () => {
    renderView({
      forecast: {
        ...ON_TRACK_FORECAST,
        status: 'at_risk',
        missingCapacityMinutes: 120,
        requiredExtraMinutesPerDay: 45,
      },
    })
    expect(screen.getByText('At Risk')).toBeInTheDocument()
    expect(screen.getByText('2h')).toBeInTheDocument()
    expect(screen.getByText('45m')).toBeInTheDocument()
  })

  it('renders impossible status as "Cannot fit"', () => {
    renderView({ forecast: { ...ON_TRACK_FORECAST, status: 'impossible' } })
    expect(screen.getByText('Cannot fit')).toBeInTheDocument()
    expect(screen.queryByText('Impossible')).not.toBeInTheDocument()
  })

  it('shows the status reason when provided', () => {
    renderView({ forecast: { ...ON_TRACK_FORECAST, statusReason: 'Some topics were left unscheduled.' } })
    expect(screen.getByText('Some topics were left unscheduled.')).toBeInTheDocument()
  })

  it('resolves unscheduled topic IDs to titles via topicsById', () => {
    const topicsById = new Map([
      ['topic-a', { id: 'topic-a', title: 'Heart Failure' }],
      ['topic-b', { id: 'topic-b', title: 'Arrhythmias' }],
    ])
    renderView({
      forecast: { ...ON_TRACK_FORECAST, unscheduledTopics: ['topic-a', 'topic-b'] },
      topicsById,
    })
    expect(screen.getByText('2 topics unscheduled')).toBeInTheDocument()
    expect(screen.getByText('Heart Failure')).toBeInTheDocument()
    expect(screen.getByText('Arrhythmias')).toBeInTheDocument()
  })

  it('renders the flashcard capacity note when usesFlashcardCapacity is true', () => {
    renderView({ forecast: ON_TRACK_FORECAST, usesFlashcardCapacity: true })
    expect(screen.getByText(/Flashcard review capacity is factored in/)).toBeInTheDocument()
  })

  it('does not render the flashcard note when flashcard capacity is off', () => {
    renderView({ forecast: ON_TRACK_FORECAST, usesFlashcardCapacity: false })
    expect(screen.queryByText(/Flashcard review capacity is factored in/)).not.toBeInTheDocument()
  })

  it('omits warning metrics when capacity is sufficient', () => {
    renderView({ forecast: ON_TRACK_FORECAST })
    expect(screen.queryByText('Missing capacity')).not.toBeInTheDocument()
    expect(screen.queryByText('Extra needed / day')).not.toBeInTheDocument()
  })

  describe('Next scheduled block', () => {
    const TOPICS_BY_ID = new Map([
      ['topic-a', { id: 'topic-a', topicTitle: 'Heart Failure' }],
    ])

    const TASK = (overrides = {}) => ({
      id: 't1',
      planTopicId: 'topic-a',
      taskDate: '2026-08-13',
      status: 'pending',
      displayOrder: 1,
      taskType: 'learning',
      estimatedMinutes: 90,
      targetCount: null,
      ...overrides,
    })

    it('renders the earliest actionable block with its real fields', () => {
      renderView({
        topicsById: TOPICS_BY_ID,
        tasks: [
          TASK({ id: 'later', taskDate: '2026-08-14', displayOrder: 0 }),
          TASK({ id: 'earliest', taskDate: '2026-08-13', displayOrder: 2 }),
        ],
        todayKey: '2026-08-13',
      })
      expect(screen.getByText('Next scheduled block')).toBeInTheDocument()
      expect(screen.getByText('Heart Failure')).toBeInTheDocument()
      expect(screen.getByText('Aug 13')).toBeInTheDocument()
      expect(screen.getByText('Learning')).toBeInTheDocument()
      expect(screen.getByText('1h 30m')).toBeInTheDocument()
    })

    it('shows the question count when the block has a target count', () => {
      renderView({
        topicsById: TOPICS_BY_ID,
        tasks: [TASK({ taskType: 'uworld_questions', targetCount: 30, estimatedMinutes: 0 })],
        todayKey: '2026-08-13',
      })
      expect(screen.getByText('30 questions')).toBeInTheDocument()
    })

    it('renders the truthful empty treatment when nothing qualifies', () => {
      renderView({
        topicsById: TOPICS_BY_ID,
        tasks: [
          TASK({ status: 'completed' }),
          TASK({ status: 'locked', taskDate: '2026-08-14' }),
          TASK({ taskDate: '2026-08-12' }),
        ],
        todayKey: '2026-08-13',
      })
      expect(screen.getByText('No upcoming actionable block scheduled.')).toBeInTheDocument()
    })

    it('ignores a past-scheduled block even when it is not terminal', () => {
      renderView({
        topicsById: TOPICS_BY_ID,
        tasks: [TASK({ taskDate: '2026-08-12' }), TASK({ id: 't2', taskDate: '2026-08-15' })],
        todayKey: '2026-08-13',
      })
      expect(screen.getByText('Aug 15')).toBeInTheDocument()
      expect(screen.queryByText('Aug 12')).not.toBeInTheDocument()
    })
  })
})
