// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { INITIAL_FORM } from '../wizardState'

const {
  holders,
  previewMutate,
  createMutate,
  pending,
  MOCK_PREVIEW_RESPONSE,
  previewShouldFail,
  previewPayloads,
} = vi.hoisted(() => {
  const holders = { preview: null, create: null }
  const pending = { preview: false, create: false }
  const previewShouldFail = { value: false }
  const previewPayloads = []
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
    incompleteQuestionGroups: [],
    sourceAdaptedQuestionGroups: [],
    unscheduledWork: [],
  }
  const previewMutate = vi.fn((payload) => {
    previewPayloads.push(payload)
    if (previewShouldFail.value) {
      holders.preview?.onError?.(new Error('Preview failed'))
    } else {
      holders.preview?.onSuccess?.(MOCK_PREVIEW_RESPONSE)
    }
  })
  const createMutate = vi.fn()
  return { holders, previewMutate, createMutate, pending, MOCK_PREVIEW_RESPONSE, previewShouldFail, previewPayloads }
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
vi.mock('../StepPlanName', () => ({
  default: ({ form, onFormChange }) => (
    <input
      aria-label="Plan name"
      value={form.planName ?? ''}
      onChange={(e) => onFormChange({ planName: e.target.value })}
    />
  ),
}))
vi.mock('../StepAvailability', () => ({ default: () => null }))
vi.mock('../StepSourceSummary', () => ({ default: () => null }))
vi.mock('../StepStudyStyle', () => ({ default: () => null }))
vi.mock('../StepReviewTopics', () => ({ default: () => null }))
vi.mock('../StepUWorldQuestions', () => ({
  default: ({ onExcludeGroup }) => (
    <button type="button" onClick={() => onExcludeGroup('group-1')}>Mock Exclude</button>
  ),
}))
vi.mock('../StepQuestionConfig', () => ({ default: () => null }))
vi.mock('../StepSchedulingConfig', () => ({ default: () => null }))
vi.mock('../StepFlashcardSettings', () => ({ default: () => null }))
vi.mock('../StepAnkiDecks', () => ({ default: () => null }))
vi.mock('../StepPreview', () => ({ default: () => null }))
vi.mock('../StepConfirm', () => ({ default: () => null }))

vi.mock('../../PlanCreationForm.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../../../../pages/Page.module.css', () => ({ default: {} }))

import PlanCreationForm from '../../PlanCreationForm'

function seedDraft({ step = 10, formOverrides = {} } = {}) {
  localStorage.setItem('rotationWizardDraft', JSON.stringify({
    schemaVersion: 1,
    savedAt: Date.now(),
    step,
    form: {
      ...INITIAL_FORM,
      sourceId: 'step-up-medicine-6e-2024',
      rotationId: 'cardiology',
      startDate: '2026-01-05',
      endDate: '2026-02-05',
      topics: [{
        normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
        sourceTopicId: 's1',
        uworldRemainingQuestions: 20,
        alreadyCompletedLearningPercentage: 0,
        alreadyCompletedQuestionCount: 0,
        incorrectQuestionsRemaining: 0,
      }],
      linkedDeckNames: ['Cardio Deck'],
      primaryDeckName: 'Cardio Deck',
      ...formOverrides,
    },
  }))
}

async function reachCreateStep(user) {
  await user.click(screen.getByRole('button', { name: /Next/i }))
  await user.click(screen.getByRole('button', { name: /Next/i }))
  await user.click(screen.getByRole('button', { name: /Next/i }))
}

async function clickNext(user, times) {
  for (let i = 0; i < times; i++) {
    await user.click(screen.getByRole('button', { name: /Next/i }))
  }
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
    MOCK_PREVIEW_RESPONSE.incompleteQuestionGroups = []
    previewShouldFail.value = false
    previewPayloads.length = 0
    vi.clearAllMocks()
  })

  it('disables create until a feasible preview with a token exists', async () => {
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Create Plan/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument()

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

  it('keeps the typed plan name when a preview fails, and reuses it on retry', async () => {
    localStorage.clear()
    seedDraft({ step: 2 })
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: /Plan name/i }), 'My Custom Name')
    await clickNext(user, 9)
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument()

    previewShouldFail.value = true
    await user.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByText('Preview failed')).toBeInTheDocument()

    previewShouldFail.value = false
    await user.click(screen.getByRole('button', { name: /Next/i }))
    expect(previewPayloads).toHaveLength(3)
    expect(previewPayloads.map(p => p.displayName)).toEqual(['My Custom Name', 'My Custom Name', 'My Custom Name'])
  })

  it('persists the plan name through preview into the create request', async () => {
    localStorage.clear()
    seedDraft({ step: 2 })
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: /Plan name/i }), 'My Custom Name')
    await clickNext(user, 9)
    await user.click(screen.getByRole('button', { name: /Next/i }))
    await user.click(screen.getByRole('button', { name: /Next/i }))
    await user.click(screen.getByRole('button', { name: /Create Plan/i }))
    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0].payload.displayName).toBe('My Custom Name')
  })

  it('auto-generates a grouped preview when entering the UWorld step', async () => {
    localStorage.clear()
    seedDraft({ step: 7 })
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await waitFor(() => expect(previewPayloads.length).toBe(1))
    expect(previewPayloads[0].uworldSchedulingMode).toBe('grouped')
    expect(previewPayloads[0].questionGroupExclusions).toEqual([])
  })

  it('advancing from the Anki Decks step lands on the preview step, not confirm', async () => {
    localStorage.clear()
    seedDraft({ step: 11 })
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Plan/i })).not.toBeInTheDocument()
  })

  it('disables creation while there are unresolved incomplete question groups', async () => {
    MOCK_PREVIEW_RESPONSE.incompleteQuestionGroups = [{ key: 'group-1' }]
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await reachCreateStep(user)
    expect(screen.getByRole('button', { name: /Create Plan/i })).toBeDisabled()
  })

  it('a group exclusion action re-runs the preview with questionGroupExclusions', async () => {
    localStorage.clear()
    seedDraft({ step: 7 })
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await waitFor(() => expect(previewPayloads.length).toBe(1))
    await user.click(screen.getByRole('button', { name: /Mock Exclude/i }))
    await waitFor(() => expect(previewPayloads.length).toBe(2))
    expect(previewPayloads[1].questionGroupExclusions).toEqual(['group-1'])
  })

  it('sends questionGroupExclusions in the create payload', async () => {
    localStorage.clear()
    seedDraft({ step: 10, formOverrides: { questionGroupExclusions: ['group-1'] } })
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await reachCreateStep(user)
    await user.click(screen.getByRole('button', { name: /Create Plan/i }))
    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0].payload.questionGroupExclusions).toEqual(['group-1'])
  })

  it('sends linked deck names and the primary deck in the create payload', async () => {
    localStorage.clear()
    seedDraft({ step: 10, formOverrides: { linkedDeckNames: ['Cardio Deck', 'Pharm Deck'], primaryDeckName: 'Cardio Deck' } })
    const user = userEvent.setup()
    render(<PlanCreationForm open onClose={vi.fn()} onCreated={vi.fn()} />)
    await reachCreateStep(user)
    await user.click(screen.getByRole('button', { name: /Create Plan/i }))
    expect(createMutate).toHaveBeenCalledTimes(1)
    const { payload } = createMutate.mock.calls[0][0]
    expect(payload.deckNames).toEqual(['Cardio Deck', 'Pharm Deck'])
    expect(payload.primaryDeckName).toBe('Cardio Deck')
  })
})
