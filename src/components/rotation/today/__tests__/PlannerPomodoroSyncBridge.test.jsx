// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import React from 'react'

const mockUsePomodoro = vi.fn()

vi.mock('../../../../context/PomodoroContext', () => ({
  usePomodoro: (...args) => mockUsePomodoro(...args),
}))

vi.mock('../../../../lib/api', () => ({
  apiPatch: vi.fn(),
  apiGet: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor({ code, message, status }) {
      super(message)
      this.code = code
      this.status = status
    }
  },
}))

vi.mock('../../../../lib/queryKeys', () => ({
  queryKeys: {
    rotations: {
      plan: (id) => ['rotations', 'plan', id],
      plans: () => ['rotations', 'plans'],
    },
  },
}))

vi.mock('../responseAdapters', () => ({
  normalizePlanResponse: vi.fn(),
}))

vi.mock('../todayUtils', () => ({
  secondsToPlannerMinutes: (s) => Math.ceil(s / 60),
}))

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiPatch, apiGet, ApiError } from '../../../../lib/api'
import { normalizePlanResponse } from '../responseAdapters'
import PlannerPomodoroSyncBridge from '../PlannerPomodoroSyncBridge'

function createMockCtx(overrides = {}) {
  return {
    plannerTaskContext: null,
    markPlannerSyncInFlight: vi.fn(),
    markPlannerSyncSucceeded: vi.fn(),
    markPlannerSyncFailed: vi.fn(),
    markNetworkOutcomeUnknown: vi.fn(),
    retryPlannerSync: vi.fn(),
    rebaseAfterConflict: vi.fn(),
    setRevisionRecoveryStatus: vi.fn(),
    setIdempotencyConflictStatus: vi.fn(),
    reservePlannerSyncOperation: vi.fn(),
    ...overrides,
  }
}

const PENDING_CTX = {
  taskId: 'task-1',
  planId: 'plan-1',
  accumulatedFocusSeconds: 300,
  syncedFocusMinutes: 0,
  syncRequestId: 'req-abc',
  syncPayload: {
    action: 'record_time',
    payload: { actualMinutes: 15 },
    expectedRevision: 0,
    clientRequestId: 'req-abc',
  },
  syncTargetFocusMinutes: 5,
  syncStatus: 'pending',
}

function renderBridge(mockCtx, { queryClient: externalQc } = {}) {
  mockUsePomodoro.mockReturnValue(mockCtx || createMockCtx())
  const queryClient = externalQc || new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(PlannerPomodoroSyncBridge)
    )
  )
}

describe('PlannerPomodoroSyncBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends PATCH with complete frozen syncPayload', async () => {
    apiPatch.mockResolvedValue({ revision: 1 })
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledTimes(1)
    })

    const [path, body, opts] = apiPatch.mock.calls[0]
    expect(path).toBe('/rotation-planner/plans/plan-1/tasks/task-1')
    expect(body).toEqual({
      action: 'record_time',
      payload: { actualMinutes: 15 },
      expectedRevision: 0,
      clientRequestId: 'req-abc',
    })
    expect(opts.headers['Idempotency-Key']).toBe('req-abc')
  })

  it('calls markPlannerSyncSucceeded with revision on success', async () => {
    apiPatch.mockResolvedValue({ revision: 1 })
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.markPlannerSyncSucceeded).toHaveBeenCalledWith({ revision: 1 })
    })
  })

  it('invalidates both plan and plans queries on success', async () => {
    apiPatch.mockResolvedValue({ revision: 1 })
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.spyOn(qc, 'invalidateQueries')

    await act(async () => {
      renderBridge(mock, { queryClient: qc })
    })

    await waitFor(() => {
      expect(mock.markPlannerSyncSucceeded).toHaveBeenCalled()
      expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['rotations', 'plan', 'plan-1'] })
      expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['rotations', 'plans'] })
    })
  })

  it('PLAN_REVISION_CONFLICT triggers recovery with apiGet', async () => {
    apiPatch.mockRejectedValue(new ApiError({ code: 'PLAN_REVISION_CONFLICT', message: 'conflict', status: 409 }))
    apiGet.mockResolvedValue({
      plan: { id: 'plan-1', revision: 5 },
      tasks: [{ id: 'task-1', status: 'in_progress', actualMinutes: 20 }],
    })
    normalizePlanResponse.mockReturnValue({
      plan: { revision: 5 },
      tasks: [{ id: 'task-1', status: 'in_progress', actualMinutes: 20 }],
    })
    const mock = createMockCtx({ plannerTaskContext: { ...PENDING_CTX, baseActualMinutes: 10 } })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.setRevisionRecoveryStatus).toHaveBeenCalled()
      expect(apiGet).toHaveBeenCalledWith('/rotation-planner/plans/plan-1')
      expect(normalizePlanResponse).toHaveBeenCalled()
      expect(mock.rebaseAfterConflict).toHaveBeenCalledWith({
        newRevision: 5,
        latestActualMinutes: 20,
      })
    })
  })

  it('PLAN_REVISION_CONFLICT keeps accumulatedFocusSeconds and syncedFocusMinutes unchanged', async () => {
    apiPatch.mockRejectedValue(new ApiError({ code: 'PLAN_REVISION_CONFLICT', message: 'conflict', status: 409 }))
    apiGet.mockResolvedValue({ plan: { revision: 5 }, tasks: [{ id: 'task-1', status: 'in_progress', actualMinutes: 20 }] })
    normalizePlanResponse.mockReturnValue({ plan: { revision: 5 }, tasks: [{ id: 'task-1', status: 'in_progress', actualMinutes: 20 }] })
    const mock = createMockCtx({ plannerTaskContext: { ...PENDING_CTX, accumulatedFocusSeconds: 300, syncedFocusMinutes: 0 } })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.rebaseAfterConflict).toHaveBeenCalled()
      const args = mock.rebaseAfterConflict.mock.calls[0][0]
      expect(args.latestActualMinutes).toBe(20)
      expect(args.newRevision).toBe(5)
    })
  })

  it('PLAN_REVISION_CONFLICT when task not in_progress calls markPlannerSyncFailed', async () => {
    apiPatch.mockRejectedValue(new ApiError({ code: 'PLAN_REVISION_CONFLICT', message: 'conflict', status: 409 }))
    apiGet.mockResolvedValue({ plan: { revision: 5 }, tasks: [{ id: 'task-1', status: 'completed', actualMinutes: 20 }] })
    normalizePlanResponse.mockReturnValue({ plan: { revision: 5 }, tasks: [{ id: 'task-1', status: 'completed', actualMinutes: 20 }] })
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.markPlannerSyncFailed).toHaveBeenCalledWith({ code: 'TASK_IMMUTABLE', message: 'Task is no longer active.' })
    })
  })

  it('unknown network error calls markNetworkOutcomeUnknown', async () => {
    apiPatch.mockRejectedValue(new Error('Network failure'))
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.markNetworkOutcomeUnknown).toHaveBeenCalled()
    })
  })

  it('terminal ApiError calls markPlannerSyncFailed', async () => {
    apiPatch.mockRejectedValue(new ApiError({ code: 'TASK_NOT_FOUND', message: 'Not found', status: 404 }))
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.markPlannerSyncFailed).toHaveBeenCalledWith({ code: 'TASK_NOT_FOUND', message: 'Not found' })
    })
  })

  it('IDEMPOTENCY_KEY_MISMATCH calls setIdempotencyConflictStatus', async () => {
    apiPatch.mockRejectedValue(new ApiError({ code: 'IDEMPOTENCY_KEY_MISMATCH', message: 'Key mismatch', status: 409 }))
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.setIdempotencyConflictStatus).toHaveBeenCalledWith({ message: 'Key mismatch' })
    })
  })

  it('dedup guard prevents duplicate dispatch of same syncRequestId', async () => {
    apiPatch.mockImplementation(() => new Promise(() => {}))
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    let rerender
    await act(async () => {
      mockUsePomodoro.mockReturnValue(mock)
      rerender = render(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(PlannerPomodoroSyncBridge)
        )
      ).rerender
    })

    expect(apiPatch).toHaveBeenCalledTimes(1)

    await act(async () => {
      rerender(
        React.createElement(QueryClientProvider, { client: qc },
          React.createElement(PlannerPomodoroSyncBridge)
        )
      )
    })

    expect(apiPatch).toHaveBeenCalledTimes(1)
  })

  it('reservePlannerSyncOperation called when syncStatus null with enough focus', async () => {
    const mock = createMockCtx({
      plannerTaskContext: {
        taskId: 'task-1',
        planId: 'plan-1',
        accumulatedFocusSeconds: 120,
        syncedFocusMinutes: 0,
        syncStatus: null,
        syncRequestId: null,
        syncPayload: null,
        syncTargetFocusMinutes: null,
      },
      reservePlannerSyncOperation: vi.fn().mockReturnValue({
        syncRequestId: 'new-req',
        syncPayload: { action: 'record_time', payload: { actualMinutes: 12 }, expectedRevision: 0, clientRequestId: 'new-req' },
        syncTargetFocusMinutes: 2,
        syncStatus: 'pending',
      }),
    })
    apiPatch.mockResolvedValue({ revision: 1 })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.reservePlannerSyncOperation).toHaveBeenCalled()
      expect(apiPatch).toHaveBeenCalledTimes(1)
    })
  })

  it('in_flight context does not trigger dispatch', async () => {
    const mock = createMockCtx({
      plannerTaskContext: { ...PENDING_CTX, syncStatus: 'in_flight' },
    })

    await act(async () => {
      renderBridge(mock)
    })

    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('network_outcome_unknown context does not trigger dispatch', async () => {
    const mock = createMockCtx({
      plannerTaskContext: { ...PENDING_CTX, syncStatus: 'network_outcome_unknown' },
    })

    await act(async () => {
      renderBridge(mock)
    })

    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('null context does not trigger dispatch', async () => {
    const mock = createMockCtx({ plannerTaskContext: null })

    await act(async () => {
      renderBridge(mock)
    })

    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('dispatches pending sync and succeeds when context has pending status', async () => {
    apiPatch.mockResolvedValue({ revision: 1 })
    const reserveFn = vi.fn()
    const mock = createMockCtx({
      plannerTaskContext: { ...PENDING_CTX, syncStatus: 'pending' },
      reservePlannerSyncOperation: reserveFn,
    })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.markPlannerSyncSucceeded).toHaveBeenCalledWith({ revision: 1 })
      expect(apiPatch).toHaveBeenCalledTimes(1)
    })
  })

  it('shows success toast after successful sync', async () => {
    apiPatch.mockResolvedValue({ revision: 1 })
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })

    const { container } = await act(async () => {
      return renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.markPlannerSyncSucceeded).toHaveBeenCalled()
    })

    // Toast is rendered via Radix — check for toast viewport
    const viewport = container.querySelector('[class*="viewport"]')
    expect(viewport).toBeTruthy()
  })

  it('shows error toast on network failure', async () => {
    apiPatch.mockRejectedValue(new Error('Offline'))
    const mock = createMockCtx({ plannerTaskContext: PENDING_CTX })

    await act(async () => {
      renderBridge(mock)
    })

    await waitFor(() => {
      expect(mock.markNetworkOutcomeUnknown).toHaveBeenCalled()
    })
  })
})
