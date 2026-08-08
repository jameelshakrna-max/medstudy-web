import { useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, CircleHelp, MoreHorizontal, Pencil, Trash2, Play, Pause, RotateCcw, CheckCircle2, ExternalLink } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs/Tabs'
import Toast from '../ui/Toast/Toast'
import LoadingScreen from '../LoadingScreen'
import Dropdown from '../ui/Dropdown/Dropdown'
import Modal from '../ui/Modal/Modal'
import useRotationPlanDetail from './today/useRotationPlanDetail'
import usePlannerTaskMutations from './today/usePlannerTaskMutations'
import useTaskAttachment from './today/useTaskAttachment'
import TodayView from './today/TodayView'
import AnkiStatus from './today/AnkiStatus'
import RecalculationBanner from './today/RecalculationBanner'
import DeckTopicMappings from './today/DeckTopicMappings'
import FlashcardForecastRecommendations from './today/FlashcardForecastRecommendations'
import RotationHelpDialog from './RotationHelpDialog'
import RecordTimeDialog from './today/dialogs/RecordTimeDialog'
import TaskCompletionDialog from './today/dialogs/TaskCompletionDialog'
import PartialDialog from './today/dialogs/PartialDialog'
import SkipConfirmDialog from './today/dialogs/SkipConfirmDialog'
import RecordQuestionsDialog from './today/dialogs/RecordQuestionsDialog'
import TopicsView from './today/TopicsView'
import CalendarView from './CalendarView'
import ProgressView from './ProgressView'
import { apiGet, apiPatch, apiDelete, apiPost, apiPut } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { getTodayKey, resolvePlannerTimezone, getBrowserTimezone } from './today/todayUtils'
import ProgressBar from '../ui/ProgressBar/ProgressBar'
import styles from './V2PlanDetail.module.css'

const GROUP_STATUS_LABEL = {
  learning: 'Learning',
  in_progress: 'Learning',
  pending: 'Learning',
  completed: 'Completed',
  excluded: 'Excluded',
}

const LIFECYCLE_META = {
  activate: { label: 'Activate Plan', icon: Play },
  pause: { label: 'Pause Plan', icon: Pause },
  resume: { label: 'Resume Plan', icon: RotateCcw },
  complete: { label: 'Complete Plan', icon: CheckCircle2 },
}

const LIFECYCLE_BY_STATUS = {
  draft: ['activate'],
  active: ['pause', 'complete'],
  paused: ['resume', 'complete'],
  completed: [],
}

const LIFECYCLE_TOAST = {
  activate: { title: 'Plan activated', description: 'Your rotation plan is now active.' },
  pause: { title: 'Plan paused', description: 'Your rotation plan is paused.' },
  resume: { title: 'Plan resumed', description: 'Your rotation plan is active again.' },
  complete: { title: 'Plan completed', description: 'Your rotation plan is complete and read-only.' },
}

function getGroupKey(group) {
  return group?.key ?? group?.groupKey ?? null
}

function getGroupState(states, group) {
  const key = getGroupKey(group)
  if (!key) return null
  const arr = Array.isArray(states) ? states : []
  return arr.find(state => {
    const stateKey = state?.groupKey ?? state?.key
    return stateKey != null && String(stateKey) === String(key)
  }) || null
}

function normalizeGroupState(state) {
  if (!state) return null
  return {
    completedCount: state.completedCount ?? state.completedQuestions ?? 0,
    targetCount: state.targetCount ?? state.targetQuestions ?? 0,
    incorrectRemaining: state.incorrectRemaining ?? state.incorrectQuestionsRemaining ?? 0,
    remaining: state.remaining ?? state.remainingQuestions ?? 0,
    status: state.status ?? (state.excluded ? 'excluded' : 'learning'),
    excluded: !!state.excluded,
  }
}

