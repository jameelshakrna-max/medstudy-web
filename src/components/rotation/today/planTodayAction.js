import { getTaskDisplayModel } from './taskDisplayModel'
import { getTodayRelevantTasks } from './todayGrouping'
import { getAvailableTaskActions } from './taskActionRules'
import getTaskLockState from './getTaskLockState'

/**
 * Decides the plan-level "Start Today's Plan" / "Resume Today's Plan" action
 * for the active plan. Pure — no React, no storage access.
 *
 * `pausedSession` is the hydrated, valid paused Pomodoro session associated
 * with this plan (see V2PlanDetail — derived from the planner task attachment
 * and the pomodoro `paused` phase). It must be `{ taskId, planId }` or null.
 * Resume is offered ONLY when such a session belongs to the selected plan and
 * its task is today's in-progress work. An unrelated session (other plan, or a
 * task that is not in progress) never produces Resume, and an in-progress task
 * with no paused session produces nothing (there is nothing to resume).
 *
 * Returns null when there is no actionable work today (empty day, all done,
 * everything locked, draft/paused/completed plan, or plan has not started).
 * Otherwise returns `{ action, task }`:
 *  - 'resume' — a hydrated paused session for this plan/task exists; resume it.
 *  - 'start'  — start the next pending, unlocked, startable task.
 *
 * The task is a display model consumed by the planner/Pomodoro bridge
 * (taskAttachment.handlePlay), so no second timer-start implementation exists.
 */
export function getPlanTodayAction({ plan, todayKey, tasks, topicsById = new Map(), lockContext = {}, pausedSession = null } = {}) {
  if (!plan || plan.status !== 'active') return null
  if (plan.startDate && todayKey < plan.startDate) return null

  const list = Array.isArray(tasks) ? tasks : []
  const displayTasks = list.map((task) => (
    getTaskDisplayModel(task, todayKey, topicsById.get(task.planTopicId) || null)
  ))

  const relevant = getTodayRelevantTasks(displayTasks, todayKey)
  if (relevant.length === 0) return null

  if (pausedSession && pausedSession.planId === plan.id) {
    const resumeTask = relevant.find((task) => (
      task.id === pausedSession.taskId && task.status === 'in_progress'
    ))
    if (resumeTask) return { action: 'resume', task: resumeTask }
  }

  const startable = relevant
    .filter((task) => {
      if (task.status !== 'pending') return false
      if (getTaskLockState(task, topicsById, lockContext).isLocked) return false
      return getAvailableTaskActions(task).includes('start')
    })
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))

  if (startable.length === 0) return null

  return { action: 'start', task: startable[0] }
}

export const PLAN_TODAY_ACTION_LABELS = {
  start: "Start Today's Plan",
  resume: "Resume Today's Plan",
}
