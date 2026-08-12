// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { harness } = vi.hoisted(() => {
  const config = { failRead: false }

  const tables = {
    curriculum_systems: [],
    curriculum_subjects: [],
    curriculum_topics: [],
  }

  const calls = []

  function resultFor(table) {
    return { data: tables[table] ?? [], error: null }
  }

  function makeInsertResult() {
    const p = Promise.resolve({ data: null, error: null })
    p.select = () => p
    return p
  }

  function makeChain(table) {
    const chain = {
      select: vi.fn((...args) => { calls.push({ table, method: 'select', args }); return chain }),
      eq: vi.fn((...args) => { calls.push({ table, method: 'eq', args }); return chain }),
      order: vi.fn((...args) => { calls.push({ table, method: 'order', args }); return chain }),
      limit: vi.fn((...args) => { calls.push({ table, method: 'limit', args }); return chain }),
      insert: vi.fn((...args) => { calls.push({ table, method: 'insert', args }); return makeInsertResult() }),
      update: vi.fn((...args) => { calls.push({ table, method: 'update', args }); return chain }),
      delete: vi.fn((...args) => { calls.push({ table, method: 'delete', args }); return chain }),
      then: vi.fn((onFulfilled, onRejected) => {
        const result = config.failRead
          ? Promise.reject(new Error('read failed'))
          : Promise.resolve(resultFor(table))
        return result.then(onFulfilled, onRejected)
      }),
      error: null,
      data: null,
    }
    return chain
  }

  const supabase = {
    from: vi.fn(table => makeChain(table)),
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  }

  return {
    harness: {
      config,
      tables,
      calls,
      supabase,
      setSystems: list => { tables.curriculum_systems = list },
      setSubjects: list => { tables.curriculum_subjects = list },
      setTopics: list => { tables.curriculum_topics = list },
      callsFor: (table, method) => calls.filter(c => c.table === table && c.method === method),
      lastCall: (table, method) => {
        const list = calls.filter(c => c.table === table && c.method === method)
        return list[list.length - 1]
      },
      hasEq: (table, id) => calls.some(c =>
        c.table === table && c.method === 'eq' && c.args[0] === 'id' && c.args[1] === id,
      ),
      reset() {
        config.failRead = false
        for (const key of Object.keys(tables)) tables[key] = []
        calls.length = 0
      },
    },
  }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: harness.supabase,
}))

vi.mock('../../components/LoadingScreen', () => ({
  default: () => <div data-testid="loading-screen" />,
}))

