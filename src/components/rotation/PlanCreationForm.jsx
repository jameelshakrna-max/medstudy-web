import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import Modal from '../ui/Modal/Modal'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import styles from './PlanCreationForm.module.css'
import '../../pages/Page.module.css'

import { INITIAL_FORM, PREVIEW_STEP, saveDraft, loadDraft, clearDraft, onSourceChange, onRotationChange, onTopicsLoaded } from './wizard/wizardState'
import { validateStep } from './wizard/wizardValidation'
import { buildPreviewPayload, buildCreatePayload, normalizeSourcesResponse, normalizeRotationsResponse, normalizeTopicsResponse } from './wizard/buildPlanRequest'

import StepSelectRotation from './wizard/StepSelectRotation'
import StepSelectDates from './wizard/StepSelectDates'
import StepAvailability from './wizard/StepAvailability'
import StepSourceSummary from './wizard/StepSourceSummary'
import StepStudyStyle from './wizard/StepStudyStyle'
import StepReviewTopics from './wizard/StepReviewTopics'
import StepUWorldQuestions from './wizard/StepUWorldQuestions'
import StepQuestionConfig from './wizard/StepQuestionConfig'
import StepSchedulingConfig from './wizard/StepSchedulingConfig'
import StepPreview from './wizard/StepPreview'
import StepConfirm from './wizard/StepConfirm'

const STEP_NAMES = [
  'Rotation', 'Dates', 'Availability', 'Source', 'Study Style',
  'Topics', 'UWorld', 'Questions', 'Scheduling', 'Preview', 'Confirm',
]

const TOTAL_STEPS = 11

