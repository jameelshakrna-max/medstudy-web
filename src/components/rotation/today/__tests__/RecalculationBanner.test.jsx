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
  it('shows stale warning when lastRecalculatedAt is old', () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    render(<RecalculationBanner lastRecalculatedAt={oldDate} onRecalculate={vi.fn()} />)
    expect(screen.getByText(/Plan may be out of date/)).toBeInTheDocument()
    expect(screen.getByText('Recalculate')).toBeInTheDocument()
  })

  it('shows stale warning when lastRecalculatedAt is null', () => {
    render(<RecalculationBanner lastRecalculatedAt={null} onRecalculate={vi.fn()} />)
    expect(screen.getByText(/Plan may be out of date/)).toBeInTheDocument()
  })

  it('shows nothing when recently recalculated', () => {
    const recentDate = new Date().toISOString()
    const { container } = render(<RecalculationBanner lastRecalculatedAt={recentDate} onRecalculate={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('calls onRecalculate on Recalculate click', () => {
    const onRecalculate = vi.fn()
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    render(<RecalculationBanner lastRecalculatedAt={oldDate} onRecalculate={onRecalculate} />)
    fireEvent.click(screen.getByText('Recalculate'))
    expect(onRecalculate).toHaveBeenCalledTimes(1)
  })

  it('shows pending state when recalculationState.status is pending', () => {
    render(<RecalculationBanner recalculationState={{ status: 'pending' }} />)
    expect(screen.getByText(/Recalculating plan/)).toBeInTheDocument()
  })

  it('shows in_flight state', () => {
    render(<RecalculationBanner recalculationState={{ status: 'in_flight' }} />)
    expect(screen.getByText(/Recalculating plan/)).toBeInTheDocument()
  })

  it('shows failed state with retry', () => {
    const onRecalculate = vi.fn()
    render(<RecalculationBanner recalculationState={{ status: 'failed', error: new Error('oops') }} onRecalculate={onRecalculate} />)
    expect(screen.getByText(/Recalculation failed/)).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('shows blocked state', () => {
    render(<RecalculationBanner recalculationState={{ status: 'blocked', blockedByTaskId: 'task-1' }} />)
    expect(screen.getByText(/blocked by an in-progress task/i)).toBeInTheDocument()
  })

  it('calls onReset on dismiss in failed state', () => {
    const onReset = vi.fn()
    render(<RecalculationBanner recalculationState={{ status: 'failed', error: new Error('oops') }} onReset={onReset} />)
    fireEvent.click(screen.getByTestId('dismiss-btn'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
