// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RecalculationBanner from '../RecalculationBanner'

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

vi.mock('../RecalculationBanner.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

describe('RecalculationBanner', () => {
  it('renders nothing when no recalc state and not stale', () => {
    const { container } = render(
      <RecalculationBanner staleAt={null} lastRecalculatedAt={null} onRecalculate={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows stale warning and action when staleAt is after lastRecalculatedAt', () => {
    const onRecalculate = vi.fn()
    render(
      <RecalculationBanner
        staleAt="2025-07-16T00:00:00Z"
        lastRecalculatedAt="2025-07-15T00:00:00Z"
        onRecalculate={onRecalculate}
      />
    )
    expect(screen.getByText('Your completed or changed work needs to be redistributed across the remaining schedule.')).toBeInTheDocument()
    expect(screen.getByText('Recalculate Plan')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Recalculate Plan'))
    expect(onRecalculate).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when staleAt is not after lastRecalculatedAt', () => {
    const { container } = render(
      <RecalculationBanner
        staleAt="2025-07-14T00:00:00Z"
        lastRecalculatedAt="2025-07-15T00:00:00Z"
        onRecalculate={vi.fn()}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows stale warning and action when visible is true even without staleAt', () => {
    const onRecalculate = vi.fn()
    render(<RecalculationBanner visible={true} staleAt={null} onRecalculate={onRecalculate} />)
    expect(screen.getByText('Your completed or changed work needs to be redistributed across the remaining schedule.')).toBeInTheDocument()
    expect(screen.getByText('Recalculate Plan')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Recalculate Plan'))
    expect(onRecalculate).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when visible is false and staleAt is null', () => {
    const { container } = render(
      <RecalculationBanner visible={false} staleAt={null} lastRecalculatedAt={null} onRecalculate={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows pending info banner even when plan would be stale', () => {
    render(
      <RecalculationBanner
        staleAt="2025-07-16T00:00:00Z"
        lastRecalculatedAt="2025-07-15T00:00:00Z"
        recalculationState={{ status: 'pending' }}
      />
    )
    expect(screen.getByText(/Recalculating plan/)).toBeInTheDocument()
    expect(screen.queryByText('Your completed or changed work needs to be redistributed across the remaining schedule.')).not.toBeInTheDocument()
  })

  it('shows in_flight info banner', () => {
    render(<RecalculationBanner recalculationState={{ status: 'in_flight' }} />)
    expect(screen.getByText(/Recalculating plan/)).toBeInTheDocument()
  })

  it('shows failed state with retry and dismiss calls onReset', () => {
    const onRecalculate = vi.fn()
    const onReset = vi.fn()
    render(
      <RecalculationBanner
        recalculationState={{ status: 'failed', error: new Error('oops') }}
        onRecalculate={onRecalculate}
        onReset={onReset}
      />
    )
    expect(screen.getByText(/Recalculation failed/)).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(onRecalculate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('dismiss-btn'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('shows blocked state with dismiss calling onReset', () => {
    const onReset = vi.fn()
    render(
      <RecalculationBanner
        recalculationState={{ status: 'blocked', blockedByTaskId: 'task-1' }}
        onReset={onReset}
      />
    )
    expect(screen.getByText(/blocked by an in-progress task/i)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dismiss-btn'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('renders exactly one banner when multiple signals are set at once', () => {
    render(
      <RecalculationBanner
        staleAt="2025-07-16T00:00:00Z"
        lastRecalculatedAt="2025-07-15T00:00:00Z"
        visible={true}
        recalculationState={{ status: 'pending' }}
      />
    )
    const banners = screen.getAllByTestId('banner')
    expect(banners).toHaveLength(1)
    expect(banners[0]).toHaveAttribute('data-variant', 'info')
    expect(screen.getByText(/Recalculating plan/)).toBeInTheDocument()
  })

  it('computes staleness purely from props and persists after reload', () => {
    render(
      <RecalculationBanner
        staleAt="2025-07-16T00:00:00Z"
        lastRecalculatedAt="2025-07-15T00:00:00Z"
      />
    )
    expect(screen.getByText('Your completed or changed work needs to be redistributed across the remaining schedule.')).toBeInTheDocument()
  })
})