export default function PlanCreationForm({ open, onClose, onCreated }) {
  const queryClient = useQueryClient()

  const restored = loadDraft()
  const [step, setStep] = useState(restored?.step ?? 0)
  const [form, setForm] = useState(restored?.form ?? INITIAL_FORM)

  const [preview, setPreview] = useState(null)
  const [previewToken, setPreviewToken] = useState(null)
  const [createRequestId, setCreateRequestId] = useState(null)
  const [overloadAccepted, setOverloadAccepted] = useState(false)
  const [validationErrors, setValidationErrors] = useState([])

  // React Query — sources
  const { data: sourcesRaw, isLoading: sourcesLoading } = useQuery({
    queryKey: queryKeys.rotations.sources(),
    queryFn: () => apiGet('/rotation-planner/sources'),
  })
  const sources = normalizeSourcesResponse(sourcesRaw)

  // React Query — rotations for selected source
  const { data: rotationsRaw, isLoading: rotationsLoading } = useQuery({
    queryKey: queryKeys.rotations.sourceRotations(form.sourceId),
    queryFn: () => apiGet(`/rotation-planner/sources/${form.sourceId}/rotations`),
    enabled: Boolean(form.sourceId),
  })
  const rotations = normalizeRotationsResponse(rotationsRaw)

  // React Query — topics for selected source+rotation
  const { data: topicsRaw } = useQuery({
    queryKey: queryKeys.rotations.sourceTopics(form.sourceId, form.rotationId),
    queryFn: () => apiGet(`/rotation-planner/sources/${form.sourceId}/rotations/${form.rotationId}/topics`),
    enabled: Boolean(form.sourceId && form.rotationId),
  })
  const apiTopics = normalizeTopicsResponse(topicsRaw)

  // Rebuild topics when API response changes
  useEffect(() => {
    if (apiTopics.length > 0 && form.rotationId) {
      setForm(current => onTopicsLoaded(current, apiTopics))
    }
  }, [apiTopics, form.rotationId])

  // Persist draft on form/step change
  useEffect(() => {
    if (open) saveDraft(step, form)
  }, [step, form, open])

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: (payload) => apiPost('/rotation-planner/plans/preview', payload),
    onSuccess: (data) => {
      setPreview(data)
      setPreviewToken(data.previewToken)
      setStep(PREVIEW_STEP)
      setValidationErrors([])
    },
    onError: (err) => {
      setValidationErrors([err.message || 'Preview failed'])
    },
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: ({ payload, idempotencyKey }) =>
      apiPost('/rotation-planner/plans', payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: (result) => {
      clearDraft()
      setPreview(null)
      setPreviewToken(null)
      setCreateRequestId(null)
      setOverloadAccepted(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plans() })
      onCreated?.(result.plan?.id)
      onClose()
    },
    onError: (err) => {
      const msg = err.message || ''
      if (msg.includes('PREVIEW_STALE')) {
        setPreview(null)
        setPreviewToken(null)
        setValidationErrors(['Preview is stale. Please regenerate.'])
        setStep(PREVIEW_STEP)
      } else if (msg.includes('IDEMPOTENCY_CONFLICT')) {
        setCreateRequestId(null)
        setValidationErrors(['Create conflict. Please try again.'])
      } else {
        setValidationErrors([msg || 'Create failed.'])
      }
    },
  })

  // Scheduling change handler — clears preview and related state
  const handleSchedulingChange = useCallback((updater) => {
    setForm(current => {
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
      return next
    })
    setPreview(null)
    setPreviewToken(null)
    setCreateRequestId(null)
    setOverloadAccepted(false)
    setValidationErrors([])
  }, [])

  // Source change handler
  const handleSourceChange = useCallback((newSourceId) => {
    handleSchedulingChange(current => onSourceChange(current, newSourceId))
  }, [handleSchedulingChange])

  // Rotation change handler
  const handleRotationChange = useCallback((newRotationId) => {
    handleSchedulingChange(current => onRotationChange(current, newRotationId))
  }, [handleSchedulingChange])

  // Generic form change (non-scheduling)
  const handleFormChange = useCallback((updater) => {
    setForm(current => {
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
      return next
    })
    setValidationErrors([])
  }, [])

  // Navigate next
  function handleNext() {
    const { valid, errors } = validateStep(step, form, form.topics)
    if (!valid) {
      setValidationErrors(errors)
      return
    }

    setValidationErrors([])

    // Trigger preview when advancing from Step 9 to Step 10
    if (step === PREVIEW_STEP - 1) {
      const payload = buildPreviewPayload(form)
      previewMutation.mutate(payload)
      return
    }

    setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
  }

  // Navigate back
  function handleBack() {
    setValidationErrors([])
    setStep(s => Math.max(0, s - 1))
  }

  // Create plan
  function handleCreate() {
    const key = createRequestId ?? crypto.randomUUID()
    setCreateRequestId(key)
    const payload = buildCreatePayload(form, previewToken, overloadAccepted)
    createMutation.mutate({ payload, idempotencyKey: key })
  }

  // Retry preview
  function handleRetryPreview() {
    const payload = buildPreviewPayload(form)
    previewMutation.mutate(payload)
  }

  const isLastStep = step === TOTAL_STEPS - 1
  const isPreviewStep = step === PREVIEW_STEP
  const canCreate = isLastStep && previewToken && (preview?.feasibility?.feasible || overloadAccepted)
  const isCreating = createMutation.isPending

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} size="lg">
      <Modal.Title>Create Rotation Plan</Modal.Title>
      <Modal.Description>
        Step {step + 1} of {TOTAL_STEPS}: {STEP_NAMES[step]}
      </Modal.Description>

      <div className={styles.wizardBody}>
        {/* Step dots — desktop */}
        <div className={styles.stepDots} aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}>
          {STEP_NAMES.map((name, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.dot} ${i === step ? styles.dotActive : ''} ${i < step ? styles.dotDone : ''}`}
              onClick={() => {
                if (i < step) {
                  setValidationErrors([])
                  setStep(i)
                }
              }}
              disabled={i > step}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${name}`}
              title={name}
            />
          ))}
        </div>

        {/* Step content */}
        <div className={styles.stepContainer}>
          {step === 0 && <StepSelectRotation form={form} onSourceChange={handleSourceChange} onRotationChange={handleRotationChange} sources={sources} sourcesLoading={sourcesLoading} rotations={rotations} rotationsLoading={rotationsLoading} errors={validationErrors} />}
          {step === 1 && <StepSelectDates form={form} onFormChange={handleFormChange} errors={validationErrors} />}
          {step === 2 && <StepAvailability form={form} onFormChange={handleSchedulingChange} errors={validationErrors} />}
          {step === 3 && <StepSourceSummary form={form} topics={form.topics} />}
          {step === 4 && <StepStudyStyle form={form} onFormChange={handleSchedulingChange} />}
          {step === 5 && <StepReviewTopics form={form} topics={form.topics} />}
          {step === 6 && <StepUWorldQuestions form={form} onFormChange={handleSchedulingChange} />}
          {step === 7 && <StepQuestionConfig form={form} onFormChange={handleSchedulingChange} />}
          {step === 8 && <StepSchedulingConfig form={form} onFormChange={handleSchedulingChange} />}
          {step === 9 && <StepPreview preview={preview} previewLoading={previewMutation.isPending} previewError={previewMutation.error} onRetry={handleRetryPreview} />}
          {step === 10 && <StepConfirm form={form} preview={preview} overloadAccepted={overloadAccepted} onOverloadChange={setOverloadAccepted} />}
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className={styles.errorSummary} role="alert" aria-live="polite">
            {validationErrors.map((err, i) => (
              <p key={i} className={styles.errorText}>{err}</p>
            ))}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className={styles.wizardFooter}>
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0}
          className={styles.btnSecondary}
        >
          <ChevronLeft size={16} /> Back
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate || isCreating}
            className={styles.btnPrimary}
          >
            {isCreating ? 'Creating...' : 'Create Plan'}
          </button>
        ) : isPreviewStep && !preview && !previewMutation.isPending ? (
          <button
            type="button"
            onClick={handleRetryPreview}
            className={styles.btnPrimary}
          >
            Generate Preview
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={isPreviewStep && previewMutation.isPending}
            className={styles.btnPrimary}
          >
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
    </Modal>
  )
}