vi.mock('../Page.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

vi.mock('../Curriculum.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

import Curriculum from '../Curriculum'

const SYSTEM = { id: 'sys1', user_id: 'u1', name: 'Cardiology', high_yield: true, status: 'Not Started', priority: 1 }
const SUBJECT = { id: 'sub1', user_id: 'u1', name: 'Cardiac Pharmacology', system_id: 'sys1', high_yield: false, difficulty: 'Medium', status: 'Not Started' }
const makeTopic = overrides => ({
  id: 't1',
  user_id: 'u1',
  name: 'Atrial Fibrillation',
  subject_id: 'sub1',
  high_yield: true,
  difficulty: 'Hard',
  status: 'In Progress',
  completion_pct: 50,
  confidence: 0,
  ...overrides,
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Curriculum />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openTopicsView(user) {
  await user.click(await screen.findByRole('button', { name: 'Topics' }))
}

beforeEach(() => {
  harness.reset()
  vi.clearAllMocks()
})

describe('Curriculum page — rendering', () => {
  it('renders systems, subjects and topics from mocked supabase', async () => {
    harness.setSystems([SYSTEM])
    harness.setSubjects([SUBJECT])
    harness.setTopics([makeTopic()])
    renderPage()
    expect(await screen.findByText('Cardiology')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Subjects' }))
    expect(await screen.findByText('Cardiac Pharmacology')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Topics' }))
    expect(await screen.findByText('Atrial Fibrillation')).toBeInTheDocument()
  })

  it('shows a distinct empty state when there is no content yet', async () => {
    renderPage()
    expect(await screen.findByText('No content yet')).toBeInTheDocument()
  })
})

describe('Curriculum page — aggregate status chips', () => {
  it('shows In Progress for partial completion', async () => {
    harness.setSystems([SYSTEM])
    harness.setSubjects([SUBJECT])
    harness.setTopics([
      makeTopic({ status: 'Complete', completion_pct: 100 }),
      makeTopic({ id: 't2', name: 'Heart Failure', status: 'Not Started', completion_pct: 0 }),
    ])
    renderPage()
    expect(await screen.findByText('In Progress')).toBeInTheDocument()
  })

  it('shows Complete when every topic is complete', async () => {
    harness.setSystems([SYSTEM])
    harness.setSubjects([SUBJECT])
    harness.setTopics([
      makeTopic({ status: 'Complete', completion_pct: 100 }),
      makeTopic({ id: 't2', name: 'Heart Failure', status: 'Complete', completion_pct: 100 }),
    ])
    renderPage()
    expect(await screen.findByText('Complete')).toBeInTheDocument()
  })

  it('shows Reviewing when any topic is reviewing even if mixed', async () => {
    harness.setSystems([SYSTEM])
    harness.setSubjects([SUBJECT])
    harness.setTopics([
      makeTopic({ status: 'Reviewing', completion_pct: 0 }),
      makeTopic({ id: 't2', name: 'Heart Failure', status: 'Complete', completion_pct: 100 }),
      makeTopic({ id: 't3', name: 'Angina', status: 'In Progress', completion_pct: 50 }),
    ])
    renderPage()
    expect(await screen.findByText('Reviewing')).toBeInTheDocument()
  })

  it('shows Not Started for a subject with no topics', async () => {
    harness.setSubjects([SUBJECT])
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Subjects' }))
    expect(await screen.findByText('Not Started')).toBeInTheDocument()
  })
})

describe('Curriculum page — topics filter and search', () => {
  it('status filter narrows the list and shows the no-results state when nothing matches', async () => {
    harness.setSubjects([SUBJECT])
    harness.setTopics([
      makeTopic({ name: 'Atrial Fibrillation', status: 'In Progress' }),
      makeTopic({ id: 't2', name: 'Hypertension', status: 'Complete', completion_pct: 100 }),
    ])
    renderPage()
    const user = userEvent.setup()
    await openTopicsView(user)
    expect(await screen.findByText('Atrial Fibrillation')).toBeInTheDocument()
    expect(screen.getByText('Hypertension')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Complete' }))
    expect(screen.getByText('Hypertension')).toBeInTheDocument()
    expect(screen.queryByText('Atrial Fibrillation')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reviewing' }))
    expect(await screen.findByText('No topics match your filter')).toBeInTheDocument()
    expect(screen.queryByText('Atrial Fibrillation')).not.toBeInTheDocument()
  })

  it('search narrows by topic name', async () => {
    harness.setSubjects([SUBJECT])
    harness.setTopics([
      makeTopic({ name: 'Atrial Fibrillation' }),
      makeTopic({ id: 't2', name: 'Heart Failure', subject_id: 'sub2' }),
    ])
    renderPage()
    const user = userEvent.setup()
    await openTopicsView(user)
    expect(await screen.findByText('Heart Failure')).toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: 'Search topics' })
    await user.type(search, 'fibrillation')
    expect(screen.getByText('Atrial Fibrillation')).toBeInTheDocument()
    expect(screen.queryByText('Heart Failure')).not.toBeInTheDocument()
  })

  it('search narrows by subject name', async () => {
    harness.setSubjects([SUBJECT, { ...SUBJECT, id: 'sub2', name: 'Renal' }])
    harness.setTopics([
      makeTopic({ name: 'Atrial Fibrillation' }),
      makeTopic({ id: 't2', name: 'Glomerulonephritis', subject_id: 'sub2' }),
    ])
    renderPage()
    const user = userEvent.setup()
    await openTopicsView(user)
    expect(await screen.findByText('Glomerulonephritis')).toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: 'Search topics' })
    await user.type(search, 'renal')
    expect(screen.getByText('Glomerulonephritis')).toBeInTheDocument()
    expect(screen.queryByText('Atrial Fibrillation')).not.toBeInTheDocument()
  })
})

describe('Curriculum page — mutations', () => {
  it('changing the completion select calls updateTopicStatus with the right payload', async () => {
    harness.setTopics([makeTopic({ id: 't1', status: 'In Progress', completion_pct: 50 })])
    renderPage()
    const user = userEvent.setup()
    await openTopicsView(user)

    const select = await screen.findByLabelText('Status')
    await user.selectOptions(select, 'Complete')

    await waitFor(() => {
      expect(harness.lastCall('curriculum_topics', 'update')).toBeTruthy()
    })
    expect(harness.lastCall('curriculum_topics', 'update').args[0]).toEqual({ status: 'Complete', completion_pct: 100 })
    expect(harness.hasEq('curriculum_topics', 't1')).toBe(true)
  })

  it('delete fires the mutation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    harness.setTopics([makeTopic({ id: 't1' })])
    renderPage()
    const user = userEvent.setup()
    await openTopicsView(user)

    await user.click(await screen.findByRole('button', { name: 'Delete topic Atrial Fibrillation' }))

    await waitFor(() => {
      expect(harness.callsFor('curriculum_topics', 'delete')).toHaveLength(1)
    })
    expect(harness.hasEq('curriculum_topics', 't1')).toBe(true)
    confirmSpy.mockRestore()
  })

  it('add mutation fires with the right payload', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add New' }))

    await user.type(screen.getByLabelText('System Name'), 'Nephrology')
    await user.click(screen.getByRole('button', { name: 'Add System' }))

    await waitFor(() => {
      expect(harness.lastCall('curriculum_systems', 'insert')).toBeTruthy()
    })
    expect(harness.lastCall('curriculum_systems', 'insert').args[0]).toEqual({
      user_id: 'u1',
      name: 'Nephrology',
      high_yield: false,
      status: 'Not Started',
      priority: 1,
    })
  })
})

describe('Curriculum page — error state', () => {
  it('shows an error state with Retry and refetches on retry', async () => {
    harness.setSystems([SYSTEM])
    harness.setSubjects([SUBJECT])
    harness.setTopics([makeTopic()])
    harness.config.failRead = true
    renderPage()

    expect(await screen.findByText("Couldn't load your curriculum")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    harness.config.failRead = false
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Cardiology')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your curriculum")).not.toBeInTheDocument()
  })
})
