// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StepAnkiDecks from '../StepAnkiDecks'

const { useQueryMock, decksHolder } = vi.hoisted(() => {
  const holder = { data: null }
  const fn = vi.fn(() => ({ data: holder.data, isLoading: false }))
  return { useQueryMock: fn, decksHolder: holder }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
}))

vi.mock('../PlanCreationForm.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

const DECKS = [
  { id: 'd1', name: 'Cardio Deck', card_count: 120 },
  { id: 'd2', name: 'Pharm Deck', card_count: 200 },
]

const baseForm = { linkedDeckNames: [], primaryDeckName: null }

describe('StepAnkiDecks', () => {
  beforeEach(() => {
    decksHolder.data = DECKS
  })

  it('renders an empty state when there are no decks', () => {
    decksHolder.data = []
    render(<StepAnkiDecks form={baseForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByText(/No Anki decks found/)).toBeInTheDocument()
  })

  it('renders decks with card counts', () => {
    render(<StepAnkiDecks form={baseForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByRole('checkbox', { name: /Cardio Deck/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Pharm Deck/ })).toBeInTheDocument()
    expect(screen.getByText('120 cards')).toBeInTheDocument()
    expect(screen.getByText('200 cards')).toBeInTheDocument()
  })

  it('selecting a deck links it and does not auto-set a primary', () => {
    const onFormChange = vi.fn()
    render(<StepAnkiDecks form={baseForm} onFormChange={onFormChange} errors={[]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Cardio Deck/ }))
    expect(onFormChange).toHaveBeenCalledWith({ linkedDeckNames: ['Cardio Deck'], primaryDeckName: null })
  })

  it('shows radio options limited to selected decks', () => {
    const form = { linkedDeckNames: ['Cardio Deck'], primaryDeckName: null }
    render(<StepAnkiDecks form={form} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByRole('radio', { name: /Cardio Deck/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Pharm Deck/ })).not.toBeInTheDocument()
  })

  it('choosing a primary deck sets primaryDeckName', () => {
    const form = { linkedDeckNames: ['Cardio Deck'], primaryDeckName: null }
    const onFormChange = vi.fn()
    render(<StepAnkiDecks form={form} onFormChange={onFormChange} errors={[]} />)
    fireEvent.click(screen.getByRole('radio', { name: /Cardio Deck/ }))
    expect(onFormChange).toHaveBeenCalledWith({ linkedDeckNames: ['Cardio Deck'], primaryDeckName: 'Cardio Deck' })
  })

  it('deselecting the primary deck clears primaryDeckName', () => {
    const form = { linkedDeckNames: ['Cardio Deck', 'Pharm Deck'], primaryDeckName: 'Cardio Deck' }
    const onFormChange = vi.fn()
    render(<StepAnkiDecks form={form} onFormChange={onFormChange} errors={[]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Cardio Deck/ }))
    expect(onFormChange).toHaveBeenCalledWith({ linkedDeckNames: ['Pharm Deck'], primaryDeckName: null })
  })

  it('renders decks when the source returns the legacy { decks } object shape', () => {
    decksHolder.data = { decks: DECKS }
    render(<StepAnkiDecks form={baseForm} onFormChange={vi.fn()} errors={[]} />)
    expect(screen.getByRole('checkbox', { name: /Cardio Deck/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Pharm Deck/ })).toBeInTheDocument()
    expect(screen.getByText('120 cards')).toBeInTheDocument()
    expect(screen.getByText('200 cards')).toBeInTheDocument()
  })
})
