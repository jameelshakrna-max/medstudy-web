// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { LayerProvider } from '../../../context/LayerContext'
import RotationHelpDialog from '../RotationHelpDialog'

const SECTIONS = [
  {
    title: 'Learning',
    body: "Every topic starts as a Learning task. Completing a topic's learning unlocks its UWorld questions.",
  },
  {
    title: 'UWorld',
    body: 'UWorld questions for a topic stay locked until you complete its learning first. Work the questions in UWorld, then record your progress in MedStudy so your plan stays up to date.',
  },
  {
    title: 'Partial progress',
    body: 'If you finish only part of a UWorld question set, record the number you completed. The remaining questions are rescheduled after your plan recalculates.',
  },
  {
    title: 'Anki',
    body: 'Your Anki reviews come from the decks mapped to your rotation topics. The Anki Status section shows how many flashcards are due today.',
  },
  {
    title: 'Recalculation',
    body: 'When the plan cannot distribute its remaining work on its own, it shows a banner asking you to recalculate. Recalculation redistributes your completed or changed work across the remaining schedule.',
  },
]

const TRIGGER_LABEL = 'How your rotation plan works'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>{TRIGGER_LABEL}</button>
      <RotationHelpDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function renderHarness() {
  return render(
    <LayerProvider>
      <Harness />
    </LayerProvider>
  )
}

async function openDialog(user) {
  await user.click(screen.getByRole('button', { name: TRIGGER_LABEL }))
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
}

describe('RotationHelpDialog', () => {
  it('does not render the dialog when closed', () => {
    renderHarness()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the title and all five sections when open', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openDialog(user)
    expect(screen.getByRole('heading', { name: 'How your rotation plan works' })).toBeInTheDocument()
    for (const section of SECTIONS) {
      expect(screen.getByRole('heading', { name: section.title })).toBeInTheDocument()
      expect(screen.getByText(section.body)).toBeInTheDocument()
    }
  })

  it('closes the dialog when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openDialog(user)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('restores focus to the trigger after closing', async () => {
    const user = userEvent.setup()
    renderHarness()
    const trigger = screen.getByRole('button', { name: TRIGGER_LABEL })
    await openDialog(user)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('calls onClose when the visible close button is clicked', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not call onClose for a closed dialog', () => {
    const onClose = vi.fn()
    render(
      <LayerProvider>
        <RotationHelpDialog open={false} onClose={onClose} />
      </LayerProvider>
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})
