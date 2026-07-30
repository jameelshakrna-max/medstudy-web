// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Banner, BannerAction } from '../Banner'

describe('Banner', () => {
  it('renders children content', () => {
    render(<Banner>Something happened</Banner>)
    expect(screen.getByText('Something happened')).toBeInTheDocument()
  })

  it('applies variant class', () => {
    const { container } = render(<Banner variant="warning">Warning</Banner>)
    expect(container.firstChild.className).toContain('warning')
  })

  it('defaults to info variant', () => {
    const { container } = render(<Banner>Info</Banner>)
    expect(container.firstChild.className).toContain('info')
  })

  it('renders dismiss button when onDismiss provided', () => {
    const onDismiss = vi.fn()
    render(<Banner onDismiss={onDismiss}>Dismissible</Banner>)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not render dismiss button when no onDismiss', () => {
    render(<Banner>No dismiss</Banner>)
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument()
  })

  it('BannerAction triggers onClick', () => {
    const onClick = vi.fn()
    render(
      <Banner variant="error">
        Error occurred <BannerAction onClick={onClick}>Retry</BannerAction>
      </Banner>
    )
    fireEvent.click(screen.getByText('Retry'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies custom className', () => {
    const { container } = render(<Banner className="custom">Test</Banner>)
    expect(container.firstChild.className).toContain('custom')
  })

  it('has role="status"', () => {
    render(<Banner>Notice</Banner>)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
