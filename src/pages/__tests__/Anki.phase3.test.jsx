// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockUrlParams, mocks } = vi.hoisted(() => ({
  mockUrlParams: new URLSearchParams(),
  mocks: { mobile: false },
}))

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockUrlParams, vi.fn()],
}))

vi.mock('../Anki.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../../components/LoadingScreen', () => ({
  default: () => null,
}))

vi.mock('../../components/ui/Toast/Toast', () => {
  const Toast = ({ title }) => (title ? <div data-testid="toast">{title}</div> : null)
  Toast.Provider = ({ children }) => <>{children}</>
  Toast.Viewport = () => null
  return { default: Toast }
})

vi.mock('lucide-react', () => ({
  Maximize2: () => null,
  Minimize2: () => null,
  Plus: () => null,
  BookOpenCheck: () => null,
}))

vi.mock('../../components/ui/Modal/Modal', () => {
  const MockModal = ({ open, children }) => (open ? <div role="dialog">{children}</div> : null)
  MockModal.Title = ({ children }) => <div>{children}</div>
  MockModal.Description = ({ children }) => <div>{children}</div>
  MockModal.Close = ({ children }) => <div>{children}</div>
  MockModal.Trigger = ({ children }) => <div>{children}</div>
  return { default: MockModal }
})

vi.mock('fsrs.js', () => ({
  FSRS: vi.fn().mockImplementation(() => ({
    repeat: () => ({
      [0]: { card: { difficulty: 0, stability: 0, state: 0, due: new Date(), getTime: () => Date.now() } },
      [1]: { card: { difficulty: 0, stability: 0, state: 0, due: new Date(), getTime: () => Date.now() } },
      [2]: { card: { difficulty: 0, stability: 0, state: 0, due: new Date(), getTime: () => Date.now() } },
      [3]: { card: { difficulty: 0, stability: 0, state: 0, due: new Date(), getTime: () => Date.now() } },
    }),
  })),
  Card: vi.fn(),
  State: { New: 0, Learning: 1, Review: 2, Relearning: 3 },
  Rating: { Again: 0, Hard: 1, Good: 2, Easy: 3 },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) } },
}))

import Anki from '../Anki'

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const DECK = { id: 'd1', name: 'Cardio' }

// state 1 (learning) + state 3 (relearning), both past-due
// state 0 (new, never reviewed) -> also due
// state 2 (review) scheduled far in the future -> NOT due
const CARDS = [
  { id: 'c1', deck_id: 'd1', state: 1, last_review: '2026-01-01', next_review: '2020-01-02', front: '<p>Q1</p>', back: '<p>A1</p>', difficulty: 0, stability: 0, interval: 0 },
  { id: 'c2', deck_id: 'd1', state: 3, last_review: '2026-01-01', next_review: '2020-01-02', front: '<p>Q2</p>', back: '<p>A2</p>', difficulty: 0, stability: 0, interval: 0 },
  { id: 'c3', deck_id: 'd1', state: 0, last_review: null, next_review: null, front: '<p>Q3</p>', back: '<p>A3</p>', difficulty: 0, stability: 0, interval: 0 },
  { id: 'c4', deck_id: 'd1', state: 2, last_review: '2026-01-01', next_review: '2030-01-01', front: '<p>Q4</p>', back: '<p>A4</p>', difficulty: 0, stability: 0, interval: 0 },
]

const NO_DUE_CARDS = [
  { id: 'c4', deck_id: 'd1', state: 2, last_review: '2026-01-01', next_review: '2030-01-01', front: '<p>Q4</p>', back: '<p>A4</p>', difficulty: 0, stability: 0, interval: 0 },
]

function makeFetchStub({ decks = [DECK], cards = CARDS, postError = null } = {}) {
  const calls = []
  globalThis.fetch = vi.fn(async (url, opts) => {
    const path = String(url)
    calls.push({ url: path, opts })
    if (opts?.method === 'POST' && path.endsWith('/api/decks')) {
      if (postError) return jsonResponse({ error: postError }, 400)
      return jsonResponse({ success: true, deck_name: 'New Deck' })
    }
    if (path.endsWith('/api/decks')) return jsonResponse(decks)
    if (path.endsWith('/api/flashcards')) return jsonResponse(cards)
    return jsonResponse({})
  })
  return { calls }
}

function renderAnki() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <Anki />
    </QueryClientProvider>
  )
  return queryClient
}

async function renderLoaded() {
  makeFetchStub()
  renderAnki()
  await screen.findByText('Cardio')
}

function pillText(text) {
  return (_content, el) => {
    const norm = (el.textContent || '').replace(/\s+/g, ' ').trim()
    return norm === text
  }
}

