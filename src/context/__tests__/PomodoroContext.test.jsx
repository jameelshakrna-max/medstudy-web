// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { PomodoroProvider, usePomodoro } from '../PomodoroContext'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}))

vi.mock('../../components/rotation/today/todayUtils', () => ({
  secondsToPlannerMinutes: vi.fn((s) => Math.ceil(s / 60)),
}))

import * as todayUtils from '../../components/rotation/today/todayUtils'

function createWrapper() {
  return ({ children }) => React.createElement(PomodoroProvider, null, children)
}

function renderPomodoro() {
  return renderHook(() => usePomodoro(), { wrapper: createWrapper() })
}

const TASK = { taskId: 'task-1', planId: 'plan-1', taskType: 'learning', actualMinutes: 10, lastKnownRevision: 0 }

describe('PomodoroContext planner extensions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockImplementation((s) => Math.ceil(s / 60))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('prepareTaskAttachment', () => {
    it('returns allowed when no task attached and timer idle', () => {
      const { result } = renderPomodoro()
      const check = result.current.prepareTaskAttachment(TASK)
      expect(check.allowed).toBe(true)
      expect(check.context.taskId).toBe('task-1')
      expect(check.context._version).toBe(1)
    })

    it('returns alreadyAttached:true when same task re-attached', () => {
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      const check = result.current.prepareTaskAttachment(TASK)
      expect(check.allowed).toBe(false)
      expect(check.alreadyAttached).toBe(true)
    })

    it('blocks when frozen operation exists', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      expect(result.current.plannerTaskContext.syncRequestId).toBeTruthy()
      const check = result.current.prepareTaskAttachment({ ...TASK, taskId: 'task-2' })
      expect(check.allowed).toBe(false)
      expect(check.reason).toMatch(/pending sync/i)
    })
  })

  describe('attachTask', () => {
    it('sets plannerTaskContext with correct initial shape', () => {
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      const ctx = result.current.plannerTaskContext
      expect(ctx.taskId).toBe('task-1')
      expect(ctx.planId).toBe('plan-1')
      expect(ctx.baseActualMinutes).toBe(10)
      expect(ctx.accumulatedFocusSeconds).toBe(0)
      expect(ctx.syncedFocusMinutes).toBe(0)
      expect(ctx.lastKnownRevision).toBe(0)
      expect(ctx.syncStatus).toBeNull()
      expect(ctx.syncRequestId).toBeNull()
    })

    it('returns alreadyAttached for same task without changing context', () => {
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      const before = result.current.plannerTaskContext
      const res = act(() => result.current.attachTask(TASK))
      expect(result.current.plannerTaskContext).toBe(before)
    })
  })

  describe('detachTask', () => {
    it('clears context when no blocking operation', () => {
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      expect(result.current.plannerTaskContext).toBeTruthy()
      act(() => { result.current.detachTask() })
      expect(result.current.plannerTaskContext).toBeNull()
    })

    it('blocks when syncRequestId exists', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      const res = act(() => result.current.detachTask())
      expect(result.current.plannerTaskContext).toBeTruthy()
    })
  })

  describe('reservePlannerSyncOperation', () => {
    it('returns null when no task attached', () => {
      const { result } = renderPomodoro()
      const op = result.current.reservePlannerSyncOperation()
      expect(op).toBeNull()
    })

    it('returns null when syncRequestId already exists', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      const op = result.current.reservePlannerSyncOperation()
      expect(op).toBeNull()
    })

    it('returns operation when focus is sufficient', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      let op
      act(() => { op = result.current.reservePlannerSyncOperation() })
      expect(op).not.toBeNull()
      expect(op.syncRequestId).toBeTruthy()
      expect(op.syncPayload.action).toBe('record_time')
      expect(op.syncPayload.payload.actualMinutes).toBe(15)
      expect(op.syncPayload.expectedRevision).toBe(0)
      expect(op.syncTargetFocusMinutes).toBe(5)
      expect(result.current.plannerTaskContext.syncStatus).toBe('pending')
    })
  })

  describe('markPlannerSyncInFlight', () => {
    it('transitions pending to in_flight', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      expect(result.current.plannerTaskContext.syncStatus).toBe('pending')
      act(() => { result.current.markPlannerSyncInFlight() })
      expect(result.current.plannerTaskContext.syncStatus).toBe('in_flight')
    })
  })

  describe('markPlannerSyncSucceeded', () => {
    it('clears operation and advances syncedFocusMinutes to frozen target', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      act(() => { result.current.markPlannerSyncInFlight() })
      act(() => { result.current.markPlannerSyncSucceeded({ revision: 1 }) })
      const ctx = result.current.plannerTaskContext
      expect(ctx.syncedFocusMinutes).toBe(5)
      expect(ctx.baseActualMinutes).toBe(15)
      expect(ctx.lastKnownRevision).toBe(1)
      expect(ctx.syncRequestId).toBeNull()
      expect(ctx.syncPayload).toBeNull()
      expect(ctx.syncStatus).toBeNull()
    })
  })

  describe('markPlannerSyncFailed', () => {
    it('sets terminal_error status with code and message', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      act(() => { result.current.markPlannerSyncInFlight() })
      act(() => { result.current.markPlannerSyncFailed({ code: 'SERVER_ERROR', message: 'Oops' }) })
      const ctx = result.current.plannerTaskContext
      expect(ctx.syncStatus).toBe('terminal_error')
      expect(ctx.syncErrorCode).toBe('SERVER_ERROR')
      expect(ctx.syncErrorMessage).toBe('Oops')
      expect(ctx.syncRequestId).toBeTruthy()
      expect(ctx.syncPayload).toBeTruthy()
    })
  })

  describe('retryPlannerSync', () => {
    it('transitions network_outcome_unknown to pending preserving payload', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      act(() => { result.current.markPlannerSyncInFlight() })
      act(() => { result.current.markNetworkOutcomeUnknown() })
      const before = result.current.plannerTaskContext
      const savedRequestId = before.syncRequestId
      const savedPayload = before.syncPayload
      act(() => { result.current.retryPlannerSync() })
      const after = result.current.plannerTaskContext
      expect(after.syncStatus).toBe('pending')
      expect(after.syncRequestId).toBe(savedRequestId)
      expect(after.syncPayload).toEqual(savedPayload)
    })

    it('transitions terminal_error to pending preserving payload', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      act(() => { result.current.markPlannerSyncInFlight() })
      act(() => { result.current.markPlannerSyncFailed({ code: 'ERR', message: 'fail' }) })
      const savedRequestId = result.current.plannerTaskContext.syncRequestId
      act(() => { result.current.retryPlannerSync() })
      expect(result.current.plannerTaskContext.syncStatus).toBe('pending')
      expect(result.current.plannerTaskContext.syncRequestId).toBe(savedRequestId)
    })
  })

  describe('rebaseAfterConflict', () => {
    it('updates baseActualMinutes and lastKnownRevision, clears operation, keeps counters', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      act(() => { result.current.markPlannerSyncInFlight() })
      act(() => { result.current.rebaseAfterConflict({ newRevision: 5, latestActualMinutes: 20 }) })
      const ctx = result.current.plannerTaskContext
      expect(ctx.baseActualMinutes).toBe(20)
      expect(ctx.lastKnownRevision).toBe(5)
      expect(ctx.accumulatedFocusSeconds).toBe(0)
      expect(ctx.syncedFocusMinutes).toBe(0)
      expect(ctx.syncRequestId).toBeNull()
      expect(ctx.syncPayload).toBeNull()
      expect(ctx.syncStatus).toBeNull()
    })
  })

  describe('discardPendingPlannerSync', () => {
    it('clears everything', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      act(() => { result.current.discardPendingPlannerSync() })
      expect(result.current.plannerTaskContext).toBeNull()
    })
  })

  describe('resetSession', () => {
    it('preserves plannerTaskContext', () => {
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      expect(result.current.plannerTaskContext).toBeTruthy()
      act(() => { result.current.resetSession() })
      expect(result.current.plannerTaskContext).toBeTruthy()
      expect(result.current.plannerTaskContext.taskId).toBe('task-1')
    })
  })

  describe('setRevisionRecoveryStatus', () => {
    it('sets revision_recovery status', () => {
      vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
      const { result } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { result.current.reservePlannerSyncOperation() })
      act(() => { result.current.markPlannerSyncInFlight() })
      act(() => { result.current.setRevisionRecoveryStatus() })
      expect(result.current.plannerTaskContext.syncStatus).toBe('revision_recovery')
    })
  })

  describe('persistence', () => {
    it('saves and restores plannerTaskContext across remount', () => {
      const { result, unmount } = renderPomodoro()
      act(() => { result.current.attachTask(TASK) })
      act(() => { vi.advanceTimersByTime(1100) })
      unmount()
      const { result: result2 } = renderPomodoro()
      expect(result2.current.plannerTaskContext).toBeTruthy()
      expect(result2.current.plannerTaskContext.taskId).toBe('task-1')
    })
  })
})
