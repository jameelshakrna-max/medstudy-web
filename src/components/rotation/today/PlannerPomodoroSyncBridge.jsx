import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePomodoro } from '../../../context/PomodoroContext'
import { apiPatch, apiGet, ApiError } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { normalizePlanResponse } from './responseAdapters'
import { secondsToPlannerMinutes } from './todayUtils'
import Toast from '../../ui/Toast/Toast'

export default function PlannerPomodoroSyncBridge() {
  const {
    plannerTaskContext,
    markPlannerSyncInFlight,
    markPlannerSyncSucceeded,
    markPlannerSyncFailed,
    markNetworkOutcomeUnknown,
    retryPlannerSync: retryAction,
    rebaseAfterConflict,
    setRevisionRecoveryStatus,
    setIdempotencyConflictStatus,
    reservePlannerSyncOperation,
  } = usePomodoro()

  const queryClient = useQueryClient()
  const dispatchedRef = useRef(new Set())
  const [toastState, setToastState] = useState({ open: false, title: '', description: '', variant: 'default' })

  const handleRevisionConflict = useCallback(async (operation) => {
    const { planId, taskId } = plannerTaskContext

    setRevisionRecoveryStatus()

    try {
      const rawPlan = await apiGet(`/rotation-planner/plans/${planId}`)
      const detail = normalizePlanResponse(rawPlan)

      const task = detail.tasks?.find(t => t.id === taskId)
      if (!task || task.status !== 'in_progress') {
        markPlannerSyncFailed({ code: 'TASK_IMMUTABLE', message: 'Task is no longer active.' })
        setToastState({ open: true, title: 'Task changed', description: 'This task is no longer active.', variant: 'error' })
        return
      }

      rebaseAfterConflict({
        newRevision: detail.plan?.revision ?? operation.syncPayload.expectedRevision,
        latestActualMinutes: task.actualMinutes ?? plannerTaskContext.baseActualMinutes,
      })
    } catch (fetchError) {
      markPlannerSyncFailed({ code: 'RECOVERY_FAILED', message: 'Could not refresh plan data.' })
      setToastState({ open: true, title: 'Recovery failed', description: 'Could not refresh plan data.', variant: 'error' })
    }
  }, [plannerTaskContext, setRevisionRecoveryStatus, rebaseAfterConflict, markPlannerSyncFailed])

  const executeSync = useCallback(async (operation) => {
    const { syncPayload, syncRequestId } = operation
    const { planId, taskId } = plannerTaskContext

    markPlannerSyncInFlight()

    try {
      const result = await apiPatch(
        `/rotation-planner/plans/${planId}/tasks/${taskId}`,
        syncPayload,
        { headers: { 'Idempotency-Key': syncRequestId } }
      )

      markPlannerSyncSucceeded({ revision: result.revision })

      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })

      setToastState({ open: true, title: 'Focus synced', description: `${syncPayload.payload.actualMinutes} min recorded.`, variant: 'success' })
      dispatchedRef.current.delete(syncRequestId)
    } catch (error) {
      dispatchedRef.current.delete(syncRequestId)

      if (error instanceof ApiError) {
        if (error.code === 'PLAN_REVISION_CONFLICT') {
          await handleRevisionConflict(operation)
          return
        }

        if (error.code === 'IDEMPOTENCY_KEY_MISMATCH') {
          setIdempotencyConflictStatus({ message: error.message })
          setToastState({ open: true, title: 'Sync conflict', description: 'Retry with a fresh session.', variant: 'error' })
          return
        }

        markPlannerSyncFailed({ code: error.code, message: error.message })
        setToastState({ open: true, title: 'Sync failed', description: error.message, variant: 'error' })
        return
      }

      markNetworkOutcomeUnknown()
      setToastState({ open: true, title: 'Offline', description: 'Tap retry when back online.', variant: 'error' })
    }
  }, [plannerTaskContext?.planId, plannerTaskContext?.taskId, plannerTaskContext?.baseActualMinutes, markPlannerSyncInFlight, markPlannerSyncSucceeded, markPlannerSyncFailed, markNetworkOutcomeUnknown, setIdempotencyConflictStatus, handleRevisionConflict, queryClient])

  const {
    syncStatus,
    syncRequestId,
    syncPayload,
    accumulatedFocusSeconds,
    syncedFocusMinutes,
  } = plannerTaskContext || {}

  useEffect(() => {
    if (!plannerTaskContext?.taskId) return

    if (syncStatus === 'pending' && syncRequestId && syncPayload) {
      if (dispatchedRef.current.has(syncRequestId)) return
      dispatchedRef.current.add(syncRequestId)
      executeSync({ syncRequestId, syncPayload })
      return
    }

    if (syncStatus === null) {
      const target = secondsToPlannerMinutes(accumulatedFocusSeconds || 0)
      const remaining = Math.max(0, target - (syncedFocusMinutes || 0))
      if (remaining > 0) {
        const op = reservePlannerSyncOperation()
        if (op) {
          dispatchedRef.current.add(op.syncRequestId)
          executeSync(op)
        }
      }
    }
  }, [
    syncStatus, syncRequestId, syncPayload,
    accumulatedFocusSeconds, syncedFocusMinutes,
    executeSync, reservePlannerSyncOperation,
    plannerTaskContext?.taskId,
  ])

  useEffect(() => {
    if (syncStatus === null && dispatchedRef.current.size > 0) {
      const timer = setTimeout(() => { dispatchedRef.current.clear() }, 5000)
      return () => clearTimeout(timer)
    }
  }, [syncStatus])

  return (
    <Toast.Provider>
      <Toast
        open={toastState.open}
        onOpenChange={(open) => setToastState(prev => ({ ...prev, open }))}
        title={toastState.title}
        description={toastState.description}
        variant={toastState.variant}
      />
      <Toast.Viewport />
    </Toast.Provider>
  )
}
