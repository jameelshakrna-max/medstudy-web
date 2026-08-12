// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockUrlParams } = vi.hoisted(() => {
  return { mockUrlParams: new URLSearchParams() }
})

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

// Simulates the FIXED backend contract for /api/decks: [{ id, name, card_count }]
function makeFetchStub({ deck = null, postError = null } = {}) {
  const calls = []
  let decks = deck ? [deck] : []
  globalThis.fetch = vi.fn(async (url, opts) => {
    const path = String(url)
    calls.push({ url: path, opts })
    if (opts?.method === 'POST' && path.endsWith('/api/decks')) {
      if (postError) {
        return jsonResponse({ error: postError }, 400)
      }
      return jsonResponse({ success: true, deck_name: deck ? deck.name : 'new' })
    }
    if (path.endsWith('/api/decks')) {
      return jsonResponse(decks)
    }
    if (path.endsWith('/api/flashcards')) {
      return jsonResponse([])
    }
    return jsonResponse({})
  })
  return { calls, setDecks: (d) => { decks = d } }
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

async function createDeck(name) {
  fireEvent.click(await screen.findByRole('button', { name: '+ Deck' }))
  const input = await screen.findByPlaceholderText('New deck name...')
  fireEvent.change(input, { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Deck' }))
}

describe('Anki create deck — release regression scenarios', () => {
  beforeEach(() => {
    for (const key of [...mockUrlParams.keys()]) {
      mockUrlParams.delete(key)
    }
  })

  it('scenario 1: valid create sends a single POST with { deck_name }', async () => {
    const { calls } = makeFetchStub({ deck: { id: 'Release Test Deck', name: 'Release Test Deck', card_count: 0 } })
    renderAnki()

    await createDeck('Release Test Deck')

    await waitFor(() => {
      const posts = calls.filter((c) => c.opts?.method === 'POST' && c.url.endsWith('/api/decks'))
      expect(posts).toHaveLength(1)
      expect(JSON.parse(posts[0].opts.body)).toEqual({ deck_name: 'Release Test Deck' })
    })
  })

  it('scenario 2 + primary repro: success shows feedback, clears input, refetches, and the deck appears immediately', async () => {
    const { calls } = makeFetchStub({ deck: { id: 'Release Test Deck', name: 'Release Test Deck', card_count: 0 } })
    renderAnki()

    const initialGets = calls.filter((c) => !c.opts?.method && c.url.endsWith('/api/decks')).length
    await createDeck('Release Test Deck')

    await waitFor(() => {
      expect(screen.getByText('Deck created.')).toBeTruthy()
      expect(screen.getByText('Release Test Deck')).toBeTruthy()
      expect(screen.queryByPlaceholderText('New deck name...')).toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    await waitFor(() => {
      const gets = calls.filter((c) => !c.opts?.method && c.url.endsWith('/api/decks'))
      expect(gets.length).toBeGreaterThan(initialGets)
    })
  })

  it('scenario 3: the created deck persists across a remount/refetch', async () => {
    const { calls } = makeFetchStub({ deck: { id: 'Release Test Deck', name: 'Release Test Deck', card_count: 0 } })
    renderAnki()

    await createDeck('Release Test Deck')
    await waitFor(() => expect(screen.getByText('Release Test Deck')).toBeTruthy())

    // Simulate a remount: fresh query client, fetch returns the persisted deck
    calls.length = 0
    renderAnki()
    await waitFor(() => expect(screen.getByText('Release Test Deck')).toBeTruthy())
  })

  it('scenario 4: API 400 shows a visible error, keeps the typed name, no false success', async () => {
    makeFetchStub({ postError: 'Deck name required (max 100 chars)' })
    renderAnki()

    await createDeck('Release Test Deck')

    await waitFor(() => {
      expect(screen.getByTestId('toast').textContent).toBe('Deck name required (max 100 chars)')
      expect(screen.getByPlaceholderText('New deck name...').value).toBe('Release Test Deck')
    })
    expect(screen.queryByText('Deck created.')).toBeNull()
  })

  it('scenario 5: API 500/network error shows a visible error, loading ends, and retry works', async () => {
    let failNext = true
    const attempts = []
    makeFetchStub({ deck: { id: 'Release Test Deck', name: 'Release Test Deck', card_count: 0 } })
    const original = globalThis.fetch
    globalThis.fetch = vi.fn(async (url, opts) => {
      attempts.push({ url: String(url), opts })
      if (opts?.method === 'POST' && String(url).endsWith('/api/decks') && failNext) {
        failNext = false
        throw new TypeError('Failed to fetch')
      }
      return original(url, opts)
    })
    renderAnki()

    await createDeck('Release Test Deck')

    await waitFor(() => {
      expect(screen.getByTestId('toast').textContent).toMatch(/Failed to fetch/)
    })
    expect(screen.getByRole('button', { name: 'Create Deck' }).disabled).toBe(false)

    await createDeck('Release Test Deck')
    await waitFor(() => {
      expect(screen.getByText('Deck created.')).toBeTruthy()
      const posts = attempts.filter((c) => c.opts?.method === 'POST' && c.url.endsWith('/api/decks'))
      expect(posts).toHaveLength(2)
    })
  })

  it('scenario 6: rapid double-click sends exactly one POST and creates one row', async () => {
    const { calls } = makeFetchStub({ deck: { id: 'Release Test Deck', name: 'Release Test Deck', card_count: 0 } })
    renderAnki()

    fireEvent.click(await screen.findByRole('button', { name: '+ Deck' }))
    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'Release Test Deck' } })
    const button = screen.getByRole('button', { name: 'Create Deck' })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => {
      const posts = calls.filter((c) => c.opts?.method === 'POST' && c.url.endsWith('/api/decks'))
      expect(posts).toHaveLength(1)
    })
  })

  it('scenario 7: unexpected success response shape does not silently clear input and shows a client error', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      const path = String(url)
      if (opts?.method === 'POST' && path.endsWith('/api/decks')) {
        return jsonResponse({ unexpected: true })
      }
      if (path.endsWith('/api/decks')) {
        return jsonResponse([])
      }
      if (path.endsWith('/api/flashcards')) {
        return jsonResponse([])
      }
      return jsonResponse({})
    })
    renderAnki()

    await createDeck('Release Test Deck')

    await waitFor(() => {
      expect(screen.getByTestId('toast').textContent).toMatch(/Unexpected server response/i)
      expect(screen.getByPlaceholderText('New deck name...').value).toBe('Release Test Deck')
    })
  })

  it('scenario 8: existing deck list is unchanged when creation fails', async () => {
    const { calls, setDecks } = makeFetchStub({
      deck: { id: 'Existing', name: 'Existing', card_count: 2 },
      postError: 'Server exploded',
    })
    renderAnki()

    await waitFor(() => expect(screen.getByText('Existing')).toBeTruthy())

    const snapshot = calls
      .filter((c) => !c.opts?.method && c.url.endsWith('/api/decks'))
      .map((c) => JSON.stringify(c))
    await createDeck('New Deck')

    await waitFor(() => {
      expect(screen.getByTestId('toast').textContent).toBe('Server exploded')
    })
    const after = calls
      .filter((c) => !c.opts?.method && c.url.endsWith('/api/decks'))
      .map((c) => JSON.stringify(c))
    expect(after).toEqual(snapshot)
    expect(screen.getByText('Existing')).toBeTruthy()
    expect(screen.queryByText('New Deck', { selector: '.deckName' })).toBeNull()
    setDecks([{ id: 'Existing', name: 'Existing', card_count: 2 }])
  })
})
