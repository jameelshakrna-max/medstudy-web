import { useState, useMemo, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { apiGet, apiPost, apiDelete, apiPut } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { CalendarRange, Plus, ChevronLeft, Play, Pause, Trash2, RotateCcw, BookOpen } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import PlanCreationForm from '../components/rotation/PlanCreationForm'
import ScheduleView from '../components/rotation/ScheduleView'
import TopicProgressCard from '../components/rotation/TopicProgressCard'
import TodaySchedule from '../components/rotation/TodaySchedule'
import Modal from '../components/ui/Modal/Modal'
import styles from './RotationPlanner.module.css'
import './Page.module.css'

const V2PlanDetail = lazy(() => import('../components/rotation/V2PlanDetail'))

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateRange(start, end) {
  if (!start || !end) return ''
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const opts = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`
}

function formatMinutes(mins) {
  if (!mins) return '0m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function RotationPlanner() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // ── Fetch V1 plans (legacy) ──
  const { data: v1Plans = [], isLoading: v1PlansLoading } = useQuery({
    queryKey: queryKeys.rotations.legacyPlans(),
    enabled: !!user,
    queryFn: () => apiGet('/rotations/plans'),
  })

  // ── Fetch V2 plans ──
  const { data: v2Plans = [], isLoading: v2PlansLoading } = useQuery({
    queryKey: queryKeys.rotations.plans(),
    enabled: !!user,
    queryFn: () => apiGet('/rotation-planner/plans'),
  })

  const plansLoading = v1PlansLoading || v2PlansLoading

  // ── Merge and tag plans with explicit version from query source ──
  const plans = useMemo(() => {
    return [
      ...v1Plans.map(p => ({ key: `v1:${p.id}`, version: 'v1', plan: p })),
      ...v2Plans.map(p => ({ key: `v2:${p.id}`, version: 'v2', plan: p })),
    ]
  }, [v1Plans, v2Plans])

  // ── Resolve selected plan version from explicit tag ──
  const selectedEntry = plans.find(e => e.plan.id === selectedPlanId)
  const selectedVersion = selectedEntry?.version ?? 'v1'

  // ── Fetch single plan details ──
  const { data: planDetail, isLoading: detailLoading } = useQuery({
    queryKey: queryKeys.rotations.plan(selectedPlanId),
    enabled: !!selectedPlanId,
    queryFn: () => apiGet(`/rotations/plans/${selectedPlanId}`),
  })

  // ── Fetch flashcard summary ──
  const { data: flashcardSummary } = useQuery({
    queryKey: queryKeys.rotations.flashcardSummary(),
    enabled: !!user && !!selectedPlanId,
    queryFn: () => apiGet('/rotations/flashcard-summary'),
  })

  // ── Delete plan ──
  const deleteMutation = useMutation({
    mutationFn: (id) => apiDelete(`/rotations/plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      setSelectedPlanId(null)
      setConfirmDelete(null)
    },
  })

  // ── Activate / Pause ──
  const activateMutation = useMutation({
    mutationFn: (id) => apiPost(`/rotations/plans/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      if (selectedPlanId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(selectedPlanId) })
      }
    },
  })

  // ── Update entry status ──
  const updateEntryMutation = useMutation({
    mutationFn: ({ id, status }) => apiPut(`/rotations/schedule/${id}`, { status }),
    onSuccess: () => {
      if (selectedPlanId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(selectedPlanId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.rotations.schedule(selectedPlanId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.rotations.progress(selectedPlanId) })
      }
    },
  })

  function handlePlanCreated() {
    setShowForm(false)
    queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
  }

  function handleDelete() {
    if (confirmDelete) {
      deleteMutation.mutate(confirmDelete)
    }
  }

  const plan = planDetail?.plan
  const schedule = planDetail?.schedule || []
  const progress = planDetail?.progress || []
  const availability = planDetail?.availability || []

  if (plansLoading) return <LoadingScreen fullPage={false} message="Loading rotation plans..." />

  // ── Detail View ──
  if (selectedPlanId) {
    if (detailLoading) return <LoadingScreen fullPage={false} message="Loading plan details..." />

    // V2 plan: render new tabbed detail view
    if (selectedVersion === 'v2') {
      return (
        <div className={styles.page}>
          <Suspense fallback={<LoadingScreen fullPage={false} message="Loading plan details..." />}>
            <V2PlanDetail
              planId={selectedPlanId}
              onBack={() => setSelectedPlanId(null)}
            />
          </Suspense>
        </div>
      )
    }

    // V1 plan: render legacy detail view

    return (
      <div className={styles.page}>
        <div className={styles.detailView}>
          <div className={styles.detailHeader}>
            <div className={styles.detailHeaderLeft}>
              <button className={styles.backBtn} onClick={() => setSelectedPlanId(null)}>
                <ChevronLeft size={16} />
                Back
              </button>
              <div>
                <h1 className={styles.detailTitle}>{plan?.name || 'Rotation Plan'}</h1>
                <div className={styles.detailSubtitle}>
                  {plan?.rotation} &middot; {formatDateRange(plan?.start_date, plan?.end_date)}
                </div>
              </div>
            </div>
            <div className={styles.detailActions}>
              {plan?.status === 'active' ? (
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                  onClick={() => activateMutation.mutate(plan.id)}
                  disabled={activateMutation.isPending}
                >
                  <Pause size={14} />
                  Pause
                </button>
              ) : (
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                  onClick={() => activateMutation.mutate(plan.id)}
                  disabled={activateMutation.isPending}
                >
                  <Play size={14} />
                  Activate
                </button>
              )}
              <button
                className={`${styles.actionBtn} ${styles.dangerBtn}`}
                onClick={() => setConfirmDelete(plan?.id)}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>

          {/* Today's Schedule */}
          {plan?.status === 'active' && (
            <div className={styles.detailSection}>
              <TodaySchedule
                schedule={schedule}
                progress={progress}
                onEntryUpdate={(id, status) => updateEntryMutation.mutate({ id, status })}
              />
            </div>
          )}

          {/* Full Schedule */}
          <div className={styles.detailSection}>
            <h2 className={styles.sectionTitle}>
              <CalendarRange size={18} />
              Schedule
            </h2>
            <ScheduleView
              schedule={schedule}
              progress={progress}
              onEntryUpdate={(id, status) => updateEntryMutation.mutate({ id, status })}
            />
          </div>

          {/* Topic Progress */}
          <div className={styles.detailSection}>
            <h2 className={styles.sectionTitle}>
              <BookOpen size={18} />
              Topic Progress
            </h2>
            <div className={styles.topicGrid}>
              {progress.map((p) => (
                <TopicProgressCard
                  key={p.topic_id}
                  topic={p}
                  progress={p}
                  sourceTopic={null}
                />
              ))}
              {progress.length === 0 && (
                <div className={styles.empty} style={{ gridColumn: '1 / -1' }}>
                  <BookOpen />
                  <div className={styles.emptyTitle}>No topic progress yet</div>
                  <div className={styles.emptyDesc}>
                    Activate the plan and complete schedule entries to track progress.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Delete confirmation */}
        <Modal open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
          <Modal.Title>Delete Plan</Modal.Title>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '12px 0 20px' }}>
            Are you sure you want to delete this rotation plan? This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              className={styles.actionBtn}
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              className={`${styles.actionBtn} ${styles.dangerBtn}`}
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      </div>
    )
  }

  // ── Plan List View ──
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Rotation Planner</h1>
            <p className={styles.sub}>
              {plans.length > 0
                ? `${plans.length} plan${plans.length !== 1 ? 's' : ''}`
                : 'Plan your clinical rotations and study schedule'}
            </p>
          </div>
          <button className={styles.createBtn} onClick={() => setShowForm(true)}>
            <Plus size={16} />
            New Plan
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className={styles.empty}>
          <CalendarRange />
          <div className={styles.emptyTitle}>No rotation plans yet</div>
          <div className={styles.emptyDesc}>
            Create your first rotation plan to generate a personalized study schedule
            based on your availability and learning goals.
          </div>
          <button
            className={styles.createBtn}
            style={{ marginTop: 16 }}
            onClick={() => setShowForm(true)}
          >
            <Plus size={16} />
            Create Your First Plan
          </button>
        </div>
      ) : (
        <div className={styles.planGrid}>
          {plans.map((entry) => {
            const p = entry.plan
            const completionPct = p.total_entries
              ? Math.round((p.completed_entries / p.total_entries) * 100)
              : p.taskCount
                ? Math.round(((p.completedTaskCount || 0) / p.taskCount) * 100)
                : 0

            return (
              <div
                key={entry.key}
                className={styles.planCard}
                onClick={() => setSelectedPlanId(p.id)}
              >
                <div className={styles.planCardTop}>
                  <h3 className={styles.planCardName}>{p.name || p.sourceTitle}</h3>
                  <div className={styles.planCardBadges}>
                    {entry.version === 'v2' && (
                      <span className={styles.versionBadge}>v2</span>
                    )}
                    <span
                      className={`${styles.statusBadge} ${
                        p.status === 'active'
                          ? styles.statusActive
                          : p.status === 'completed'
                            ? styles.statusCompleted
                            : p.status === 'paused'
                              ? styles.statusPaused
                              : styles.statusDraft
                      }`}
                    >
                      {p.status === 'active'
                        ? 'Active'
                        : p.status === 'completed'
                          ? 'Completed'
                          : p.status === 'paused'
                            ? 'Paused'
                            : 'Draft'}
                    </span>
                  </div>
                </div>
                <div className={styles.planCardRotation}>
                  {p.rotation || p.sourceTitle || ''}
                </div>
                <div className={styles.planCardDates}>
                  {p.start_date && p.end_date
                    ? formatDateRange(p.start_date, p.end_date)
                    : p.startDate && p.endDate
                      ? formatDateRange(p.startDate, p.endDate)
                      : ''}
                  {(p.exam_date || p.examDate) && (
                    <> &middot; Exam: {new Date((p.exam_date || p.examDate) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                  )}
                </div>
                <div className={styles.planProgress}>
                  <div className={styles.planProgressBar}>
                    <div
                      className={styles.planProgressFill}
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <div className={styles.planProgressText}>
                    {completionPct}% complete
                    {p.total_entries > 0 && <> &middot; {p.completed_entries}/{p.total_entries} entries</>}
                    {p.taskCount > 0 && <> &middot; {p.completedTaskCount || 0}/{p.taskCount} tasks</>}
                  </div>
                </div>
                <div className={styles.planStats}>
                  {p.total_study_minutes > 0 && (
                    <span className={styles.planStat}>{formatMinutes(p.total_study_minutes)} study</span>
                  )}
                  {p.total_uworld_questions > 0 && (
                    <span className={styles.planStat}>{p.total_uworld_questions} UWorld Qs</span>
                  )}
                  {p.topicCount > 0 && (
                    <span className={styles.planStat}>{p.topicCount} topics</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Creation form modal */}
      <PlanCreationForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={handlePlanCreated}
      />
    </div>
  )
}
