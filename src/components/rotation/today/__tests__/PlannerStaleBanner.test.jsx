// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlannerStaleBanner from '../PlannerStaleBanner'

vi.mock('../../../ui/Banner/Banner', () => ({
  Banner: ({ children, variant, className }) => (
    <div data-testid="banner" data-variant={variant} className={className}>
      {children}
    </div>
  ),
  BannerAction: ({ children, onClick }) => (
    <button data-testid="recalculate-btn" onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../PlannerStaleBanner.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

describe('PlannerStaleBanner', () => {
  it('renders nothing when not stale and visible not set', () => {
    const { container } = render(<PlannerStaleBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('shows warning when visible is true', () => {
    render(<PlannerStaleBanner visible={true} onRecalculate={vi.fn()} />)
    expect(screen.getByText(/Plan data may be out of date/i)).toBeInTheDocument()
  })

  it('shows calculating state when isRecalculating is true', () => {
    render(<PlannerStaleBanner isRecalculating={true} />)
    expect(screen.getByText(/Recalculating plan/i)).toBeInTheDocument()
  })

  it('calls onRecalculate when Recalculate Plan is clicked', () => {
    const onRecalculate = vi.fn()
    render(<PlannerStaleBanner visible={true} onRecalculate={onRecalculate} />)
    fireEvent.click(screen.getByTestId('recalculate-btn'))
    expect(onRecalculate).toHaveBeenCalledTimes(1)
  })

  it('uses internal stale check when staleAt > lastRecalculatedAt', () => {
    render(<PlannerStaleBanner staleAt="2025-07-16T00:00:00Z" lastRecalculatedAt="2025-07-15T00:00:00Z" />)
    expect(screen.getByText(/Plan data may be out of date/i)).toBeInTheDocument()
  })

  it('hides when internal stale check passes (staleAt <= lastRecalculatedAt)', () => {
    const { container } = render(<PlannerStaleBanner staleAt="2025-07-14T00:00:00Z" lastRecalculatedAt="2025-07-15T00:00:00Z" />)
    expect(container.innerHTML).toBe('')
  })
})