function UWorldGroupCard({ group, state }) {
  const title = group.title || getGroupKey(group) || 'UWorld group'
  const status = state?.status || 'learning'
  const excluded = !!state?.excluded || !!group.excluded
  const targetCount = state?.targetCount ?? group.targetQuestions ?? 0
  const completedCount = state?.completedCount ?? 0
  const remaining = state?.remaining ?? Math.max(0, targetCount - completedCount)
  const incorrectRemaining = state?.incorrectRemaining ?? 0
  const percent = targetCount > 0 ? Math.min(1, completedCount / targetCount) : 0
  const statusLabel = GROUP_STATUS_LABEL[status] || 'Learning'
  const badgeClass = status === 'completed'
    ? styles.groupBadgeSuccess
    : status === 'excluded'
      ? styles.groupBadgeMuted
      : styles.groupBadgeActive

  return (
    <div className={styles.groupCard} data-status={status}>
      <div className={styles.groupCardHeader}>
        <div className={styles.groupCardTitleGroup}>
          <h3 className={styles.groupCardTitle}>{title}</h3>
          {group.system && <div className={styles.groupCardMeta}>{group.system}</div>}
        </div>
        <span className={`${styles.groupBadge} ${badgeClass}`}>{statusLabel}</span>
      </div>
      {excluded ? (
        <p className={styles.groupExcluded}>Excluded from this plan's schedule.</p>
      ) : state ? (
        <div className={styles.groupProgress}>
          <div className={styles.groupProgressRow}>
            <span className={styles.groupProgressLabel}>
              {targetCount > 0 ? `Learning ${completedCount}/${targetCount}` : 'Learning'}
            </span>
            <span className={styles.groupProgressValue}>{Math.round(percent * 100)}%</span>
          </div>
          <ProgressBar value={percent} size="sm" />
          <div className={styles.groupStats}>
            {remaining > 0 && <span>{remaining} questions left</span>}
            {incorrectRemaining > 0 && <span>{incorrectRemaining} incorrect to review</span>}
          </div>
        </div>
      ) : (
        <p className={styles.groupNoProgress}>No progress yet</p>
      )}
    </div>
  )
}

function UWorldReviewGroups({ groups, states }) {
  const ordered = [...groups].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  return (
    <section className={styles.groupSection} aria-label="UWorld Review Groups">
      <h2 className={styles.groupSectionTitle}>UWorld Review Groups</h2>
      {ordered.map(group => (
        <UWorldGroupCard
          key={getGroupKey(group) || group.id || group.title}
          group={group}
          state={normalizeGroupState(getGroupState(states, group))}
        />
      ))}
    </section>
  )
}

