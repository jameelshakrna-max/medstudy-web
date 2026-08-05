// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import V2PlanDetail from '../V2PlanDetail'
import { queryKeys } from '../../../lib/queryKeys'

const { mockUseRotationPlanDetail, mockUseQuery, mockUsePlannerTaskMutations, mockUseMutation, invalidateQueriesSpy } = vi.hoisted(() => {
  const mockUseQueryFn = vi.fn(() => ({ data: null, isLoading: false, error: null }))
  const mockRotationPlanDetailFn = vi.fn(() => ({
    data: { plan: { id: 'p1', revision: 1 }, topics: [], tasks: [], availability: [], sourcePace: null },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }))
  const mockMutationsFn = vi.fn(() => ({
    isPending: false,
    currentRevision: 1,
    startTask: vi.fn(),
    completeTask: vi.fn(),
    partialTask: vi.fn(),
    recordTime: vi.fn(),
    recordQuestions: vi.fn(),
    rescheduleTask: vi.fn(),
    skipTask: vi.fn(),
    retryRecalculation: vi.fn(),
    reset: vi.fn(),
    error: null,
    recalculationState: null,
  }))
  const mockUseMutationFn = vi.fn(() => ({ mutate: vi.fn(), isPending: false }))
  const invalidateQueriesSpy = vi.fn()
  return { mockUseRotationPlanDetail: mockRotationPlanDetailFn, mockUseQuery: mockUseQueryFn, mockUsePlannerTaskMutations: mockMutationsFn, mockUseMutation: mockUseMutationFn, invalidateQueriesSpy }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../V2PlanDetail.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../today/useRotationPlanDetail', () => ({
  default: () => mockUseRotationPlanDetail(),
}))

vi.mock('../today/usePlannerTaskMutations', () => ({
  default: () => mockUsePlannerTaskMutations(),
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
  return {
    ...actual,
    useQuery: mockUseQuery,
    useMutation: mockUseMutation,
    useQueryClient: () => ({ invalidateQueries: invalidateQueriesSpy, getQueryData: vi.fn() }),
  }
})

vi.mock('../../ui/Dropdown/Dropdown', () => {
  const DropdownMock = ({ children }) => <div data-testid="plan-actions-dropdown">{children}</div>
  DropdownMock.Trigger = ({ children }) => <div>{children}</div>
  DropdownMock.Content = ({ children }) => <div>{children}</div>
  DropdownMock.Item = ({ children, onSelect }) => <button type="button" onClick={onSelect}>{children}</button>
  return { default: DropdownMock }
})

vi.mock('../../ui/Modal/Modal', () => {
  const ModalMock = ({ open, children }) => open ? <div data-testid="modal">{children}</div> : null
  ModalMock.Title = ({ children }) => <h2>{children}</h2>
  ModalMock.Description = ({ children }) => <p>{children}</p>
  ModalMock.Close = () => null
  ModalMock.Footer = ({ children }) => <div>{children}</div>
  return { default: ModalMock }
})

vi.mock('../today/TodayView', () => ({
  default: ({ onStart, onComplete, onPartial, onRecordTime, onRecordQuestions, onSkip }) => (
    <div data-testid="today-view">
      <button data-testid="btn-start" onClick={() => onStart({ id: 't1' })} />
      <button data-testid="btn-complete" onClick={() => onComplete({ id: 't1' })} />
      <button data-testid="btn-partial" onClick={() => onPartial({ id: 't1' })} />
      <button data-testid="btn-record-time" onClick={() => onRecordTime({ id: 't1' })} />
      <button data-testid="btn-record-questions" onClick={() => onRecordQuestions({ id: 't1', taskType: 'uworld_questions' })} />
      <button data-testid="btn-skip" onClick={() => onSkip({ id: 't1' })} />
    </div>
  ),
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
  default: ({ visible, recalculationState }) => {
    if (recalculationState?.status === 'pending' || recalculationState?.status === 'in_flight') {
      return <div data-testid="recalc-pending" />
    }
    if (recalculationState?.status === 'failed') return <div data-testid="recalc-failed" />
    if (recalculationState?.status === 'blocked') return <div data-testid="recalc-blocked" />
    return visible ? <div data-testid="stale-banner" /> : null
  },
}))

vi.mock('../today/DeckTopicMappings', () => ({
  default: ({ onRecalculationRequired }) => (
    <div data-testid="deck-mappings">
      Deck-Topic Mappings
      <button data-testid="btn-recalc-required" onClick={onRecalculationRequired} />
    </div>
  ),
}))

vi.mock('../today/FlashcardForecastRecommendations', () => ({
  default: () => <div data-testid="forecast-recs" />,
}))

vi.mock('../RotationHelpDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="rotation-help-dialog" /> : null),
}))

