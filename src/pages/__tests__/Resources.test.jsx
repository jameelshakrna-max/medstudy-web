// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LayerProvider } from '../../context/LayerContext'
import { ProfilePanelProvider } from '../../context/ProfilePanelContext'
import { apiGet as apiGetMock, apiPost as apiPostMock } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import Resources from '../Resources'

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const { harness } = vi.hoisted(() => {
  const state = {
    db: [],
    failFirstPage: false,
    failNextPage: false,
  }

  const CATEGORIES = [
    { id: 'cardiology', name: 'Cardiology' },
    { id: 'internal_medicine', name: 'Internal Medicine' },
  ]

  function makeResource(id, overrides = {}) {
    return {
      id,
      title: `Resource ${id}`,
      category: 'cardiology',
      description: '',
      tags: [],
      type: '',
      file_name: 'notes.pdf',
      mime_type: 'application/pdf',
      file_size: 1234,
      image_key: null,
      user_id: 'u1',
      user_name: 'Test User',
      created_at: '2026-01-01 00:00:00',
      ...overrides,
    }
  }

  function defaultApiGet(path) {
    if (path === '/categories') return Promise.resolve(CATEGORIES)
    if (path.startsWith('/resources')) {
      if (state.failFirstPage) return Promise.reject(new Error('first page down'))
      const url = new URL('https://x' + path)
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || 50)
      const search = (url.searchParams.get('search') || '').toLowerCase()
      const category = url.searchParams.get('category')
      const type = url.searchParams.get('type')
      let rows = state.db
      if (category) rows = rows.filter(r => r.category === category)
      if (type) rows = rows.filter(r => r.type === type)
      if (search) rows = rows.filter(r => `${r.title} ${r.description || ''}`.toLowerCase().includes(search))
      if (state.failNextPage && offset > 0) return Promise.reject(new Error('next page down'))
      return Promise.resolve(rows.slice(offset, offset + limit))
    }
    return Promise.resolve([])
  }

  return {
    harness: {
      state,
      CATEGORIES,
      makeResource,
      defaultApiGet,
      reset() {
        state.db = []
        state.failFirstPage = false
        state.failNextPage = false
      },
    },
  }
})

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(harness.defaultApiGet),
  apiPost: vi.fn(() => Promise.resolve({ success: true })),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'test-token' } } })) },
  },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ profile: { full_name: 'Test User' }, user: { id: 'u1' } }),
}))

vi.mock('../Resources.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

class FakeXHR {
  constructor() {
    this.upload = { addEventListener: vi.fn() }
    this.listeners = {}
    this.status = 0
    this.responseText = ''
  }
  addEventListener(type, handler) {
    this.listeners[type] = handler
  }
  open(method, url) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name, value) {
    this.headers = this.headers || {}
    this.headers[name] = value
  }
  send() {
    queueMicrotask(() => {
      if (this.aborted) return
      this.status = 200
      this.responseText = JSON.stringify({ success: true })
      harness.state.db.unshift(
        harness.makeResource('uploaded-1', {
          title: 'Cardio Atlas',
          created_at: '2099-01-01 00:00:00',
        })
      )
      this.listeners.load?.()
    })
  }
}

let queryClient

function renderResources() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const utils = render(
    <LayerProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ProfilePanelProvider>
            <Resources />
          </ProfilePanelProvider>
        </QueryClientProvider>
      </MemoryRouter>
    </LayerProvider>
  )
  return { invalidateSpy, ...utils }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function listCalls() {
  return apiGetMock.mock.calls.map(([path]) => path).filter(path => path.startsWith('/resources?'))
}

function resourceParams(path) {
  return new URLSearchParams(path.slice(path.indexOf('?') + 1))
}

function resourceTitles() {
  return screen.queryAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
}

beforeEach(() => {
  harness.reset()
  apiGetMock.mockReset()
  apiGetMock.mockImplementation(harness.defaultApiGet)
  apiPostMock.mockReset()
  apiPostMock.mockImplementation(() => Promise.resolve({ success: true }))
  supabase.auth.getSession.mockReset()
  supabase.auth.getSession.mockImplementation(() =>
    Promise.resolve({ data: { session: { access_token: 'test-token' } } })
  )
  globalThis.XMLHttpRequest = FakeXHR
})

