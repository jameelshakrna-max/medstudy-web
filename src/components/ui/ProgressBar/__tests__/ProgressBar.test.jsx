// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ProgressBar from '../ProgressBar'

describe('ProgressBar', () => {
  it('renders progress bar with correct ARIA attributes', () => {
    render(<ProgressBar value={0.65} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '65')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('clamps value to 0-1 range', () => {
    render(<ProgressBar value={1.5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('clamps negative values', () => {
    render(<ProgressBar value={-0.5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('shows label when provided', () => {
    render(<ProgressBar value={0.5} label="10/20 tasks" />)
    expect(screen.getByText('10/20 tasks')).toBeInTheDocument()
  })

  it('does not show label when omitted', () => {
    const { container } = render(<ProgressBar value={0.5} />)
    expect(container.querySelector('span')).not.toBeInTheDocument()
  })

  it('applies size class', () => {
    const { container } = render(<ProgressBar value={0.5} size="lg" />)
    expect(container.firstChild.className).toContain('lg')
  })

  it('defaults to default size', () => {
    const { container } = render(<ProgressBar value={0.5} />)
    expect(container.firstChild.className).toContain('default')
  })

  it('sets fill width correctly', () => {
    const { container } = render(<ProgressBar value={0.33} />)
    const fill = container.querySelector('[class*="fill"]')
    expect(fill.style.width).toBe('33%')
  })

  it('applies custom className', () => {
    const { container } = render(<ProgressBar value={0.5} className="extra" />)
    expect(container.firstChild.className).toContain('extra')
  })

  it('uses label as aria-label fallback', () => {
    render(<ProgressBar value={0.5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', '50%')
  })
})
