import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs/Tabs'
import Toast from '../ui/Toast/Toast'
import LoadingScreen from '../LoadingScreen'
import useRotationPlanDetail from './today/useRotationPlanDetail'
import usePlannerTaskMutations from './today/usePlannerTaskMutations'
import useTaskAttachment from './today/useTaskAttachment'
import TodayView from './today/TodayView'
import RecalculationBanner from './today/RecalculationBanner'
import RecordTimeDialog from './today/dialogs/RecordTimeDialog'
import TaskCompletionDialog from './today/dialogs/TaskCompletionDialog'
import PartialDialog from './today/dialogs/PartialDialog'
import SkipConfirmDialog from './today/dialogs/SkipConfirmDialog'
import RecordQuestionsDialog from './today/dialogs/RecordQuestionsDialog'
import ScheduleView from './today/ScheduleView'
import TopicsView from './today/TopicsView'
import styles from './V2PlanDetail.module.css'

function getRecalculationDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function V2PlanDetail({ planId, onBack }) {
  const navigate = useNavigate()
  const { data, isLoading, error } = useRotationPlanDetail(planId)

  const [dialogState, setDialogState] = useState({ type: null, task: null })
  const [toast, setToast] = useState({ open: false, title: '', description: '', variant: 'default' })

  const openDialog = useCallback((type, task) => {
    setDialogState({ type, task })
  }, [])

  const closeDialog = useCallback(() => {
    setDialogState({ type: null, task: null })
  }, [])

  const topicsById = useMemo(() => {
    const topics = data?.topics || []
    const map = new Map()
    for (const t of topics) {
      if (t.id) map.set(t.id, t)
    }
    return map
  }, [data?.topics])

  const mutations = usePlannerTaskMutations({
    planId,
    initialRevision: data?.plan?.revision,
    getRecalculationDate,
  })

  const taskAttachment = useTaskAttachment({
    startTask: mutations.startTask,
    currentRevision: mutations.currentRevision,
    onAttached: () => navigate('/pomodoro'),
  })

  const handleStart = useCallback(async (task) => {
    try {
      await mutations.startTask(task.id)
    } catch (err) {
      setToast({ open: true, title: 'Failed to start task', description: err?.message || 'Please try again.', variant: 'error' })
    }
  }, [mutations])

  const handleComplete = useCallback((task) => {
    openDialog('complete', task)
  }, [openDialog])

  const handlePartial = useCallback((task) => {
    openDialog('partial', task)
  }, [openDialog])

  const handleRecordTime = useCallback((task) => {
    openDialog('recordTime', task)
  }, [openDialog])

  const handleRecordQuestions = useCallback((task) => {
    openDialog('recordQuestions', task)
  }, [openDialog])

  const handleSkip = useCallback((task) => {
    openDialog('skip', task)
  }, [openDialog])

  const handleStudyPomodoro = useCallback(async (task) => {
    const result = await taskAttachment.handlePlay(task)
    if (result?.alreadyAttached || result?.allowed) {
      navigate('/pomodoro')
    } else if (result?.reason) {
      setToast({ open: true, title: 'Cannot start Pomodoro', description: result.reason, variant: 'error' })
    }
  }, [taskAttachment, navigate])

  const handleCompleteSubmit = useCallback(async (payload) => {
    await mutations.completeTask(dialogState.task.id, payload)
  }, [mutations, dialogState.task])

  const handlePartialSubmit = useCallback(async (payload) => {
    await mutations.partialTask(dialogState.task.id, payload)
  }, [mutations, dialogState.task])

  const handleRecordTimeSubmit = useCallback(async (payload) => {
    await mutations.recordTime(dialogState.task.id, payload.actualMinutes)
  }, [mutations, dialogState.task])

  const handleRecordQuestionsSubmit = useCallback(async (payload) => {
    await mutations.recordQuestions(dialogState.task.id, payload)
  }, [mutations, dialogState.task])

  const handleSkipSubmit = useCallback(async () => {
    await mutations.skipTask(dialogState.task.id)
  }, [mutations, dialogState.task])

  if (isLoading) return <LoadingScreen fullPage={false} message="Loading plan details..." />

  if (error) {
    return (
      <div className={styles.container}>
        <button className={styles.backButton} onClick={onBack}>
          <ChevronLeft size={18} /> Plans
        </button>
        <div className={styles.error}>Failed to load plan. Please try again.</div>
      </div>
    )
  }

  const { plan, tasks, topics, schedule, progress } = data

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <ChevronLeft size={18} /> Plans
        </button>
        <div>
          <h1 className={styles.title}>{plan.sourceTitle || 'Rotation Plan'}</h1>
          <div className={styles.meta}>
            {plan.topicCount > 0 && <span>{plan.topicCount} topics</span>}
            {plan.taskCount > 0 && <span>{plan.taskCount} tasks</span>}
            {plan.schedulingMode && <span className={styles.mode}>{plan.schedulingMode}</span>}
          </div>
        </div>
      </div>

      <RecalculationBanner
        planId={planId}
        lastRecalculatedAt={plan.lastRecalculatedAt}
        revision={plan.revision}
      />

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
        </TabsList>
        <TabsContent value="today">
          <TodayView
            planId={planId}
            tasks={tasks}
            topics={topics}
            topicsById={topicsById}
            plan={plan}
            sourceTitle={plan.sourceTitle}
            isMutating={mutations.isPending}
            onStart={handleStart}
            onComplete={handleComplete}
            onPartial={handlePartial}
            onRecordTime={handleRecordTime}
            onRecordQuestions={handleRecordQuestions}
            onSkip={handleSkip}
            onStudyPomodoro={handleStudyPomodoro}
          />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleView
            tasks={tasks}
            topicsById={topicsById}
            sourceTitle={plan.sourceTitle}
            availability={data.availability}
          />
        </TabsContent>
        <TabsContent value="topics">
          <TopicsView topics={topics} sourceTitle={plan.sourceTitle} />
        </TabsContent>
      </Tabs>

      {dialogState.type === 'recordTime' && (
        <RecordTimeDialog
          open
          task={dialogState.task}
          onClose={closeDialog}
          onSubmit={handleRecordTimeSubmit}
        />
      )}

      {dialogState.type === 'complete' && (
        <TaskCompletionDialog
          open
          task={dialogState.task}
          onClose={closeDialog}
          onSubmit={handleCompleteSubmit}
        />
      )}

      {dialogState.type === 'partial' && (
        <PartialDialog
          open
          task={dialogState.task}
          onClose={closeDialog}
          onSubmit={handlePartialSubmit}
        />
      )}

      {dialogState.type === 'skip' && (
        <SkipConfirmDialog
          open
          task={dialogState.task}
          onClose={closeDialog}
          onSubmit={handleSkipSubmit}
        />
      )}

      {dialogState.type === 'recordQuestions' && (
        <RecordQuestionsDialog
          open
          task={dialogState.task}
          onClose={closeDialog}
          onSubmit={handleRecordQuestionsSubmit}
        />
      )}

      <Toast.Provider>
        <Toast
          open={toast.open}
          onOpenChange={(open) => setToast(prev => ({ ...prev, open }))}
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
        />
        <Toast.Viewport />
      </Toast.Provider>
    </div>
  )
}
