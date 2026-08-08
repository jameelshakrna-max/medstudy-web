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
import { supabase as supabaseMock } from '../../lib/supabase'

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

const STUB_SUBSCRIPTION = {
  toJSON: () => ({ endpoint: 'https://push.example/endpoint-abc', keys: { p256dh: 'key-p256dh', auth: 'key-auth' } }),
}

function installPushMocks({
  permission = 'default',
  requestPermissionResult,
  existingSubscription = null,
  subscribeImpl,
  fetchStatus = 'ok',
} = {}) {
  const requestPermission = vi.fn().mockImplementation(async () => {
    const result = requestPermissionResult ?? permission
    globalThis.Notification.permission = result
    return result
  })
  globalThis.Notification = { permission, requestPermission }
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existingSubscription),
    subscribe: vi.fn(subscribeImpl || (() => Promise.resolve(STUB_SUBSCRIPTION))),
  }
  const registration = { active: { postMessage: vi.fn() }, pushManager }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve(registration),
      controller: { postMessage: vi.fn() },
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
    configurable: true,
  })
  window.PushManager = class PushManager {}
  const fetchMock = vi.fn().mockResolvedValue({
    ok: fetchStatus === 'ok',
    status: fetchStatus === 'ok' ? 200 : 500,
    text: () => Promise.resolve('{}'),
  })
  globalThis.fetch = fetchMock
  return { requestPermission, pushManager, registration, fetchMock }
}

function cleanupPushMocks() {
  delete globalThis.Notification
  delete window.PushManager
  delete navigator.serviceWorker
  delete globalThis.fetch
}

describe('PomodoroContext push notifications', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    supabaseMock.auth.getUser.mockClear()
    supabaseMock.auth.getSession.mockClear()
  })

  afterEach(() => {
    cleanupPushMocks()
    vi.useRealTimers()
  })

  it('default permission: first gesture requests permission before any auth/SW work', async () => {
    const mocks = installPushMocks({ permission: 'default', requestPermissionResult: 'granted' })
    const { result } = renderPomodoro()
    await act(async () => {})
    act(() => { document.dispatchEvent(new window.Event('click')) })
    await act(async () => {})
    await act(async () => {})

    expect(mocks.requestPermission).toHaveBeenCalledTimes(1)
    expect(mocks.requestPermission.mock.invocationCallOrder[0])
      .toBeLessThan(supabaseMock.auth.getUser.mock.invocationCallOrder[0])
    expect(mocks.requestPermission.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.pushManager.subscribe.mock.invocationCallOrder[0])
    expect(result.current.pushPermission).toBe('granted')
  })

  it('granted result creates a subscription and saves it', async () => {
    const mocks = installPushMocks({ permission: 'default', requestPermissionResult: 'granted' })
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'granted', subscribed: true })
    expect(mocks.requestPermission).toHaveBeenCalledTimes(1)
    expect(mocks.pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(result.current.pushPermission).toBe('granted')
    expect(result.current.pushBlocked).toBe(false)
    const body = JSON.parse(mocks.fetchMock.mock.calls[0][1].body)
    expect(body.user_id).toBe('user-1')
  })

  it('denied result marks blocked and does not subscribe', async () => {
    const mocks = installPushMocks({ permission: 'default', requestPermissionResult: 'denied' })
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'denied', subscribed: false })
    expect(result.current.pushBlocked).toBe(true)
    expect(mocks.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('dismissed (default) result stops cleanly without subscribing', async () => {
    const mocks = installPushMocks({ permission: 'default', requestPermissionResult: 'default' })
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'default', subscribed: false })
    expect(result.current.pushBlocked).toBe(false)
    expect(result.current.pushPermission).toBe('default')
    expect(mocks.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('already denied: no re-prompt, blocked state set', async () => {
    const mocks = installPushMocks({ permission: 'denied' })
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'denied', subscribed: false })
    expect(mocks.requestPermission).not.toHaveBeenCalled()
    expect(result.current.pushBlocked).toBe(true)
  })

  it('default permission: play-path re-subscribe does not prompt or subscribe', async () => {
    const mocks = installPushMocks({ permission: 'default' })
    const { result } = renderPomodoro()
    await act(async () => {})
    act(() => { result.current.togglePlay() })
    await act(async () => {})
    await act(async () => {})

    expect(mocks.requestPermission).not.toHaveBeenCalled()
    expect(mocks.pushManager.subscribe).not.toHaveBeenCalled()
    act(() => { result.current.skipTimer() })
  })

  it('granted with existing subscription synchronizes without calling subscribe', async () => {
    const mocks = installPushMocks({ permission: 'granted', existingSubscription: STUB_SUBSCRIPTION })
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'granted', subscribed: true })
    expect(mocks.pushManager.getSubscription).toHaveBeenCalledTimes(1)
    expect(mocks.pushManager.subscribe).not.toHaveBeenCalled()
    const body = JSON.parse(mocks.fetchMock.mock.calls[0][1].body)
    expect(body.subscription.endpoint).toBe('https://push.example/endpoint-abc')
  })

  it('granted with no subscription creates one (userVisibleOnly + VAPID key)', async () => {
    const mocks = installPushMocks({ permission: 'granted', existingSubscription: null })
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'granted', subscribed: true })
    expect(mocks.pushManager.subscribe).toHaveBeenCalledTimes(1)
    const options = mocks.pushManager.subscribe.mock.calls[0][0]
    expect(options.userVisibleOnly).toBe(true)
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array)
    expect(options.applicationServerKey.length).toBeGreaterThan(0)
    expect(result.current.pushPermission).toBe('granted')
  })

  it('backend failure returns subscribed:false without exposing sensitive data in logs', async () => {
    const mocks = installPushMocks({ permission: 'granted', existingSubscription: null, fetchStatus: 'fail' })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'granted', subscribed: false })
    const logText = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logText).toContain('Subscription save failed: HTTP 500')
    expect(logText).not.toContain('https://push.example')
    expect(logText).not.toContain('key-p256dh')
    expect(logText).not.toContain('test-token')
    logSpy.mockRestore()
  })

  it('pushManager.subscribe throwing does not crash the app', async () => {
    const mocks = installPushMocks({
      permission: 'granted',
      existingSubscription: null,
      subscribeImpl: () => Promise.reject(new Error('boom')),
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'granted', subscribed: false })
    expect(result.current.pushPermission).toBe('granted')
    expect(result.current.pushSupported).toBe(true)
    const logText = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logText).toContain('Subscription failed: Error: boom')
    logSpy.mockRestore()
  })

  it('Notification API unsupported: app stays functional, unsupported result', async () => {
    installPushMocks({ permission: 'default' })
    delete globalThis.Notification
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'unsupported', subscribed: false })
    expect(result.current.pushSupported).toBe(false)
    expect(result.current.togglePlay).toBeTypeOf('function')
  })

  it('serviceWorker/PushManager unsupported: app stays functional', async () => {
    installPushMocks({ permission: 'default' })
    delete globalThis.Notification
    delete navigator.serviceWorker
    delete window.PushManager
    const { result } = renderPomodoro()
    let out
    await act(async () => { out = await result.current.requestPushPermission() })
    expect(out).toEqual({ permission: 'unsupported', subscribed: false })
    expect(result.current.pushSupported).toBe(false)
    expect(result.current.skipTimer).toBeTypeOf('function')
  })
})