function headerPill(text) {
  return screen.getByText(pillText(text), { selector: '.pill' })
}

function cardioTile() {
  return screen.getByText('Cardio').closest('.deckCard')
}

beforeEach(() => {
  mocks.mobile = false
  for (const key of [...mockUrlParams.keys()]) {
    mockUrlParams.delete(key)
  }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query) => ({
      matches: mocks.mobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('Anki phase 3 — truthful counts and review workflow', () => {
  it('Learning count includes state 1 AND state 3 cards', async () => {
    await renderLoaded()

    expect(headerPill('2 learning')).toBeInTheDocument()
    expect(within(cardioTile()).getByText(pillText('2 learning'))).toBeInTheDocument()
  })

  it('New count is state 0 cards only', async () => {
    await renderLoaded()

    expect(headerPill('1 new')).toBeInTheDocument()
    expect(within(cardioTile()).getByText(pillText('1 new'))).toBeInTheDocument()
  })

  it('Due count equals the reviewable collection size', async () => {
    await renderLoaded()

    // c1 (state 1, due) + c2 (state 3, due) + c3 (state 0, never reviewed) = 3
    expect(headerPill('3 due')).toBeInTheDocument()
    expect(within(cardioTile()).getByText(pillText('3 due'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Now (3)' })).toBeInTheDocument()
  })

  it('Review Now is hidden when there are no reviewable cards', async () => {
    makeFetchStub({ cards: NO_DUE_CARDS })
    renderAnki()
    await screen.findByText('Cardio')

    expect(screen.queryByRole('button', { name: /Review Now/ })).toBeNull()
    expect(headerPill('0 due')).toBeInTheDocument()
  })

  it('desktop shows header Review Now + Create and no mobile shortcuts', async () => {
    await renderLoaded()

    expect(screen.getByRole('button', { name: '+ Deck' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Now (3)' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Quick actions')).toBeNull()
  })

  it('mobile hides header actions and shows ContextualShortcuts with Review Now + Create', async () => {
    mocks.mobile = true
    await renderLoaded()

    expect(screen.queryByRole('button', { name: '+ Deck' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Review Now (3)' })).toBeNull()

    const shortcuts = screen.getByLabelText('Quick actions')
    expect(within(shortcuts).getByRole('button', { name: 'Review Now' })).toBeInTheDocument()
    expect(within(shortcuts).getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('mobile shortcuts drop Review Now when nothing is reviewable', async () => {
    mocks.mobile = true
    makeFetchStub({ cards: NO_DUE_CARDS })
    renderAnki()
    await screen.findByText('Cardio')

    const shortcuts = screen.getByLabelText('Quick actions')
    expect(within(shortcuts).queryByRole('button', { name: 'Review Now' })).toBeNull()
    expect(within(shortcuts).getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('header Review Now starts the inline review workflow with the reviewable queue', async () => {
    await renderLoaded()

    fireEvent.click(screen.getByRole('button', { name: 'Review Now (3)' }))

    // Same inline review view the existing button produces: queue == reviewable
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument()
  })

  it('browse Review tab still starts the same workflow with the same queue', async () => {
    await renderLoaded()

    fireEvent.click(cardioTile())
    fireEvent.click(screen.getByText('Review', { selector: '.tabReview' }))

    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument()
  })
})

describe('Anki phase 3 — New Deck modal', () => {
  it('opens via the header Create button, submits the POST contract, closes on success', async () => {
    const { calls } = makeFetchStub()
    renderAnki()
    await screen.findByText('Cardio')

    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('New Deck')).toBeInTheDocument()

    const input = within(dialog).getByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'New Deck' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Deck' }))

    await waitFor(() => {
      const post = calls.find((c) => c.opts?.method === 'POST')
      expect(post).toBeTruthy()
      expect(post.url.endsWith('/api/decks')).toBe(true)
      expect(JSON.parse(post.opts.body)).toEqual({ deck_name: 'New Deck' })
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('keeps the modal open and preserves the name on error', async () => {
    makeFetchStub({ postError: 'Deck name required (max 100 chars)' })
    renderAnki()
    await screen.findByText('Cardio')

    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))
    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'Bad Deck' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Deck' }))

    await waitFor(() => {
      expect(screen.getByTestId('toast').textContent).toBe('Deck name required (max 100 chars)')
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('New deck name...').value).toBe('Bad Deck')
  })

  it('submits when Enter is pressed inside the modal input', async () => {
    const { calls } = makeFetchStub()
    renderAnki()
    await screen.findByText('Cardio')

    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))
    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'Enter Deck' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      const post = calls.find((c) => c.opts?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(post.opts.body)).toEqual({ deck_name: 'Enter Deck' })
    })
  })
})
