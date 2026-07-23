import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { apiPatch, apiPost, ApiError } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'

function generateClientId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function usePlannerTaskMutations({ planId, initialRevision, getRecalculationDate }) {
  const queryClient = useQueryClient()
  const [currentRevision, setCurrentRevision] = useState(initialRevision ?? 0)
  const [recalculationState, setRecalculationState] = useState(null)
  const [lastFailedOperation, setLastFailedOperation] = useState(null)

  const invalidatePlan = useCallback(() => {
    if (planId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
    }
  }, [queryClient, planId])

  const taskMutation = useMutation({
    mutationFn: async ({ operationId, taskId, action, payload = {}, requestId }) => {
      const result = await apiPatch(
        `/api/rotation-planner/plans/${planId}/tasks/${taskId}`,
        {
          action,
          payload,
          expectedRevision: currentRevision,
          clientRequestId: requestId,
        },
        { headers: { 'Idempotency-Key': requestId } }
      )
      return { operationId, taskId, action, result }
    },
    onSuccess: ({ operationId, taskId, action, result }) => {
      if (result?.revision != null) {
        setCurrentRevision(result.revision)
      }

      if (result?.recalculationRequired) {
        const recalcDate = getRecalculationDate?.()
        if (recalcDate) {
          setRecalculationState({
            planId,
            taskId,
            action,
            recalculationDate: recalcDate,
            status: 'pending',
          })
        }
      }

      setLastFailedOperation(null)
      invalidatePlan()
    },
    onError: (error, { operationId, taskId, action }) => {
      const code = error?.code || ''

      if (code === 'PLAN_REVISION_CONFLICT') {
        invalidatePlan()
      }

      setLastFailedOperation({
        operationId,
        taskId,
        action,
        status: 'failed',
        error,
      })
    },
  })

  const executeTaskAction = useCallback(
    (action, taskId, payload = {}) => {
      const operationId = generateClientId()
      const requestId = generateClientId()

      return taskMutation.mutateAsync({
        operationId,
        taskId,
        action,
        payload,
        requestId,
      })
    },
    [taskMutation, currentRevision]
  )

  const recalculationMutation = useMutation({
    mutationFn: async ({ recalculationDate, requestId }) => {
      const result = await apiPost(
        `/api/rotation-planner/plans/${planId}/recalculate`,
        {
          recalculationDate,
          expectedRevision: currentRevision,
          clientRequestId: requestId,
        },
        { headers: { 'Idempotency-Key': requestId } }
      )
      return result
    },
    onSuccess: (result) => {
      if (result?.revision != null) {
        setCurrentRevision(result.revision)
      }
      setRecalculationState(null)
      invalidatePlan()
    },
    onError: (error) => {
      const code = error?.code || ''
      if (code === 'TASK_IN_PROGRESS' && error?.details?.inProgressTaskId) {
        setRecalculationState(prev => prev ? {
          ...prev,
          status: 'blocked',
          blockedByTaskId: error.details.inProgressTaskId,
        } : null)
      } else {
        setRecalculationState(prev => prev ? { ...prev, status: 'failed', error } : null)
      }
    },
  })

  const retryRecalculation = useCallback(() => {
    if (!recalculationState) return

    const requestId = generateClientId()
    setRecalculationState(prev => prev ? { ...prev, status: 'in_flight' } : null)

    return recalculationMutation.mutateAsync({
      recalculationDate: recalculationState.recalculationDate,
      requestId,
    })
  }, [recalculationState, recalculationMutation, currentRevision])

  const startTask = useCallback(
    (taskId) => executeTaskAction('start', taskId),
    [executeTaskAction]
  )

  const completeTask = useCallback(
    (taskId, payload = {}) => executeTaskAction('complete', taskId, payload),
    [executeTaskAction]
  )

  const partialTask = useCallback(
    (taskId, payload = {}) => executeTaskAction('partial', taskId, payload),
    [executeTaskAction]
  )

  const skipTask = useCallback(
    (taskId) => executeTaskAction('skip', taskId),
    [executeTaskAction]
  )

  const recordTime = useCallback(
    (taskId, actualMinutes) =>
      executeTaskAction('record_time', taskId, { actualMinutes }),
    [executeTaskAction]
  )

  const recordQuestions = useCallback(
    (taskId, payload) => executeTaskAction('record_questions', taskId, payload),
    [executeTaskAction]
  )

  const reset = useCallback(() => {
    taskMutation.reset()
    setRecalculationState(null)
    setLastFailedOperation(null)
  }, [taskMutation])

  return {
    startTask,
    completeTask,
    partialTask,
    skipTask,
    recordTime,
    recordQuestions,
    isPending: taskMutation.isPending || recalculationMutation.isPending,
    error: taskMutation.error,
    reset,
    recalculationState,
    retryRecalculation,
    currentRevision,
  }
}