vi.mock('../../ui/Toast/Toast', () => {
  const ToastMock = ({ open, title, description, variant }) => open ? (
    <div data-testid="toast" data-variant={variant}>
      <span data-testid="toast-title">{title}</span>
      <span>{description}</span>
    </div>
  ) : null
  ToastMock.Provider = ({ children }) => <>{children}</>
  ToastMock.Viewport = () => null
  return { default: ToastMock }
})

vi.mock('../../LoadingScreen', () => ({
  default: ({ message }) => message ? <div data-testid="loading-screen">{message}</div> : <div data-testid="loading-screen" />,
}))

vi.mock('../../ui/Tabs/Tabs', () => ({
  Tabs: ({ children, ...props }) => <div data-testid="tabs" {...props}>{children}</div>,
  TabsList: ({ children }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ value, children }) => <button role="tab" data-value={value}>{children}</button>,
  TabsContent: ({ value, children }) => <div data-content={value}>{children}</div>,
}))

vi.mock('../today/dialogs/TaskCompletionDialog', () => ({
  default: ({ open }) => open ? <div data-testid="dialog-complete" /> : null,
}))

vi.mock('../today/dialogs/RecordTimeDialog', () => ({
  default: ({ open }) => open ? <div data-testid="dialog-record-time" /> : null,
}))

vi.mock('../today/dialogs/PartialDialog', () => ({
  default: ({ open }) => open ? <div data-testid="dialog-partial" /> : null,
}))

vi.mock('../today/dialogs/SkipConfirmDialog', () => ({
  default: ({ open }) => open ? <div data-testid="dialog-skip" /> : null,
}))

vi.mock('../today/dialogs/RecordQuestionsDialog', () => ({
  default: ({ open }) => open ? <div data-testid="dialog-record-questions" /> : null,
}))

