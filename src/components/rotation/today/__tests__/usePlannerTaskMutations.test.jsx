// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

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

import { apiPatch, apiPost, ApiError } from '../../../../lib/api'
import usePlannerTaskMutations from '../usePlannerTaskMutations'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = ({ children }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )
  return { queryClient, invalidateSpy, wrapper }
}

const PLAN_ID = 'plan-abc-123'
const TASK_ID = 'task-def-456'

function makeHookArgs(overrides = {}) {
  return {
    planId: PLAN_ID,
    initialRevision: 0,
    getRecalculationDate: () => '2026-01-06',
    ...overrides,
  }
}

function renderMutationsHook(overrides = {}, { wrapper: w } = {}) {
  const { wrapper: defaultWrapper } = createWrapper()
  return renderHook(
    (args) => usePlannerTaskMutations(args),
    {
      wrapper: w || defaultWrapper,
      initialProps: makeHookArgs(overrides),
    }
  )
}

describe('usePlannerTaskMutations', () => {
  let wrapper, invalidateSpy, queryClient

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
    const w = createWrapper()
    wrapper = w.wrapper
    invalidateSpy = w.invalidateSpy
    queryClient = w.queryClient
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('basic functionality', () => {
    it('sends PATCH to the correct route /rotation-planner/plans/:planId/tasks/:taskId', async () => {
      apiPatch.mockResolvedValueOnce({ taskId: TASK_ID, action: 'start', status: 'in_progress', revision: 1 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      expect(apiPatch).toHaveBeenCalledOnce()
      const [path] = apiPatch.mock.calls[0]
      expect(path).toBe(`/rotation-planner/plans/${PLAN_ID}/tasks/${TASK_ID}`)
    })

    it('sends body with action, payload, expectedRevision, and clientRequestId', async () => {
      apiPatch.mockResolvedValueOnce({ taskId: TASK_ID, action: 'complete', status: 'completed', revision: 1 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.completeTask(TASK_ID, { actualMinutes: 30, completedCount: 5 })
      })

      const [, body] = apiPatch.mock.calls[0]
      expect(body.action).toBe('complete')
      expect(body.payload).toEqual({ actualMinutes: 30, completedCount: 5 })
      expect(body.expectedRevision).toBe(0)
      expect(typeof body.clientRequestId).toBe('string')
      expect(body.clientRequestId.length).toBeGreaterThan(0)
    })

    it('sends the same request ID in Idempotency-Key header', async () => {
      apiPatch.mockResolvedValueOnce({ taskId: TASK_ID, action: 'start', status: 'in_progress', revision: 1 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      const [, body, opts] = apiPatch.mock.calls[0]
      expect(opts.headers['Idempotency-Key']).toBe(body.clientRequestId)
    })

    it('generates a different key for a different mutation call', async () => {
      apiPatch.mockResolvedValue({ taskId: TASK_ID, action: 'start', status: 'in_progress', revision: 1 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })
      const key1 = apiPatch.mock.calls[0][1].clientRequestId

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })
      const key2 = apiPatch.mock.calls[1][1].clientRequestId

      expect(key1).not.toBe(key2)
    })

    it('uses the revision returned by the task mutation', async () => {
      apiPatch.mockResolvedValueOnce({ taskId: TASK_ID, action: 'start', status: 'in_progress', revision: 1 })
      apiPatch.mockResolvedValueOnce({ taskId: TASK_ID, action: 'complete', status: 'completed', revision: 2 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })
      expect(apiPatch.mock.calls[0][1].expectedRevision).toBe(0)

      await act(async () => {
        await result.current.completeTask(TASK_ID, {})
      })
      expect(apiPatch.mock.calls[1][1].expectedRevision).toBe(1)
    })

    it('invalidates plan query and plans list after success', async () => {
      apiPatch.mockResolvedValueOnce({ taskId: TASK_ID, action: 'start', status: 'in_progress', revision: 1 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['rotations', 'plan', PLAN_ID]) })
      )
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['rotations', 'plans']) })
      )
    })

    it('exposes currentRevision from hook', async () => {
      const { result } = renderMutationsHook({}, { wrapper })

      expect(result.current.currentRevision).toBe(0)

      apiPatch.mockResolvedValueOnce({ taskId: TASK_ID, action: 'start', status: 'in_progress', revision: 1 })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      expect(result.current.currentRevision).toBe(1)
    })

    it('convenience methods: startTask, completeTask, partialTask, skipTask, recordTime, recordQuestions', async () => {
      apiPatch.mockResolvedValue({ taskId: TASK_ID, status: 'in_progress', revision: 1 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })
      expect(apiPatch.mock.calls[0][1].action).toBe('start')
      expect(apiPatch.mock.calls[0][1].payload).toEqual({})

      await act(async () => {
        await result.current.completeTask(TASK_ID, { actualMinutes: 45 })
      })
      expect(apiPatch.mock.calls[1][1].action).toBe('complete')
      expect(apiPatch.mock.calls[1][1].payload).toEqual({ actualMinutes: 45 })

      await act(async () => {
        await result.current.partialTask(TASK_ID, { completedPercentage: 50 })
      })
      expect(apiPatch.mock.calls[2][1].action).toBe('partial')
      expect(apiPatch.mock.calls[2][1].payload).toEqual({ completedPercentage: 50 })

      await act(async () => {
        await result.current.skipTask(TASK_ID)
      })
      expect(apiPatch.mock.calls[3][1].action).toBe('skip')
      expect(apiPatch.mock.calls[3][1].payload).toEqual({})

      await act(async () => {
        await result.current.recordTime(TASK_ID, 25)
      })
      expect(apiPatch.mock.calls[4][1].action).toBe('record_time')
      expect(apiPatch.mock.calls[4][1].payload).toEqual({ actualMinutes: 25 })

      await act(async () => {
        await result.current.recordQuestions(TASK_ID, { completedCount: 10, incorrectCount: 2 })
      })
      expect(apiPatch.mock.calls[5][1].action).toBe('record_questions')
      expect(apiPatch.mock.calls[5][1].payload).toEqual({ completedCount: 10, incorrectCount: 2 })
    })
  })

  describe('error handling', () => {
    it('invalidates queries on PLAN_REVISION_CONFLICT error', async () => {
      apiPatch.mockRejectedValueOnce(
        new ApiError({ code: 'PLAN_REVISION_CONFLICT', message: 'Plan modified', status: 409 })
      )

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        try { await result.current.startTask(TASK_ID) } catch {}
      })

      expect(invalidateSpy).toHaveBeenCalled()
    })

    it('does not invalidate on IDEMPOTENCY_CONFLICT', async () => {
      apiPatch.mockRejectedValueOnce(
        new ApiError({ code: 'IDEMPOTENCY_CONFLICT', message: 'Duplicate', status: 409 })
      )

      const { result } = renderMutationsHook({}, { wrapper })
      invalidateSpy.mockClear()

      await act(async () => {
        try { await result.current.startTask(TASK_ID) } catch {}
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('does not invalidate on COMPLETED_TASK_IMMUTABLE', async () => {
      apiPatch.mockRejectedValueOnce(
        new ApiError({ code: 'COMPLETED_TASK_IMMUTABLE', message: 'Cannot modify', status: 409 })
      )

      const { result } = renderMutationsHook({}, { wrapper })
      invalidateSpy.mockClear()

      await act(async () => {
        try { await result.current.startTask(TASK_ID) } catch {}
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('does not invalidate on VALIDATION_ERROR', async () => {
      apiPatch.mockRejectedValueOnce(
        new ApiError({ code: 'VALIDATION_ERROR', message: 'Invalid input', status: 422 })
      )

      const { result } = renderMutationsHook({}, { wrapper })
      invalidateSpy.mockClear()

      await act(async () => {
        try { await result.current.startTask(TASK_ID) } catch {}
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('propagates errors to the caller', async () => {
      const err = new ApiError({ code: 'SOME_ERROR', message: 'Something went wrong', status: 500 })
      apiPatch.mockRejectedValueOnce(err)

      const { result } = renderMutationsHook({}, { wrapper })

      let caught
      await act(async () => {
        try { await result.current.startTask(TASK_ID) } catch (e) { caught = e }
      })

      expect(caught).toBeDefined()
      expect(caught).toBe(err)
      expect(caught.code).toBe('SOME_ERROR')
      expect(caught.message).toBe('Something went wrong')
    })
  })

  describe('recalculation', () => {
    it('sets recalculationState when PATCH returns recalculationRequired: true', async () => {
      apiPatch.mockResolvedValueOnce({
        taskId: TASK_ID,
        action: 'start',
        status: 'in_progress',
        revision: 1,
        recalculationRequired: true,
      })

      const { result } = renderMutationsHook({}, { wrapper })

      expect(result.current.recalculationState).toBeNull()

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      expect(result.current.recalculationState).toEqual({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'start',
        recalculationDate: '2026-01-06',
        status: 'pending',
      })
    })

    it('does not set recalculationState when PATCH returns recalculationRequired: false', async () => {
      apiPatch.mockResolvedValueOnce({
        taskId: TASK_ID,
        action: 'start',
        status: 'in_progress',
        revision: 1,
        recalculationRequired: false,
      })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      expect(result.current.recalculationState).toBeNull()
    })

    it('retryRecalculation calls apiPost to recalculate endpoint', async () => {
      apiPatch.mockResolvedValueOnce({
        taskId: TASK_ID,
        action: 'start',
        status: 'in_progress',
        revision: 1,
        recalculationRequired: true,
      })
      apiPost.mockResolvedValueOnce({ revision: 2 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      await act(async () => {
        await result.current.retryRecalculation()
      })

      expect(apiPost).toHaveBeenCalledOnce()
      const [path, body, opts] = apiPost.mock.calls[0]
      expect(path).toBe(`/rotation-planner/plans/${PLAN_ID}/recalculate`)
      expect(body.recalculationDate).toBe('2026-01-06')
      expect(body.expectedRevision).toBe(1)
      expect(typeof body.clientRequestId).toBe('string')
      expect(opts.headers['Idempotency-Key']).toBe(body.clientRequestId)
    })

    it('retryRecalculation clears recalculationState on success and updates revision', async () => {
      apiPatch.mockResolvedValueOnce({
        taskId: TASK_ID,
        action: 'start',
        status: 'in_progress',
        revision: 1,
        recalculationRequired: true,
      })
      apiPost.mockResolvedValueOnce({ revision: 3 })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      expect(result.current.recalculationState).not.toBeNull()

      await act(async () => {
        await result.current.retryRecalculation()
      })

      expect(result.current.recalculationState).toBeNull()
      expect(result.current.currentRevision).toBe(3)
    })

    it('handles TASK_IN_PROGRESS from recalculate by setting blocked status', async () => {
      apiPatch.mockResolvedValueOnce({
        taskId: TASK_ID,
        action: 'start',
        status: 'in_progress',
        revision: 1,
        recalculationRequired: true,
      })

      const recalcErr = new ApiError({
        code: 'TASK_IN_PROGRESS',
        message: 'Another task is in progress',
        status: 409,
        details: { inProgressTaskId: 'task-xyz-789' },
      })
      apiPost.mockRejectedValueOnce(recalcErr)

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      await act(async () => {
        try { await result.current.retryRecalculation() } catch {}
      })

      expect(result.current.recalculationState).toEqual({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'start',
        recalculationDate: '2026-01-06',
        status: 'blocked',
        blockedByTaskId: 'task-xyz-789',
      })
    })
  })

  describe('reset', () => {
    it('reset clears mutation state and recalculationState', async () => {
      apiPatch.mockResolvedValueOnce({
        taskId: TASK_ID,
        action: 'start',
        status: 'in_progress',
        revision: 1,
        recalculationRequired: true,
      })

      const { result } = renderMutationsHook({}, { wrapper })

      await act(async () => {
        await result.current.startTask(TASK_ID)
      })

      expect(result.current.recalculationState).not.toBeNull()
      expect(result.current.currentRevision).toBe(1)

      act(() => {
        result.current.reset()
      })

      expect(result.current.recalculationState).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.isPending).toBe(false)
    })
  })
})
