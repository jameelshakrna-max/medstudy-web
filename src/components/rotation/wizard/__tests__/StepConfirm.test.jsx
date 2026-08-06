// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StepConfirm from '../StepConfirm'

vi.mock('../PlanCreationForm.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

const FORM = {
  sourceId: 'step-up-medicine-6e-2024',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-02-05',
  examDate: '',
  studyStyle: 'active',
  schedulingMode: 'efficient',
  topics: [{}],
  bufferPercentage: 20,
  maximumActiveTopics: 2,
}

describe('StepConfirm', () => {
  it('does not show overload warning for a feasible preview', () => {
    render(<StepConfirm form={FORM} preview={{ feasibility: { feasible: true } }} overloadAccepted={false} onOverloadChange={vi.fn()} />)
    expect(screen.queryByText(/exceeds available capacity/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows overload warning and checkbox for an infeasible preview; checking calls onOverloadChange(true)', async () => {
    const onOverloadChange = vi.fn()
    const user = userEvent.setup()
    render(<StepConfirm form={FORM} preview={{ feasibility: { feasible: false } }} overloadAccepted={false} onOverloadChange={onOverloadChange} />)
    expect(screen.getByText(/exceeds available capacity/)).toBeInTheDocument()
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeInTheDocument()
    await user.click(checkbox)
    expect(onOverloadChange).toHaveBeenCalledWith(true)
  })

  it('warns when there are unresolved incomplete question groups', () => {
    render(<StepConfirm form={FORM} preview={{ feasibility: { feasible: true }, incompleteQuestionGroups: [{ key: 'g1' }] }} overloadAccepted={false} onOverloadChange={vi.fn()} />)
    expect(screen.getByText(/Resolve or exclude incomplete UWorld review groups before creating this plan/)).toBeInTheDocument()
  })

  it('does not warn when incomplete question groups is empty', () => {
    render(<StepConfirm form={FORM} preview={{ feasibility: { feasible: true }, incompleteQuestionGroups: [] }} overloadAccepted={false} onOverloadChange={vi.fn()} />)
    expect(screen.queryByText(/Resolve or exclude incomplete UWorld review groups/)).not.toBeInTheDocument()
  })
})
