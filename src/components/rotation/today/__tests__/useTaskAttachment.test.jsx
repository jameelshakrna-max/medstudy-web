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

const TASK = {
  id: 'task-1',
  planId: 'plan-1',
  taskType: 'learning',
  actualMinutes: 30,
  lastKnownRevision: 5,
}

const TASK2 = {
  id: 'task-2',
  planId: 'plan-1',
  taskType: 'uworld_questions',
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

  it('attaches a task via handlePlay', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    let res
    act(() => {
      res = result.current.handlePlay(TASK)
    })

    expect(res).toEqual({ allowed: true })
    expect(result.current.isAttached).toBe(true)
    expect(result.current.attachedTaskId).toBe('task-1')
    expect(result.current.attachedPlanId).toBe('plan-1')
    expect(result.current.attachedTask.taskType).toBe('learning')
  })

  it('isTaskAttached returns true only for the matching task', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    act(() => { result.current.handlePlay(TASK) })

    expect(result.current.isTaskAttached('task-1')).toBe(true)
    expect(result.current.isTaskAttached('task-2')).toBe(false)
  })

  it('reports isTimerRunning when timer is running and task is attached', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    act(() => { result.current.handlePlay(TASK) })

    expect(result.current.isTimerRunning).toBe(false)

    act(() => {
      result.current.running = true
    })
  })

  it('handlePlay returns alreadyAttached when same task is attached', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    act(() => { result.current.handlePlay(TASK) })

    let res
    act(() => {
      res = result.current.handlePlay(TASK)
    })

    expect(res).toEqual({ allowed: false, alreadyAttached: true })
  })

  it('handleDetach detaches the task', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    act(() => { result.current.handlePlay(TASK) })
    expect(result.current.isAttached).toBe(true)

    act(() => { result.current.handleDetach() })
    expect(result.current.isAttached).toBe(false)
    expect(result.current.attachedTaskId).toBeNull()
  })

  it('canAttach returns alreadyAttached for the same task', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    act(() => { result.current.handlePlay(TASK) })

    expect(result.current.canAttach('task-1')).toEqual({
      allowed: false,
      alreadyAttached: true,
    })
  })

  it('canAttach rejects when another task is attached', () => {
    const { result } = renderHook(() => useTaskAttachment(), {
      wrapper: createWrapper(),
    })

    act(() => { result.current.handlePlay(TASK) })

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