function ConnectedAnkiDecks({ plan, planId, onToast }) {
  const queryClient = useQueryClient()
  const linkedDecks = Array.isArray(plan?.linkedDecks) ? plan.linkedDecks : []

  const [decksModalOpen, setDecksModalOpen] = useState(false)
  const [selectedDeckNames, setSelectedDeckNames] = useState([])
  const [selectedPrimary, setSelectedPrimary] = useState(null)
  const [decksError, setDecksError] = useState(null)

  const { data: decksData } = useQuery({
    queryKey: queryKeys.flashcards.decks(),
    queryFn: () => apiGet('/api/flashcards/decks'),
    enabled: decksModalOpen,
    staleTime: 30_000,
  })
  const availableDecks = Array.isArray(decksData) ? decksData : []

  const decksMutation = useMutation({
    mutationFn: ({ deckNames, primaryDeckName, expectedRevision, clientRequestId }) =>
      apiPut(`/rotation-planner/plans/${planId}/decks`, { deckNames, primaryDeckName, expectedRevision, clientRequestId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      queryClient.invalidateQueries({ queryKey: queryKeys.flashcards.decks() })
      queryClient.invalidateQueries({ queryKey: queryKeys.tracking.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
      setDecksModalOpen(false)
      setDecksError(null)
      onToast({ open: true, title: 'Anki decks updated', description: 'Your linked decks were saved.', variant: 'default' })
    },
    onError: (err) => {
      if (err?.code === 'REVISION_CONFLICT' || err?.code === 'PLAN_TERMINAL') {
        queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      }
      setDecksError(err?.message || 'Failed to update decks. Please try again.')
    },
  })

  const openManageDecks = useCallback(() => {
    const linked = Array.isArray(plan?.linkedDecks) ? plan.linkedDecks : []
    setSelectedDeckNames(linked.map(d => d.deckName))
    setSelectedPrimary(linked.find(d => d.isPrimary)?.deckName ?? null)
    setDecksError(null)
    setDecksModalOpen(true)
  }, [plan?.linkedDecks])

  const handleToggle = useCallback((deckName, checked) => {
    setSelectedDeckNames(prev => {
      const next = checked ? [...prev, deckName] : prev.filter(n => n !== deckName)
      setSelectedPrimary(primary => (primary && next.includes(primary) ? primary : null))
      return next
    })
  }, [])

  const submitDecks = useCallback(() => {
    if (decksMutation.isPending) return
    decksMutation.mutate({
      deckNames: selectedDeckNames,
      primaryDeckName: selectedPrimary,
      expectedRevision: plan?.revision,
      clientRequestId: crypto.randomUUID(),
    })
  }, [decksMutation, selectedDeckNames, selectedPrimary, plan?.revision])

  return (
    <section className={styles.decksSection} aria-label="Connected Anki Decks">
      <div className={styles.decksSectionHeader}>
        <h3 className={styles.decksHeading}>Connected Anki Decks</h3>
        <button type="button" className={styles.decksManageBtn} onClick={openManageDecks}>
          Manage decks
        </button>
      </div>

      {linkedDecks.length === 0 ? (
        <p className={styles.decksEmpty}>No Anki decks linked to this plan yet.</p>
      ) : (
        <ul className={styles.decksList}>
          {linkedDecks.map(deck => (
            <li key={deck.deckName || deck.openUrl} className={styles.decksListItem}>
              <span className={styles.decksName}>
                {deck.deckName}
                {deck.isPrimary && <span className={styles.decksPrimary}>Primary</span>}
              </span>
              <span className={styles.decksMeta}>
                {deck.cardCount} card{deck.cardCount !== 1 ? 's' : ''} · {deck.dueCount} due
              </span>
              <a
                href={deck.openUrl || ('/anki?deck=' + encodeURIComponent(deck.deckName))}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.decksLink}
              >
                Open <ExternalLink size={12} />
              </a>
            </li>
          ))}
        </ul>
      )}

      <Modal open={decksModalOpen} onOpenChange={(open) => { if (!open && !decksMutation.isPending) setDecksModalOpen(false) }}>
        <Modal.Title>Manage Anki Decks</Modal.Title>
        <Modal.Description>Choose which decks are linked to this rotation. Linked decks are organizational only.</Modal.Description>
        <div style={{ margin: '16px 0' }}>
          {availableDecks.length === 0 ? (
            <p style={{ color: 'var(--mist)', fontSize: 13 }}>No Anki decks found. Create decks in the Anki section first.</p>
          ) : (
            <>
              {availableDecks.map(deck => (
                <label key={deck.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--input-bg)', fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedDeckNames.includes(deck.name)}
                    onChange={e => handleToggle(deck.name, e.target.checked)}
                  />
                  <span>{deck.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--mist)' }}>
                    {deck.card_count} card{deck.card_count !== 1 ? 's' : ''}
                  </span>
                </label>
              ))}
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mist)', marginBottom: 6 }}>Primary deck</p>
                {selectedDeckNames.length === 0 ? (
                  <p style={{ color: 'var(--mist)', fontSize: 12 }}>Select at least one deck first.</p>
                ) : (
                  availableDecks.filter(deck => selectedDeckNames.includes(deck.name)).map(deck => (
                    <label key={deck.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 14, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="modal-primary-deck"
                        value={deck.name}
                        checked={selectedPrimary === deck.name}
                        onChange={() => setSelectedPrimary(deck.name)}
                      />
                      <span>{deck.name}</span>
                    </label>
                  ))
                )}
              </div>
            </>
          )}
          {decksError && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }} role="alert">{decksError}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => setDecksModalOpen(false)}
            disabled={decksMutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.renameBtn}
            onClick={submitDecks}
            disabled={decksMutation.isPending || selectedDeckNames.length === 0 || !selectedPrimary}
          >
            {decksMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>
    </section>
  )
}

export default function V2PlanDetail({ planId, onBack }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useRotationPlanDetail(planId)

  const [dialogState, setDialogState] = useState({ type: null, task: null })
  const [toast, setToast] = useState({ open: false, title: '', description: '', variant: 'default' })
  const [helpOpen, setHelpOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState(null)

  const renameMutation = useMutation({
    mutationFn: ({ displayName, expectedRevision, clientRequestId }) =>
      apiPatch(`/rotation-planner/plans/${planId}`, { displayName, expectedRevision, clientRequestId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.tracking.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
      setRenameOpen(false)
      setRenameValue('')
      setRenameError(null)
      setToast({ open: true, title: 'Plan renamed', description: 'Your plan was updated.', variant: 'default' })
    },
    onError: (err) => {
      setRenameError(err?.message || 'Failed to rename plan. Please try again.')
    },
  })

  const openRename = useCallback(() => {
    setRenameValue(data?.plan?.displayName || '')
    setRenameError(null)
    setRenameOpen(true)
  }, [data?.plan?.displayName])

  const submitRename = useCallback(() => {
    if (renameMutation.isPending) return
    const clientRequestId = crypto.randomUUID()
    renameMutation.mutate({
      displayName: renameValue,
      expectedRevision: data?.plan?.revision,
      clientRequestId,
    })
  }, [renameMutation, renameValue, data?.plan?.revision])

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/rotation-planner/plans/${planId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.tracking.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
      setDeleteOpen(false)
      setDeleteError(null)
      setToast({ open: true, title: 'Plan deleted', description: 'Your rotation plan was removed.', variant: 'default' })
      onBack()
    },
    onError: (err) => {
      setDeleteError(err?.message || 'Failed to delete plan. Please try again.')
    },
  })

  const openDelete = useCallback(() => {
    setDeleteError(null)
    setDeleteOpen(true)
  }, [])

  const submitDelete = useCallback(() => {
    if (deleteMutation.isPending) return
    deleteMutation.mutate()
  }, [deleteMutation])

  const [completionOpen, setCompletionOpen] = useState(false)
  const [completionOutstanding, setCompletionOutstanding] = useState(null)
  const [completionError, setCompletionError] = useState(null)

  const lifecycleMutation = useMutation({
    mutationFn: ({ action, confirmOutstanding = false }) => {
      const clientRequestId = crypto.randomUUID()
      return apiPost(`/rotation-planner/plans/${planId}/status`, {
        action,
        expectedRevision: data?.plan?.revision,
        clientRequestId,
        ...(confirmOutstanding ? { confirmOutstanding: true } : {}),
      })
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.forecast(planId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.tracking.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
      if (variables.action === 'complete') {
        setCompletionOpen(false)
        setCompletionOutstanding(null)
        setCompletionError(null)
      }
      const toastMeta = LIFECYCLE_TOAST[variables.action]
      setToast({ open: true, title: toastMeta.title, description: toastMeta.description, variant: 'default' })
    },
    onError: (err, variables) => {
      // Unconfirmed completion with outstanding work opens the confirmation dialog.
      if (variables.action === 'complete' && !variables.confirmOutstanding && err?.code === 'PLAN_HAS_OUTSTANDING_TASKS') {
        setCompletionOutstanding(err?.details?.outstanding ?? null)
        setCompletionError(null)
        setCompletionOpen(true)
        return
      }
      if (err?.code === 'REVISION_CONFLICT' || err?.code === 'PLAN_TERMINAL') {
        queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      }
      // A confirmed completion that fails keeps the dialog open with the error.
      if (variables.action === 'complete' && variables.confirmOutstanding) {
        setCompletionOpen(true)
        setCompletionError(err?.message || 'Failed to complete plan. Please try again.')
        return
      }
      setToast({ open: true, title: 'Failed to update plan', description: err?.message || 'Please try again.', variant: 'error' })
    },
  })

  const runLifecycle = useCallback((action) => {
    if (lifecycleMutation.isPending) return
    lifecycleMutation.mutate({ action })
  }, [lifecycleMutation])

  const confirmCompletion = useCallback(() => {
    if (lifecycleMutation.isPending) return
    lifecycleMutation.mutate({ action: 'complete', confirmOutstanding: true })
  }, [lifecycleMutation])

  const { data: forecast, isLoading: forecastLoading, error: forecastError } = useQuery({
    queryKey: queryKeys.rotations.forecast(planId),
    queryFn: () => apiGet(`/rotation-planner/plans/${planId}/forecast`),
    enabled: !!planId,
    staleTime: 60_000,
  })

  const [recalculationRequired, setRecalculationRequired] = useState(false)

  useEffect(() => {
    if (!recalculationRequired) return
    const plan = data?.plan
    if (!plan) return
    if (!plan.staleAt || (plan.lastRecalculatedAt && new Date(plan.lastRecalculatedAt) >= new Date(plan.staleAt))) {
      setRecalculationRequired(false)
    }
  }, [recalculationRequired, data?.plan?.staleAt, data?.plan?.lastRecalculatedAt])

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

  const resolvedTimezone = useMemo(
    () => resolvePlannerTimezone({ browserTimezone: getBrowserTimezone() }),
    []
  )

  const getRecalculationDate = useCallback(
    () => getTodayKey(new Date(), resolvedTimezone),
    [resolvedTimezone]
  )

  const mutations = usePlannerTaskMutations({
    planId,
    initialRevision: data?.plan?.revision,
    getRecalculationDate,
    timezone: resolvedTimezone,
  })

  useEffect(() => {
    const op = mutations.lastFailedOperation
    const err = op?.error
    const code = err?.code || err?.payload?.error?.code
    if (code === 'TASK_LOCKED') {
      setToast({
        open: true,
        title: 'Task locked',
        description: err?.message || 'This task is locked. Complete its prerequisite first.',
        variant: 'error',
      })
    }
  }, [mutations.lastFailedOperation])

  const tasks = data?.tasks || []

  const questionGroups = data?.questionGroups ?? data?.plan?.questionGroups ?? []
  const questionGroupStates = data?.questionGroupStates ?? data?.plan?.questionGroupStates ?? []

  const completedTopicCount = useMemo(() => {
    return (data?.topics || []).filter(t => t.status === 'completed').length
  }, [data?.topics])

  const dateRange = useMemo(() => {
    const plan = data?.plan
    if (!plan?.startDate || !plan?.endDate) return null
    const start = new Date(plan.startDate + 'T00:00:00')
    const end = new Date(plan.endDate + 'T00:00:00')
    const fmt = { month: 'short', day: 'numeric' }
    return `${start.toLocaleDateString('en-US', fmt)} – ${end.toLocaleDateString('en-US', fmt)}`
  }, [data?.plan?.startDate, data?.plan?.endDate])

  const taskAttachment = useTaskAttachment({
    startTask: mutations.startTask,
    currentRevision: mutations.currentRevision,
    onAttached: () => navigate('/pomodoro'),
    tasks,
    planId,
  })

  const handleStart = useCallback(async (task) => {
    try {
      await mutations.startTask(task.id)
    } catch (err) {
      const code = err?.code || err?.payload?.error?.code
      if (code !== 'TASK_LOCKED') {
        setToast({ open: true, title: 'Failed to start task', description: err?.message || 'Please try again.', variant: 'error' })
      }
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

  const handleReschedule = useCallback(async (taskId, newTaskDate) => {
    try {
      await mutations.rescheduleTask(taskId, newTaskDate)
    } catch (err) {
      const code = err?.code || err?.payload?.error?.code
      if (code !== 'TASK_LOCKED') {
        setToast({ open: true, title: 'Failed to move task', description: err?.message || 'Please try again.', variant: 'error' })
      }
    }
  }, [mutations])

  const handleSkipSubmit = useCallback(async () => {
    await mutations.skipTask(dialogState.task.id)
  }, [mutations, dialogState.task])

  const handleRecalculationRequired = useCallback(() => {
    setRecalculationRequired(true)
  }, [])

  const handleRecalculate = useCallback(() => {
    mutations.retryRecalculation()
  }, [mutations])

  if (isLoading) return <LoadingScreen fullPage={false} message="Loading plan details..." />

  if (error) {
    return (
      <div className={styles.container}>
        <button className={styles.backButton} onClick={onBack}>
          <ChevronLeft size={18} /> Plans
        </button>
        <div className={styles.error}>Failed to load plan. Please try again.</div>
        <button type="button" className={styles.backButton} style={{ marginTop: 12 }} onClick={() => refetch()}>Retry</button>
      </div>
    )
  }

  if (!data || !data.plan) {
    return (
      <div className={styles.container}>
        <button className={styles.backButton} onClick={onBack}>
          <ChevronLeft size={18} /> Plans
        </button>
        <div className={styles.error}>Plan not found.</div>
      </div>
    )
  }

  const { plan, topics, schedule, progress } = data

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <ChevronLeft size={18} /> Plans
        </button>
        <button
          type="button"
          className={styles.helpBtn}
          aria-label="How your rotation plan works"
          onClick={() => setHelpOpen(true)}
        >
          <CircleHelp size={18} />
        </button>
        <Dropdown>
          <Dropdown.Trigger asChild>
            <button
              type="button"
              className={styles.helpBtn}
              aria-label="Plan actions"
            >
              <MoreHorizontal size={18} />
            </button>
          </Dropdown.Trigger>
          <Dropdown.Content>
            {(LIFECYCLE_BY_STATUS[plan.status] || []).map((action) => {
              const meta = LIFECYCLE_META[action]
              const Icon = meta.icon
              return (
                <Dropdown.Item key={action} onSelect={() => runLifecycle(action)} disabled={lifecycleMutation.isPending}>
                  <Icon size={14} />
                  {meta.label}
                </Dropdown.Item>
              )
            })}
            {(LIFECYCLE_BY_STATUS[plan.status] || []).length > 0 && <Dropdown.Separator />}
            <Dropdown.Item onSelect={openRename}>
              <Pencil size={14} />
              Rename Plan
            </Dropdown.Item>
            <Dropdown.Item onSelect={openDelete} className={styles.dangerItem}>
              <Trash2 size={14} />
              Delete Plan
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown>
        <h1 className={styles.title}>{plan.displayName || plan.sourceTitle || 'Rotation Plan'}</h1>
        <div className={styles.meta}>
          {plan.schedulingMode && <span className={styles.mode}>{plan.schedulingMode}</span>}
        </div>
        {(dateRange || plan.topicCount > 0) && (
          <div className={styles.headerDetails}>
            {dateRange && <span>{dateRange}</span>}
            {plan.topicCount > 0 && (
              <span>{completedTopicCount} / {plan.topicCount} topics completed</span>
            )}
          </div>
        )}
      </div>

      <RecalculationBanner
        staleAt={plan.staleAt}
        lastRecalculatedAt={plan.lastRecalculatedAt}
        visible={recalculationRequired}
        recalculationState={mutations.recalculationState}
        onRecalculate={handleRecalculate}
        onReset={mutations.reset}
      />

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
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
            isOrphaned={taskAttachment.isOrphaned}
            hasUnsyncedData={taskAttachment.hasUnsyncedData}
            discardOrphanedPlannerContext={taskAttachment.discardOrphanedPlannerContext}
            questionGroups={questionGroups}
            questionGroupStates={questionGroupStates}
            onStart={handleStart}
            onComplete={handleComplete}
            onPartial={handlePartial}
            onRecordTime={handleRecordTime}
            onRecordQuestions={handleRecordQuestions}
            onSkip={handleSkip}
            onStudyPomodoro={handleStudyPomodoro}
          />
          <AnkiStatus
            plan={plan}
            topics={topics}
            tasks={tasks}
            todayKey={getTodayKey(new Date(), resolvedTimezone)}
          />
          <ConnectedAnkiDecks plan={plan} planId={planId} onToast={setToast} />
          <DeckTopicMappings
            planId={planId}
            topics={topics}
            usesFlashcardCapacity={plan.usesFlashcardCapacity}
            onRecalculationRequired={handleRecalculationRequired}
          />
          <FlashcardForecastRecommendations
            forecast={forecast}
            usesFlashcardCapacity={plan.usesFlashcardCapacity}
            topicsById={topicsById}
            topics={topics}
          />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarView
            tasks={tasks}
            topics={topics}
            topicsById={topicsById}
            plan={plan}
            availability={data.availability}
            sourceTitle={plan.sourceTitle}
            todayKey={getTodayKey(new Date(), resolvedTimezone)}
            onReschedule={handleReschedule}
            isMutating={mutations.isPending}
          />
        </TabsContent>
        <TabsContent value="topics">
          {plan.uworldSchedulingMode === 'grouped' && Array.isArray(questionGroups) && questionGroups.length > 0 && (
            <UWorldReviewGroups groups={questionGroups} states={questionGroupStates} />
          )}
          <TopicsView topics={topics} sourceTitle={plan.sourceTitle} />
        </TabsContent>
        <TabsContent value="progress">
          <ProgressView
            plan={plan}
            topics={topics}
            tasks={tasks}
            topicsById={topicsById}
            sourcePace={data.sourcePace || null}
            todayKey={getTodayKey(new Date(), resolvedTimezone)}
            forecast={forecast || null}
            forecastLoading={forecastLoading}
            forecastError={forecastError}
          />
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

      <RotationHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Modal open={renameOpen} onOpenChange={(open) => !open && setRenameOpen(false)}>
        <Modal.Title>Rename Plan</Modal.Title>
        <Modal.Description>Choose a name for this rotation plan.</Modal.Description>
        <div style={{ margin: '16px 0' }}>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => { setRenameValue(e.target.value); setRenameError(null) }}
            maxLength={100}
            autoFocus
            aria-label="Plan name"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--card-border)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontSize: 14,
            }}
          />
          {renameError && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{renameError}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => setRenameOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.renameBtn}
            onClick={submitRename}
            disabled={renameMutation.isPending || !renameValue.trim()}
          >
            {renameMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>

      <Modal open={completionOpen} onOpenChange={(open) => { if (!open && !lifecycleMutation.isPending) { setCompletionOpen(false); setCompletionError(null); setCompletionOutstanding(null) } }}>
        <Modal.Title>Complete Rotation</Modal.Title>
        <Modal.Description>
          Completing freezes this rotation. Unfinished work will remain unfinished, and this plan becomes read-only.
        </Modal.Description>
        {completionOutstanding && (
          <div
            style={{
              margin: '16px 0',
              padding: 12,
              borderRadius: 'var(--radius-md)',
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
            }}
          >
            <p style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Unfinished work in this plan</p>
            <ul style={{ fontSize: 13, display: 'grid', gap: 4, paddingLeft: 18 }}>
              <li>{completionOutstanding.learningTasks} learning tasks</li>
              <li>{completionOutstanding.uworldTasks} UWorld tasks</li>
              <li>{completionOutstanding.incorrectReviewTasks} incorrect-review tasks</li>
              <li>{completionOutstanding.remainingLearningMinutes} learning minutes remaining</li>
              <li>{completionOutstanding.remainingQuestions} questions remaining</li>
            </ul>
          </div>
        )}
        {completionError && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{completionError}</p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => { setCompletionOpen(false); setCompletionError(null); setCompletionOutstanding(null) }}
            disabled={lifecycleMutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={confirmCompletion}
            disabled={lifecycleMutation.isPending}
          >
            {lifecycleMutation.isPending ? 'Completing...' : 'Complete Rotation'}
          </button>
        </div>
      </Modal>

      <Modal open={deleteOpen} onOpenChange={(open) => !open && setDeleteOpen(false)}>
        <Modal.Title>Delete Plan</Modal.Title>
        <Modal.Description>
          Delete <strong>{plan.displayName || plan.sourceTitle || 'Rotation Plan'}</strong>? This
          permanently removes the plan, its schedule, topics, and progress. This action cannot be undone.
        </Modal.Description>
        {deleteError && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{deleteError}</p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => setDeleteOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={submitDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Plan'}
          </button>
        </div>
      </Modal>

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
