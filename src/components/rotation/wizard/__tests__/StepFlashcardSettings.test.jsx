// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StepFlashcardSettings from '../StepFlashcardSettings'

vi.mock('../PlanCreationForm.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

const defaultForm = {
  flashcardSettings: {
    learningUnlockMode: 'learning_completed',
    maxProjectedFlashcardReviewMinutesPerDay: null,
  },
}

describe('StepFlashcardSettings', () => {
  it('renders heading Flashcard Capacity', () => {
    render(<StepFlashcardSettings form={defaultForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByText('Flashcard Capacity')).toBeInTheDocument()
  })

  it('renders both radio options', () => {
    render(<StepFlashcardSettings form={defaultForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByText('After learning is completed')).toBeInTheDocument()
    expect(screen.getByText('After learning is started')).toBeInTheDocument()
  })

  it('default radio selection matches form value', () => {
    render(<StepFlashcardSettings form={defaultForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByDisplayValue('learning_completed')).toBeChecked()
  })

  it('changing radio calls onFormChange with updated flashcardSettings', () => {
    const onFormChange = vi.fn()
    render(<StepFlashcardSettings form={defaultForm} onFormChange={onFormChange} errors={[]} />)
    fireEvent.click(screen.getByDisplayValue('learning_started'))
    expect(onFormChange).toHaveBeenCalledWith({
      flashcardSettings: {
        ...defaultForm.flashcardSettings,
        learningUnlockMode: 'learning_started',
      },
    })
  })

  it('renders toggle for review limit', () => {
    render(<StepFlashcardSettings form={defaultForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByText('Safe-new-card forecasting')).toBeInTheDocument()
  })

  it('when limit is not null, shows the toggle as enabled with the input', () => {
    const form = {
      flashcardSettings: {
        learningUnlockMode: 'learning_completed',
        maxProjectedFlashcardReviewMinutesPerDay: 30,
      },
    }
    render(<StepFlashcardSettings form={form} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByLabelText('Daily projected review limit (minutes)')).toBeInTheDocument()
  })

  it('when limit is null, shows the toggle as disabled', () => {
    render(<StepFlashcardSettings form={defaultForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.queryByLabelText('Daily projected review limit (minutes)')).not.toBeInTheDocument()
  })

  it('does not crash when errors are provided', () => {
    const errors = ['Some error']
    expect(() =>
      render(<StepFlashcardSettings form={defaultForm} onFormChange={vi.fn()} errors={errors} />)
    ).not.toThrow()
  })

  it('renders description/hint text', () => {
    render(<StepFlashcardSettings form={defaultForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByText(/Control how safe-new-card recommendations work/)).toBeInTheDocument()
  })
})
