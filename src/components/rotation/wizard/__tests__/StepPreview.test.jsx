// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StepPreview from '../StepPreview'

vi.mock('../PlanCreationForm.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

describe('StepPreview', () => {
  it('renders "No preview generated yet." when preview is null', () => {
    render(<StepPreview preview={null} previewLoading={false} previewError={null} onRetry={vi.fn()} />)
    expect(screen.getByText('No preview generated yet.')).toBeInTheDocument()
  })

  it('renders "Generating preview..." when previewLoading is true', () => {
    render(<StepPreview preview={null} previewLoading previewError={null} onRetry={vi.fn()} />)
    expect(screen.getByText('Generating preview...')).toBeInTheDocument()
  })

  it('renders feasible state', () => {
    render(<StepPreview preview={{ feasibility: { feasible: true, totalRequiredMinutes: 600, availableMinutes: 900, missingCapacity: 0, topicsLeftUnscheduled: [], possibleSolutions: [] } }} previewLoading={false} previewError={null} onRetry={vi.fn()} />)
    expect(screen.getByText('Plan is feasible')).toBeInTheDocument()
  })

  it('renders infeasible state with possible solutions', () => {
    render(<StepPreview preview={{ feasibility: { feasible: false, missingCapacity: 120, totalRequiredMinutes: 1000, availableMinutes: 880, topicsLeftUnscheduled: [], possibleSolutions: ['Reduce daily study load', 'Extend end date'] } }} previewLoading={false} previewError={null} onRetry={vi.fn()} />)
    expect(screen.getByText('Plan exceeds available capacity')).toBeInTheDocument()
    expect(screen.getByText('Reduce daily study load')).toBeInTheDocument()
    expect(screen.getByText('Extend end date')).toBeInTheDocument()
  })

  it('renders unscheduledWork entries', () => {
    render(<StepPreview preview={{ feasibility: { feasible: false, topicsLeftUnscheduled: [], possibleSolutions: [] }, unscheduledWork: [{ canonicalTopicId: 'cardiology.x', title: 'Stable Angina', remainingLearningMinutes: 60, remainingQuestions: 10 }] }} previewLoading={false} previewError={null} onRetry={vi.fn()} />)
    expect(screen.getByText('Stable Angina: 60 min learning, 10 questions')).toBeInTheDocument()
  })

  it('renders retry button and calls onRetry when previewError is set', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<StepPreview preview={null} previewLoading={false} previewError={new Error('boom')} onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: /Retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
