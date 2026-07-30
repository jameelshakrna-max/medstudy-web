// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PlannerStaleBanner from '../PlannerStaleBanner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiPost } from '../../../../lib/api'

vi.mock('../../../../lib/api', () => ({
  apiPost: vi.fn(),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  }
})

vi.mock('../../../ui/Banner/Banner', () => ({
  Banner: ({ children, variant, className, onDismiss }) => (
    <div data-testid="banner" data-variant={variant} className={className}>
      {children}
      {onDismiss && <button data-testid="dismiss-btn" onClick={onDismiss}>Dismiss</button>}
    </div>
  ),
  BannerAction: ({ children, onClick }) => (
    <button data-testid="recalculate-btn" onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../PlannerStaleBanner.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

function renderWithClient(ui) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('PlannerStaleBanner', () => {
  const defaultProps = {
    planId: 'plan-1',
    revision: 2,
    getRecalculationDate: () => '2025-07-15',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when not stale and visible not set', () => {
    const { container } = renderWithClient(<PlannerStaleBanner {...defaultProps} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows warning when visible is true', () => {
    renderWithClient(<PlannerStaleBanner {...defaultProps} visible={true} />)
    expect(screen.getByText(/Plan data may be out of date/i)).toBeInTheDocument()
  })

  it('shows calculating state during recalculation', async () => {
    apiPost.mockImplementation(() => new Promise(() => {}))
    renderWithClient(<PlannerStaleBanner {...defaultProps} visible={true} />)
    fireEvent.click(screen.getByTestId('recalculate-btn'))
    expect(await screen.findByText(/Recalculating plan/i)).toBeInTheDocument()
  })

  it('calls apiPost with correct parameters', async () => {
    apiPost.mockResolvedValue({})
    renderWithClient(<PlannerStaleBanner {...defaultProps} visible={true} />)
    fireEvent.click(screen.getByTestId('recalculate-btn'))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/rotation-planner/plans/plan-1/recalculate', {
        expectedRevision: 2,
        recalculationDate: '2025-07-15',
        clientRequestId: expect.any(String),
      })
    })
  })

  it('shows error message when recalculation fails', async () => {
    apiPost.mockRejectedValue(new Error('Network error'))
    renderWithClient(<PlannerStaleBanner {...defaultProps} visible={true} />)
    fireEvent.click(screen.getByTestId('recalculate-btn'))
    expect(await screen.findByText(/Network error/i)).toBeInTheDocument()
  })

    it('banner stays visible after failed recalculation', async () => {
    apiPost.mockRejectedValue(new Error('Network error'))
    renderWithClient(<PlannerStaleBanner {...defaultProps} visible={true} />)
    fireEvent.click(screen.getByTestId('recalculate-btn'))
    await screen.findByText(/Network error/i)
    expect(screen.getByText(/Plan data may be out of date/i)).toBeInTheDocument()
    expect(screen.getByText(/Recalculate Plan/i)).toBeInTheDocument()
  })

  it('prevents duplicate clicks during recalculation', async () => {
    apiPost.mockImplementation(() => new Promise(() => {}))
    renderWithClient(<PlannerStaleBanner {...defaultProps} visible={true} />)
    fireEvent.click(screen.getByTestId('recalculate-btn'))
    await screen.findByText(/Recalculating plan/i)
    expect(screen.queryByTestId('recalculate-btn')).not.toBeInTheDocument()
    expect(apiPost).toHaveBeenCalledTimes(1)
  })

  it('uses internal stale check when staleAt > lastRecalculatedAt', () => {
    renderWithClient(<PlannerStaleBanner {...defaultProps} staleAt="2025-07-16T00:00:00Z" lastRecalculatedAt="2025-07-15T00:00:00Z" />)
    expect(screen.getByText(/Plan data may be out of date/i)).toBeInTheDocument()
  })

  it('hides when internal stale check passes (staleAt <= lastRecalculatedAt)', () => {
    const { container } = renderWithClient(<PlannerStaleBanner {...defaultProps} staleAt="2025-07-14T00:00:00Z" lastRecalculatedAt="2025-07-15T00:00:00Z" />)
    expect(container.innerHTML).toBe('')
  })
})
