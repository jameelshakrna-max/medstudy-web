// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import RecalculationBanner from '../RecalculationBanner'

vi.mock('../../../../lib/api', () => ({
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor({ code, message, status, details }) {
      super(message)
      this.code = code
      this.status = status
      this.details = details
    }
  },
}))

import { apiPatch, apiPost } from '../../../../lib/api'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )
  return { queryClient, wrapper }
}

describe('RecalculationBanner', () => {
  it('shows stale warning when lastRecalculatedAt is old', () => {
    const { wrapper } = createWrapper()
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    render(
      <RecalculationBanner planId="plan-1" lastRecalculatedAt={oldDate} revision={5} />,
      { wrapper }
    )
    expect(screen.getByText(/Plan may be out of date/)).toBeInTheDocument()
    expect(screen.getByText('Recalculate')).toBeInTheDocument()
  })

  it('shows stale warning when lastRecalculatedAt is null', () => {
    const { wrapper } = createWrapper()
    render(
      <RecalculationBanner planId="plan-1" lastRecalculatedAt={null} revision={5} />,
      { wrapper }
    )
    expect(screen.getByText(/Plan may be out of date/)).toBeInTheDocument()
  })

  it('shows nothing when recently recalculated', () => {
    const { wrapper } = createWrapper()
    const recentDate = new Date().toISOString()
    const { container } = render(
      <RecalculationBanner planId="plan-1" lastRecalculatedAt={recentDate} revision={5} />,
      { wrapper }
    )
    expect(container.innerHTML).toBe('')
  })

  it('calls recalculate on Recalculate click', async () => {
    apiPost.mockResolvedValue({ revision: 6 })
    const { wrapper } = createWrapper()
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    render(
      <RecalculationBanner planId="plan-1" lastRecalculatedAt={oldDate} revision={5} />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('Recalculate'))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
  })
})
