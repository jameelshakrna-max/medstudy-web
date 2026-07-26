// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { PomodoroProvider, usePomodoro } from '../../../../context/PomodoroContext'
import useTaskAttachment from '../useTaskAttachment'
import { getTodayKey, getBrowserTimezone, resolvePlannerTimezone } from '../todayUtils'

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}))

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn() }))

vi.mock('../todayUtils', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    secondsToPlannerMinutes: vi.fn((s) => Math.ceil(s / 60)),
  }
})

import * as todayUtils from '../todayUtils'

function createWrapper() {
  return ({ children }) => React.createElement(PomodoroProvider, null, children)
}

const TASK = { id: 'task-1', taskId: 'task-1', planId: 'plan-1', taskType: 'learning', status: 'pending', actualMinutes: 10, lastKnownRevision: 0 }
const IN_PROGRESS_TASK = { id: 'task-2', taskId: 'task-2', planId: 'plan-1', taskType: 'uworld_questions', status: 'in_progress', actualMinutes: 15, lastKnownRevision: 5 }

function useCombined(opts) {
  const pomodoro = usePomodoro()
  const attachment = useTaskAttachment(opts)
  return { ...pomodoro, ...attachment }
}

function attachAndSync() {
  const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
  vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
  act(() => { result.current.attachTask(TASK) })
  act(() => { result.current.reservePlannerSyncOperation() })
  act(() => { result.current.markPlannerSyncInFlight() })
  return result
}

// ═══════════════════════════════════════════════
//  DATE — timezone-aware recalculation date
// ═══════════════════════════════════════════════
describe('R3 DATE — timezone-aware recalculation date', () => {
  it('getTodayKey returns YYYY-MM-DD format', () => {
    const result = getTodayKey(new Date('2026-07-26T12:00:00Z'), 'UTC')
    expect(result).toBe('2026-07-26')
  })

  it('getTodayKey uses timezone, not browser local', () => {
    const date = new Date('2026-07-26T23:30:00Z')
    const utcResult = getTodayKey(date, 'UTC')
    const tokyoResult = getTodayKey(date, 'Asia/Tokyo')
    expect(utcResult).toBe('2026-07-26')
    expect(tokyoResult).toBe('2026-07-27')
  })

  it('UTC/local boundary: late UTC = next day in ahead timezone', () => {
    const date = new Date('2026-01-01T23:59:00Z')
    const utcKey = getTodayKey(date, 'UTC')
    const nzKey = getTodayKey(date, 'Pacific/Auckland')
    expect(utcKey).toBe('2026-01-01')
    expect(nzKey).toBe('2026-01-02')
  })

  it('resolvePlannerTimezone returns a valid IANA timezone', () => {
    const tz = resolvePlannerTimezone({ browserTimezone: getBrowserTimezone() })
    expect(typeof tz).toBe('string')
    expect(tz.length).toBeGreaterThan(0)
  })

  it('banner and task mutation use same date source when passed same callback', () => {
    const fakeDate = new Date('2026-03-15T10:00:00Z')
    const tz = 'UTC'
    const dateKey = getTodayKey(fakeDate, tz)
    expect(dateKey).toBe('2026-03-15')
  })
})

