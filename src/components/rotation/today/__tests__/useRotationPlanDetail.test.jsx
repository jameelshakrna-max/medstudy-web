// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import useRotationPlanDetail from '../useRotationPlanDetail'

vi.mock('../../../../lib/api', () => ({
  apiGet: vi.fn(),
}))

import { apiGet } from '../../../../lib/api'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )
  return { queryClient, wrapper }
}

const PLAN_ID = 'plan-abc-123'

const mockRawResponse = {
  plan: {
    id: PLAN_ID,
    revision: 5,
    sourceTitle: 'Internal Medicine',
    topicCount: 12,
    taskCount: 40,
    schedulingMode: 'sequential',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
  },
  tasks: [
    {
      id: 'task-1',
      planId: PLAN_ID,
      planTopicId: 'topic-1',
      taskType: 'learning',
      status: 'pending',
      taskDate: '2026-07-23',
      estimatedMinutes: 60,
      actualMinutes: 0,
      completionPercentage: 0,
      displayOrder: 1,
    },
    {
      id: 'task-2',
      planId: PLAN_ID,
      planTopicId: 'topic-2',
      taskType: 'uworld_questions',
      status: 'completed',
      taskDate: '2026-07-22',
      estimatedMinutes: 45,
      actualMinutes: 40,
      targetCount: 20,
      completedCount: 20,
      incorrectCount: 3,
      displayOrder: 2,
    },
  ],
  schedule: { entries: [] },
  progress: { totalTasks: 40, completedTasks: 10, weightedProgress: 0.25 },
  availability: {},
}

describe('useRotationPlanDetail', () => {
  beforeEach(() => {
    apiGet.mockClear()
  })

  it('fetches and normalizes plan detail', async () => {
    apiGet.mockResolvedValue(mockRawResponse)
    const { wrapper } = createWrapper()

    const { result } = renderHook(
      () => useRotationPlanDetail(PLAN_ID),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.data.plan.id).toBe(PLAN_ID)
    expect(result.current.data.plan.revision).toBe(5)
    expect(result.current.data.tasks).toHaveLength(2)
    expect(result.current.data.tasks[0].id).toBe('task-1')
  })

  it('does not fetch when planId is null', () => {
    const { wrapper } = createWrapper()

    const { result } = renderHook(
      () => useRotationPlanDetail(null),
      { wrapper }
    )

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('returns error state on fetch failure', async () => {
    apiGet.mockRejectedValue(new Error('Network error'))
    const { wrapper } = createWrapper()

    const { result } = renderHook(
      () => useRotationPlanDetail(PLAN_ID),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error.message).toBe('Network error')
  })

  it('calls correct API endpoint', async () => {
    apiGet.mockResolvedValue(mockRawResponse)
    const { wrapper } = createWrapper()

    renderHook(
      () => useRotationPlanDetail(PLAN_ID),
      { wrapper }
    )

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(`/rotation-planner/plans/${PLAN_ID}`)
    })
  })
})
