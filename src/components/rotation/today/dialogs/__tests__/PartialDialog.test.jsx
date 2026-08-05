// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PartialDialog from '../PartialDialog'

vi.mock('../ActionDialog', () => {
  const MockActionDialog = ({ open, title, description, children, actions }) => open ? (
    <div data-testid="action-dialog">
      <div data-testid="dialog-title">{title}</div>
      {description && <div>{description}</div>}
      <div>{children}</div>
      <div>{actions}</div>
    </div>
  ) : null
  return { default: MockActionDialog }
})

vi.mock('../ActionDialog.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

function makeTask(overrides = {}) {
  return {
    id: 'task-1',
    taskType: 'uworld_questions',
    targetCount: 10,
    completedCount: 2,
    topicTitle: 'Cardiology',
    ...overrides,
  }
}

function renderPartial(task = makeTask(), { onSubmit = vi.fn(), onClose = vi.fn() } = {}) {
  return render(<PartialDialog open task={task} onClose={onClose} onSubmit={onSubmit} />)
}

describe('PartialDialog', () => {
  it('renders recap copy about persistence and rescheduling for an uworld task', () => {
    renderPartial(makeTask())
    expect(screen.getByText('Your completed progress will remain in history.')).toBeInTheDocument()
    expect(screen.getByText('The remaining questions will be rescheduled after recalculation.')).toBeInTheDocument()
  })

  it('renders recap copy for percentage-path tasks too', () => {
    renderPartial(makeTask({ taskType: 'learning' }))
    expect(screen.getByText('Your completed progress will remain in history.')).toBeInTheDocument()
    expect(screen.getByText('The remaining questions will be rescheduled after recalculation.')).toBeInTheDocument()
  })

  it('shows the exact amount recorded and exact remainder for the count path', async () => {
    const user = userEvent.setup()
    renderPartial(makeTask({ targetCount: 20, completedCount: 0 }))
    await user.type(screen.getByLabelText('Questions completed'), '5')
    expect(screen.getByText('Recording: 5 of 20 questions')).toBeInTheDocument()
    expect(screen.getByText('Remaining after this: 15 questions')).toBeInTheDocument()
  })

  it('shows the amount recorded and remainder for the percentage path', async () => {
    const user = userEvent.setup()
    renderPartial(makeTask({ taskType: 'learning' }))
    await user.type(screen.getByLabelText(/Completion percentage/), '60')
    expect(screen.getByText('Recording: 60%')).toBeInTheDocument()
    expect(screen.getByText('Remaining after this: 40%')).toBeInTheDocument()
  })

  it('hides the recording recap lines when nothing has been entered', () => {
    renderPartial(makeTask())
    expect(screen.queryByText(/Recording:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Remaining after this:/)).not.toBeInTheDocument()
  })

  it('shows the exact remainder for the count path even when it would go negative', async () => {
    const user = userEvent.setup()
    renderPartial(makeTask({ targetCount: 20, completedCount: 0 }))
    await user.type(screen.getByLabelText('Questions completed'), '30')
    expect(screen.getByText('Recording: 30 of 20 questions')).toBeInTheDocument()
    expect(screen.getByText('Remaining after this: 0 questions')).toBeInTheDocument()
  })

  it('rejects completedCount of 0 with the minimum-count error', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderPartial(makeTask(), { onSubmit })
    await user.type(screen.getByLabelText('Questions completed'), '0')
    await user.type(screen.getByLabelText('Incorrect answers'), '1')
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect(screen.getByText('Enter at least 1 completed question.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects completedCount exceeding remaining', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderPartial(makeTask(), { onSubmit })
    await user.type(screen.getByLabelText('Questions completed'), '9')
    await user.type(screen.getByLabelText('Incorrect answers'), '1')
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect(screen.getByText('Cannot exceed the remaining questions for this task.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts completedCount equal to remaining', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderPartial(makeTask(), { onSubmit })
    await user.type(screen.getByLabelText('Questions completed'), '8')
    await user.type(screen.getByLabelText('Incorrect answers'), '1')
    await user.click(screen.getByRole('button', { name: 'Complete' }))
    expect(onSubmit).toHaveBeenCalledWith({ completedCount: 8, incorrectCount: 1 })
  })

  it('labels the submit button Complete when the entry finishes the task', async () => {
    const user = userEvent.setup()
    renderPartial(makeTask())
    const countInput = screen.getByLabelText('Questions completed')
    await user.type(countInput, '5')
    expect(screen.getByRole('button', { name: 'Save Partial' })).toBeInTheDocument()
    await user.clear(countInput)
    await user.type(countInput, '8')
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument()
  })

  it('keeps the Save Partial label for percentage-path entries', async () => {
    const user = userEvent.setup()
    renderPartial(makeTask({ taskType: 'learning' }))
    await user.type(screen.getByLabelText(/Completion percentage/), '50')
    expect(screen.getByRole('button', { name: 'Save Partial' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument()
  })

  it('submits { completedCount, incorrectCount } for uworld tasks', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderPartial(makeTask(), { onSubmit })
    await user.type(screen.getByLabelText('Questions completed'), '5')
    await user.type(screen.getByLabelText('Incorrect answers'), '2')
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect(onSubmit).toHaveBeenCalledWith({ completedCount: 5, incorrectCount: 2 })
  })

  it('submits { completedCount } for incorrect_review tasks', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderPartial(makeTask({ taskType: 'incorrect_review' }), { onSubmit })
    await user.type(screen.getByLabelText('Questions completed'), '5')
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect(onSubmit).toHaveBeenCalledWith({ completedCount: 5 })
  })

  it('submits { completedPercentage } for learning tasks', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderPartial(makeTask({ taskType: 'learning' }), { onSubmit })
    await user.type(screen.getByLabelText(/Completion percentage/), '50')
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect(onSubmit).toHaveBeenCalledWith({ completedPercentage: 50 })
  })

  it('submits exactly once on rapid double-click and disables controls while submitting', async () => {
    let resolveSubmit
    const onSubmit = vi.fn(() => new Promise((resolve) => { resolveSubmit = resolve }))
    const user = userEvent.setup()
    renderPartial(makeTask(), { onSubmit })
    await user.type(screen.getByLabelText('Questions completed'), '5')
    await user.type(screen.getByLabelText('Incorrect answers'), '1')
    await user.dblClick(screen.getByRole('button', { name: 'Save Partial' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    resolveSubmit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })

  it('surfaces a submit error via the error element', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server refused'))
    const user = userEvent.setup()
    renderPartial(makeTask(), { onSubmit })
    await user.type(screen.getByLabelText('Questions completed'), '5')
    await user.type(screen.getByLabelText('Incorrect answers'), '1')
    await user.click(screen.getByRole('button', { name: 'Save Partial' }))
    expect(await screen.findByText('Server refused')).toBeInTheDocument()
  })
})