describe('Resources list — debounced search', () => {
  it('does not fire a request per keystroke and settles on the final value', async () => {
    harness.state.db = [
      harness.makeResource('a', { title: 'Cardiology Notes' }),
      harness.makeResource('b', { title: 'Cardio Deck' }),
      harness.makeResource('c', { title: 'Pharmacology Atlas' }),
      harness.makeResource('d', { title: 'Surgery Handbook' }),
      harness.makeResource('e', { title: 'Anatomy Review' }),
    ]
    renderResources()
    await waitFor(() => expect(resourceTitles()).toHaveLength(5))

    const searchInput = screen.getByPlaceholderText('Search by title...')
    const callsBefore = listCalls().length

    fireEvent.change(searchInput, { target: { value: 'c' } })
    await act(() => sleep(100))
    fireEvent.change(searchInput, { target: { value: 'ca' } })
    await act(() => sleep(100))
    fireEvent.change(searchInput, { target: { value: 'car' } })
    await act(() => sleep(200))

    expect(listCalls()).toHaveLength(callsBefore)

    await act(() => sleep(250))
    await waitFor(() => expect(resourceTitles()).toHaveLength(2))

    const calls = listCalls()
    expect(calls).toHaveLength(callsBefore + 1)
    const params = resourceParams(calls[calls.length - 1])
    expect(params.get('search')).toBe('car')
    expect(params.get('offset')).toBe('0')
    expect(params.get('limit')).toBe('50')
  })

  it('clears the debounced search immediately, without waiting for the delay', async () => {
    harness.state.db = [
      harness.makeResource('a', { title: 'Cardiology Notes' }),
      harness.makeResource('b', { title: 'Cardio Deck' }),
      harness.makeResource('c', { title: 'Pharmacology Atlas' }),
      harness.makeResource('d', { title: 'Surgery Handbook' }),
      harness.makeResource('e', { title: 'Anatomy Review' }),
    ]
    renderResources()
    await waitFor(() => expect(resourceTitles()).toHaveLength(5))

    const searchInput = screen.getByPlaceholderText('Search by title...')
    fireEvent.change(searchInput, { target: { value: 'cardio' } })
    await waitFor(() => expect(resourceTitles()).toHaveLength(2))
    const callsAfterSearch = listCalls().length

    fireEvent.change(searchInput, { target: { value: '' } })

    expect(resourceTitles()).toHaveLength(5)
    expect(listCalls()).toHaveLength(callsAfterSearch)
  })
})

describe('Resources list — filters and pagination', () => {
  it('restarts from offset 0 when a filter changes', async () => {
    harness.state.db = Array.from({ length: 60 }, (_, i) => harness.makeResource('r' + i))
    renderResources()
    await waitFor(() => expect(resourceTitles()).toHaveLength(50))

    fireEvent.click(screen.getByRole('button', { name: 'Cardiology' }))

    await waitFor(() => {
      const last = resourceParams(listCalls()[listCalls().length - 1])
      expect(last.get('category')).toBe('cardiology')
      expect(last.get('offset')).toBe('0')
    })
    await waitFor(() => expect(resourceTitles()).toHaveLength(50))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'name' } })

    await waitFor(() => {
      const last = resourceParams(listCalls()[listCalls().length - 1])
      expect(last.get('sort')).toBe('name')
      expect(last.get('offset')).toBe('0')
      expect(last.get('category')).toBe('cardiology')
    })
  })

  it('requests pages with limit=50 and cumulative offsets', async () => {
    harness.state.db = Array.from({ length: 60 }, (_, i) => harness.makeResource('r' + i))
    renderResources()
    await waitFor(() => expect(resourceTitles()).toHaveLength(50))

    const first = resourceParams(listCalls()[0])
    expect(first.get('limit')).toBe('50')
    expect(first.get('offset')).toBe('0')
    expect(first.get('sort')).toBe('created_at')
    expect(first.get('search')).toBeNull()
    expect(first.get('category')).toBeNull()
    expect(first.get('type')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(resourceTitles()).toHaveLength(60))

    const second = resourceParams(listCalls()[listCalls().length - 1])
    expect(second.get('limit')).toBe('50')
    expect(second.get('offset')).toBe('50')
  })

  it('appends page 2 and deduplicates by id, first occurrence wins', async () => {
    apiGetMock.mockImplementation((path) => {
      if (path === '/categories') return Promise.resolve(harness.CATEGORIES)
      if (path.startsWith('/resources')) {
        const url = new URL('https://x' + path)
        const offset = Number(url.searchParams.get('offset') || 0)
        const base = Array.from({ length: 90 }, (_, i) => harness.makeResource('r' + i))
        const rows = offset === 0 ? base.slice(0, 50) : base.slice(40, 90)
        return Promise.resolve(rows)
      }
      return Promise.resolve([])
    })
    renderResources()
    await waitFor(() => expect(resourceTitles()).toHaveLength(50))

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(resourceTitles()).toHaveLength(90))

    const titles = resourceTitles()
    expect(new Set(titles).size).toBe(90)
    expect(titles[0]).toBe('Resource r0')
    expect(titles[titles.length - 1]).toBe('Resource r89')
  })

  it('hides Load more when the next page comes back empty', async () => {
    harness.state.db = Array.from({ length: 50 }, (_, i) => harness.makeResource('r' + i))
    renderResources()
    await waitFor(() => expect(resourceTitles()).toHaveLength(50))

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(listCalls().length).toBeGreaterThanOrEqual(2))

    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(resourceTitles()).toHaveLength(50)
  })
})

