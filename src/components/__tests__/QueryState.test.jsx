// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryErrorState, RefetchWarning } from '../QueryState'

describe('QueryErrorState', () => {
  it('renders an alert with the message', () => {
    render(<QueryErrorState message="Boom" onRetry={vi.fn()} />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Boom')
  })

  it('calls onRetry when the Retry button is clicked', () => {
    const onRetry = vi.fn()
    render(<QueryErrorState message="Boom" onRetry={onRetry} />)
    fireEvent.click(screen.getByTestId('query-error-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders no Retry button when onRetry is not provided', () => {
    render(<QueryErrorState message="Boom" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
    expect(screen.queryByTestId('query-error-retry')).not.toBeInTheDocument()
  })
})

describe('RefetchWarning', () => {
  it('renders the message and calls onRetry from the Retry action', () => {
    const onRetry = vi.fn()
    render(<RefetchWarning message="Stale data" onRetry={onRetry} />)
    expect(screen.getByTestId('refetch-warning')).toBeInTheDocument()
    expect(screen.getByText('Stale data')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
