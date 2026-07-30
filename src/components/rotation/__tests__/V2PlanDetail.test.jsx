// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import V2PlanDetail from '../V2PlanDetail'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../V2PlanDetail.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../today/useRotationPlanDetail', () => ({
  default: () => ({
    data: { plan: { id: 'p1', revision: 1 }, topics: [], tasks: [], availability: [], sourcePace: null },
    isLoading: false,
    error: null,
  }),
}))

vi.mock('../today/usePlannerTaskMutations', () => ({
  default: () => ({ isPending: false, currentRevision: 1, startTask: vi.fn() }),
}))

vi.mock('../today/useTaskAttachment', () => ({
  default: () => ({
    isOrphaned: false,
    hasUnsyncedData: false,
    discardOrphanedPlannerContext: vi.fn(),
    handlePlay: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useQuery: () => ({ data: null, isLoading: false, error: null }), useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: vi.fn() }) }
})

vi.mock('../today/TodayView', () => ({
  default: () => <div data-testid="today-view" />,
}))

vi.mock('../CalendarView', () => ({
  default: () => <div data-testid="calendar-view" />,
}))

vi.mock('../today/TopicsView', () => ({
  default: () => <div data-testid="topics-view" />,
}))

vi.mock('../ProgressView', () => ({
  default: () => <div data-testid="progress-view" />,
}))

vi.mock('../today/RecalculationBanner', () => ({
  default: () => null,
}))

vi.mock('../ui/Toast/Toast', () => ({
  default: () => null,
}))

vi.mock('../LoadingScreen', () => ({
  default: () => null,
}))

vi.mock('../ui/Tabs/Tabs', () => ({
  Tabs: ({ children, ...props }) => <div data-testid="tabs" {...props}>{children}</div>,
  TabsList: ({ children }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ value, children }) => <button role="tab" data-value={value}>{children}</button>,
  TabsContent: ({ value, children }) => <div data-content={value}>{children}</div>,
}))

describe('V2PlanDetail top-level tabs', () => {
  it('renders exactly 4 top-level tabs: Today, Calendar, Topics, Progress', () => {
    render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
    const tabTriggers = screen.getAllByRole('tab')
    expect(tabTriggers).toHaveLength(4)
    const labels = tabTriggers.map(t => t.textContent)
    expect(labels).toEqual(['Today', 'Calendar', 'Topics', 'Progress'])
  })

  it('does not include a standalone Schedule tab', () => {
    render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
    const tabTriggers = screen.getAllByRole('tab')
    const labels = tabTriggers.map(t => t.textContent)
    expect(labels).not.toContain('Schedule')
  })

  it('renders DeckTopicMappings component', () => {
    render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
    expect(screen.getByText('Deck-Topic Mappings')).toBeInTheDocument()
  })

  it('renders FlashcardForecastRecommendations component', () => {
    render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
    expect(screen.getByText(/does not currently own flashcard capacity/i)).toBeInTheDocument()
  })
})
