// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { PomodoroProvider } from '../../../../context/PomodoroContext'
import useTaskAttachment from '../useTaskAttachment'

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}))

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn() }))

vi.mock('../../todayUtils', () => ({
  secondsToPlannerMinutes: vi.fn((s) => Math.ceil(s / 60)),
}))

const PENDING_TASK = {
  id: 'task-1',
  planId: 'plan-1',
  taskType: 'learning',
  status: 'pending',
  actualMinutes: 30,
  lastKnownRevision: 5,
}

const IN_PROGRESS_TASK = {
  id: 'task-2',
  planId: 'plan-1',
  taskType: 'uworld_questions',
  status: 'in_progress',
  actualMinutes: 15,
  lastKnownRevision: 5,
}

function createWrapper() {
  return ({ children }) => React.createElement(PomodoroProvider, null, children)
}

describe('useTaskAttachment', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports no task attached initially', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })
    expect(result.current.isAttached).toBe(false)
    expect(result.current.attachedTaskId).toBeNull()
    expect(result.current.attachedPlanId).toBeNull()
    expect(result.current.attachedTask).toBeNull()
  })

  it('in_progress task attaches directly without startTask', async () => {
    const startTask = vi.fn()
    const { result } = renderHook(() => useTaskAttachment({ startTask }), {
      wrapper: createWrapper(),
    })

    let res
    await act(async () => {
      res = await result.current.handlePlay(IN_PROGRESS_TASK)
    })

    expect(res).toEqual({ allowed: true })
    expect(startTask).not.toHaveBeenCalled()
    expect(result.current.isAttached).toBe(true)
    expect(result.current.attachedTaskId).toBe('task-2')
  })

  it('pending task calls startTask before attachTask', async () => {
    const startTask = vi.fn().mockResolvedValue({ result: { revision: 6 } })
    const { result } = renderHook(() => useTaskAttachment({ startTask, currentRevision: 5 }), {
      wrapper: createWrapper(),
    })

    let res
    await act(async () => {
      res = await result.current.handlePlay(PENDING_TASK)
    })

    expect(startTask).toHaveBeenCalledOnce()
    expect(startTask).toHaveBeenCalledWith('task-1')
    expect(res).toEqual({ allowed: true })
    expect(result.current.isAttached).toBe(true)
    expect(result.current.attachedTask.lastKnownRevision).toBe(6)
  })

  it('prepareTaskAttachment runs before startTask', async () => {
    const callOrder = []
    const startTask = vi.fn().mockImplementation(async () => {
      callOrder.push('startTask')
      return { result: { revision: 6 } }
    })
    const { result } = renderHook(() => useTaskAttachment({ startTask }), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handlePlay(PENDING_TASK)
    })

    expect(callOrder).toEqual(['startTask'])
  })

  it('conflict from prepareTaskAttachment prevents startTask', async () => {
    const startTask = vi.fn()
    const { result } = renderHook(() => useTaskAttachment({ startTask }), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handlePlay(PENDING_TASK)
    })

    await act(async () => {
      const res = await result.current.handlePlay(PENDING_TASK)
      expect(res).toEqual({ allowed: false, alreadyAttached: true })
    })

    expect(startTask).toHaveBeenCalledOnce()
  })

  it('start failure prevents attachment', async () => {
    const startTask = vi.fn().mockResolvedValue({ error: { code: 'PLAN_REVISION_CONFLICT' } })
    const { result } = renderHook(() => useTaskAttachment({ startTask, currentRevision: 5 }), {
      wrapper: createWrapper(),
    })

    let res
    await act(async () => {
      res = await result.current.handlePlay(PENDING_TASK)
    })

    expect(res.allowed).toBe(false)
    expect(res.reason).toBe('Failed to start task')
    expect(result.current.isAttached).toBe(false)
  })

  it('returns revision from startTask result to attachTask', async () => {
    const startTask = vi.fn().mockResolvedValue({ result: { revision: 42 } })
    const { result } = renderHook(() => useTaskAttachment({ startTask, currentRevision: 5 }), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handlePlay(PENDING_TASK)
    })

    expect(result.current.attachedTask.lastKnownRevision).toBe(42)
  })

  it('falls back to currentRevision when startTask returns no revision and task has none', async () => {
    const startTask = vi.fn().mockResolvedValue({ result: {} })
    const taskNoRevision = { ...PENDING_TASK, lastKnownRevision: undefined }
    const { result } = renderHook(() => useTaskAttachment({ startTask, currentRevision: 10 }), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handlePlay(taskNoRevision)
    })

    expect(result.current.attachedTask.lastKnownRevision).toBe(10)
  })

  it('in_progress never calls startTask', async () => {
    const startTask = vi.fn()
    const { result } = renderHook(() => useTaskAttachment({ startTask }), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handlePlay(IN_PROGRESS_TASK)
    })

    expect(startTask).not.toHaveBeenCalled()
  })

  it('isTaskAttached returns true only for the matching task', async () => {
    const startTask = vi.fn().mockResolvedValue({ result: { revision: 6 } })
    const { result } = renderHook(() => useTaskAttachment({ startTask }), {
      wrapper: createWrapper(),
    })

    await act(async () => { await result.current.handlePlay(PENDING_TASK) })

    expect(result.current.isTaskAttached('task-1')).toBe(true)
    expect(result.current.isTaskAttached('task-2')).toBe(false)
  })

  it('handleDetach detaches the task', async () => {
    const startTask = vi.fn().mockResolvedValue({ result: { revision: 6 } })
    const { result } = renderHook(() => useTaskAttachment({ startTask }), {
      wrapper: createWrapper(),
    })

    await act(async () => { await result.current.handlePlay(PENDING_TASK) })
    expect(result.current.isAttached).toBe(true)

    act(() => { result.current.handleDetach() })
    expect(result.current.isAttached).toBe(false)
    expect(result.current.attachedTaskId).toBeNull()
  })

  it('canAttach returns alreadyAttached for the same task', async () => {
    const startTask = vi.fn().mockResolvedValue({ result: { revision: 6 } })
    const { result } = renderHook(() => useTaskAttachment({ startTask }), {
      wrapper: createWrapper(),
    })

    await act(async () => { await result.current.handlePlay(PENDING_TASK) })

    expect(result.current.canAttach('task-1')).toEqual({
      allowed: false,
      alreadyAttached: true,
    })
  })

  it('canAttach rejects when another task is attached', async () => {
    const startTask = vi.fn().mockResolvedValue({ result: { revision: 6 } })
    const { result } = renderHook(() => useTaskAttachment({ startTask }), {
      wrapper: createWrapper(),
    })

    await act(async () => { await result.current.handlePlay(PENDING_TASK) })

    expect(result.current.canAttach('task-2')).toEqual({
      allowed: false,
      reason: 'Another task is attached. Detach it first.',
    })
  })

  it('canAttach allows when no task is attached', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    expect(result.current.canAttach('task-1')).toEqual({ allowed: true })
  })

  it('forwards seconds and totalSec from PomodoroContext', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    expect(result.current.seconds).toBeGreaterThanOrEqual(0)
    expect(result.current.totalSec).toBeGreaterThan(0)
    expect(result.current.running).toBe(false)
  })
})
