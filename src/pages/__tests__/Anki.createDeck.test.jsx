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
}))

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

function makeFetchStub() {
  const calls = []
  globalThis.fetch = vi.fn(async (url, opts) => {
    const path = String(url)
    calls.push({ url: path, opts })
    if (opts?.method === 'POST' && path.endsWith('/api/decks')) {
      return jsonResponse({ success: true, deck_name: 'new' })
    }
    if (path.endsWith('/api/decks')) {
      return jsonResponse([])
    }
    if (path.endsWith('/api/flashcards')) {
      return jsonResponse([])
    }
    return jsonResponse({})
  })
  return calls
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

describe('Anki create deck', () => {
  beforeEach(() => {
    for (const key of [...mockUrlParams.keys()]) {
      mockUrlParams.delete(key)
    }
  })

  it('submits the typed name as deck_name in the POST body', async () => {
    const calls = makeFetchStub()
    renderAnki()

    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'new' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))

    await waitFor(() => {
      const post = calls.find((c) => c.opts?.method === 'POST')
      expect(post).toBeTruthy()
      expect(post.url.endsWith('/api/decks')).toBe(true)
      expect(JSON.parse(post.opts.body)).toEqual({ deck_name: 'new' })
    })
  })

  it('trims whitespace from the submitted deck name', async () => {
    const calls = makeFetchStub()
    renderAnki()

    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: '  new  ' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))

    await waitFor(() => {
      const post = calls.find((c) => c.opts?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(post.opts.body)).toEqual({ deck_name: 'new' })
    })
  })

  it('sends exactly one POST request per submit', async () => {
    const calls = makeFetchStub()
    renderAnki()

    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'new' } })
    const button = screen.getByRole('button', { name: '+ Deck' })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => {
      const posts = calls.filter((c) => c.opts?.method === 'POST' && c.url.endsWith('/api/decks'))
      expect(posts.length).toBe(1)
    })
  })

  it('clears the input after a successful creation', async () => {
    makeFetchStub()
    renderAnki()

    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'new' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('New deck name...').value).toBe('')
    })
  })

  it('refetches the deck list after a successful creation', async () => {
    const calls = makeFetchStub()
    renderAnki()

    const initialGets = calls.filter((c) => !c.opts?.method && c.url.endsWith('/api/decks')).length

    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'new' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))

    await waitFor(() => {
      const gets = calls.filter((c) => !c.opts?.method && c.url.endsWith('/api/decks'))
      expect(gets.length).toBeGreaterThan(initialGets)
    })
  })

  it('preserves the entered name when creation fails', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (opts?.method === 'POST') {
        return jsonResponse({ error: 'Deck name required (max 100 chars)' }, 400)
      }
      return jsonResponse([])
    })
    renderAnki()

    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: 'new' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))

    await waitFor(() => {
      expect(screen.getByTestId('toast').textContent).toBe('Deck name required (max 100 chars)')
    })
    expect(screen.getByPlaceholderText('New deck name...').value).toBe('new')
  })

  it('does not send a request for a whitespace-only name', async () => {
    const calls = makeFetchStub()
    renderAnki()

    const input = await screen.findByPlaceholderText('New deck name...')
    fireEvent.change(input, { target: { value: '   ' } })

    expect(screen.getByRole('button', { name: '+ Deck' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }))
    expect(calls.filter((c) => c.opts?.method === 'POST')).toHaveLength(0)
  })
})
