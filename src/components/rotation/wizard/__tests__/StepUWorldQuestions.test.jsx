// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StepUWorldQuestions from '../StepUWorldQuestions'

vi.mock('../PlanCreationForm.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../../../ui/Modal/Modal', () => {
  const Modal = ({ open, children }) => (open ? <div>{children}</div> : null)
  Modal.Title = ({ children }) => <>{children}</>
  Modal.Description = ({ children }) => <>{children}</>
  return { default: Modal }
})

const TOPICS = [
  { sourceTopicId: 's1', title: 'Stable Angina' },
  { sourceTopicId: 's2', title: 'Heart Failure' },
]

function makePreview(overrides = {}) {
  return {
    questionGroups: [
      {
        key: 'group-1',
        title: 'Cardiac Review',
        system: 'Cardiology',
        targetQuestions: 20,
        memberTopicIds: ['s1', 's2'],
        requiredTopicIds: ['s1'],
        excluded: false,
        displayOrder: 1,
      },
    ],
    incompleteQuestionGroups: [],
    sourceAdaptedQuestionGroups: [],
    feasibility: { feasible: true },
    tasks: [],
    previewToken: 'tok-1',
    ...overrides,
  }
}

const BASE_FORM = {
  topics: TOPICS,
  preferredQuestionsPerDay: 30,
  questionGroupExclusions: [],
  uworldSchedulingMode: 'grouped',
}

function renderStep(props = {}) {
  const defaultProps = {
    form: BASE_FORM,
    preview: null,
    previewLoading: false,
    previewError: null,
    allTopics: [],
    onRegeneratePreview: vi.fn(),
    onAddRelatedTopics: vi.fn(),
    onExcludeGroup: vi.fn(),
    onUndoExclusion: vi.fn(),
  }
  return render(<StepUWorldQuestions {...defaultProps} {...props} />)
}