describe('Resources list — errors', () => {
  it('shows an inline error when the next page fails and Retry retries the fetch', async () => {
    harness.state.db = Array.from({ length: 60 }, (_, i) => harness.makeResource('r' + i))
    renderResources()
    await waitFor(() => expect(resourceTitles()).toHaveLength(50))

    harness.state.failNextPage = true
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText("Couldn't load more resources.")).toBeInTheDocument()
    expect(resourceTitles()).toHaveLength(50)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()

    harness.state.failNextPage = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(resourceTitles()).toHaveLength(60))
    expect(screen.queryByText("Couldn't load more resources.")).not.toBeInTheDocument()
  })

  it('shows a full error state when the first page fails and Retry refetches', async () => {
    harness.state.db = Array.from({ length: 60 }, (_, i) => harness.makeResource('r' + i))
    harness.state.failFirstPage = true
    renderResources()

    expect(await screen.findByText("Couldn't load resources")).toBeInTheDocument()
    expect(screen.queryByText('Resource r0')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    harness.state.failFirstPage = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(resourceTitles()).toHaveLength(50))
    expect(screen.queryByText("Couldn't load resources")).not.toBeInTheDocument()
  })
})

describe('Resources list — empty states', () => {
  it('shows distinct empty states for no resources vs no filter matches', async () => {
    renderResources()
    await waitFor(() => expect(screen.getByText('No resources yet')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Upload your first resource' })).toBeInTheDocument()

    harness.state.db = [harness.makeResource('a', { title: 'Cardiology Notes' })]
    fireEvent.click(screen.getByRole('button', { name: '📖 Book' }))

    await waitFor(() => expect(screen.getByText('No resources match your search')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })
})

describe('Resources list — upload invalidation', () => {
  it('invalidates the debounced-filtered list query after a successful upload', async () => {
    harness.state.db = [
      harness.makeResource('a', { title: 'Cardiology Notes' }),
      harness.makeResource('b', { title: 'Cardio Deck' }),
      harness.makeResource('c', { title: 'Pharmacology Atlas' }),
    ]
    const { invalidateSpy } = renderResources()
    await waitFor(() => expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(3))

    const searchInput = screen.getByPlaceholderText('Search by title...')
    fireEvent.change(searchInput, { target: { value: 'card' } })
    await waitFor(() => expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByPlaceholderText('Resource title'), { target: { value: 'Cardio Atlas' } })
    fireEvent.change(within(dialog).getAllByRole('combobox')[0], { target: { value: 'cardiology' } })
    const fileInput = dialog.querySelectorAll('input[type="file"]')[0]
    fireEvent.change(fileInput, { target: { files: [new File(['pdf'], 'atlas.pdf', { type: 'application/pdf' })] } })

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }))
    })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Cardio Atlas')).toBeInTheDocument())
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(3)

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resources', 'list', '', '', 'card', 'created_at'],
    })

    const last = resourceParams(listCalls()[listCalls().length - 1])
    expect(last.get('search')).toBe('card')
    expect(last.get('offset')).toBe('0')
  })
})