describe('V2PlanDetail', () => {
  beforeEach(() => {
    mockUseRotationPlanDetail.mockReturnValue({
      data: { plan: { id: 'p1', revision: 1 }, topics: [], tasks: [], availability: [], sourcePace: null },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null })
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUsePlannerTaskMutations.mockReturnValue({
      isPending: false,
      currentRevision: 1,
      startTask: vi.fn(),
      completeTask: vi.fn(),
      partialTask: vi.fn(),
      recordTime: vi.fn(),
      recordQuestions: vi.fn(),
      rescheduleTask: vi.fn(),
      skipTask: vi.fn(),
      retryRecalculation: vi.fn(),
      reset: vi.fn(),
      error: null,
      recalculationState: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('loading and error states', () => {
    it('shows loading screen when isLoading is true', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: true, error: null })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Loading plan details/i)).toBeInTheDocument()
    })

    it('shows error message when error is non-null', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: false, error: new Error('test error') })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Failed to load plan/i)).toBeInTheDocument()
    })

    it('calls refetch when Retry button is clicked in error state', async () => {
      const refetchMock = vi.fn()
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: false, error: new Error('boom'), refetch: refetchMock })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Failed to load plan/i)).toBeInTheDocument()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /Retry/i }))
      expect(refetchMock).toHaveBeenCalled()
    })

    it('shows plan-not-found when data is null', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: false, error: null })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Plan not found/i)).toBeInTheDocument()
    })

    it('shows plan-not-found when data.plan is null', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: { plan: null, topics: [] }, isLoading: false, error: null })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Plan not found/i)).toBeInTheDocument()
    })
  })

  describe('forecast states', () => {
    it('renders main content when forecast is loading', () => {
      mockUseQuery.mockReturnValue({ data: null, isLoading: true, error: null })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByTestId('tabs')).toBeInTheDocument()
    })

    it('renders main content when forecast has an error', () => {
      mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: new Error('forecast error') })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByTestId('tabs')).toBeInTheDocument()
    })
  })

  describe('tabs rendering', () => {
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
      expect(screen.getByTestId('forecast-recs')).toBeInTheDocument()
    })
  })

  describe('dialog interactions', () => {
    it('opens TaskCompletionDialog when onComplete is triggered', async () => {
      const user = userEvent.setup()
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByTestId('btn-complete'))
      expect(screen.getByTestId('dialog-complete')).toBeInTheDocument()
    })

    it('opens RecordTimeDialog when onRecordTime is triggered', async () => {
      const user = userEvent.setup()
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByTestId('btn-record-time'))
      expect(screen.getByTestId('dialog-record-time')).toBeInTheDocument()
    })

    it('opens PartialDialog when onPartial is triggered', async () => {
      const user = userEvent.setup()
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByTestId('btn-partial'))
      expect(screen.getByTestId('dialog-partial')).toBeInTheDocument()
    })

    it('opens SkipConfirmDialog when onSkip is triggered', async () => {
      const user = userEvent.setup()
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByTestId('btn-skip'))
      expect(screen.getByTestId('dialog-skip')).toBeInTheDocument()
    })

    it('opens RecordQuestionsDialog when onRecordQuestions is triggered', async () => {
      const user = userEvent.setup()
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByTestId('btn-record-questions'))
      expect(screen.getByTestId('dialog-record-questions')).toBeInTheDocument()
    })
  })

  describe('toast behavior', () => {
    it('shows error toast when startTask fails', async () => {
      const user = userEvent.setup()
      mockUsePlannerTaskMutations.mockReturnValue({
        isPending: false,
        currentRevision: 1,
        startTask: vi.fn().mockRejectedValue(new Error('Start failed')),
      })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByTestId('btn-start'))
      expect(screen.getByTestId('toast')).toBeInTheDocument()
      expect(screen.getByTestId('toast-title')).toHaveTextContent('Failed to start task')
    })

    it('does not show toast when startTask succeeds', () => {
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.queryByTestId('toast')).not.toBeInTheDocument()
    })
  })

  describe('recalculation stale banner', () => {
    it('shows stale banner after onRecalculationRequired fires', async () => {
      const user = userEvent.setup()
      mockUseRotationPlanDetail.mockReturnValue({
        data: { plan: { id: 'p1', revision: 1, staleAt: '2099-01-01' }, topics: [], tasks: [], availability: [], sourcePace: null },
        isLoading: false,
        error: null,
      })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('btn-recalc-required'))
      expect(screen.getByTestId('stale-banner')).toBeInTheDocument()
    })

    it('renders exactly one banner when both visible and recalculationState are set', async () => {
      const user = userEvent.setup()
      mockUseRotationPlanDetail.mockReturnValue({
        data: { plan: { id: 'p1', revision: 1, staleAt: '2099-01-01' }, topics: [], tasks: [], availability: [], sourcePace: null },
        isLoading: false,
        error: null,
      })
      mockUsePlannerTaskMutations.mockReturnValue({
        isPending: false,
        currentRevision: 1,
        startTask: vi.fn(),
        completeTask: vi.fn(),
        partialTask: vi.fn(),
        recordTime: vi.fn(),
        recordQuestions: vi.fn(),
        rescheduleTask: vi.fn(),
        skipTask: vi.fn(),
        retryRecalculation: vi.fn(),
        reset: vi.fn(),
        error: null,
        recalculationState: { status: 'pending' },
      })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByTestId('btn-recalc-required'))
      expect(screen.getByTestId('recalc-pending')).toBeInTheDocument()
      expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument()
      expect(screen.getAllByTestId('recalc-pending')).toHaveLength(1)
    })
  })

  describe('back button', () => {
    it('calls onBack when back button is clicked', async () => {
      const user = userEvent.setup()
      const onBack = vi.fn()
      render(<V2PlanDetail planId="p1" onBack={onBack} />)
      await user.click(screen.getByRole('button', { name: /plans/i }))
      expect(onBack).toHaveBeenCalledTimes(1)
    })
  })

  describe('help dialog', () => {
    it('opens RotationHelpDialog from the header help button', async () => {
      const user = userEvent.setup()
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'How your rotation plan works' }))
      expect(screen.getByTestId('rotation-help-dialog')).toBeInTheDocument()
    })

    it('does not open RotationHelpDialog before the help button is clicked', () => {
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.queryByTestId('rotation-help-dialog')).not.toBeInTheDocument()
    })
  })

  describe('hook-count transition regression', () => {
    const loadedData = {
      plan: {
        id: 'p1',
        revision: 1,
        sourceTitle: 'Cardiology',
        startDate: '2026-08-01',
        endDate: '2026-08-28',
        topicCount: 2,
        schedulingMode: 'self-paced',
      },
      topics: [
        { id: 't1', status: 'completed' },
        { id: 't2', status: 'pending' },
      ],
      tasks: [],
      availability: [],
      sourcePace: null,
    }

    it('does not crash when transitioning from loading to loaded on the same instance', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: true, error: null })
      const { rerender } = render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Loading plan details/i)).toBeInTheDocument()

      mockUseRotationPlanDetail.mockReturnValue({ data: loadedData, isLoading: false, error: null })

      expect(() => rerender(<V2PlanDetail planId="p1" onBack={vi.fn()} />)).not.toThrow()
      expect(screen.getByRole('heading', { name: 'Cardiology' })).toBeInTheDocument()
      expect(screen.getByText('1 / 2 topics completed')).toBeInTheDocument()
    })

    it('does not crash when transitioning from loading to error on the same instance', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: true, error: null })
      const { rerender } = render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Loading plan details/i)).toBeInTheDocument()

      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: false, error: new Error('test error') })

      expect(() => rerender(<V2PlanDetail planId="p1" onBack={vi.fn()} />)).not.toThrow()
      expect(screen.getByText(/Failed to load plan/i)).toBeInTheDocument()
    })

    it('does not crash when transitioning from loading to not-found on the same instance', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: true, error: null })
      const { rerender } = render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Loading plan details/i)).toBeInTheDocument()

      mockUseRotationPlanDetail.mockReturnValue({ data: { plan: null, topics: [] }, isLoading: false, error: null })

      expect(() => rerender(<V2PlanDetail planId="p1" onBack={vi.fn()} />)).not.toThrow()
      expect(screen.getByText(/Plan not found/i)).toBeInTheDocument()
    })

    it('does not render mutation controls during loading, error, or not-found states', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: true, error: null })
      const { rerender } = render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.queryByTestId('btn-start')).not.toBeInTheDocument()
      expect(screen.queryByTestId('dialog-complete')).not.toBeInTheDocument()

      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: false, error: new Error('test error') })
      rerender(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.queryByTestId('btn-start')).not.toBeInTheDocument()
      expect(screen.queryByTestId('dialog-complete')).not.toBeInTheDocument()

      mockUseRotationPlanDetail.mockReturnValue({ data: { plan: null, topics: [] }, isLoading: false, error: null })
      rerender(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.queryByTestId('btn-start')).not.toBeInTheDocument()
      expect(screen.queryByTestId('dialog-complete')).not.toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('renders default title when plan has no sourceTitle', () => {
      mockUseRotationPlanDetail.mockReturnValue({
        data: { plan: { id: 'p1', revision: 1, sourceTitle: null }, topics: [], tasks: [], availability: [], sourcePace: null },
        isLoading: false,
        error: null,
      })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText('Rotation Plan')).toBeInTheDocument()
    })

    it('handles empty topics array', () => {
      mockUseRotationPlanDetail.mockReturnValue({
        data: { plan: { id: 'p1', revision: 1 }, topics: [], tasks: [], availability: [], sourcePace: null },
        isLoading: false,
        error: null,
      })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByTestId('tabs')).toBeInTheDocument()
    })
  })

  describe('rename plan', () => {
    it('opens the rename modal prefilled with the current displayName', async () => {
      const user = userEvent.setup()
      mockUseRotationPlanDetail.mockReturnValue({
        data: { plan: { id: 'p1', revision: 1, displayName: 'Cardio — Jan' }, topics: [], tasks: [], availability: [], sourcePace: null },
        isLoading: false,
        error: null,
      })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Plan actions' }))
      await user.click(screen.getByRole('button', { name: /Rename Plan/i }))
      expect(screen.getByTestId('modal')).toBeInTheDocument()
      expect(screen.getByLabelText('Plan name')).toHaveValue('Cardio — Jan')
    })

    it('submits rename with displayName, expectedRevision, and clientRequestId', async () => {
      const user = userEvent.setup()
      const mutate = vi.fn()
      mockUseMutation.mockReturnValue({ mutate, isPending: false })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Plan actions' }))
      await user.click(screen.getByRole('button', { name: /Rename Plan/i }))
      await user.clear(screen.getByLabelText('Plan name'))
      await user.type(screen.getByLabelText('Plan name'), 'New Cardio Name')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(mutate).toHaveBeenCalledTimes(1)
      const args = mutate.mock.calls[0][0]
      expect(args.displayName).toBe('New Cardio Name')
      expect(args.expectedRevision).toBe(1)
      expect(typeof args.clientRequestId).toBe('string')
    })

    it('disables Save while the rename is pending', async () => {
      const user = userEvent.setup()
      mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: true })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Plan actions' }))
      await user.click(screen.getByRole('button', { name: /Rename Plan/i }))
      expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled()
    })

    it('shows error message when rename fails', async () => {
      const user = userEvent.setup()
      mockUseMutation.mockImplementation(({ onError }) => ({
        mutate: () => onError(new Error('Rename failed')),
        isPending: false,
      }))
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Plan actions' }))
      await user.click(screen.getByRole('button', { name: /Rename Plan/i }))
      await user.type(screen.getByLabelText('Plan name'), 'New Cardio Name')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(screen.getByText('Rename failed')).toBeInTheDocument()
    })

    it('closes the modal and shows a success toast when rename succeeds', async () => {
      const user = userEvent.setup()
      mockUseMutation.mockImplementation(({ onSuccess }) => ({
        mutate: () => onSuccess({ ok: true }),
        isPending: false,
      }))
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Plan actions' }))
      await user.click(screen.getByRole('button', { name: /Rename Plan/i }))
      await user.type(screen.getByLabelText('Plan name'), 'New Cardio Name')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
      expect(screen.getByTestId('toast')).toBeInTheDocument()
      expect(screen.getByTestId('toast-title')).toHaveTextContent('Plan renamed')
    })
  })

  describe('delete plan', () => {
    function mockDeleteMutation({ error = false, isPending = false, mutate } = {}) {
      mockUseMutation.mockImplementation((config) => {
        const isDelete = typeof config.mutationFn === 'function' && config.mutationFn.toString().includes('apiDelete')
        if (isDelete) {
          const runMutate = mutate || (() => {
            if (error) config.onError(new Error('Delete failed'))
            else config.onSuccess({ success: true })
          })
          return { mutate: runMutate, isPending }
        }
        return { mutate: vi.fn(), isPending: false }
      })
    }

    async function openDeleteDialog(user) {
      await user.click(screen.getByRole('button', { name: 'Plan actions' }))
      await user.click(screen.getByRole('button', { name: 'Delete Plan' }))
    }

    it('exposes delete only through the kebab (plan actions) menu', () => {
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      const dropdown = screen.getByTestId('plan-actions-dropdown')
      expect(within(dropdown).getByRole('button', { name: 'Delete Plan' })).toBeInTheDocument()
    })

    it('shows no delete controls when the plan cannot be loaded', () => {
      mockUseRotationPlanDetail.mockReturnValue({ data: null, isLoading: false, error: null })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      expect(screen.getByText(/Plan not found/i)).toBeInTheDocument()
      expect(screen.queryByTestId('plan-actions-dropdown')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete Plan' })).not.toBeInTheDocument()
    })

    it('shows the delete confirmation dialog with the plan name', async () => {
      const user = userEvent.setup()
      mockUseRotationPlanDetail.mockReturnValue({
        data: { plan: { id: 'p1', revision: 1, displayName: 'Cardio — Jan' }, topics: [], tasks: [], availability: [], sourcePace: null },
        isLoading: false,
        error: null,
      })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await openDeleteDialog(user)
      const modal = screen.getByTestId('modal')
      expect(within(modal).getByRole('heading', { name: 'Delete Plan' })).toBeInTheDocument()
      expect(within(modal).getByText('Cardio — Jan')).toBeInTheDocument()
    })

    it('warns that deletion permanently removes the plan and cannot be undone', async () => {
      const user = userEvent.setup()
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await openDeleteDialog(user)
      const modal = screen.getByTestId('modal')
      expect(within(modal).getByText(/permanently removes/i)).toBeInTheDocument()
      expect(within(modal).getByText(/cannot be undone/i)).toBeInTheDocument()
    })

    it('calls the delete mutation when the user confirms', async () => {
      const user = userEvent.setup()
      const deleteMutate = vi.fn()
      mockDeleteMutation({ mutate: deleteMutate })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await openDeleteDialog(user)
      await user.click(within(screen.getByTestId('modal')).getByRole('button', { name: 'Delete Plan' }))
      expect(deleteMutate).toHaveBeenCalledTimes(1)
    })

    it('disables the confirm button while the delete is pending', async () => {
      const user = userEvent.setup()
      mockDeleteMutation({ isPending: true })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await openDeleteDialog(user)
      expect(within(screen.getByTestId('modal')).getByRole('button', { name: /Deleting/ })).toBeDisabled()
    })

    it('closes the dialog, invalidates caches, toasts, and navigates back on success', async () => {
      const user = userEvent.setup()
      const onBack = vi.fn()
      mockDeleteMutation()
      render(<V2PlanDetail planId="p1" onBack={onBack} />)
      await openDeleteDialog(user)
      await user.click(within(screen.getByTestId('modal')).getByRole('button', { name: 'Delete Plan' }))
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
      expect(screen.getByTestId('toast')).toBeInTheDocument()
      expect(screen.getByTestId('toast-title')).toHaveTextContent('Plan deleted')
      expect(onBack).toHaveBeenCalledTimes(1)
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.rotations.plans() })
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.goals.list() })
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.tracking.all })
    })

    it('shows an inline error and keeps the dialog open when delete fails', async () => {
      const user = userEvent.setup()
      mockDeleteMutation({ error: true })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await openDeleteDialog(user)
      await user.click(within(screen.getByTestId('modal')).getByRole('button', { name: 'Delete Plan' }))
      expect(within(screen.getByTestId('modal')).getByText('Delete failed')).toBeInTheDocument()
      expect(screen.getByTestId('modal')).toBeInTheDocument()
    })

    it('keeps the pending state visible while the delete request is in flight', async () => {
      const user = userEvent.setup()
      mockDeleteMutation({ isPending: true })
      render(<V2PlanDetail planId="p1" onBack={vi.fn()} />)
      await openDeleteDialog(user)
      expect(screen.getByTestId('modal')).toBeInTheDocument()
      expect(within(screen.getByTestId('modal')).getByRole('button', { name: /Deleting/ })).toBeDisabled()
      expect(within(screen.getByTestId('modal')).getByText(/deleting/i)).toBeInTheDocument()
    })
  })
})