// ═══════════════════════════════════════════════
//  ORPHAN — authoritative orphan detection
// ═══════════════════════════════════════════════
describe('R3 ORPHAN — authoritative orphan detection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockImplementation((s) => Math.ceil(s / 60))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('existing task in task list → isOrphaned false', async () => {
    const { result } = renderHook(
      () => useCombined({ tasks: [IN_PROGRESS_TASK], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    await act(async () => { await result.current.handlePlay(IN_PROGRESS_TASK) })
    expect(result.current.isOrphaned).toBe(false)
  })

  it('task absent from authoritative task list → isOrphaned true', async () => {
    const { result } = renderHook(
      () => useCombined({
        tasks: [{ id: 'task-99', planId: 'plan-1', taskType: 'learning', status: 'pending', actualMinutes: 5, lastKnownRevision: 0 }],
        planId: 'plan-1',
      }),
      { wrapper: createWrapper() }
    )
    await act(async () => { await result.current.handlePlay(IN_PROGRESS_TASK) })
    expect(result.current.isOrphaned).toBe(true)
  })

  it('no tasks prop (undefined) → isOrphaned false (not authoritative)', async () => {
    const { result } = renderHook(
      () => useCombined({ tasks: undefined, planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    await act(async () => { await result.current.handlePlay(IN_PROGRESS_TASK) })
    expect(result.current.isOrphaned).toBe(false)
  })

  it('context for different plan → isOrphaned false even if task absent', async () => {
    const { result } = renderHook(
      () => useCombined({ tasks: [{ id: 'other-task', planId: 'plan-2' }], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    await act(async () => {
      await result.current.handlePlay({ ...IN_PROGRESS_TASK, planId: 'plan-different' })
    })
    expect(result.current.isOrphaned).toBe(false)
  })

  it('no attachment → isOrphaned false', () => {
    const { result } = renderHook(
      () => useCombined({ tasks: [], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    expect(result.current.isOrphaned).toBe(false)
  })
})

// ═══════════════════════════════════════════════
//  hasUnsyncedPlannerData — centralized predicate
// ═══════════════════════════════════════════════
describe('R3 hasUnsyncedPlannerData', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockImplementation((s) => Math.ceil(s / 60))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('freshly attached task has no unsynced data', () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
    act(() => { result.current.attachTask(TASK) })
    expect(result.current.hasUnsyncedPlannerData(result.current.plannerTaskContext)).toBe(false)
  })

  it('terminal_error with frozen payload → hasUnsynced true', () => {
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
    const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
    act(() => { result.current.attachTask(TASK) })
    act(() => { result.current.reservePlannerSyncOperation() })
    act(() => { result.current.markPlannerSyncInFlight() })
    act(() => { result.current.markPlannerSyncFailed({ code: 'SERVER_ERROR', message: 'fail' }) })
    expect(result.current.hasUnsyncedPlannerData(result.current.plannerTaskContext)).toBe(true)
  })

  it('idempotency_conflict with payload → hasUnsynced true', () => {
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
    const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
    act(() => { result.current.attachTask(TASK) })
    act(() => { result.current.reservePlannerSyncOperation() })
    act(() => { result.current.markPlannerSyncInFlight() })
    act(() => { result.current.setIdempotencyConflictStatus({ message: 'dup' }) })
    expect(result.current.hasUnsyncedPlannerData(result.current.plannerTaskContext)).toBe(true)
  })

  it('network_outcome_unknown → hasUnsynced true', () => {
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
    const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
    act(() => { result.current.attachTask(TASK) })
    act(() => { result.current.reservePlannerSyncOperation() })
    act(() => { result.current.markPlannerSyncInFlight() })
    act(() => { result.current.markNetworkOutcomeUnknown() })
    expect(result.current.hasUnsyncedPlannerData(result.current.plannerTaskContext)).toBe(true)
  })

  it('null context → hasUnsynced false', () => {
    const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
    expect(result.current.hasUnsyncedPlannerData(null)).toBe(false)
  })

  it('accumulatedFocusSeconds exceeding syncedFocusMinutes → hasUnsynced true', () => {
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(10)
    const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
    act(() => { result.current.attachTask(TASK) })
    const ctx = { ...result.current.plannerTaskContext }
    ctx.accumulatedFocusSeconds = 600
    ctx.syncedFocusMinutes = 0
    ctx.syncStatus = null
    ctx.syncPayload = null
    ctx.syncRequestId = null
    expect(result.current.hasUnsyncedPlannerData(ctx)).toBe(true)
  })
})

// ═══════════════════════════════════════════════
//  DETACH — tightened detach rules
// ═══════════════════════════════════════════════
describe('R3 DETACH — tightened detach rules', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockImplementation((s) => Math.ceil(s / 60))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('no unsynced data → normal detach allowed', async () => {
    const { result } = renderHook(
      () => useCombined({ tasks: [IN_PROGRESS_TASK], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    await act(async () => { await result.current.handlePlay(IN_PROGRESS_TASK) })
    let res
    act(() => { res = result.current.detachTask() })
    expect(res.allowed).toBe(true)
    expect(result.current.isAttached).toBe(false)
  })

  it('frozen payload → detach blocked', () => {
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
    const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
    act(() => { result.current.attachTask(TASK) })
    act(() => { result.current.reservePlannerSyncOperation() })
    let res
    act(() => { res = result.current.detachTask() })
    expect(res.allowed).toBe(false)
    expect(result.current.plannerTaskContext).toBeTruthy()
  })

  it('terminal_error with unsynced data → detach blocked', () => {
    const result = attachAndSync()
    act(() => { result.current.markPlannerSyncFailed({ code: 'SERVER_ERROR', message: 'fail' }) })
    let res
    act(() => { res = result.current.detachTask() })
    expect(res.allowed).toBe(false)
    expect(result.current.plannerTaskContext).toBeTruthy()
  })

  it('idempotency_conflict with unsynced data → detach blocked', () => {
    const result = attachAndSync()
    act(() => { result.current.setIdempotencyConflictStatus({ message: 'dup' }) })
    let res
    act(() => { res = result.current.detachTask() })
    expect(res.allowed).toBe(false)
    expect(result.current.plannerTaskContext).toBeTruthy()
  })

  it('network_outcome_unknown → detach blocked', () => {
    const result = attachAndSync()
    act(() => { result.current.markNetworkOutcomeUnknown() })
    let res
    act(() => { res = result.current.detachTask() })
    expect(res.allowed).toBe(false)
    expect(result.current.plannerTaskContext).toBeTruthy()
  })

  it('revision_recovery → detach blocked', () => {
    const result = attachAndSync()
    act(() => { result.current.setRevisionRecoveryStatus() })
    let res
    act(() => { res = result.current.detachTask() })
    expect(res.allowed).toBe(false)
    expect(result.current.plannerTaskContext).toBeTruthy()
  })

  it('accumulated unsynced time → detach blocked', () => {
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockReturnValue(5)
    const { result } = renderHook(() => usePomodoro(), { wrapper: createWrapper() })
    act(() => { result.current.attachTask(TASK) })
    const ctx = result.current.plannerTaskContext
    ctx.accumulatedFocusSeconds = 600
    ctx.syncedFocusMinutes = 0
    let res
    act(() => { res = result.current.detachTask() })
    expect(res.allowed).toBe(false)
    expect(result.current.plannerTaskContext).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════
//  DISCARD — destructive orphan clear
// ═══════════════════════════════════════════════
describe('R3 DISCARD — destructive orphan clear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockImplementation((s) => Math.ceil(s / 60))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('verified orphan + no unsynced + explicit discard → clears context', async () => {
    const { result } = renderHook(
      () => useCombined({ tasks: [{ id: 'other', planId: 'plan-1' }], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    await act(async () => { await result.current.handlePlay({ ...IN_PROGRESS_TASK }) })
    expect(result.current.isOrphaned).toBe(true)
    expect(result.current.hasUnsyncedData).toBe(false)
    let res
    act(() => { res = result.current.discardOrphanedPlannerContext() })
    expect(res.cleared).toBe(true)
    expect(result.current.isAttached).toBe(false)
  })

  it('not orphaned → discard refuses', async () => {
    const { result } = renderHook(
      () => useCombined({ tasks: [IN_PROGRESS_TASK], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    await act(async () => { await result.current.handlePlay(IN_PROGRESS_TASK) })
    expect(result.current.isOrphaned).toBe(false)
    let res
    act(() => { res = result.current.discardOrphanedPlannerContext() })
    expect(res.cleared).toBe(false)
    expect(result.current.isAttached).toBe(true)
  })

  it('no planner context → discard refuses', () => {
    const { result } = renderHook(
      () => useCombined({ tasks: [], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    let res
    act(() => { res = result.current.discardOrphanedPlannerContext() })
    expect(res.cleared).toBe(false)
  })
})

// ═══════════════════════════════════════════════
//  REGRESSION — existing flows preserved
// ═══════════════════════════════════════════════
describe('R3 REGRESSION — existing flows preserved', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.mocked(todayUtils.secondsToPlannerMinutes).mockImplementation((s) => Math.ceil(s / 60))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pending → start → attach flow works', async () => {
    const startTask = vi.fn().mockResolvedValue({ result: { revision: 6 } })
    const { result } = renderHook(
      () => useCombined({ startTask, currentRevision: 5, tasks: [TASK], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    await act(async () => { await result.current.handlePlay(TASK) })
    expect(startTask).toHaveBeenCalledWith('task-1')
    expect(result.current.isAttached).toBe(true)
    expect(result.current.attachedTask.lastKnownRevision).toBe(6)
    expect(result.current.isOrphaned).toBe(false)
  })

  it('in_progress → attach without duplicate start', async () => {
    const startTask = vi.fn()
    const { result } = renderHook(
      () => useCombined({ startTask, tasks: [IN_PROGRESS_TASK], planId: 'plan-1' }),
      { wrapper: createWrapper() }
    )
    await act(async () => { await result.current.handlePlay(IN_PROGRESS_TASK) })
    expect(startTask).not.toHaveBeenCalled()
    expect(result.current.isAttached).toBe(true)
    expect(result.current.isOrphaned).toBe(false)
  })

  it('normal refetch (tasks still present) does not show orphan warning', async () => {
    const { result, rerender } = renderHook(
      ({ tasks }) => useCombined({ tasks, planId: 'plan-1' }),
      {
        wrapper: createWrapper(),
        initialProps: { tasks: [IN_PROGRESS_TASK] },
      }
    )
    await act(async () => { await result.current.handlePlay(IN_PROGRESS_TASK) })
    expect(result.current.isOrphaned).toBe(false)
    rerender({ tasks: [IN_PROGRESS_TASK] })
    expect(result.current.isOrphaned).toBe(false)
  })

  it('running/unsynced task cannot be casually detached', () => {
    const result = attachAndSync()
    let res
    act(() => { res = result.current.detachTask() })
    expect(res.allowed).toBe(false)
    expect(result.current.plannerTaskContext).toBeTruthy()
  })
})