describe('StepUWorldQuestions — states', () => {
  it('shows a spinner while generating with no preview yet', () => {
    renderStep({ preview: null, previewLoading: true })
    expect(screen.getByText('Generating UWorld review groups...')).toBeInTheDocument()
  })

  it('shows error text and a Retry button that calls onRegeneratePreview', async () => {
    const onRegeneratePreview = vi.fn()
    const user = userEvent.setup()
    renderStep({ preview: null, previewLoading: false, previewError: new Error('boom'), onRegeneratePreview })
    expect(screen.getByText('Failed to generate UWorld review groups.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Retry/i }))
    expect(onRegeneratePreview).toHaveBeenCalledTimes(1)
  })

  it('offers a Generate UWorld Groups button when no preview exists', async () => {
    const onRegeneratePreview = vi.fn()
    const user = userEvent.setup()
    renderStep({ preview: null, previewLoading: false, previewError: null, onRegeneratePreview })
    expect(screen.getByText('UWorld Review Groups')).toBeInTheDocument()
    expect(screen.getByText('Questions are scheduled after you complete the related learning topics.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Generate UWorld Groups/i }))
    expect(onRegeneratePreview).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when the preview has no groups', () => {
    renderStep({ preview: makePreview({ questionGroups: [] }) })
    expect(screen.getByText('No UWorld review groups found for these topics.')).toBeInTheDocument()
  })

  it('shows the excluded count summary line', () => {
    renderStep({ form: { ...BASE_FORM, questionGroupExclusions: ['g1', 'g2'] }, preview: makePreview() })
    expect(screen.getByText('2 group(s) excluded')).toBeInTheDocument()
  })
})

describe('StepUWorldQuestions — group cards', () => {
  it('renders a curated group with title, member titles, block target and lock explanation', () => {
    renderStep({ preview: makePreview() })
    expect(screen.getByText('UWorld review group')).toBeInTheDocument()
    expect(screen.getByText('Cardiac Review')).toBeInTheDocument()
    expect(screen.getByText('Members (2)')).toBeInTheDocument()
    expect(screen.getByText('Heart Failure')).toBeInTheDocument()
    expect(screen.getAllByText('Stable Angina').length).toBeGreaterThan(0)
    expect(screen.getByText('30 questions per review block')).toBeInTheDocument()
    expect(screen.getByText(/UWorld questions unlock after you complete the required learning topics\. Incorrect answers are reviewed after the group's questions are complete\./)).toBeInTheDocument()
  })

  it('renders missing related topic TITLES (not raw ids) with Add Related Topics and Exclude', () => {
    const preview = makePreview({
      incompleteQuestionGroups: [
        { key: 'group-1', missingRequiredTopicIds: ['s3'], missingRequiredTopicTitles: ['Valvular Disease'] },
      ],
    })
    renderStep({ preview })
    expect(screen.getByText('Missing related topics:')).toBeInTheDocument()
    expect(screen.getByText('Valvular Disease')).toBeInTheDocument()
    expect(screen.queryByText('s3')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Related Topics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exclude UWorld Group' })).toBeInTheDocument()
  })

  it('renders "Not covered by this source" with titles and no add button for source-adapted groups', () => {
    const preview = makePreview({
      sourceAdaptedQuestionGroups: [
        { groupKey: 'group-1', unavailableRequiredTopicIds: ['reg-1'], unavailableRequiredTopicTitles: ['Pacemaker Programming'] },
      ],
    })
    renderStep({ preview })
    expect(screen.getByText('Not covered by this source:')).toBeInTheDocument()
    expect(screen.getByText('Pacemaker Programming')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Related Topics' })).not.toBeInTheDocument()
  })

  it('shows an Excluded badge and Undo for excluded groups; Undo calls onUndoExclusion', async () => {
    const onUndoExclusion = vi.fn()
    const user = userEvent.setup()
    renderStep({ form: { ...BASE_FORM, questionGroupExclusions: ['group-1'] }, preview: makePreview(), onUndoExclusion })
    expect(screen.getByText('Excluded')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exclude UWorld Group' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndoExclusion).toHaveBeenCalledWith('group-1')
  })

  it('renders fallback groups neutrally with the curriculum-section hint', () => {
    const preview = makePreview({
      questionGroups: [
        {
          key: 'fallback-cardiology',
          title: 'Cardiology',
          system: 'Cardiology',
          targetQuestions: 10,
          memberTopicIds: ['s1'],
          requiredTopicIds: [],
          excluded: false,
          displayOrder: 1,
        },
      ],
    })
    renderStep({ preview })
    expect(screen.getByText('UWorld review group')).toBeInTheDocument()
    expect(screen.getByText('Grouped by curriculum section — not an official UWorld grouping.')).toBeInTheDocument()
  })
})

describe('StepUWorldQuestions — actions', () => {
  it('calls onAddRelatedTopics with the missing topic ids', async () => {
    const onAddRelatedTopics = vi.fn()
    const user = userEvent.setup()
    const preview = makePreview({
      incompleteQuestionGroups: [
        { key: 'group-1', missingRequiredTopicIds: ['s3', 's4'], missingRequiredTopicTitles: ['Topic A', 'Topic B'] },
      ],
    })
    renderStep({ preview, onAddRelatedTopics })
    await user.click(screen.getByRole('button', { name: 'Add Related Topics' }))
    expect(onAddRelatedTopics).toHaveBeenCalledWith(['s3', 's4'])
  })

  it('disables Add Related Topics and shows a regenerating note while previewLoading', () => {
    const preview = makePreview({
      incompleteQuestionGroups: [
        { key: 'group-1', missingRequiredTopicIds: ['s3'], missingRequiredTopicTitles: ['Valvular Disease'] },
      ],
    })
    renderStep({ preview, previewLoading: true })
    expect(screen.getByRole('button', { name: 'Add Related Topics' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Exclude UWorld Group' })).toBeDisabled()
    expect(screen.getByText('Regenerating...')).toBeInTheDocument()
  })

  it('opens the Exclude confirmation modal and confirm calls onExcludeGroup', async () => {
    const onExcludeGroup = vi.fn()
    const user = userEvent.setup()
    renderStep({ preview: makePreview(), onExcludeGroup })
    expect(screen.queryByRole('button', { name: 'Confirm Exclude' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Exclude UWorld Group' }))
    expect(screen.getByRole('button', { name: 'Confirm Exclude' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm Exclude' }))
    expect(onExcludeGroup).toHaveBeenCalledWith('group-1')
  })
})
