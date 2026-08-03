// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { INITIAL_FORM } from '../wizardState'

const {
  holders,
  previewMutate,
  createMutate,
  pending,
  MOCK_PREVIEW_RESPONSE,
} = vi.hoisted(() => {
  const holders = { preview: null, create: null }
  const pending = { preview: false, create: false }
  const MOCK_PREVIEW_RESPONSE = {
    plan: {
      id: null,
      scheduleFingerprint: 'fp-123',
      settingsJson: { forecastSettings: {}, forecast: {} },
    },
    topics: [],
    tasks: [],
    availability: [],
    previewToken: 'fp-123',
    feasibility: {
      feasible: true,
      totalRequiredMinutes: 600,
      availableMinutes: 900,
      missingCapacity: 0,
      topicsLeftUnscheduled: [],
      possibleSolutions: [],
    },
    unscheduledWork: [],
  }
  const previewMutate = vi.fn(() => {
    if (holders.preview?.onSuccess) holders.preview.onSuccess(MOCK_PREVIEW_RESPONSE)
  })
  const createMutate = vi.fn()
  return { holders, previewMutate, createMutate, pending, MOCK_PREVIEW_RESPONSE }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: null, isLoading: false })),
  useMutation: vi.fn((config) => {
    const isPreview = typeof config.mutationFn === 'function' && config.mutationFn.toString().includes('/plans/preview')
    if (isPreview) holders.preview = config
    else holders.create = config
    return {
      mutate: isPreview ? previewMutate : createMutate,
      isPending: isPreview ? pending.preview : pending.create,
    }
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('../../../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('../../../../components/ui/Modal/Modal', () => {
  const Modal = ({ children }) => <>{children}</>
  Modal.Title = Modal.Description = ({ children }) => <>{children}</>
  return { default: Modal }
})

vi.mock('../StepSelectRotation', () => ({ default: () => null }))
vi.mock('../StepSelectDates', () => ({ default: () => null }))
vi.mock('../StepAvailability', () => ({ default: () => null }))
vi.mock('../StepSourceSummary', () => ({ default: () => null }))
vi.mock('../StepStudyStyle', () => ({ default: () => null }))
vi.mock('../StepReviewTopics', () => ({ default: () => null }))
vi.mock('../StepUWorldQuestions', () => ({ default: () => null }))
vi.mock('../StepQuestionConfig', () => ({ default: () => null }))
vi.mock('../StepSchedulingConfig', () => ({ default: () => null }))
vi.mock('../StepFlashcardSettings', () => ({ default: () => null }))
vi.mock('../StepPreview', () => ({ default: () => null }))
vi.mock('../StepConfirm', () => ({ default: () => null }))

vi.mock('../../PlanCreationForm.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../../../../pages/Page.module.css', () => ({ default: {} }))

import PlanCreationForm from '../../PlanCreationForm'

function seedDraft() {
  localStorage.setItem('rotationWizardDraft', JSON.stringify({
    schemaVersion: 1,
    savedAt: Date.now(),
    step: 9,
    form: {
      ...INITIAL_FORM,
      sourceId: 'step-up-medicine-6e-2024',
      rotationId: 'cardiology',
      startDate: '2026-01-05',
      endDate: '2026-02-05',
      topics: [{
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
        uworldRemainingQuestions: 20,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
        incorrectQuestionsRemaining: 0,
      }],
    },
  }))
}

async function reachCreateStep(user) {
  await user.click(screen.getByRole('button', { name: /Next/i }))
  await user.click(screen.getByRole('button', { name: /Next/i }))
}

describe('PlanCreationForm', () => {
  beforeEach(() => {
    localStorage.clear()
    seedDraft()
    holders.preview = null
    holders.create = null
    pending.preview = false
    pending.create = false
    MOCK_PREVIEW_RESPONSE.feasibility.feasible = true
    vi.clearAllMocks()
  })

  it('disables create until a feasible preview with a token exists', async () => {
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Create Plan/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Next/i }))
    const createButton = screen.getByRole('button', { name: /Create Plan/i })
    expect(createButton).toBeInTheDocument()
    expect(createButton).toBeEnabled()
  })

  it('feasible preview enables creation', async () => {
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await reachCreateStep(user)
    expect(screen.getByRole('button', { name: /Create Plan/i })).not.toBeDisabled()
  })

  it('infeasible preview disables creation unless overload is accepted', async () => {
    MOCK_PREVIEW_RESPONSE.feasibility.feasible = false
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await reachCreateStep(user)
    expect(screen.getByRole('button', { name: /Create Plan/i })).toBeDisabled()
  })

  it('create request sends the exact previewToken and acceptOverload=false', async () => {
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await reachCreateStep(user)
    await user.click(screen.getByRole('button', { name: /Create Plan/i }))
    expect(createMutate).toHaveBeenCalledTimes(1)
    const { payload } = createMutate.mock.calls[0][0]
    expect(payload.previewToken).toBe('fp-123')
    expect(payload.acceptOverload).toBe(false)
  })

  it('disables create while create is pending to guard double submission', async () => {
    pending.create = true
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await reachCreateStep(user)
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled()
  })
})
