import { useCallback, useMemo } from 'react'
import { usePomodoro } from '../../../context/PomodoroContext'

export default function useTaskAttachment({ startTask, currentRevision } = {}) {
  const {
    plannerTaskContext,
    attachTask,
    prepareTaskAttachment,
    detachTask,
    seconds,
    totalSec,
    running,
  } = usePomodoro()

  const attachedTaskId = plannerTaskContext?.taskId ?? null
  const attachedPlanId = plannerTaskContext?.planId ?? null

  const isAttached = attachedTaskId !== null
  const isTimerRunning = running && isAttached

  const isTaskAttached = useCallback(
    (taskId) => attachedTaskId === taskId,
    [attachedTaskId]
  )

  const canAttach = useCallback(
    (taskId) => {
      if (attachedTaskId === taskId) return { allowed: false, alreadyAttached: true }
      if (isAttached) return { allowed: false, reason: 'Another task is attached. Detach it first.' }
      return { allowed: true }
    },
    [attachedTaskId, isAttached]
  )

  const handlePlay = useCallback(
    async (task) => {
      const check = prepareTaskAttachment({
        taskId: task.id,
        planId: task.planId,
        taskType: task.taskType,
        actualMinutes: task.actualMinutes ?? 0,
        lastKnownRevision: task.lastKnownRevision ?? 0,
      })

      if (!check.allowed) return check

      let lastKnownRevision = task.lastKnownRevision ?? currentRevision ?? 0

      if (task.status === 'pending' && startTask) {
        const startResult = await startTask(task.id)

        if (startResult?.error) {
          return { allowed: false, reason: 'Failed to start task', error: startResult.error }
        }

        const returnedRevision = startResult?.result?.revision
        if (returnedRevision != null) {
          lastKnownRevision = returnedRevision
        }
      }

      const result = attachTask({
        taskId: task.id,
        planId: task.planId,
        taskType: task.taskType,
        actualMinutes: task.actualMinutes ?? 0,
        lastKnownRevision,
      })

      return result
    },
    [prepareTaskAttachment, attachTask, startTask, currentRevision]
  )

  const handleDetach = useCallback(() => {
    return detachTask()
  }, [detachTask])

  const attachedTask = useMemo(() => {
    if (!plannerTaskContext) return null
    return {
      taskId: plannerTaskContext.taskId,
      planId: plannerTaskContext.planId,
      taskType: plannerTaskContext.taskType,
      baseActualMinutes: plannerTaskContext.baseActualMinutes,
      lastKnownRevision: plannerTaskContext.lastKnownRevision,
    }
  }, [plannerTaskContext])

  return {
    attachedTaskId,
    attachedPlanId,
    attachedTask,
    isAttached,
    isTimerRunning,
    isTaskAttached,
    canAttach,
    handlePlay,
    handleDetach,
    seconds,
    totalSec,
    running,
  }
}
