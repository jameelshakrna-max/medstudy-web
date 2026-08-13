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

  it('renders impossible status label', () => {
    renderView({ forecast: { ...ON_TRACK_FORECAST, status: 'impossible' } })
    expect(screen.getByText('Impossible')).toBeInTheDocument()
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
})
